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

// Absence decisions for one employee-month, split the way the payslip shows them. Only an `approved`
// decision deducts; `rejected` (excused / no deduction) and `pending` never do. `asOf` (YYYY-MM-DD)
// drops anything after that date — a day that has not happened yet is never an absence.
export async function listAbsenceReviewsForMonth(employeeId, year, month, asOf = null) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  const { data, error } = await supabase
    .from('payroll_absence_reviews')
    .select('absence_date, status')
    .eq('employee_id', employeeId)
    .gte('absence_date', from)
    .lt('absence_date', to);
  if (error) throw error;
  return (data || []).filter((r) => !asOf || String(r.absence_date).slice(0, 10) <= asOf);
}

export async function listApprovedAbsenceReviews(employeeId, year, month, asOf = null) {
  const rows = await listAbsenceReviewsForMonth(employeeId, year, month, asOf);
  return rows.filter((r) => r.status === 'approved').map((r) => ({ absence_date: r.absence_date }));
}

/** Pure: absence counts for the payslip. */
export function summarizeAbsenceReviews(rows = []) {
  const approved = rows.filter((r) => r.status === 'approved').length;
  const excused = rows.filter((r) => r.status === 'rejected').length;
  const pending = rows.filter((r) => r.status !== 'approved' && r.status !== 'rejected').length;
  return { registered: rows.length, approved, excused, pending, unexcused: approved };
}
