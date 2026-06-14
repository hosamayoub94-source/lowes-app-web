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

// تطبيع اسم المنتج للمطابقة: lowercase + طيّ الحروف التركية (İ/ı/Ş/Ğ/Ç/Ö/Ü)
// + إزالة بادئة العلامة LOWE'S/LOWES + إزالة المسافات والترقيم (يُبقي العربي
// واللاتيني والأرقام). يُطبَّق على الطرفين (الطلب + الكتالوج) فلا مطابقات خاطئة.
// يعالج: «LOWE'S VİTAMİN C SERUM» / «LOWE'SVİTAMİNCSERUM» → vitamincserum.
function _normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/i̇/g, 'i').replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g').replace(/[çÇ]/g, 'c')
    .replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u')
    .replace(/[^a-z0-9؀-ۿ]/g, '')
    .replace(/^lowes/, '');
}

// مرادفات يدوية مؤكَّدة من المالك (14 يونيو 2026): اسم كما يظهر بالطلب →
// اسم المنتج بالكتالوج (name_en، كلاهما يُطبَّع). للأسماء المختلفة لغوياً
// (تركية كاملة) أو المُسمّاة خطأً. القيمة لازم تطابق name/name_en بالكتالوج.
const PRODUCT_ALIASES = {
  'ROSEMARY SERUM':         'Rosemary Oil',                       // قرار المالك: = زيت الروزماري
  'Body toner':             'PORE TIHGTENNING & PURIFINE TONER',  // = تونر تنقية البشرة
  'sakal ve Bıyık Serumu':  'BEARD SERUM',                        // تركي = سيروم اللحية
  'GÖĞÜS BAKIM SERUM':      'BREAST CARE SERUM',                  // تركي = سيروم العناية بالثدي
  'WHITHING CREAM':         'WHITENING CREAM',                    // خطأ إملائي = كريم تفتيح البشرة
  // مُتجاهَلة عمداً (ليست بمخزون لويز المتتبَّع): Strawberry Body Scrub,
  // Hair Removal Cream, كريم سوبر فيغا الأزرق.
};

// Map order items ({name, qty}) to catalog product ids via normalized name
// (Arabic name or name_en) + confirmed aliases. Unmatched items are skipped
// silently — only catalog products are stock-tracked.
async function _matchItemsToProducts(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const { data: products } = await supabase
    .from('products')
    .select('id, name, name_en');
  const byNorm = {};
  for (const p of (products ?? [])) {
    if (p.name)    byNorm[_normName(p.name)]    = p.id;
    if (p.name_en) byNorm[_normName(p.name_en)] = p.id;
  }
  // اربط المرادفات المؤكَّدة بمعرّف المنتج (فقط إن وُجد المنتج بالكتالوج).
  const aliasToId = {};
  for (const [alias, canon] of Object.entries(PRODUCT_ALIASES)) {
    const pid = byNorm[_normName(canon)];
    if (pid) aliasToId[_normName(alias)] = pid;
  }
  const matched = [];
  for (const it of items) {
    const key = _normName(it.name);
    if (!key) continue;
    const pid = byNorm[key] || aliasToId[key];
    if (pid) matched.push({ productId: pid, qty: Number(it.qty || 1) });
  }
  return matched;
}

// الحالات التي يكون فيها مخزون الطلب «خارج المخزن» (مخصوم): من «في التجهيز»
// فما فوق حتى التسليم/التسوية. أي حالة أخرى (وارد جديد/بالانتظار/راجع/ملغي/لم
// يُستلم) تعني أن البضاعة موجودة بالمخزن — فيُسترد ما كان مخصوماً.
// قرار المالك (يونيو 2026): الخصم يبدأ عند «📦 في التجهيز» لا عند الإنشاء.
const DEDUCTED_STATUSES = new Set([
  'preparing', 'ready', 'motor_prep', 'at_center', 'shipped',
  'on_way', 'special_delivery', 'motor', 'prepaid', 'delivered', 'settled',
]);

// هل الطلب مخصوم فعلاً الآن؟ (صافي الحركات: Σحجز − Σإرجاع > 0).
async function _isCurrentlyReserved(orderId) {
  const { data: moves } = await supabase
    .from('wh_movements')
    .select('type, quantity')
    .eq('order_id', orderId)
    .in('type', ['reserve', 'release']);
  let reserved = 0, released = 0;
  for (const m of (moves || [])) {
    if (m.type === 'reserve') reserved += Number(m.quantity || 0);
    else                      released += Number(m.quantity || 0);
  }
  return reserved > released;
}

