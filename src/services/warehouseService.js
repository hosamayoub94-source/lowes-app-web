// =============================================================
// warehouseService — Phase 1 data layer for the warehouse system.
// Tables: wh_warehouses, wh_stock, wh_movements (PIN-auth, open RLS).
// All stock mutations also write a wh_movements audit row.
// =============================================================
import { supabase } from './supabase';

// List active warehouses (central first, then sales, then others).
export async function listWarehouses() {
  const { data, error } = await supabase
    .from('wh_warehouses')
    .select('*')
    .eq('is_active', true)
    .order('type')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

// Build the visibility matrix: one row per active product with a
// { [warehouseId]: quantity } map + total. Returns { warehouses, rows }.
export async function getStockMatrix() {
  const [whRes, prodRes, stockRes] = await Promise.all([
    supabase.from('wh_warehouses').select('*').eq('is_active', true).order('type').order('name'),
    supabase.from('products').select('id, name, sku, min_stock').eq('is_active', true).order('name'),
    supabase.from('wh_stock').select('warehouse_id, product_id, quantity'),
  ]);
  if (whRes.error)    throw whRes.error;
  if (prodRes.error)  throw prodRes.error;
  if (stockRes.error) throw stockRes.error;

  const warehouses = whRes.data ?? [];
  const products   = prodRes.data ?? [];
  const stock      = stockRes.data ?? [];

  // index stock by product → warehouse → qty
  const byProduct = {};
  for (const s of stock) {
    (byProduct[s.product_id] ??= {})[s.warehouse_id] = s.quantity;
  }

  const rows = products.map(p => {
    const perWh = byProduct[p.id] ?? {};
    const total = Object.values(perWh).reduce((a, q) => a + Number(q || 0), 0);
    return { ...p, perWh, total };
  });

  return { warehouses, rows };
}

// Internal: read current qty for (warehouse, product); 0 if no row.
async function _currentQty(warehouseId, productId) {
  const { data } = await supabase
    .from('wh_stock')
    .select('quantity')
    .eq('warehouse_id', warehouseId)
    .eq('product_id', productId)
    .maybeSingle();
  return Number(data?.quantity ?? 0);
}

// Internal: set qty for (warehouse, product) via upsert.
async function _setQty(warehouseId, productId, qty) {
  const { error } = await supabase
    .from('wh_stock')
    .upsert(
      { warehouse_id: warehouseId, product_id: productId, quantity: qty, updated_at: new Date().toISOString() },
      { onConflict: 'warehouse_id,product_id' },
    );
  if (error) throw error;
}

async function _logMovement(row) {
  const { error } = await supabase.from('wh_movements').insert(row);
  if (error) throw error;
}

// Receive new stock into a warehouse (typically central).
export async function receiveStock({ productId, warehouseId, quantity, performedBy, reason }) {
  const qty = Number(quantity);
  if (!qty || qty <= 0) throw new Error('أدخل كمية صحيحة');
  const current = await _currentQty(warehouseId, productId);
  await _setQty(warehouseId, productId, current + qty);
  await _logMovement({
    product_id: productId, from_warehouse_id: null, to_warehouse_id: warehouseId,
    quantity: qty, type: 'receive', reason: reason || null, performed_by: performedBy || null,
  });
}

// Allocate (transfer) stock from one warehouse to another.
export async function allocateStock({ productId, fromWarehouseId, toWarehouseId, quantity, performedBy }) {
  const qty = Number(quantity);
  if (!qty || qty <= 0) throw new Error('أدخل كمية صحيحة');
  if (fromWarehouseId === toWarehouseId) throw new Error('المخزن المصدر والوجهة متطابقان');
  const fromQty = await _currentQty(fromWarehouseId, productId);
  if (fromQty < qty) throw new Error(`الكمية المتاحة بالمصدر ${fromQty} فقط`);
  const toQty = await _currentQty(toWarehouseId, productId);
  await _setQty(fromWarehouseId, productId, fromQty - qty);
  await _setQty(toWarehouseId,   productId, toQty + qty);
  await _logMovement({
    product_id: productId, from_warehouse_id: fromWarehouseId, to_warehouse_id: toWarehouseId,
    quantity: qty, type: 'allocate', reason: null, performed_by: performedBy || null,
  });
}

// Manually set the exact quantity (stocktake / correction).
export async function adjustStock({ productId, warehouseId, newQuantity, performedBy, reason }) {
  const qty = Number(newQuantity);
  if (qty < 0 || Number.isNaN(qty)) throw new Error('أدخل كمية صحيحة');
  await _setQty(warehouseId, productId, qty);
  await _logMovement({
    product_id: productId, from_warehouse_id: warehouseId, to_warehouse_id: warehouseId,
    quantity: qty, type: 'adjust', reason: reason || 'جرد/تصحيح', performed_by: performedBy || null,
  });
}

// ── Phase 2: order reservation ────────────────────────────────

// Resolve the warehouse an order draws from:
//   1) the handler's linked warehouse (profiles.warehouse_id) — distributors
//   2) else the active 'sales' warehouse matching the order's market
// Returns a warehouse id or null if none found.
async function _resolveSourceWarehouse(order) {
  // 1) seller's own warehouse
  if (order.handler_name) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('warehouse_id')
      .eq('employee_name', order.handler_name)
      .maybeSingle();
    if (prof?.warehouse_id) return prof.warehouse_id;
  }
  // 2) default sales warehouse for the market
  const { data: wh } = await supabase
    .from('wh_warehouses')
    .select('id')
    .eq('type', 'sales')
    .eq('market', order.market)
    .eq('is_active', true)
    .maybeSingle();
  return wh?.id ?? null;
}

