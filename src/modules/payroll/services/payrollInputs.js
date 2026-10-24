// Latest change timestamps of the inputs a payroll calculation depends on.
// Returns null when any lookup fails so the approval gate treats the run as
// unverifiable (stale) instead of silently trusting it.
import { supabase } from '@services/supabase';
import { checkRunSummary } from './payrollValidation.js';

// Fresh read of the run header vs its entries (the store's run object may be stale after a run).
export async function fetchRunSummaryCheck(runId) {
  try {
    const [{ data: run, error: rErr }, { data: lines, error: lErr }] = await Promise.all([
      supabase.from('payroll_runs').select('employee_count, total_net_usd').eq('id', runId).single(),
      supabase.from('payroll_entries').select('net_salary_usd').eq('run_id', runId),
    ]);
    if (rErr || lErr) throw new Error((rErr || lErr).message);
    return checkRunSummary({ runCount: run?.employee_count, runNet: run?.total_net_usd, entries: lines || [] });
  } catch (error) {
    console.error('[PayrollSummary]', error);
    return { ok: false, message: 'تعذّر التحقق من ملخص الدورة: ' + (error?.message || error) };
  }
}

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
