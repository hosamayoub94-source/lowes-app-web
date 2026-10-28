// =============================================================
// deliveryAccountingService — جلب فقط. الحساب كله في @utils/deliveryAccounting (دوال صرفة مُختبَرة).
// المصدر: الدالة profitability_orders (تاريخ التسليم من order_status_history/إثبات الشحن) — نفس مصدر الربحية،
// فلا تعريف ثالث لـ«شهر التسليم». تُستعمل أيضاً من محرّك الرواتب ليتطابق تقرير التسليمات مع العمولات.
// =============================================================
import { supabase } from '@services/supabase';
import { fetchAllRows } from '@utils/fetchAllRows';
import { selectDeliveredInPeriod, UNDELIVERED_GROUPS } from '@utils/deliveryAccounting';
import { LEDGER_STATUSES, buildStatusViews } from '@utils/statusLedger';

const DAY = 86400000;
const OPEN_STATUSES = Object.values(UNDELIVERED_GROUPS).flatMap((g) => g.statuses).filter((s) => !['returned', 'returning', 'not_received'].includes(s));
const EXTRA_COLS = 'id, brand, handler_name, customer_name, shipping_company, payment_method, tracking_number';
const LEDGER_ORDER_COLS = 'id, order_id, market, status, order_date, items, amount, currency, handler_name, customer_name, shipping_company, payment_method, brand, tracking_number, delivery_cost, shipping_payer, payment_status, paid_amount, deleted_at';
// الإلغاء: طلب فترة سابقة لا يبقى يحمّل القاعدة بعد تبديل الشهر (الدالة الثقيلة تُلغى عند قطع الاتصال)
const withSignal = (q, signal) => (signal ? q.abortSignal(signal) : q);

/** يدمج حقول الطلب (بائع/عميل/شحن/دفع/براند) غير الموجودة بمخرجات الدالة. */
async function attachOrderFields(rpcRows, from, to, signal) {
  if (!rpcRows.length) return rpcRows;
  const winFrom = new Date(Date.parse(from) - 120 * DAY).toISOString();
  const extra = await fetchAllRows(() => withSignal(supabase.from('orders').select(EXTRA_COLS)
    .is('deleted_at', null).gte('order_date', winFrom).lt('order_date', to)
    .in('status', ['delivered', 'settled', 'returned', 'returning', 'not_received']).order('id'), signal));
  const byId = new Map((extra || []).map((r) => [r.id, r]));
  return rpcRows.map((r) => ({ ...r, ...(byId.get(r.id) || {}) }));
}

/** الطلبات المسلَّمة/المرتجعة ضمن الفترة (تدخل الحساب). نفس الدالة تستعملها الرواتب. */
export async function loadDeliveredForPeriod({ from, to, includeLegacy = true, signal } = {}) {
  const rows = await fetchAllRows(() => withSignal(supabase.rpc('profitability_orders', { p_from: from, p_to: to }), signal));
  const full = await attachOrderFields(rows || [], from, to, signal);
  return { rows: full, ...selectDeliveredInPeriod(full, { from, to, includeLegacy }) };
}

/** طلبات غير مسلَّمة حالياً (قبل نهاية الفترة): للعرض فقط، لا تدخل أي حساب. */
async function loadOpenOrders(from, to, signal) {
  const winFrom = new Date(Date.parse(from) - 120 * DAY).toISOString();
  const rows = await fetchAllRows(() => withSignal(supabase.from('orders')
    .select('id, order_id, market, status, order_date, items, amount, currency, handler_name, customer_name, shipping_company, payment_method, brand, tracking_number, delivery_cost, shipping_payer, payment_status, paid_amount')
    .is('deleted_at', null).gte('order_date', winFrom).lt('order_date', to).in('status', OPEN_STATUSES).order('id'), signal));
  return (rows || []).map((r) => ({ ...r, order_code: r.order_id }));
}

/** مسار حالات كل طلب مُسوّى (id → [الحالات بالترتيب]) من order_status_history — قراءة فقط. */
async function loadSettledPaths(ids, signal) {
  const map = new Map();
  if (!ids.length) return map;
  const hist = await fetchAllRows(() => withSignal(supabase.from('order_status_history').select('order_id, to_status, changed_at').in('order_id', ids).order('order_id').order('changed_at'), signal));
  for (const h of hist || []) { if (!map.has(h.order_id)) map.set(h.order_id, []); map.get(h.order_id).push(h.to_status); }
  return map;
}

