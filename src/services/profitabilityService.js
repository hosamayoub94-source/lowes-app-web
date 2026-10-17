// =============================================================
// Profitability Service — ربحية شهرية من الطلبات الفعلية + مصاريف شهرية يدوية.
// الحساب نفسه في @utils/profitabilityCalc (دوال صرفة مُختبَرة)؛ هنا الجلب والحفظ فقط.
// السعر/التكلفة مُنسَّخان بالشهر: product_economics_history (انظر migration 20261017120000).
// =============================================================
import { supabase, supabaseAnon } from './supabase';
import { fetchAllRows } from '@utils/fetchAllRows';
import { computeMonthly, monthBounds, SALE_STATUSES, RETURN_STATUSES } from '@utils/profitabilityCalc';

const currentMonth = () => new Date().toISOString().slice(0, 7);
const missingTable = (res) => res?.error && /does not exist|schema cache/i.test(res.error.message || '');

async function requireSession() {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    throw new Error('صفحة الربحية تتطلّب جلسة دخول مصادَقة. سجّل الخروج ثم ادخل من جديد بالـPIN.');
  }
}

export async function loadProfitability({ month, since, brand = 'lowes' } = {}) {
  await requireSession();
  const { monthStart, from, to } = monthBounds(month || since || currentMonth());

  const [orders, econRes, mapRes, historyRes, expensesRes] = await Promise.all([
    // على دفعات (orders ضخم). نجلب المبيعات والمرتجعات فقط؛ المحذوف (soft-delete) مستبعد.
    fetchAllRows(() => supabaseAnon.from('orders')
      .select('status, items, order_date, market, amount, currency')
      .is('deleted_at', null)
      .in('status', [...SALE_STATUSES, ...RETURN_STATUSES])
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

  const expenses = expensesRes.error ? [] : (expensesRes.data || []);
  const result = computeMonthly({
    orders, month: monthStart, brand, expenses,
    nameMapRows: mapRes.data || [],
    historyRows: historyRes.error ? [] : (historyRes.data || []),
    currentRows: econRes.data || [],
  });
  return { ...result, expenses, since: monthStart };
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
