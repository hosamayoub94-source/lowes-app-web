// =============================================================
// Payroll Engine — one-click monthly payroll computation
//
// Computes, for each active employee (salaries standardized to USD):
//   net = base + allowances + sales commission
//       − absence deduction − approved advances − manual deductions
//
// Data sources (the live, authoritative ones — verified against prod,
// see docs/payroll-engine-blueprint.md):
//   • base / allowances / commission%  → employee_salary_settings
//        (base_salary, internet_allowance, food_allowance,
//         sales_commission_pct, currency)  — joined to active profiles
//   • monthly sales   → orders (handler_name = seller, amount, currency,
//                        status, order_date) — collected orders only,
//                        ALL currencies converted to USD via exchange_rates
//   • absence         → attendance_records (via attendanceLink.js)
//   • approved advances → employee_requests (repay this month), → USD
//
// Owner decisions (2026-07-01): salary source = employee_salary_settings ·
// commission = pct × (sales converted to USD) · pct per employee.
// =============================================================

import { supabase } from '@services/supabase';
import { fetchMonthlyAttendanceSummary, calcAbsenceDeduction } from './attendanceLink.js';

// Orders that count as REALIZED sales for commission. Accounting rule:
// commission is earned on collected/delivered sales, never on returns.
export const COMMISSIONABLE_STATUSES = ['delivered', 'settled'];

// Entry currency — salaries are standardized to USD (owner decision).
export const PAYROLL_CURRENCY = 'USD';

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

// ── Exchange rates ────────────────────────────────────────────

/**
 * Build a { currency → rate-to-USD } map from the exchange_rates table.
 * Prefers a direct X→USD row; falls back to 1 / (USD→X); USD is 1.
 */
export function buildRateToUsd(rates) {
  const direct = {}, inverse = {};
  for (const r of (rates || [])) {
    if (r.to_cur === 'USD') direct[r.from_cur] = Number(r.rate);
    if (r.from_cur === 'USD') inverse[r.to_cur] = Number(r.rate);
  }
  const map = { USD: 1 };
  for (const cur of new Set([...Object.keys(direct), ...Object.keys(inverse)])) {
    if (cur === 'USD') continue;
    if (direct[cur] > 0) map[cur] = direct[cur];
    else if (inverse[cur] > 0) map[cur] = 1 / inverse[cur];
  }
  return map;
}

export async function fetchExchangeRateMap() {
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('from_cur, to_cur, rate')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  // dedupe: first (newest) per pair wins
  const seen = new Set(), latest = [];
  for (const r of (data || [])) {
    const k = `${r.from_cur}->${r.to_cur}`;
    if (!seen.has(k)) { seen.add(k); latest.push(r); }
  }
  return buildRateToUsd(latest);
}

/** Convert an amount in `currency` to USD using the rate map (missing → 0, flagged). */
function toUsd(amount, currency, rateMap) {
  const rate = rateMap[currency];
  if (!(rate > 0)) return { usd: 0, missing: currency !== 'USD' };
  return { usd: Number(amount) * rate, missing: false };
}

// ── Sales aggregation ─────────────────────────────────────────

/**
 * One query for the whole month's collected orders, grouped by
 * (normalized handler name → currency → totals). One `orders` hit per run.
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

/**
 * Employee's collected sales for a month, converted to USD across ALL
 * currencies, from a prebuilt index + rate map.
 */
export function salesUsdFromIndex(index, emp, rateMap) {
  let usd = 0, count = 0, missingRate = false;
  for (const name of employeeNames(emp)) {
    const bucket = index.get(name);
    if (!bucket) continue;
    for (const [cur, slot] of Object.entries(bucket)) {
      const { usd: v, missing } = toUsd(slot.total, cur, rateMap);
      usd += v; count += slot.count;
      if (missing) missingRate = true;
    }
  }
  return { usd: Math.round(usd * 100) / 100, count, missingRate };
}

/**
 * Detailed per-employee sales statement (for the "كشف حركة المبيعات" modal).
 * Returns the actual collected orders (all currencies) with USD value, so
 * the owner can verify what fed the commission.
 */
export async function fetchEmployeeSalesStatement(emp, year, month) {
  const { from, to } = monthBounds(year, month);
  const names = employeeNames(emp);
  if (names.length === 0) return { orders: [], totalUsd: 0, count: 0 };

  const [ordersRes, rateMap] = await Promise.all([
    supabase.from('orders')
      .select('order_id, order_date, customer_name, amount, currency, status, handler_name, market')
      .gte('order_date', from).lt('order_date', to)
      .in('status', COMMISSIONABLE_STATUSES)
      .order('order_date', { ascending: true }),
    fetchExchangeRateMap(),
  ]);
  if (ordersRes.error) throw new Error(ordersRes.error.message);

  const orders = (ordersRes.data || [])
    .filter(o => names.includes(normalizeName(o.handler_name)))
    .map(o => ({ ...o, usd_value: toUsd(o.amount, o.currency || 'USD', rateMap).usd }));
  const totalUsd = Math.round(orders.reduce((s, o) => s + o.usd_value, 0) * 100) / 100;
  return { orders, totalUsd, count: orders.length };
}

// ── Advances ──────────────────────────────────────────────────

/**
 * Sum approved advances scheduled to be repaid this month, converted to USD.
 * repay_month/repay_year prevents re-deducting across runs.
 */