const CHUNK = 100;
let ledgerCache = null; // أحداث الحالات + الطلبات الحالية لا تتعلق بالفترة: تُحمَّل مرة وتُعاد 5 دقائق

/** كل أحداث الحالات الأربع (راجع/لم يُستلم/مرتجع/تسوية) + الطلبات الحالية بهذه الحالات — بلا نافذة زمنية. */
async function loadLedgerBase(signal) {
  if (ledgerCache && Date.now() - ledgerCache.at < 5 * 60 * 1000) return ledgerCache;
  const [events, current] = await Promise.all([
    fetchAllRows(() => withSignal(supabase.from('order_status_history').select('id, order_id, to_status, changed_at, source').in('to_status', LEDGER_STATUSES).order('id'), signal)),
    fetchAllRows(() => withSignal(supabase.from('orders').select(LEDGER_ORDER_COLS).is('deleted_at', null).in('status', LEDGER_STATUSES).order('id'), signal)),
  ]);
  ledgerCache = { at: Date.now(), events: events || [], current: current || [] };
  return ledgerCache;
}

async function fetchByIds(table, cols, ids, signal, extra) {
  const out = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const rows = await fetchAllRows(() => withSignal(extra(supabase.from(table).select(cols).in(table === 'orders' ? 'id' : 'order_id', part)), signal));
    out.push(...(rows || []));
  }
  return out;
}

/** دفتر الحالات للفترة: أحداث كل الأزمنة + طلبات الحالية + طلبات أحداث الفترة + مسارات الطلبات المُسوّاة. */
export async function loadStatusLedger({ from, to, signal }) {
  const base = await loadLedgerBase(signal);
  const t0 = Date.parse(from), t1 = Date.parse(to);
  const have = new Set(base.current.map((o) => o.id));
  const periodIds = [...new Set(base.events.filter((e) => { const t = Date.parse(e.changed_at); return t >= t0 && t < t1; }).map((e) => e.order_id))].filter((id) => !have.has(id));
  const extra = await fetchByIds('orders', LEDGER_ORDER_COLS, periodIds, signal, (q) => q.is('deleted_at', null).order('id'));
  const settledIds = [...new Set([...base.events.filter((e) => e.to_status === 'settled').map((e) => e.order_id), ...base.current.filter((o) => o.status === 'settled').map((o) => o.id)])];
  const hist = await fetchByIds('order_status_history', 'order_id, to_status, changed_at', settledIds, signal, (q) => q.order('order_id').order('changed_at'));
  const paths = new Map();
  for (const h of hist) { if (!paths.has(h.order_id)) paths.set(h.order_id, []); paths.get(h.order_id).push({ to_status: h.to_status, changed_at: h.changed_at }); }
  return { events: base.events, orders: [...base.current, ...extra], paths };
}

/**
 * «تمت التسوية» بلا تسليم سابق داخل الفترة (الزبون دفع أجور الشحن ولم يستلم): يُعدّ راجعاً للبائع للعرض بلا خصم. قراءة فقط.
 * لا يدخل عدّاد الرواجع المخصوم في الرواتب.
 */
export async function loadSettledAsReturns({ from, to, signal } = {}) {
  const ledger = await loadStatusLedger({ from, to, signal });
  const views = buildStatusViews(ledger, { from, to });
  return (views.settlements || []).filter((o) => o.settlement_kind !== 'delivered_settled' && !o.delivered_before);
}

/** مراجع أسعار المنتجات (نسخ تاريخية + أسعار سوق + خريطة الأسماء). */
async function loadProductRefs(to) {
  const day = String(to).slice(0, 10);
  const [econ, map, hist, mkt] = await Promise.all([
    supabase.from('product_economics').select('*'),
    supabase.from('product_name_map').select('*'),
    supabase.from('product_economics_history').select('*').lte('effective_from', day),
    supabase.from('product_market_prices').select('*').lte('effective_from', day).order('effective_from', { ascending: false }),
  ]);
  return {
    currentRows: econ.error ? [] : econ.data || [],
    nameMapRows: map.error ? [] : map.data || [],
    historyRows: hist.error ? [] : hist.data || [],
    marketPriceRows: mkt.error ? [] : mkt.data || [],
  };
}

/** تعرفة الشحن (كل الصفوف مع التاريخ). الجدول قد لا يكون مطبَّقاً بعد: يُعاد [] ولا يكسر اللوحة. */
export async function loadCarrierRates(signal) {
  const res = await withSignal(supabase.from('shipping_carrier_rates').select('*').order('effective_from', { ascending: false }), signal);
  if (res.error) {
    if (/does not exist|schema cache|Could not find/i.test(res.error.message || '')) return { rates: [], missingTable: true };
    throw res.error;
  }
  return { rates: res.data || [], missingTable: false };
}

