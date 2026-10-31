// =============================================================
// Profitability Service — جلب وحفظ فقط. الحساب في @utils/profitabilityCalc (دوال صرفة مُختبَرة).
// الأساس (migrations 20261017120000 · 20261017180000 · 20261018100000 · 20261018110000):
//  • الطلبات تأتي من الدالة profitability_orders (تاريخ التسليم + أساسه، المرتجعات، حركات المخزون).
//  • المصاريف الرسمية = accounting_entries؛ profitability_expenses للبنود الإضافية فقط.
//  • العملة غير الدولارية لا تُحوَّل إلا بسعر شهري مُدخَل يدوياً (profitability_fx_rates).
// =============================================================
import { supabase } from './supabase';
import { fetchAllRows } from '@utils/fetchAllRows';
import { computeMonthly, monthBounds, snapshotOf, diffSnapshot } from '@utils/profitabilityCalc';
import { STATUS_BUCKETS, buildStatusBreakdown, buildCategoryIndex, buildAliasIndex, dedupeById, detailedSnapshotOf } from '@utils/productAnalytics';

const currentMonth = () => new Date().toISOString().slice(0, 7);
const missingTable = (res) => res?.error && /does not exist|schema cache|Could not find the function/i.test(res.error.message || '');

async function requireSession() {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) throw new Error('صفحة الربحية تتطلّب جلسة دخول مصادَقة. سجّل الخروج ثم ادخل من جديد بالـPIN.');
  return data.session;
}
const nextMonthStart = (monthStart) => { const y = Number(monthStart.slice(0, 4)), m = Number(monthStart.slice(5, 7)); return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`; };

export async function loadProfitability({ month, since, brand = 'lowes' } = {}) {
  await requireSession();
  const { monthStart, from, to } = monthBounds(month || since || currentMonth());
  const nextStart = nextMonthStart(monthStart);

  const winFrom = new Date(Date.parse(from) - 120 * 86400000).toISOString();
  const [ordersRaw, brandRows, entries, econRes, mapRes, historyRes, expensesRes, channelsRes, fxRes, closureRes, mktRes, catalogRes, failRes] = await Promise.all([
    fetchAllRows(() => supabase.rpc('profitability_orders', { p_from: from, p_to: to })),
    fetchAllRows(() => supabase.from('orders').select('id, brand').is('deleted_at', null).gte('order_date', winFrom).lt('order_date', to).in('status', ['delivered', 'settled', 'returned', 'returning', 'not_received']).order('id')),
    fetchAllRows(() => supabase.from('accounting_entries')
      .select('id, entry_type, category, amount_usd, amount_try, amount_syp, channel_id, transfer_group, is_void, entry_date, book')
      .in('entry_type', ['expense', 'transfer']).gte('entry_date', monthStart).lt('entry_date', nextStart).order('id')),
    supabase.from('product_economics').select('*'),
    supabase.from('product_name_map').select('*'),
    supabase.from('product_economics_history').select('*').lte('effective_from', monthStart),
    supabase.from('profitability_expenses').select('*').eq('month', monthStart).order('created_at', { ascending: true }),
    supabase.from('accounting_channels').select('id, name_ar, kind, market'),
    supabase.from('profitability_fx_rates').select('*').lte('month', monthStart).order('entered_at', { ascending: false }),
    supabase.from('profitability_month_closures').select('*').eq('month', monthStart).maybeSingle(),
    supabase.from('product_market_prices').select('*').lte('effective_from', monthStart).order('effective_from', { ascending: false }),
    supabase.from('products').select('name, is_active'),
    supabase.from('order_status_history_failures').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
  ]);
  for (const res of [econRes, mapRes, historyRes, expensesRes, channelsRes, fxRes, closureRes, mktRes]) if (res.error && !missingTable(res)) throw res.error;

  const brandById = new Map((brandRows || []).map((r) => [r.id, r.brand]));
  const orders = (ordersRaw || []).map((r) => ({ ...r, brand: brandById.get(r.id) || null }));
  const expenses = expensesRes.error ? [] : (expensesRes.data || []);
  // كل أسعار الصرف حتى الشهر (المرتجع يُحوَّل بسعر شهر التسليم الأصلي)؛ لوحة الصرف تعرض شهر التقرير فقط
  const fxAllRates = fxRes.error ? [] : (fxRes.data || []);
  const fxRates = fxAllRates.filter((r) => String(r.month).slice(0, 10) === monthStart);
  const result = computeMonthly({
    orders, month: monthStart, brand, expenses, fxRates: fxAllRates,
    nameMapRows: mapRes.data || [],
    historyRows: historyRes.error ? [] : (historyRes.data || []),
    currentRows: econRes.data || [],
    accountingEntries: entries,
    channels: channelsRes.data || [],
    catalogNames: catalogRes?.error ? [] : (catalogRes?.data || []).map((p) => p.name),
    marketPriceRows: mktRes.error ? [] : (mktRes.data || []),
  });
  const closure = closureRes.error ? null : closureRes.data;
  const liveSnap = snapshotOf(result);
  return {
    ...result, expenses, fxRates, since: monthStart, closure, brand,
    closureDiff: closure ? diffSnapshot(closure.snapshot, liveSnap) : [],
    historyFailures30d: failRes?.count ?? 0,
  };
}

// ───── تحليل المنتجات حسب السوق (نفس المحرك، مدى أشهر) ─────
const OPEN_STATUSES = [...STATUS_BUCKETS.in_transit, ...STATUS_BUCKETS.cancelled];
const monthsBetween = (fromM, toM) => {
  const out = []; let y = Number(fromM.slice(0, 4)), m = Number(fromM.slice(5, 7));
  const [ty, tm] = [Number(toM.slice(0, 4)), Number(toM.slice(5, 7))];
  while ((y < ty || (y === ty && m <= tm)) && out.length < 24) { out.push(`${y}-${String(m).padStart(2, '0')}-01`); m++; if (m > 12) { m = 1; y++; } }
  return out;
};

/**
 * كشف مبيعات/تكلفة/ربح إجمالي لكل منتج وسوق لمدى أشهر (حتى 12).
 * الطلبات: profitability_orders لكل شهر (نفس قواعد صفحة الربحية) + الطلبات غير المباعة (ملغى/قيد التوصيل) بأعمدة خفيفة بلا بيانات زبون.
 * لا مصاريف تشغيلية هنا: النطاق = الربح الإجمالي (المبيعات − تكلفة المنتجات).
 */
export async function loadProductAnalytics({ fromMonth, toMonth, brand = 'lowes' } = {}) {
  await requireSession();
  const months = monthsBetween(String(fromMonth || currentMonth()).slice(0, 7), String(toMonth || fromMonth || currentMonth()).slice(0, 7)).slice(0, 12);
  if (!months.length) throw new Error('مدى الأشهر غير صالح');
  const first = monthBounds(months[0]), last = monthBounds(months[months.length - 1]);
  const winFrom = new Date(Date.parse(first.from) - 120 * 86400000).toISOString();
  const toM = months[months.length - 1];

  // RPC شهراً بشهر (تسلسلياً — دالة ثقيلة، لا تزاحم على مهلة القاعدة)؛ النوافذ تتداخل ← إزالة التكرار بالمعرّف
  const rpcPerMonth = [];
  for (const m of months) { const b = monthBounds(m); rpcPerMonth.push(await fetchAllRows(() => supabase.rpc('profitability_orders', { p_from: b.from, p_to: b.to }))); }
  const [brandRows, openRows, econRes, mapRes, historyRes, fxRes, mktRes, catalogRes, closuresRes] = await Promise.all([
    fetchAllRows(() => supabase.from('orders').select('id, brand').is('deleted_at', null).gte('order_date', winFrom).lt('order_date', last.to).in('status', ['delivered', 'settled', 'returned', 'returning', 'not_received']).order('id')),
    fetchAllRows(() => supabase.from('orders').select('id, market, status, order_date, items, brand').is('deleted_at', null).gte('order_date', first.from).lt('order_date', last.to).in('status', OPEN_STATUSES).order('id')),
    supabase.from('product_economics').select('*'),
    supabase.from('product_name_map').select('*'),
    supabase.from('product_economics_history').select('*').lte('effective_from', toM),
    supabase.from('profitability_fx_rates').select('*').lte('month', toM).order('entered_at', { ascending: false }),
    supabase.from('product_market_prices').select('*').lte('effective_from', toM).order('effective_from', { ascending: false }),
    supabase.from('products').select('*'),
    supabase.from('profitability_month_closures').select('*').in('month', months),
  ]);
  for (const res of [econRes, mapRes, historyRes, fxRes, mktRes, closuresRes]) if (res.error && !missingTable(res)) throw res.error;

  const brandById = new Map((brandRows || []).map((r) => [r.id, r.brand]));
  const orders = dedupeById(rpcPerMonth.flat()).map((r) => ({ ...r, brand: brandById.get(r.id) || null }));
  const nameMapRows = mapRes.data || [];
  const fxAll = fxRes.error ? [] : (fxRes.data || []);
  const productRows = catalogRes?.error ? [] : (catalogRes?.data || []);
  const closures = new Map((closuresRes.error ? [] : (closuresRes.data || [])).map((c) => [String(c.month).slice(0, 10), c]));
  const statusSource = dedupeById([...orders, ...(openRows || [])]);
  const perMonth = months.map((month) => {
    const result = computeMonthly({
      orders, month, brand, fxRates: fxAll, nameMapRows,
      historyRows: historyRes.error ? [] : (historyRes.data || []),
      currentRows: econRes.data || [],
      marketPriceRows: mktRes.error ? [] : (mktRes.data || []),
      catalogNames: productRows.map((p) => p.name),
    });
    const closure = closures.get(month) || null;
    return {
      month, result, closure,
      statusBreakdown: buildStatusBreakdown(statusSource, { nameMapRows, month, brand }),
      fxRates: fxAll.filter((r) => String(r.month).slice(0, 10) === month),
      closureDiff: closure ? diffSnapshot(closure.snapshot, snapshotOf(result)) : [],
    };
  });
  const nowIso = new Date().toISOString();
  const latest = orders.reduce((mx, o) => [o.delivered_at, o.return_at].reduce((a, t) => (t && t > a && t <= nowIso ? t : a), mx), '');
  return {
    months: perMonth, brand, fetchedAt: nowIso, dataAsOf: latest || null,
    categoryIndex: buildCategoryIndex(productRows, nameMapRows), aliasIndex: buildAliasIndex(nameMapRows),
    categories: [...new Set(productRows.map((p) => String(p.category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar')),
  };
}

// ───── المصاريف الإضافية (لا قيد محاسبي مقابل لها) ─────
/** إضافة (بلا id) أو تعديل. شهر مغلق يتطلّب retro_reason (يُسجَّل قبل/بعد تلقائياً بالقاعدة). */
export async function saveExpense({ id, month, market = 'all', category, amount_usd, notes = '', accounting_entry_id = null, retro_reason = null }) {
  const row = {
    month: `${String(month).slice(0, 7)}-01`, market, category: String(category || '').trim(),
    amount_usd: Number(amount_usd) || 0, notes: notes?.trim() || null, updated_at: new Date().toISOString(),
    accounting_entry_id: accounting_entry_id || null, retro_reason: retro_reason?.trim() || null, source: accounting_entry_id ? 'accounting_link' : 'manual_extra',
  };
  if (!row.category) throw new Error('اختر تصنيف المصروف');
  if (row.amount_usd < 0) throw new Error('القيمة لا يمكن أن تكون سالبة');
  const q = id ? supabase.from('profitability_expenses').update(row).eq('id', id) : supabase.from('profitability_expenses').insert(row);
  const { error } = await q;
  if (error) throw new Error(/MONTH_CLOSED/.test(error.message) ? 'هذا الشهر مغلق — أدخل سبب التعديل الرجعي' : error.message);
}

export async function deleteExpense(id, { reason = '', actor = '' } = {}) {
  const { error } = await supabase.rpc('profitability_delete_expense', { p_id: id, p_reason: reason, p_actor: actor });
  if (error) throw new Error(/MONTH_CLOSED/.test(error.message) ? 'هذا الشهر مغلق — أدخل سبب الحذف الرجعي' : error.message);
}

// ───── أسعار الصرف الشهرية اليدوية (إلحاقية: لا تعديل ولا حذف) ─────
export async function saveFxRate({ month, scope = 'all', currency, units_per_usd, note = '', name, retro_reason = null }) {
  const { data: u } = await supabase.auth.getUser();
  const rate = Number(units_per_usd);
  if (!(rate > 0)) throw new Error('أدخل سعر تحويل موجباً (وحدات العملة لكل 1 دولار)');
  if (!name) throw new Error('اسم المُدخِل مطلوب');
  const { error } = await supabase.from('profitability_fx_rates').insert({
    month: `${String(month).slice(0, 7)}-01`, scope, currency, units_per_usd: rate, note: note?.trim() || null,
    entered_by: u?.user?.id, entered_by_name: name, retro_reason: retro_reason?.trim() || null,
  });
  if (error) throw new Error(/MONTH_CLOSED/.test(error.message) ? 'هذا الشهر مغلق — أدخل سبب التعديل الرجعي' : error.message);
}

// ───── إغلاق الشهر وسجل التعديل الرجعي ─────
export async function closeMonth({ month, result, name, note = '' }) {
  // النسخة المعتمدة: الأرقام المفتاحية نفسها + detail (أسطر المنتجات لكل سوق وأسعار الصرف المستخدمة) — diffSnapshot يقارن المفتاحية فقط
  const snap = detailedSnapshotOf(snapshotOf(result), result, { fxRates: result.fxRates || [], brand: result.brand || 'lowes' });
  const { error } = await supabase.rpc('profitability_close_month', { p_month: monthStart(month), p_snapshot: snap, p_name: name, p_note: note || null });
  if (error) throw error;
}
export async function acknowledgeRetroDrift({ month, reason, before, after, name }) {
  if (!reason?.trim()) throw new Error('اكتب سبب التغيّر الرجعي');
  const { error } = await supabase.rpc('profitability_log_retro', { p_month: monthStart(month), p_reason: reason.trim(), p_before: before, p_after: after, p_name: name });
  if (error) throw error;
}
export async function loadRetroLog(month) {
  const { data, error } = await supabase.from('profitability_retro_log').select('*').eq('month', monthStart(month)).order('created_at', { ascending: false }).limit(50);
  if (error) throw error; return data || [];
}
const monthStart = (m) => `${String(m).slice(0, 7)}-01`;

export async function setProductActive(canonicalName, isActive) {
  const { error } = await supabase.from('product_name_map')
    .update({ is_active: isActive, updated_at: new Date().toISOString() }).eq('canonical_name', canonicalName);
  if (error) throw error;
  return true;
}

/**
 * حفظ السعر/التكلفة عبر دالة ذرّية: القيمة الجديدة تسري من الشهر الحالي (إسطنبول) وما بعده،
 * والأشهر السابقة لا تتغيّر. حقل غير مُمرَّر = يبقى كما هو.
 */
export async function saveEconomics(itemName, fields = {}) {
  const pick = (k) => (fields[k] === undefined || fields[k] === null ? null : Number(fields[k]));
  const { data, error } = await supabase.rpc('profitability_save_economics', {
    p_item: itemName,
    p_price: pick('sale_price_usd'), p_cost: pick('cost_usd'),
    p_ad: pick('ad_cost_usd'), p_ship: pick('shipping_cost_usd'), p_month: fields.month || null,
  });
  if (error) throw error;
  return data;
}

/**
 * سعر بيع (وتكلفة اختيارية) لمنتج في سوق ابتداءً من شهر. الشهر الحالي أو القادم فقط؛ إعادة حفظ الشهر نفسه تحدّث الصف نفسه.
 * حقل null = يبقى كما هو (يرث من آخر صف سابق لنفس المنتج والسوق).
 */
export async function saveMarketPrice({ item, market, price = null, cost = null, ship = null, month = null, name = null }) {
  const { data, error } = await supabase.rpc('profitability_save_market_price', {
    p_item: item, p_market: market, p_price: price, p_cost: cost, p_ship: ship, p_month: month, p_name: name,
  });
  if (error) throw new Error(/past months/.test(error.message) ? 'لا يمكن تعديل شهر سابق — الأشهر الماضية لا تُعاد كتابتها' : /not allowed/.test(error.message) ? 'لا صلاحية لتعديل الأسعار' : error.message);
  return data;
}
