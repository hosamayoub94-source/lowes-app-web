import { supabase } from '@services/supabase';

export async function listAbsenceReviews({ from, to, employeeId } = {}) {
  let q = supabase.from('payroll_absence_reviews').select('*').order('absence_date');
  if (from) q = q.gte('absence_date', from);
  if (to) q = q.lte('absence_date', to);
  if (employeeId) q = q.eq('employee_id', employeeId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function saveAbsenceReview({ employeeId, employeeName, absenceDate, reason, status, reviewer }) {
  const payload = {
    employee_id: employeeId,
    employee_name: employeeName,
    absence_date: absenceDate,
    reason: reason || null,
    status,
    reviewed_by: reviewer || null,
    reviewed_at: status === 'pending' ? null : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('payroll_absence_reviews')
    .upsert(payload, { onConflict: 'employee_id,absence_date' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listApprovedAbsenceReviews(employeeId, year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  const { data, error } = await supabase
    .from('payroll_absence_reviews')
    .select('absence_date')
    .eq('employee_id', employeeId)
    .eq('status', 'approved')
    .gte('absence_date', from)
    .lt('absence_date', to);
  if (error) throw error;
  return data || [];
}
