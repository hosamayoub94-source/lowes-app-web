// =============================================================
// warehouseService — Phase 1 data layer for the warehouse system.
// Reads are scoped by RLS to real Supabase Auth users.
// Mutations go through server-authorized RPCs that write stock + audit atomically.
// A local PIN-only fallback session has no database authority for warehouse changes.
// =============================================================
// أنواع الحركات: receive | allocate | adjust | reserve | release | reverse | waste (D-076)
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

// The backend derives the actor from auth.uid(), verifies permission, and records the movement atomically.
export async function receiveStock({ productId, warehouseId, quantity, reason }) {
  const qty = Number(quantity);
  if (!qty || qty <= 0) throw new Error('أدخل كمية صحيحة');
  const { error } = await supabase.rpc('wh_receive_stock', {
    p_product: productId, p_warehouse: warehouseId, p_quantity: qty, p_reason: reason || null,
  });
  if (error) throw error;
}

// Transfer and matching audit row are atomic inside wh_transfer_stock.
export async function allocateStock({ productId, fromWarehouseId, toWarehouseId, quantity }) {
  const qty = Number(quantity);
  if (!qty || qty <= 0) throw new Error('أدخل كمية صحيحة');
  if (fromWarehouseId === toWarehouseId) throw new Error('المخزن المصدر والوجهة متطابقان');
  const { error } = await supabase.rpc('wh_transfer_stock', {
    p_from: fromWarehouseId, p_to: toWarehouseId, p_product: productId, p_qty: qty,
  });
  if (error) {
    if (/insufficient stock/i.test(error.message || '')) {
      const have = await _currentQty(fromWarehouseId, productId);
      throw new Error('الكمية المتاحة بالمصدر ' + have + ' فقط');
    }
    throw error;
  }
}

// Stocktake correction and audit row are atomic inside wh_adjust_stock.
export async function adjustStock({ productId, warehouseId, newQuantity, reason }) {
  const qty = Number(newQuantity);
  if (qty < 0 || Number.isNaN(qty)) throw new Error('أدخل كمية صحيحة');
  const { error } = await supabase.rpc('wh_adjust_stock', {
    p_product: productId, p_warehouse: warehouseId, p_new_quantity: qty, p_reason: reason || null,
  });
  if (error) throw error;
}

// ── إتلاف (D-076) ────────────────────────────────────────────
// أسباب مغلقة لتمييز الخسارة الفعلية عن خطأ العدّ (بعكس "± جرد" الحر).
export const WASTE_REASONS = [
  { value: 'broken',  label: 'كسر' },
  { value: 'spilled', label: 'انسكاب أو تسرّب' },
  { value: 'damaged', label: 'تلف عام' },
  { value: 'expired', label: 'انتهاء صلاحية' },
];

// إتلاف كمية من منتج بمخزن: خصم ذرّي (نفس آلية الاستلام) + حركة 'waste' بسبب
// إلزامي من قائمة مغلقة. يمنع تجاوز الكمية المتاحة فعلياً (لا رصيد سالب هنا).
// لا يمسّ الطلبات/الحجز ولا الرواتب — حركة مخزون بحتة.
export async function writeOffStock({ productId, warehouseId, quantity, reasonCode, note }) {
  const qty = Number(quantity);
  if (!qty || qty <= 0) throw new Error('أدخل كمية صحيحة');
  const reasonMeta = WASTE_REASONS.find(r => r.value === reasonCode);
  if (!reasonMeta) throw new Error('اختر سبب الإتلاف');
  const reason = note ? reasonMeta.label + ' — ' + note : reasonMeta.label;
  const { error } = await supabase.rpc('wh_write_off_stock', {
    p_product: productId, p_warehouse: warehouseId, p_quantity: qty, p_reason: reason,
  });
  if (error) {
    if (/insufficient stock/i.test(error.message || '')) {
      const have = await _currentQty(warehouseId, productId);
      throw new Error('الكمية المتاحة بهذا المخزن ' + have + ' فقط');
    }
    throw error;
  }
}

// Server-side order stock synchronization. The database reads the persisted order,
// resolves its warehouse and products, and writes reserve/release + movements atomically.
// The caller supplies only order ID and an optional target status for delete-before-soft-delete.
export async function syncOrderStock(order) {
  if (!order?.id) return true;
  const { error } = await supabase.rpc('wh_sync_order_stock', {
    p_order_id: order.id, p_target_status: order.status || null,
  });
  if (error) {
    console.error('[warehouse] Secure order-stock sync failed', order.id, error);
    return false;
  }
  return true;
}

export async function reverseMovement(movement) {
  if (!movement?.id) throw new Error('حركة غير صالحة');
  if (!['receive', 'allocate', 'waste'].includes(movement.type)) {
    throw new Error('يمكن التراجع فقط عن الاستلام أو التخصيص أو الإتلاف (الجرد يُصحَّح بجرد جديد).');
  }
  const { error } = await supabase.rpc('wh_reverse_movement', { p_movement_id: movement.id });
  if (error) throw error;
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
  const { error } = await supabase.rpc('wh_assign_seller_warehouse', {
    p_profile_id: profileId, p_warehouse_id: warehouseId || null,
  });
  if (error) throw error;
}
