// Latest change timestamps of the inputs a payroll calculation depends on.
// Returns null when any lookup fails so the approval gate treats the run as
// unverifiable (stale) instead of silently trusting it.
import { supabase } from '@services/supabase';

async function latest(table, column, filter) {
  let q = supabase.from(table).select(column).order(column, { ascending: false, nullsFirst: false }).limit(1);
  if (filter) q = filter(q);
  const { data, error } = await q;
  if (error) throw error;
  return data?.[0]?.[column] || null;
}

export async function fetchPayrollInputsUpdatedAt(year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  try {
    const [salarySettings, allowancesUpdated, allowancesCreated, absenceReviews] = await Promise.all([
      latest('employee_salary_settings', 'updated_at'),
      latest('payroll_allowances', 'updated_at'),
      latest('payroll_allowances', 'created_at'),
      latest('payroll_absence_reviews', 'updated_at', (q) => q.gte('absence_date', from).lt('absence_date', next)),
    ]);
    const allowances = [allowancesUpdated, allowancesCreated].filter(Boolean).sort().pop() || null;
    return { salarySettings, allowances, absenceReviews };
  } catch (error) {
    console.error('[PayrollInputs]', error);
    return null;
  }
}
