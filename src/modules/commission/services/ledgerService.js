// =============================================================
// Ledger Service — قراءة دفتر العمولات والمحفظة وطلبات السحب.
// كل القراءات محكومة بـ RLS (البائع يرى صفوفه، المشرفة فريقها).
// =============================================================
import { supabase } from '@services/supabase';

/** الشهر الحالي بصيغة 'YYYY-MM'. */
export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

/** رصيد المحفظة (cache من profiles.wallet_balance). */
export async function getWalletBalance(sellerId) {
  if (!sellerId) return 0;
  const { data, error } = await supabase
    .from('profiles').select('wallet_balance').eq('id', sellerId).maybeSingle();
  if (error) { console.warn('wallet:', error.message); return 0; }
  return Number(data?.wallet_balance || 0);
}

/** الكشف الشهري مجمّعاً حسب النوع والعملة (عبر RPC commission_statement). */
export async function getStatement(sellerId, month = currentMonth()) {
  if (!sellerId) return [];
  const { data, error } = await supabase
    .rpc('commission_statement', { p_seller: sellerId, p_month: month });
  if (error) { console.warn('statement:', error.message); return []; }
  return data || [];
}

/** صفوف الدفتر التفصيلية لشهر معيّن. */
export async function getLedgerRows(sellerId, month = currentMonth()) {
  if (!sellerId) return [];
  const { data, error } = await supabase
    .from('commission_ledger')
    .select('id, type, amount, currency, pct, basis_amount, note, created_at, order_id')
    .eq('seller_id', sellerId).eq('month', month)
    .order('created_at', { ascending: false });
  if (error) { console.warn('ledger:', error.message); return []; }
  return data || [];
}

/** طلبات السحب الخاصة بالبائع. */
export async function listWithdrawals(sellerId) {
  if (!sellerId) return [];
  const { data, error } = await supabase
    .from('withdrawals').select('*')
    .eq('seller_id', sellerId).order('created_at', { ascending: false });
  if (error) { console.warn('withdrawals:', error.message); return []; }
  return data || [];
}

/** إنشاء طلب سحب (pending) — تعتمده الإدارة لاحقاً. */
export async function requestWithdrawal(sellerId, amount, currency = 'USD', note = '') {
  if (!sellerId || !(Number(amount) > 0)) return false;
  const { error } = await supabase
    .from('withdrawals').insert({ seller_id: sellerId, amount: Number(amount), currency, note });
  if (error) { console.warn('requestWithdrawal:', error.message); return false; }
  return true;
}

// تسميات أنواع صفوف الدفتر (للعرض).
export const LEDGER_TYPE_LABELS = {
  personal:         'عمولة شخصية',
  team_override:    'عمولة فريق',
  group_override:   'عمولة إشراف',
  bonus_volume:     'بونص حجم',
  bonus_new_client: 'بونص عميل جديد',
  bonus_collection: 'بونص تحصيل',
  bonus_retention:  'بونص احتفاظ',
  bonus_recruit:    'بونص ضمّ',
  penalty:          'خصم',
  adjustment:       'تعديل',
};

/** كشف عمولات كل البائعين لشهر (إدارة فقط — محكوم في الـRPC). */
export async function getManagerReport(month = currentMonth()) {
  const { data, error } = await supabase.rpc('manager_commission_report', { p_month: month });
  if (error) { console.warn('managerReport:', error.message); return []; }
  return data || [];
}

/** لوحة شرف العمولات (موحّدة بالـUSD تقريبياً للترتيب). */
export async function getLeaderboard(month = currentMonth(), limit = 10) {
  const { data, error } = await supabase
    .rpc('commission_leaderboard', { p_month: month, p_limit: limit });
  if (error) { console.warn('leaderboard:', error.message); return []; }
  return data || [];
}

export const WITHDRAWAL_STATUS_LABELS = {
  pending:  'قيد المراجعة',
  approved: 'معتمد',
  paid:     'مدفوع',
  rejected: 'مرفوض',
};
