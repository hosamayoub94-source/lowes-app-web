// =============================================================
// Allowance Service — بدلات دورية بعملتها الأصلية (payroll_allowances)
// مثال: بدل طعام 7500 ل.س جديد لموظفي الصالة. المحرك يحوّلها لدولار بسعر
// الدورة المثبَّت. الإضافة/التعديل/الإلغاء من شاشة الرواتب (RLS: payroll_has_access).
// =============================================================
import { supabase } from '@services/supabase';

export const ALLOWANCE_KIND_LABELS = { food: '🍽️ بدل طعام', other: '➕ بدل آخر' };
export const ALLOWANCE_CURRENCIES = ['SYP', 'USD', 'TRY'];

export async function listAllowances() {
  const { data, error } = await supabase
    .from('payroll_allowances')
    .select('id, employee_id, kind, amount, currency, is_active, note, profiles(employee_name)')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(r => ({ ...r, employee_name: r.profiles?.employee_name ?? '' }));
}

export async function listPayrollEmployees() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, employee_name')
    .eq('is_active', true)
    .order('employee_name');
  if (error) throw new Error(error.message);
  return data || [];
}

/** إضافة أو تعديل (مفتاح التفرّد: الموظف + النوع). */
export async function saveAllowance({ employeeId, kind = 'food', amount, currency = 'SYP', isActive = true, note = null }) {
  const n = Number(amount);
  if (!employeeId) throw new Error('اختر الموظف');
  if (!(n >= 0)) throw new Error('المبلغ غير صالح');
  const { data, error } = await supabase
    .from('payroll_allowances')
    .upsert(
      { employee_id: employeeId, kind, amount: n, currency, is_active: isActive, note, updated_at: new Date().toISOString() },
      { onConflict: 'employee_id,kind' },
    )
    .select('id, employee_id, kind, amount, currency, is_active, note')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteAllowance(id) {
  const { error } = await supabase.from('payroll_allowances').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** القيمة بالدولار حسب أسعار الدورة المثبَّتة (rate_usd_syp = كم ل.س للدولار). null إن لم يوجد سعر. */
export function allowanceUsd(a, run) {
  const amount = Number(a?.amount) || 0;
  if (a?.currency === 'USD') return amount;
  const rate = a?.currency === 'SYP' ? Number(run?.rate_usd_syp) : a?.currency === 'TRY' ? Number(run?.rate_usd_try) : 0;
  return rate > 0 ? Math.round((amount / rate) * 100) / 100 : null;
}
