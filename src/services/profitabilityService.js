// =============================================================
// Profitability Service — ربحية شهرية من الطلبات الفعلية + مصاريف شهرية يدوية.
// الحساب نفسه في @utils/profitabilityCalc (دوال صرفة مُختبَرة)؛ هنا الجلب والحفظ فقط.
// السعر/التكلفة مُنسَّخان بالشهر: product_economics_history (migrations 20261017120000 + 20261017180000).
// =============================================================
import { supabase, supabaseAnon } from './supabase';
import { fetchAllRows } from '@utils/fetchAllRows';
import { computeMonthly, monthBounds, SALE_STATUSES, SETTLED_STATUSES, RETURN_STATUSES } from '@utils/profitabilityCalc';

const currentMonth = () => new Date().toISOString().slice(0, 7);
const missingTable = (res) => res?.error && /does not exist|schema cache/i.test(res.error.message || '');

async function requireSession() {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    throw new Error('صفحة الربحية تتطلّب جلسة دخول مصادَقة. سجّل الخروج ثم ادخل من جديد بالـPIN.');
  }
}

/** سجل حالات المرتجعات (لمعرفة هل سُلِّم الطلب قبل إرجاعه). null = تعذّر الجلب. */
async function loadReturnHistory(orderIds) {
  const out = {};
  for (let i = 0; i < orderIds.length; i += 100) {
    const chunk = orderIds.slice(i, i + 100);
    const { data, error } = await supabase.from('order_status_history').select('order_id, to_status, changed_at').in('order_id', chunk);
    if (error) return null;
    (data || []).forEach((h) => { (out[h.order_id] ||= []).push(h); });
  }
  return out;
}

/** مصاريف الشحن/الإعلانات المسجَّلة بدفتر المحاسبة لنفس الشهر — للعرض فقط، لا تدخل الحساب (منعاً للعدّ المزدوج). */
async function loadAccountingNotice(monthStart, to) {
  const { data, error } = await supabase.from('accounting_entries')
    .select('category, amount_usd, amount_try, amount_syp, is_void')
    .eq('entry_type', 'expense').in('category', ['شحن', 'إعلانات'])
    .gte('entry_date', monthStart).lt('entry_date', to.slice(0, 10));
  if (error) return null;
  const rows = {};
  (data || []).filter((e) => !e.is_void).forEach((e) => {
    const r = (rows[e.category] ||= { n: 0, USD: 0, TRY: 0, SYP: 0 });
    r.n++; r.USD += Number(e.amount_usd) || 0; r.TRY += Number(e.amount_try) || 0; r.SYP += Number(e.amount_syp) || 0;
  });
  return rows;
}

export async function loadProfitability({ month, since, brand = 'lowes' } = {}) {
  await requireSession();
  const { monthStart, from, to } = monthBounds(month || since || currentMonth());

  const [orders, econRes, mapRes, historyRes, expensesRes] = await Promise.all([
    // على دفعات (orders ضخم). نجلب التسليم والمرتجعات والتسويات فقط؛ المحذوف (soft-delete) مستبعد.
    fetchAllRows(() => supabaseAnon.from('orders')
      .select('id, status, items, order_date, market, amount, currency')
      .is('deleted_at', null)
      .in('status', [...SALE_STATUSES, ...SETTLED_STATUSES, ...RETURN_STATUSES])
      .gte('order_date', from).lt('order_date', to)),
    supabase.from('product_economics').select('*'),
    supabase.from('product_name_map').select('*'),
    supabase.from('product_economics_history').select('*').lte('effective_from', monthStart),
    supabase.from('profitability_expenses').select('*').eq('month', monthStart).order('created_at', { ascending: true }),
  ]);
  if (econRes.error && !missingTable(econRes)) throw econRes.error;
  if (mapRes.error && !missingTable(mapRes)) throw mapRes.error;
  if (historyRes.error && !missingTable(historyRes)) throw historyRes.error;
  if (expensesRes.error && !missingTable(expensesRes)) throw expensesRes.error;

  const returnIds = orders.filter((o) => RETURN_STATUSES.includes(o.status)).map((o) => o.id);
  const [statusHistory, accountingNotice] = await Promise.all([
    returnIds.length ? loadReturnHistory(returnIds) : Promise.resolve({}),
    loadAccountingNotice(monthStart, to),
  ]);

  const expenses = expensesRes.error ? [] : (expensesRes.data || []);
  const result = computeMonthly({
    orders, month: monthStart, brand, expenses,
    nameMapRows: mapRes.data || [],
    historyRows: historyRes.error ? [] : (historyRes.data || []),
    currentRows: econRes.data || [],
    statusHistory: statusHistory || undefined,
  });
  return { ...result, expenses, since: monthStart, accountingNotice, returnHistoryUnavailable: statusHistory === null };
}

/** إضافة مصروف (بلا id) أو تعديله (مع id). month بصيغة YYYY-MM. */
export async function saveExpense({ id, month, market = 'all', category, amount_usd, notes = '' }) {
  const row = {
    month: `${String(month).slice(0, 7)}-01`, market, category: String(category || '').trim(),
    amount_usd: Number(amount_usd) || 0, notes: notes?.trim() || null, updated_at: new Date().toISOString(),
  };
  if (!row.category) throw new Error('اختر تصنيف المصروف');
  if (row.amount_usd < 0) throw new Error('القيمة لا يمكن أن تكون سالبة');
  const q = id
    ? supabase.from('profitability_expenses').update(row).eq('id', id)
    : supabase.from('profitability_expenses').insert(row);
  const { error } = await q;
  if (error) throw error;
}

export async function deleteExpense(id) {
  const { error } = await supabase.from('profitability_expenses').delete().eq('id', id);
  if (error) throw error;
}

export async function setProductActive(canonicalName, isActive) {
  const { error } = await supabase.from('product_name_map')
    .update({ is_active: isActive, updated_at: new Date().toISOString() }).eq('canonical_name', canonicalName);
  if (error) throw error;
  return true;
}

/**
 * حفظ السعر/التكلفة عبر دالة ذرّية في القاعدة: القيمة الجديدة تسري من الشهر الحالي (إسطنبول)
 * وما بعده، والأشهر السابقة لا تتغيّر. حقل غير مُمرَّر = يبقى كما هو حالياً.
 */
export async function saveEconomics(itemName, fields = {}) {
  const pick = (k) => (fields[k] === undefined || fields[k] === null ? null : Number(fields[k]));
  const { data, error } = await supabase.rpc('profitability_save_economics', {
    p_item: itemName,
    p_price: pick('sale_price_usd'), p_cost: pick('cost_usd'),
    p_ad: pick('ad_cost_usd'), p_ship: pick('shipping_cost_usd'),
  });
  if (error) throw error;
  return data; // تاريخ بدء النسخة المحفوظة
}
