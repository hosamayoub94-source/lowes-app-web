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

// Recent movements (for the activity log).
export async function listMovements({ limit = 50 } = {}) {
  const { data, error } = await supabase
    .from('wh_movements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