// Map order items ({name, qty}) to catalog product ids by exact name
// (Arabic name or name_en). Unmatched items are skipped silently —
// only catalog products are stock-tracked.
async function _matchItemsToProducts(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const names = items.map(i => (i.name || '').trim()).filter(Boolean);
  if (names.length === 0) return [];
  const { data: products } = await supabase
    .from('products')
    .select('id, name, name_en');
  const byName = {};
  for (const p of (products ?? [])) {
    if (p.name)    byName[p.name.trim().toLowerCase()] = p.id;
    if (p.name_en) byName[p.name_en.trim().toLowerCase()] = p.id;
  }
  const matched = [];
  for (const it of items) {
    const key = (it.name || '').trim().toLowerCase();
    const pid = byName[key];
    if (pid) matched.push({ productId: pid, qty: Number(it.qty || 1) });
  }
  return matched;
}

// Reserve stock for a newly created order: deduct each catalog item from
// the source warehouse + log a 'reserve' movement. No-op for non-lowes
// brands. Idempotent: skips if this order already has reserve movements.
// Best-effort — never throws (stock can go negative if oversold; surfaced
// in the dashboard as a low/negative total for the manager to correct).
export async function reserveForOrder(order, performedBy) {
  try {
    if (!order?.id) return;
    if ((order.brand || 'lowes') !== 'lowes') return;
    // idempotency: already reserved?
    const { data: existing } = await supabase
      .from('wh_movements')
      .select('id')
      .eq('order_id', order.id)
      .eq('type', 'reserve')
      .limit(1);
    if (existing && existing.length) return;

    const warehouseId = await _resolveSourceWarehouse(order);
    if (!warehouseId) return;
    const matched = await _matchItemsToProducts(order.items);
    for (const { productId, qty } of matched) {
      if (!qty || qty <= 0) continue;
      const current = await _currentQty(warehouseId, productId);
      await _setQty(warehouseId, productId, current - qty);
      await _logMovement({
        product_id: productId, from_warehouse_id: warehouseId, to_warehouse_id: null,
        quantity: qty, type: 'reserve', reason: 'حجز طلب', performed_by: performedBy || null,
        order_id: order.id,
      });
    }
  } catch { /* best-effort */ }
}

// Release a previously reserved order (e.g. on cancellation): add the
// quantities back to the source warehouse + log 'release'. Idempotent:
// only acts if reserve movements exist and no release yet.
export async function releaseForOrder(order, performedBy) {
  try {
    if (!order?.id) return;
    const { data: reserves } = await supabase
      .from('wh_movements')
      .select('product_id, quantity, from_warehouse_id')
      .eq('order_id', order.id)
      .eq('type', 'reserve');
    if (!reserves || reserves.length === 0) return;
    const { data: releases } = await supabase
      .from('wh_movements')
      .select('id')
      .eq('order_id', order.id)
      .eq('type', 'release')
      .limit(1);
    if (releases && releases.length) return; // already released

    for (const r of reserves) {
      const whId = r.from_warehouse_id;
      if (!whId) continue;
      const current = await _currentQty(whId, r.product_id);
      await _setQty(whId, r.product_id, current + Number(r.quantity || 0));
      await _logMovement({
        product_id: r.product_id, from_warehouse_id: null, to_warehouse_id: whId,
        quantity: Number(r.quantity || 0), type: 'release', reason: 'إلغاء طلب',
        performed_by: performedBy || null, order_id: order.id,
      });
    }
  } catch { /* best-effort */ }
}

// Recent movements (for the activity log).
export async function listMovements({ limit = 50, warehouseId = null } = {}) {
  let q = supabase
    .from('wh_movements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (warehouseId) q = q.or(`from_warehouse_id.eq.${warehouseId},to_warehouse_id.eq.${warehouseId}`);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// Create a new (sub-)warehouse. Syria sub-centers use type 'distributor'.
export async function createWarehouse({ name, type = 'distributor', market = 'syria', ownerName = null }) {
  const { data, error } = await supabase
    .from('wh_warehouses')
    .insert({ name: String(name).trim(), type, market, owner_name: ownerName || null, is_active: true })
    .select('*').single();
  if (error) throw error;
  return data;
}

// Rename / toggle a warehouse.
export async function updateWarehouse(id, patch) {
  const { error } = await supabase.from('wh_warehouses').update(patch).eq('id', id);
  if (error) throw error;
}

// Active sellers and their current warehouse assignment (profiles.warehouse_id).
export async function listSellersWithWarehouse() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, employee_name, team, warehouse_id')
    .eq('is_active', true)
    .order('employee_name');
  if (error) throw error;
  return data ?? [];
}

// Assign a seller to a warehouse → their orders deduct from it (reserveForOrder
// resolves the seller's own warehouse first). Pass null to unassign.
export async function assignSellerWarehouse(profileId, warehouseId) {
  const { error } = await supabase
    .from('profiles')
    .update({ warehouse_id: warehouseId || null })
    .eq('id', profileId);
  if (error) throw error;
}
