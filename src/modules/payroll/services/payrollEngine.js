// =============================================================
// Payroll Engine — one-click monthly payroll computation
//
// Computes, for each active employee IN THEIR NATIVE CURRENCY:
//   net = base + allowances + sales commission
//       − absence deduction − approved advances − manual deductions
//
// Data sources (the live, authoritative ones — see
// docs/payroll-engine-blueprint.md):
//   • salary/commission%  → profiles (base_salary_usd, housing/transport
//                            allowance, commission_pct, salary_currency)
//   • monthly sales       → orders (handler_name = seller, amount, currency,
//                            status, order_date)  — collected orders only
//   • absence             → attendance_records (via attendanceLink.js)
//   • approved advances   → employee_requests (repay this month)
//
// All amounts stay in the employee's currency; no cross-currency mixing.
// =============================================================

import { supabase } from '@services/supabase';
import { fetchMonthlyAttendanceSummary, calcAbsenceDeduction } from './attendanceLink.js';

// Orders that count as REALIZED sales for commission. Accounting rule:
// commission is earned on collected/delivered sales, never on returns
// or cancellations. Easy to extend if the company changes the policy.
export const COMMISSIONABLE_STATUSES = ['delivered', 'settled'];

// ── Helpers ───────────────────────────────────────────────────