export async function fetchAdvanceRepaymentUsd(employeeId, year, month, rateMap) {
  const { data, error } = await supabase
    .from('employee_requests')
    .select('advance_amount, advance_currency, repay_month, repay_year, status, request_type')
    .eq('employee_id', employeeId)
    .eq('request_type', 'advance')
    .eq('status', 'approved')
    .eq('repay_year', year)
    .eq('repay_month', month);

  if (error) return { usd: 0, missingRate: false };
  let usd = 0, missingRate = false;
  for (const r of (data || [])) {
    const { usd: v, missing } = toUsd(r.advance_amount, r.advance_currency || 'USD', rateMap);
    usd += v;
    if (missing) missingRate = true;
  }
  return { usd: Math.round(usd * 100) / 100, missingRate };
}

// ── Per-employee computation ──────────────────────────────────

/**
 * Compute a full payroll entry for one employee.
 * @param {object} opts.emp       active profile row (id, employee_name, seller_alias, role_type)
 * @param {object} opts.settings  employee_salary_settings row (or null)
 * @param {Map}    opts.salesIndex prebuilt month sales index
 * @param {object} opts.rateMap   currency→USD map
 */
export async function computeEmployeeEntry({ emp, settings, runId, year, month, salesIndex, rateMap }) {
  const base       = Number(settings?.base_salary) || 0;
  const allowances = (Number(settings?.internet_allowance) || 0) +
                     (Number(settings?.food_allowance) || 0);
  const commPct    = Number(settings?.sales_commission_pct) || 0;

  // Sales (all currencies → USD) & commission
  const { usd: salesUsd, count: salesCount, missingRate: salesMissing } =
    salesUsdFromIndex(salesIndex, emp, rateMap);
  const commission = Math.round((salesUsd * commPct) / 100 * 100) / 100;

  // Attendance → absence deduction.
  // SAFETY: only deduct when there is a real attendance signal (presentDays>0).
  // If a month has no attendance records at all, treating everyone as absent
  // would wrongly wipe out full salaries — so we deduct 0 and flag it instead.
  let workingDays = 26, absentDays = 0, absenceDeduction = 0, attError = null, noAttData = false;
  try {
    const att = await fetchMonthlyAttendanceSummary(emp.id, year, month);
    workingDays = att.workingDays || workingDays;
    attError    = att.error || null;
    if ((att.presentDays || 0) > 0) {
      absentDays = att.absentDays || 0;
      absenceDeduction = calcAbsenceDeduction(base, workingDays, absentDays);
    } else {
      noAttData = true; // no attendance signal → do not deduct
    }
  } catch (e) {
    attError = e?.message || 'attendance error';
  }

  // Approved advances due this month (→ USD)
  const { usd: advance, missingRate: advMissing } =
    await fetchAdvanceRepaymentUsd(emp.id, year, month, rateMap);

  const net = base + allowances + commission - absenceDeduction - advance;

  const notes = [
    !settings ? '⚠️ لا يوجد إعداد راتب' : null,
    noAttData ? 'ℹ️ لا بيانات حضور (بلا خصم غياب)' : null,
    attError ? '⚠️ الحضور غير مؤكد' : null,
    (salesMissing || advMissing) ? '⚠️ سعر صرف ناقص' : null,
  ].filter(Boolean).join(' · ') || null;

  return {
    run_id: runId,
    employee_id: emp.id,
    employee_name: emp.employee_name,
    role_type: emp.role_type,
    currency: PAYROLL_CURRENCY,
    base_salary_usd: base,
    allowances_usd: allowances,
    bonus_usd: 0,
    commission_usd: commission,
    commission_pct: commPct,
    sales_total_usd: salesUsd,
    sales_orders_count: salesCount,
    deductions_usd: 0,
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
 * Idempotent via UNIQUE(run_id, employee_id).
 *
 * @returns {Promise<{count:number, totalNet:number, entries:object[], errors:string[]}>}
 */
export async function runPayrollForMonth({ runId, year, month, onProgress, skipEmployeeIds }) {
  const errors = [];

  // 1. Active employees (id, name, alias, role)
  const { data: emps, error: empErr } = await supabase
    .from('profiles')
    .select('id, employee_name, role_type, is_active, seller_alias')
    .eq('is_active', true)
    .order('employee_name');
  if (empErr) throw new Error('تعذّر جلب الموظفين: ' + empErr.message);

  // 2. Salary settings for those employees → keyed by employee_id
  const settingsById = new Map();
  {
    const { data: settings, error: sErr } = await supabase
      .from('employee_salary_settings')
      .select('employee_id, base_salary, currency, internet_allowance, food_allowance, sales_commission_pct, is_active');
    if (sErr) errors.push('تعذّر جلب إعدادات الرواتب: ' + sErr.message);
    for (const s of (settings || [])) {
      // keep the active/most-relevant row per employee
      if (!settingsById.has(s.employee_id) || s.is_active) settingsById.set(s.employee_id, s);
    }
  }

  // 3. Exchange rates + one sales query for the month
  let rateMap = { USD: 1 };
  let salesIndex = new Map();
  try { rateMap = await fetchExchangeRateMap(); }
  catch (e) { errors.push('تعذّر جلب أسعار الصرف: ' + (e?.message || e)); }
  try { salesIndex = await fetchMonthlySalesIndex(year, month); }
  catch (e) { errors.push('تعذّر جلب المبيعات: ' + (e?.message || e) + ' — العمولات = 0'); }

  const { upsertPayrollEntry } = await import('./payrollService.js');
  const skip = skipEmployeeIds || new Set();

  const entries = [];
  let done = 0;
  const total = (emps || []).length;

  for (const emp of (emps || [])) {
    if (skip.has(emp.id)) { done++; onProgress?.(done, total); continue; }
    try {
      const entry = await computeEmployeeEntry({
        emp, settings: settingsById.get(emp.id) || null,
        runId, year, month, salesIndex, rateMap,
      });
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
