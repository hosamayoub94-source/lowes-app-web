// =============================================================
// deliveryAccountingService — جلب فقط. الحساب كله في @utils/deliveryAccounting (دوال صرفة مُختبَرة).
// المصدر: الدالة profitability_orders (تاريخ التسليم من order_status_history/إثبات الشحن) — نفس مصدر الربحية،
// فلا تعريف ثالث لـ«شهر التسليم». تُستعمل أيضاً من محرّك الرواتب ليتطابق تقرير التسليمات مع العمولات.
// =============================================================
import { supabase } from '@services/supabase';
import { fetchAllRows } from '@utils/fetchAllRows';
import { selectDeliveredInPeriod, UNDELIVERED_GROUPS } from '@utils/deliveryAccounting';

const DAY = 86400000;
const OPEN_STATUSES = Object.values(UNDELIVERED_GROUPS).flatMap((g) => g.statuses).filter((s) => s !== 'returned');
const EXTRA_COLS = 'id, brand, handler_name, customer_name, shipping_company, payment_method';
// الإلغاء: طلب فترة سابقة لا يبقى يحمّل القاعدة بعد تبديل الشهر (الدالة الثقيلة تُلغى عند قطع الاتصال)
const withSignal = (q, signal) => (signal ? q.abortSignal(signal) : q);

/** يدمج حقول الطلب (بائع/عميل/شحن/دفع/براند) غير الموجودة بمخرجات الدالة. */
async function attachOrderFields(rpcRows, from, to, signal) {
  if (!rpcRows.length) return rpcRows;
  const winFrom = new Date(Date.parse(from) - 120 * DAY).toISOString();
  const extra = await fetchAllRows(() => withSignal(supabase.from('orders').select(EXTRA_COLS)
    .is('deleted_at', null).gte('order_date', winFrom).lt('order_date', to)
    .in('status', ['delivered', 'settled', 'returned']).order('id'), signal));
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
    .select('id, order_id, market, status, order_date, items, amount, currency, handler_name, customer_name, shipping_company, payment_method, brand, tracking_number')
    .is('deleted_at', null).gte('order_date', winFrom).lt('order_date', to).in('status', OPEN_STATUSES).order('id'), signal));
  return (rows || []).map((r) => ({ ...r, order_code: r.order_id }));
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
  const [{ rows }, open, refs] = await Promise.all([
    loadDeliveredForPeriod({ from: period.from, to: period.to, includeLegacy, signal }),
    loadOpenOrders(period.from, period.to, signal),
    loadProductRefs(period.to),
  ]);
  const seen = new Set(rows.map((r) => r.id));
  return { rows: [...rows, ...open.filter((r) => !seen.has(r.id))], refs };
}