// داخلي: اخصم أصناف الطلب من مخزن المصدر + سجّل حركة 'reserve'.
async function _reserveOrder(order, performedBy) {
  const warehouseId = await _resolveSourceWarehouse(order);
  if (!warehouseId) return;
  const matched = await _matchItemsToProducts(order.items);
  for (const { productId, qty } of matched) {
    if (!qty || qty <= 0) continue;
    const current = await _currentQty(warehouseId, productId);
    await _setQty(warehouseId, productId, current - qty);
    await _logMovement({
      product_id: productId, from_warehouse_id: warehouseId, to_warehouse_id: null,
      quantity: qty, type: 'reserve', reason: 'حجز طلب (في التجهيز)', performed_by: performedBy || null,
      order_id: order.id,
    });
  }
}

// داخلي: أعد الصافي المخصوم المتبقّي لكل (مخزن، منتج) إلى المخزن + سجّل 'release'.
// net-aware: يدعم دورات تجهيز↔انتظار متكررة دون ازدواج (يرجّع الفرق فقط).
async function _releaseOrder(order, performedBy) {
  const { data: moves } = await supabase
    .from('wh_movements')
    .select('product_id, quantity, type, from_warehouse_id, to_warehouse_id')
    .eq('order_id', order.id)
    .in('type', ['reserve', 'release']);
  const net = {}; // "whId|productId" → { whId, productId, qty }
  for (const m of (moves || [])) {
    const whId = m.type === 'reserve' ? m.from_warehouse_id : m.to_warehouse_id;
    if (!whId) continue;
    const k = whId + '|' + m.product_id;
    (net[k] ??= { whId, productId: m.product_id, qty: 0 });
    net[k].qty += (m.type === 'reserve' ? 1 : -1) * Number(m.quantity || 0);
  }
  for (const { whId, productId, qty } of Object.values(net)) {
    if (qty <= 0) continue; // لا شيء مخصوم متبقٍّ
    const current = await _currentQty(whId, productId);
    await _setQty(whId, productId, current + qty);
    await _logMovement({
      product_id: productId, from_warehouse_id: null, to_warehouse_id: whId,
      quantity: qty, type: 'release', reason: 'استرداد للمخزون', performed_by: performedBy || null,
      order_id: order.id,
    });
  }
}

// مُصلِّح الحالة الموحّد: يضمن أن مخزون الطلب يطابق حالته الحالية.
// يُستدعى عند كل إنشاء/تغيير حالة (فردي/جماعي) + الحذف/الإلغاء.
// idempotent + net-aware. no-op للعلامات غير lowes. best-effort (لا يرمي).
export async function syncOrderStock(order, performedBy) {
  try {
    if (!order?.id) return;
    if ((order.brand || 'lowes') !== 'lowes') return;
    const desiredOut   = DEDUCTED_STATUSES.has(order.status);
    const currentlyOut = await _isCurrentlyReserved(order.id);
    if (desiredOut && !currentlyOut)      await _reserveOrder(order, performedBy);
    else if (!desiredOut && currentlyOut) await _releaseOrder(order, performedBy);
  } catch { /* best-effort */ }
}

// تراجع عن حركة استلام/تخصيص أُدخلت خطأً: يعكس أثرها على المخزون + يسجّل
// حركة 'reverse' مرتبطة بالأصل عبر reverses_id. idempotent (لا تراجع مزدوج).
// مسموح فقط لحركات receive/allocate (الإدخالات اليدوية). للمسؤولين فقط (gated بالشاشة).
export async function reverseMovement(movement, performedBy) {
  if (!movement?.id) throw new Error('حركة غير صالحة');
  if (!['receive', 'allocate'].includes(movement.type))
    throw new Error('يمكن التراجع فقط عن الاستلام أو التخصيص (الجرد يُصحَّح بجرد جديد).');
  // idempotency: هل تم التراجع عنها سابقاً؟
  const { data: existing } = await supabase
    .from('wh_movements').select('id').eq('reverses_id', movement.id).limit(1);
  if (existing && existing.length) throw new Error('تم التراجع عن هذه الحركة مسبقاً.');

  const qty = Number(movement.quantity || 0);
  if (movement.type === 'receive') {
    // الأصل: null → to (+qty). العكس: انقص qty من to.
    const wh = movement.to_warehouse_id;
    await _setQty(wh, movement.product_id, (await _currentQty(wh, movement.product_id)) - qty);
  } else {
    // allocate: from (−qty) → to (+qty). العكس: أرجِع لـfrom، انقص من to.
    const { from_warehouse_id: from, to_warehouse_id: to } = movement;
    await _setQty(from, movement.product_id, (await _currentQty(from, movement.product_id)) + qty);
    await _setQty(to,   movement.product_id, (await _currentQty(to,   movement.product_id)) - qty);
  }
  await _logMovement({
    product_id: movement.product_id,
    from_warehouse_id: movement.to_warehouse_id || null,   // عكس الاتجاه (تدقيق)
    to_warehouse_id:   movement.from_warehouse_id || null,
    quantity: qty, type: 'reverse',
    reason: `تراجع عن ${movement.type === 'receive' ? 'استلام' : 'تخصيص'}`,
    performed_by: performedBy || null,
    reverses_id: movement.id,
  });
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
