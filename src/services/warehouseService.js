// =============================================================
// warehouseService — single write path for warehouse stock.
// Tables: wh_warehouses, wh_stock, wh_movements.
// Every mutation must be atomic, auditable, and idempotent.
// =============================================================
// أنواع الحركات: receive | allocate | adjust | reserve | release | reverse | waste | return
import { supabase } from './supabase';
import { planOrderStock, matchOrderLines } from '../utils/orderStockPlan';

// Return cases that still hold the original reservation (not yet restocked/cancelled).
const OPEN_RETURN_STATUSES = ['in_transit', 'received', 'inspected', 'quarantine', 'damaged'];

// PostgREST caps a response at 1000 rows; the movement ledger is far larger, so
// page through it (ordered by id) instead of silently truncating the totals.
async function _fetchAll(makeQuery, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) return { data: out, error: null };
  }
}

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
  const [whRes, prodRes, stockRes, reservedRes, returnsRes] = await Promise.all([
    supabase.from('wh_warehouses').select('*').eq('is_active', true).order('type').order('name'),
    supabase.from('products').select('id, name, sku, min_stock').eq('is_active', true).order('name'),
    supabase.from('wh_stock').select('warehouse_id, product_id, quantity'),
    _fetchAll(() => supabase.from('wh_movements').select('id, from_warehouse_id, to_warehouse_id, product_id, type, quantity').in('type', ['reserve', 'release']).order('id')),
    supabase.from('wh_return_cases').select('warehouse_id, status, items').in('status', OPEN_RETURN_STATUSES),
  ]);
  if (whRes.error)    throw whRes.error;
  if (prodRes.error)  throw prodRes.error;
  if (stockRes.error) throw stockRes.error;
  if (reservedRes.error) throw reservedRes.error;
  if (returnsRes.error) throw returnsRes.error;

  const warehouses = whRes.data ?? [];
  const products   = prodRes.data ?? [];
  const stock      = stockRes.data ?? [];
  const reservedMovements = reservedRes.data ?? [];
  const openReturns = returnsRes.data ?? [];

  // index stock by product → warehouse → qty
  const byProduct = {};
  for (const s of stock) {
    (byProduct[s.product_id] ??= {})[s.warehouse_id] = s.quantity;
  }

  // wh_stock is available stock after reservations; derive reserved stock from
  // the immutable ledger so the UI explains the difference.
  const reservedByProduct = {};
  for (const m of reservedMovements) {
    const whId = m.type === 'reserve' ? m.from_warehouse_id : m.to_warehouse_id;
    if (!whId) continue;
    const byWarehouse = (reservedByProduct[m.product_id] ??= {});
    const sign = m.type === 'reserve' ? 1 : -1;
    byWarehouse[whId] = Number(byWarehouse[whId] || 0) + sign * Number(m.quantity || 0);
  }
  // Goods tied to an open return case are no longer "reserved for a customer": show
  // them as a separate returns bucket per status so the three never overlap.
  const returnsByProduct = {};   // product → warehouse → { pending, quarantine, damaged }
  for (const rc of openReturns) {
    const bucket = rc.status === 'quarantine' ? 'quarantine' : rc.status === 'damaged' ? 'damaged' : 'pending';
    for (const it of (Array.isArray(rc.items) ? rc.items : [])) {
      if (!it?.productId) continue;
      const q = Number(it.qty || 0);
      const w = ((returnsByProduct[it.productId] ??= {})[rc.warehouse_id] ??= { pending: 0, quarantine: 0, damaged: 0 });
      w[bucket] += q;
      const rbw = (reservedByProduct[it.productId] ??= {});
      rbw[rc.warehouse_id] = Number(rbw[rc.warehouse_id] || 0) - q;
    }
  }
  for (const byWarehouse of Object.values(reservedByProduct)) {
    for (const k of Object.keys(byWarehouse)) byWarehouse[k] = Math.max(0, byWarehouse[k]);
  }

  const rows = products.map(p => {
    const perWh = byProduct[p.id] ?? {};
    const reservedPerWh = reservedByProduct[p.id] ?? {};
    const total = Object.values(perWh).reduce((a, q) => a + Number(q || 0), 0);
    const reserved = Object.values(reservedPerWh).reduce((a, q) => a + Number(q || 0), 0);
    const returnsPerWh = returnsByProduct[p.id] ?? {};
    const returned = Object.values(returnsPerWh).reduce((a, w) => a + w.pending + w.quarantine + w.damaged, 0);
    return { ...p, perWh, reservedPerWh, returnsPerWh, total, reserved, returned, physicalTotal: total + reserved };
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

async function _logMovement(row) {
  const { error } = await supabase.from('wh_movements').insert(row);
  if (error) throw error;
}

function _movementError(error, context) {
  const message = error?.message || String(error || 'unknown error');
  throw new Error(`فشلت حركة المخزون (${context}): ${message}`);
}

// Atomic stock delta via SECURITY DEFINER RPC (race-free — see migration 0007).
// Replaces read-then-write (_currentQty + _setQty) for incremental changes so two
// concurrent operations on the same (warehouse, product) can't lose an update.
async function _applyDelta(warehouseId, productId, delta) {
  const { error } = await supabase.rpc('wh_apply_stock_delta', {
    p_warehouse: warehouseId, p_product: productId, p_delta: delta,
  });
  if (error) throw error;
}

// Receive new stock into a warehouse (typically central).
export async function receiveStock({ productId, warehouseId, quantity, performedBy, reason }) {
  const qty = Number(quantity);
  if (!qty || qty <= 0) throw new Error('أدخل كمية صحيحة');
  try { await _applyDelta(warehouseId, productId, qty); } catch (e) { _movementError(e, 'استلام'); }
  try { await _logMovement({
    product_id: productId, from_warehouse_id: null, to_warehouse_id: warehouseId,
    quantity: qty, type: 'receive', reason: reason || null, performed_by: performedBy || null,
  }); } catch (e) { _movementError(e, 'تسجيل الاستلام'); }
}

// Allocate (transfer) stock from one warehouse to another.
export async function allocateStock({ productId, fromWarehouseId, toWarehouseId, quantity, performedBy }) {
  const qty = Number(quantity);
  if (!qty || qty <= 0) throw new Error('أدخل كمية صحيحة');
  if (fromWarehouseId === toWarehouseId) throw new Error('المخزن المصدر والوجهة متطابقان');
  // Atomic transfer (locks the source row, checks sufficiency, moves) — race-free.
  const { error: trErr } = await supabase.rpc('wh_transfer_stock', {
    p_from: fromWarehouseId, p_to: toWarehouseId, p_product: productId, p_qty: qty,
  });
  if (trErr) {
    if (/insufficient stock/i.test(trErr.message || '')) {
      const have = await _currentQty(fromWarehouseId, productId);
      throw new Error(`الكمية المتاحة بالمصدر ${have} فقط`);
    }
    throw trErr;
  }
  try { await _logMovement({
    product_id: productId, from_warehouse_id: fromWarehouseId, to_warehouse_id: toWarehouseId,
    quantity: qty, type: 'allocate', reason: null, performed_by: performedBy || null,
  }); } catch (e) { _movementError(e, 'تسجيل التحويل'); }
}

// Manually set the exact quantity (stocktake / correction).
export async function adjustStock({ productId, warehouseId, newQuantity, performedBy, reason }) {
  const qty = Number(newQuantity);
  if (qty < 0 || Number.isNaN(qty)) throw new Error('أدخل كمية صحيحة');
  const before = await _currentQty(warehouseId, productId);
  const delta = qty - before;
  if (delta === 0) return;
  try { await _applyDelta(warehouseId, productId, delta); } catch (e) { _movementError(e, 'الجرد'); }
  try { await _logMovement({
    product_id: productId, from_warehouse_id: warehouseId, to_warehouse_id: warehouseId,
    quantity: Math.abs(delta), type: 'adjust', reason: reason || `جرد/تصحيح (الفرق: ${delta > 0 ? '+' : ''}${delta})`, performed_by: performedBy || null,
  }); } catch (e) { _movementError(e, 'تسجيل الجرد'); }
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
export async function writeOffStock({ productId, warehouseId, quantity, reasonCode, note, performedBy }) {
  const qty = Number(quantity);
  if (!qty || qty <= 0) throw new Error('أدخل كمية صحيحة');
  const reasonMeta = WASTE_REASONS.find(r => r.value === reasonCode);
  if (!reasonMeta) throw new Error('اختر سبب الإتلاف');
  const have = await _currentQty(warehouseId, productId);
  if (qty > have) throw new Error(`الكمية المتاحة بهذا المخزن ${have} فقط`);
  await _applyDelta(warehouseId, productId, -qty);
  const reason = note ? `${reasonMeta.label} — ${note}` : reasonMeta.label;
  await _logMovement({
    product_id: productId, from_warehouse_id: warehouseId, to_warehouse_id: null,
    quantity: qty, type: 'waste', reason, performed_by: performedBy || null,
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
    if (prof?.warehouse_id) {
      // مخزن البائع يُعتمد فقط إذا كان من نفس سوق الطلب — بائعة تركيا تبيع
      // أيضاً للإمارات؛ طلبها الإماراتي لازم يُخصم من مخزن دبي لا مخزنها التركي.
      const { data: own } = await supabase
        .from('wh_warehouses').select('market').eq('id', prof.warehouse_id).maybeSingle();
      if (!own?.market || own.market === order.market) return prof.warehouse_id;
    }
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

// تطبيع اسم المنتج والمطابقة نفسها صارا في src/utils/orderStockPlan.js
// (دوال نقية مغطّاة بالاختبارات). يُبقي العربي واللاتيني والأرقام ويطوي التركية.

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

// Map order items to catalog products. Returns { lines, missing }: an item that
// cannot be linked is reported in `missing` — never dropped silently.
async function _matchItemsToProducts(items) {
  if (!Array.isArray(items) || items.length === 0) return { lines: [], missing: [] };
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, name_en');
  if (error) throw error;
  return matchOrderLines(items, products, PRODUCT_ALIASES);
}

// الحالات المخصومة (DEDUCTED_STATUSES) وحالات المرتجع (returning/returned) تُحدَّد
// في src/utils/orderStockPlan.js. قرار المالك (يونيو 2026): الخصم يبدأ عند
// «📦 في التجهيز» لا عند الإنشاء. المرتجع لا يعيد البضاعة للبيع تلقائياً.

// مصادر خارجية تملك مخزونها بنفسها — طلباتها لا تُخصَم هنا إطلاقاً.
// شبكة النجوم (lowes-classic) تخصم مخزون تركيا عند اعتماد المشرفة على نفس
// البضاعة الفعلية؛ الخصم هنا كمان = خصم مزدوج بكل قطعة.
// uae_sheet_import: طلبات الإمارات المستوردة من الجدول (27 أيلول 2026) — بضاعتها
// طلعت قبل تتبّع مخزن دبي بالتطبيق، فأي تغيير حالة لاحق لازم ما يخصمها مرة ثانية.
const EXTERNALLY_STOCKED_SOURCES = new Set(['star_network', 'uae_sheet_import']);

// ⚠️ لا تنقل هذا الفحص لمواقع الاستدعاء: `handleSave` بشاشة الطلبات يمرّر
// `{ id, ...form }` و`form` قائمة سماح صريحة لا تحوي `source` — فأول تعديل
// إداري على طلب مُنسَّخ (رقم هاتف مثلاً) كان يخصم البضاعة مرة ثانية. لذلك
// نقرأ `source` من القاعدة حين لا يحمله الكائن الممرَّر.
async function _isExternallyStocked(order) {
  let src = order.source;
  if (src === undefined) {
    const { data } = await supabase.from('orders').select('source').eq('id', order.id).maybeSingle();
    src = data?.source ?? null;
  }
  return EXTERNALLY_STOCKED_SOURCES.has(src);
}

// مُصلِّح الحالة الموحّد: يضمن أن مخزون الطلب يطابق حالته الحالية.
// يُستدعى عند كل إنشاء/تغيير حالة (فردي/جماعي) + الحذف/الإلغاء.
// idempotent + net-aware. no-op للعلامات غير lowes. يرمي عند أي فشل (لا إخفاء صامت).
// returning/returned لا تُعيد البضاعة للبيع: تفتح/تحدّث حالة مرتجع فقط.
export async function syncOrderStock(order, performedBy) {
  try {
    if (!order?.id) return;
    if ((order.brand || 'lowes') !== 'lowes') return;
    if (await _isExternallyStocked(order)) return;
    const plan = planOrderStock(order.status);
    const warehouseId = await _resolveSourceWarehouse(order);
    if (!warehouseId) throw new Error(`لا يوجد مخزن مصدر للسوق ${order.market || 'غير محدد'}`);
    const { lines, missing } = await _matchItemsToProducts(order.items);
    if (missing.length) {
      throw new Error(`أصناف الطلب غير مربوطة بالكتالوج: ${missing.join('، ')}`);
    }
    if (plan.kind === 'return') {
      const { error } = await supabase.rpc('wh_register_order_return', {
        p_order_id: order.id,
        p_warehouse: warehouseId,
        p_items: lines,
        p_stage: plan.stage,
        p_performed_by: performedBy || null,
        p_reason: `حالة مرتجع: ${order.status}`,
      });
      if (error) throw error;
      return;
    }
    const { error } = await supabase.rpc('wh_sync_order_stock', {
      p_order_id: order.id,
      p_warehouse: warehouseId,
      p_lines: lines,
      p_should_be_out: plan.shouldBeOut,
      p_performed_by: performedBy || null,
      p_release_reason: plan.shouldBeOut ? null : `استرداد بسبب حالة الطلب: ${order.status}`,
    });
    if (error) throw error;
  } catch (e) {
    console.error('[warehouse] syncOrderStock failed', { orderId: order?.id, status: order?.status, error: e });
    throw e;
  }
}

// تراجع عن حركة استلام/تخصيص أُدخلت خطأً: يعكس أثرها على المخزون + يسجّل
// حركة 'reverse' مرتبطة بالأصل عبر reverses_id. idempotent (لا تراجع مزدوج).
// مسموح فقط لحركات receive/allocate (الإدخالات اليدوية). للمسؤولين فقط (gated بالشاشة).
export async function reverseMovement(movement, performedBy) {
  if (!movement?.id) throw new Error('حركة غير صالحة');
  if (!['receive', 'allocate', 'waste'].includes(movement.type))
    throw new Error('يمكن التراجع فقط عن الاستلام أو التخصيص أو الإتلاف (الجرد يُصحَّح بجرد جديد).');
  // idempotency: هل تم التراجع عنها سابقاً؟
  const { data: existing } = await supabase
    .from('wh_movements').select('id').eq('reverses_id', movement.id).limit(1);
  if (existing && existing.length) throw new Error('تم التراجع عن هذه الحركة مسبقاً.');

  const qty = Number(movement.quantity || 0);
  if (movement.type === 'receive') {
    // الأصل: null → to (+qty). العكس: انقص qty من to.
    await _applyDelta(movement.to_warehouse_id, movement.product_id, -qty);
  } else if (movement.type === 'waste') {
    // الأصل: from (−qty) → null. العكس: أرجِع qty إلى from.
    await _applyDelta(movement.from_warehouse_id, movement.product_id, qty);
  } else {
    // allocate: from (−qty) → to (+qty). العكس: أرجِع لـfrom، انقص من to.
    await _applyDelta(movement.from_warehouse_id, movement.product_id, qty);
    await _applyDelta(movement.to_warehouse_id,   movement.product_id, -qty);
  }
  const TYPE_AR = { receive: 'استلام', allocate: 'تخصيص', waste: 'إتلاف' };
  await _logMovement({
    product_id: movement.product_id,
    from_warehouse_id: movement.to_warehouse_id || null,   // عكس الاتجاه (تدقيق)
    to_warehouse_id:   movement.from_warehouse_id || null,
    quantity: qty, type: 'reverse',
    reason: `تراجع عن ${TYPE_AR[movement.type] || movement.type}`,
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

// ── المرتجعات (D-157) ─────────────────────────────────────────
// كل تغيير رصيد يمرّ عبر RPC ذري (wh_restock_return) ويسجّل wh_movements؛ لا كتابة
// مباشرة على wh_stock/wh_return_cases من الواجهة.
export const RETURN_STATUS_LABEL = {
  in_transit: 'في الطريق', received: 'مستلم بالمخزن', inspected: 'تم الفحص',
  restocked: 'أُعيد للمخزون', quarantine: 'حجر', damaged: 'تالف', cancelled: 'ملغى',
};

// الإجراءات المسموحة لكل حالة (مرآة لآلة الحالات في قاعدة البيانات).
export const RETURN_ACTIONS = {
  in_transit: ['receive'],
  received:   ['inspect'],
  inspected:  ['restock', 'quarantine', 'damaged'],
  quarantine: ['restock', 'damaged'],
};

// رسائل خطأ عربية واضحة لأخطاء قاعدة البيانات.
function _returnError(e) {
  const m = String(e?.message || e || '');
  if (/انتقال غير مسموح/.test(m)) return new Error('هذا الإجراء غير مسموح لحالة المرتجع الحالية. حدّث الصفحة وراجع الحالة.');
  if (/قبل الفحص/.test(m)) return new Error('لا يمكن الإرجاع للمخزون قبل فحص المرتجع.');
  if (/ليست سليمة/.test(m)) return new Error('نتيجة الفحص ليست «سليم»؛ استخدم الحجر أو التالف.');
  if (/الحجز المسجّل/.test(m)) return new Error('كمية المرتجع أكبر من الكمية المحجوزة لهذا الطلب؛ راجع الطلب قبل الإرجاع.');
  if (/stock cannot become negative|insufficient stock/i.test(m)) return new Error('الرصيد لا يسمح بهذه العملية.');
  if (/لا توجد أصناف|غير مربوط/.test(m)) return new Error('أصناف المرتجع غير مربوطة بالكتالوج؛ لا يمكن تعديل الرصيد.');
  if (/permission denied|row-level security|not authorized/i.test(m)) return new Error('ليست لديك صلاحية لهذا الإجراء.');
  if (/المسؤول|سبب|نتيجة الفحص|لا توجد حالة/.test(m)) return new Error(m);
  return new Error('تعذّر تنفيذ الإجراء: ' + m);
}

async function _returnRpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw _returnError(error);
  return data;
}

function _need(v, msg) { if (!String(v ?? '').trim()) throw new Error(msg); }

// قائمة حالات المرتجع مع الطلب والعميل والمنتج. `status` اختياري (مصفوفة أو نص).
export async function listReturnCases({ status = null, limit = 300 } = {}) {
  let q = supabase
    .from('wh_return_cases')
    .select('id, order_id, warehouse_id, status, items, reason, notes, received_at, received_by, inspected_at, inspected_by, inspection_condition, resolved_at, resolved_by, resolution_notes, created_at, updated_at, orders(order_id, customer_name, market, amount, currency)')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (status) q = Array.isArray(status) ? q.in('status', status) : q.eq('status', status);
  const { data, error } = await q;
  if (error) throw _returnError(error);
  const cases = data ?? [];
  const ids = [...new Set(cases.flatMap(c => (Array.isArray(c.items) ? c.items : []).map(i => i?.productId).filter(Boolean)))];
  let names = {};
  if (ids.length) {
    const { data: prods, error: pe } = await supabase.from('products').select('id, name').in('id', ids);
    if (pe) throw _returnError(pe);
    names = Object.fromEntries((prods ?? []).map(p => [p.id, p.name]));
  }
  return cases.map(c => ({
    ...c,
    orderCode: c.orders?.order_id ?? null,
    customerName: c.orders?.customer_name ?? '',
    market: c.orders?.market ?? null,
    lines: (Array.isArray(c.items) ? c.items : []).map(i => ({
      productId: i.productId, qty: Number(i.qty || 0), name: names[i.productId] || 'صنف غير معروف',
    })),
  }));
}

export async function receiveReturn({ orderId, performedBy, notes = null }) {
  _need(performedBy, 'اسم المستخدم غير معروف؛ أعد تسجيل الدخول');
  return _returnRpc('wh_receive_return', { p_order_id: orderId, p_performed_by: performedBy, p_notes: notes });
}

// condition: good | suspect | damaged
export async function inspectReturn({ orderId, condition, performedBy, notes = null }) {
  _need(performedBy, 'اسم المستخدم غير معروف؛ أعد تسجيل الدخول');
  if (!['good', 'suspect', 'damaged'].includes(condition)) throw new Error('اختر نتيجة الفحص');
  return _returnRpc('wh_inspect_return', { p_order_id: orderId, p_condition: condition, p_performed_by: performedBy, p_notes: notes });
}

export async function restockReturn({ orderId, performedBy, notes = null }) {
  _need(performedBy, 'اسم المستخدم غير معروف؛ أعد تسجيل الدخول');
  return _returnRpc('wh_restock_return', { p_order_id: orderId, p_performed_by: performedBy, p_notes: notes });
}

export async function quarantineReturn({ orderId, performedBy, notes }) {
  _need(performedBy, 'اسم المستخدم غير معروف؛ أعد تسجيل الدخول');
  _need(notes, 'اكتب سبب الحجر');
  return _returnRpc('wh_quarantine_return', { p_order_id: orderId, p_performed_by: performedBy, p_notes: notes });
}

export async function markReturnDamaged({ orderId, performedBy, notes }) {
  _need(performedBy, 'اسم المستخدم غير معروف؛ أعد تسجيل الدخول');
  _need(notes, 'اكتب سبب التلف');
  return _returnRpc('wh_mark_return_damaged', { p_order_id: orderId, p_performed_by: performedBy, p_notes: notes });
}