/** حفظ تعرفة (الدالة تفرض: دور محاسبة، ولا إعادة كتابة للتاريخ). */
export async function saveCarrierRate({ carrier, market, currency, outbound, returnPolicy, returnFee, effectiveFrom, note, name }) {
  const { data, error } = await supabase.rpc('shipping_rate_save', {
    p_carrier: carrier, p_market: market, p_currency: currency, p_outbound: Number(outbound),
    p_return_policy: returnPolicy || 'unknown', p_return_fee: returnPolicy === 'fixed' ? Number(returnFee) : null,
    p_effective_from: effectiveFrom || null, p_note: note || null, p_name: name || null,
  });
  if (error) {
    const m = error.message || '';
    if (/history is never rewritten/.test(m)) throw new Error('لا يمكن إدخال تاريخ أقدم من آخر تعرفة لهذه الشركة — التاريخ لا يُعاد كتابته. اختر تاريخاً أحدث.');
    if (/past rate is locked/.test(m)) throw new Error('هذه تعرفة من شهر سابق ومقفلة — أضف تعرفة جديدة بتاريخ أحدث.');
    if (/not allowed/.test(m)) throw new Error('لا صلاحية: تعديل التعرفة لمدير الحسابات أو الأدمن فقط.');
    throw error;
  }
  return data;
}

/** إلغاء تعرفة أُدخلت بالخطأ (أدمن فقط، الشهر الحالي أو بعده فقط، والنسخة تُحفظ بسجل لا يُمحى). */
export async function deleteCarrierRate({ id, name }) {
  const { error } = await supabase.rpc('shipping_rate_delete', { p_id: id, p_name: name || null });
  if (error) {
    const m = error.message || '';
    if (/past rate is locked/.test(m)) throw new Error('هذه تعرفة من شهر سابق ومقفلة — لا تُحذف. أضف تعرفة جديدة بتاريخ أحدث.');
    if (/not allowed/.test(m)) throw new Error('لا صلاحية: إلغاء التعرفة للأدمن فقط.');
    if (/not found/.test(m)) throw new Error('التعرفة غير موجودة (ربما أُلغيت). حدّث الصفحة.');
    throw error;
  }
}

/** عمولات الشهر كما حُسبت فعلاً بمسيّر الرواتب (قراءة فقط) — اسم الموظف → عمولة $. */
export async function loadStoredCommissions(year, month) {
  const { data: run } = await supabase.from('payroll_runs').select('id').eq('period_year', year).eq('period_month', month).maybeSingle();
  if (!run?.id) return [];
  const [{ data: entries }, { data: profs }] = await Promise.all([
    supabase.from('payroll_entries').select('employee_id, commission_usd, sales_total_usd, sales_orders_count').eq('run_id', run.id),
    supabase.from('profiles').select('id, employee_name'),
  ]);
  const nameOf = new Map((profs || []).map((p) => [p.id, p.employee_name]));
  return (entries || []).map((e) => ({ name: nameOf.get(e.employee_id) || e.employee_id, commission: Number(e.commission_usd) || 0, salesUsd: Number(e.sales_total_usd) || 0, orders: Number(e.sales_orders_count) || 0 }));
}

/** كل بيانات الفترة الخام (بلا فلاتر) — الشاشة تُركّب التقرير والفلاتر محلياً بلا إعادة جلب. */
export async function loadDeliveryData({ period, includeLegacy = true, signal }) {
  const [{ rows }, open, refs, statusLedger, rateRes] = await Promise.all([
    loadDeliveredForPeriod({ from: period.from, to: period.to, includeLegacy, signal }),
    loadOpenOrders(period.from, period.to, signal),
    loadProductRefs(period.to),
    loadStatusLedger({ from: period.from, to: period.to, signal }),
    loadCarrierRates(signal),
  ]);
  const seen = new Set(rows.map((r) => r.id));
  const settledPaths = await loadSettledPaths(rows.filter((r) => r.status === 'settled').map((r) => r.id), signal);
  return { rows: [...rows, ...open.filter((r) => !seen.has(r.id))], refs: { ...refs, settledPaths, statusLedger, carrierRates: rateRes.rates, ratesMissingTable: rateRes.missingTable } };
}