/** Normalize a seller/handler name for tolerant matching. */
export function normalizeName(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** First & last day (exclusive upper bound) of a month, ISO date strings. */
function monthBounds(year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  const to = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  return { from, to };
}

/** The set of names an employee's orders may be filed under. */
function employeeNames(emp) {
  return [emp.employee_name, emp.seller_alias]
    .map(normalizeName)
    .filter(Boolean);
}

// ── Sales aggregation ─────────────────────────────────────────

/**
 * One query for the whole month's collected orders, grouped by
 * (normalized handler name → currency → totals). Used by the run so we
 * hit `orders` once instead of once-per-employee.
 *
 * @returns {Promise<Map<string, Record<string,{total:number,count:number}>>>}
 */
export async function fetchMonthlySalesIndex(year, month) {
  const { from, to } = monthBounds(year, month);
  const index = new Map();

  const { data, error } = await supabase
    .from('orders')
    .select('handler_name, amount, currency, status')
    .gte('order_date', from)
    .lt('order_date', to)
    .in('status', COMMISSIONABLE_STATUSES);

  if (error) throw new Error(error.message);

  for (const o of (data || [])) {
    const key = normalizeName(o.handler_name);
    if (!key) continue;
    const cur = o.currency || 'USD';
    const bucket = index.get(key) || {};
    const slot = bucket[cur] || { total: 0, count: 0 };
    slot.total += Number(o.amount) || 0;
    slot.count += 1;
    bucket[cur] = slot;
    index.set(key, bucket);
  }
  return index;
}

/** Read one employee's collected sales for a month from a prebuilt index. */
export function salesFromIndex(index, emp, currency) {
  let total = 0, count = 0;
  for (const name of employeeNames(emp)) {
    const bucket = index.get(name);
    const slot = bucket?.[currency];
    if (slot) { total += slot.total; count += slot.count; }
  }
  return { total, count };
}

/**
 * Detailed per-employee sales statement (for the "كشف حركة المبيعات" modal).
 * Returns the actual orders that fed the commission so the owner can verify.
 */
export async function fetchEmployeeSalesStatement(emp, year, month, currency) {
  const { from, to } = monthBounds(year, month);
  const names = employeeNames(emp);
  if (names.length === 0) return { orders: [], total: 0, count: 0 };

  const { data, error } = await supabase
    .from('orders')
    .select('order_id, order_date, customer_name, amount, currency, status, handler_name, market')
    .gte('order_date', from)
    .lt('order_date', to)
    .in('status', COMMISSIONABLE_STATUSES)
    .order('order_date', { ascending: true });

  if (error) throw new Error(error.message);

  const orders = (data || []).filter(o => {
    if (currency && (o.currency || 'USD') !== currency) return false;
    return names.includes(normalizeName(o.handler_name));
  });
  const total = orders.reduce((s, o) => s + (Number(o.amount) || 0), 0);
  return { orders, total, count: orders.length };
}

// ── Advances ──────────────────────────────────────────────────

/**
 * Sum approved advances that are scheduled to be repaid this month,
 * in the employee's currency. Using repay_month/repay_year prevents
 * re-deducting the same advance across multiple runs.
 */
export async function fetchAdvanceRepayment(employeeId, year, month, currency) {
  const { data, error } = await supabase
    .from('employee_requests')
    .select('advance_amount, advance_currency, repay_month, repay_year, status, request_type')
    .eq('employee_id', employeeId)
    .eq('request_type', 'advance')
    .eq('status', 'approved')
    .eq('repay_year', year)
    .eq('repay_month', month);

  if (error) return { amount: 0, mismatch: false }; // non-fatal
  let amount = 0, mismatch = false;
  for (const r of (data || [])) {
    if ((r.advance_currency || 'USD') === currency) amount += Number(r.advance_amount) || 0;
    else mismatch = true; // different currency — flagged, not silently mixed
  }
  return { amount, mismatch };
}

// ── Per-employee computation ──────────────────────────────────

/**
 * Compute a full payroll entry for one employee. Pure-ish: it does its
 * own attendance + advance lookups, but takes sales from a prebuilt index.
 */
export async function computeEmployeeEntry({ emp, runId, year, month, salesIndex }) {
  const currency = emp.salary_currency || 'USD';
  const base       = Number(emp.base_salary_usd) || 0;
  const allowances = (Number(emp.housing_allowance_usd) || 0) +
                     (Number(emp.transport_allowance_usd) || 0);
  const commPct    = Number(emp.commission_pct) || 0;

  // Sales & commission (in the employee's currency)
  const { total: salesTotal, count: salesCount } = salesFromIndex(salesIndex, emp, currency);
  const commission = Math.round((salesTotal * commPct) / 100 * 100) / 100;

  // Attendance → absence deduction
  let workingDays = 26, absentDays = 0, absenceDeduction = 0, attError = null;
  try {
    const att = await fetchMonthlyAttendanceSummary(emp.id, year, month);
    workingDays = att.workingDays || workingDays;
    absentDays  = att.absentDays  || 0;
    attError    = att.error || null;
    absenceDeduction = calcAbsenceDeduction(base, workingDays, absentDays);
  } catch (e) {
    attError = e?.message || 'attendance error';
  }

  // Approved advances due this month
  const { amount: advance, mismatch: advMismatch } =
    await fetchAdvanceRepayment(emp.id, year, month, currency);

  const net = base + allowances + commission
            - absenceDeduction - advance;

  const notes = [
    attError ? '⚠️ الحضور غير مؤكد' : null,
    advMismatch ? '⚠️ سلفة بعملة مختلفة (غير مخصومة)' : null,
  ].filter(Boolean).join(' · ') || null;

  return {
    run_id: runId,
    employee_id: emp.id,
    employee_name: emp.employee_name,
    role_type: emp.role_type,
    currency,
    base_salary_usd: base,
    allowances_usd: allowances,
    bonus_usd: 0,                       // manual bonus (admin can add)
    commission_usd: commission,
    commission_pct: commPct,
    sales_total_usd: salesTotal,
    sales_orders_count: salesCount,
    deductions_usd: 0,                  // other manual deductions
    absence_deduction_usd: absenceDeduction,
    advance_deduction_usd: advance,
    working_days: workingDays,
    absent_days: absentDays,
    net_salary_usd: Math.round(net * 100) / 100,
    source: 'auto',
    computed_at: new Date().toISOString(),
    notes,
  };
}

// ── Full run ──────────────────────────────────────────────────

/**
 * Compute & upsert entries for every active employee in one shot.
 * Idempotent thanks to UNIQUE(run_id, employee_id) — re-running a run
 * updates the auto rows instead of duplicating.
 *
 * @param {object}   opts
 * @param {string}   opts.runId
 * @param {number}   opts.year
 * @param {number}   opts.month
 * @param {Function} [opts.onProgress]  (done, total) => void
 * @param {Set<string>} [opts.skipEmployeeIds]  entries edited manually — keep as-is
 * @returns {Promise<{count:number, totalNet:number, entries:object[], errors:string[]}>}
 */
export async function runPayrollForMonth({ runId, year, month, onProgress, skipEmployeeIds }) {
  const errors = [];

  // 1. Active employees with their pay config
  const { data: emps, error: empErr } = await supabase
    .from('profiles')
    .select('id, employee_name, role_type, is_active, salary_currency, seller_alias, ' +
            'base_salary_usd, housing_allowance_usd, transport_allowance_usd, commission_pct')
    .eq('is_active', true)
    .order('employee_name');
  if (empErr) throw new Error('تعذّر جلب الموظفين: ' + empErr.message);

  // 2. One sales query for the whole month
  let salesIndex = new Map();
  try {
    salesIndex = await fetchMonthlySalesIndex(year, month);
  } catch (e) {
    errors.push('تعذّر جلب المبيعات: ' + (e?.message || e) + ' — العمولات = 0');
  }

  const { upsertPayrollEntry } = await import('./payrollService.js');
  const skip = skipEmployeeIds || new Set();

  const entries = [];
  let done = 0;
  const total = (emps || []).length;

  for (const emp of (emps || [])) {
    if (skip.has(emp.id)) { done++; onProgress?.(done, total); continue; }
    try {
      const entry = await computeEmployeeEntry({ emp, runId, year, month, salesIndex });
      const saved = await upsertPayrollEntry(entry);
      entries.push(saved);
    } catch (e) {
      errors.push(`${emp.employee_name}: ${e?.message || e}`);
    }
    done++;
    onProgress?.(done, total);
  }

  const totalNet = entries.reduce((s, e) => s + (Number(e.net_salary_usd) || 0), 0);
  return { count: entries.length, totalNet, entries, errors };
}
