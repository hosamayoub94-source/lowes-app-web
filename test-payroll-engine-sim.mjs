/* global process */
// Safe end-to-end simulation of the REAL payroll engine (runPayrollForMonth) against an
// in-memory fake Supabase. No network, no production data, nothing to roll back.
// Covers: base+allowances, sales, returns, target (met / missed), absence statuses,
// advance, FX frozen on the run, inactive settings, payroll_excluded, zero salary,
// exempt staff, and before/after recalculation.
import { createServer } from 'vite';
import path from 'node:path';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const near = (a, b, m, eps = 0.011) => ok(Math.abs(Number(a) - b) <= eps, `${m} (got ${a}, want ${b})`);

import { makeDb } from "./test-support/fakeSupabase.mjs";

const RUN = {
  id: 'sim-run', status: 'draft', period_year: 2026, period_month: 10,
  month_setup_confirmed_at: '2026-11-01T08:00:00Z',
  target_syria_usd: 1000, above_target_pct_syria: 5,
  target_turkey_try: 65000, above_target_pct_turkey: 5,
  rate_usd_try: 46.8, rate_usd_syp: 131,
};
const mk = (id, name, extra = {}) => ({ id, employee_name: name, role_type: 'employee', is_active: true, team: 'سوريا', seller_alias: null, base_salary_usd: 0, housing_allowance_usd: 0, transport_allowance_usd: 0, commission_pct: 0, payroll_commission_exempt: false, payroll_excluded: false, join_date: '2025-01-01', resigned_at: null, ...extra });
const order = (handler, amount, status = 'delivered', currency = 'USD', day = '2026-10-10') => ({ handler_name: handler, amount, currency, status, market: currency === 'TRY' ? 'turkey' : 'syria', payment_method: 'cash', order_date: day });

const seed = {
  profiles: [
    mk('ali', 'Ali Syria'),
    mk('mehmet', 'Mehmet Turkey', { team: 'تركيا', base_salary_usd: 400 }),
    mk('zero', 'Zero Salary'),
    mk('excl', 'Excluded Emp', { payroll_excluded: true, base_salary_usd: 500 }),
    mk('old', 'Old Settings Emp', { base_salary_usd: 200, team: 'سوريا' }),
    mk('media', 'Media Staff', { payroll_commission_exempt: true, team: 'ميديا' }),
  ],
  employee_salary_settings: [
    { employee_id: 'ali', base_salary: 300, currency: 'USD', internet_allowance: 10, food_allowance: 0, sales_commission_pct: 0, is_active: true, effective_from: '2026-01-01' },
    { employee_id: 'old', base_salary: 999, currency: 'USD', internet_allowance: 50, food_allowance: 0, sales_commission_pct: 0, is_active: false, effective_from: '2025-01-01' },
    { employee_id: 'media', base_salary: 250, currency: 'USD', internet_allowance: 0, food_allowance: 0, sales_commission_pct: 0, is_active: true, effective_from: '2026-01-01' },
  ],
  payroll_allowances: [
    { employee_id: 'ali', kind: 'food', amount: 7500, currency: 'SYP', is_active: true },
    { employee_id: 'media', kind: 'food', amount: 13100, currency: 'SYP', is_active: true },
  ],
  exchange_rates: [
    { from_cur: 'TRY', to_cur: 'USD', rate: 1 / 46.8, created_at: '2026-10-01' },
    { from_cur: 'SYP', to_cur: 'USD', rate: 1 / 131, created_at: '2026-10-01' },
  ],
  orders: [
    // Ali: 10 delivered USD orders = 1500 (avg 150), 2 confirmed returns → allowed ceil(10*3%)=1, excess 1
    ...Array.from({ length: 10 }, () => order('Ali Syria', 150)),
    order('Ali Syria', 80, 'returned'), order('Ali Syria', 80, 'returned'),
    // Mehmet: 50000 TRY delivered (below 65000 target)
    order('Mehmet Turkey', 25000, 'delivered', 'TRY'), order('Mehmet Turkey', 25000, 'delivered', 'TRY'),
  ],
  employee_requests: [
    { employee_id: 'ali', request_type: 'advance', status: 'approved', advance_amount: 20, advance_currency: 'USD', repay_year: 2026, repay_month: 10 },
  ],
  payroll_absence_reviews: [
    { employee_id: 'ali', absence_date: '2026-10-05', status: 'approved' },
    { employee_id: 'ali', absence_date: '2026-10-06', status: 'pending' },
    { employee_id: 'ali', absence_date: '2026-10-07', status: 'rejected' },
  ],
  commission_rules: [],
  attendance: [],
  attendance_records: [],
  payroll_entries: [
    { id: 'stale-1', run_id: 'sim-run', employee_id: 'excl', source: 'auto', net_salary_usd: 500 },
    { id: 'manual-1', run_id: 'sim-run', employee_id: 'excl', source: 'manual', net_salary_usd: 10 },
  ],
};

seed.payroll_runs = [{ id: "sim-run", period_year: 2026, period_month: 10, status: "draft", employee_count: 0, total_net_usd: 0 }];
const db = makeDb(seed, { syncRunSummary: true });
globalThis.__fakeSb = db.client;

const server = await createServer({
  configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: { '@utils': path.resolve('src/utils'), '@': path.resolve('src') } },
  plugins: [{
    name: 'fake-supabase', enforce: 'pre',
    resolveId(s) { return s === '@services/supabase' ? '\0fake-sb' : s === '@services/deliveryAccountingService' ? path.resolve('src/services/deliveryAccountingService.js') : null; },
    load(id) { return id === '\0fake-sb' ? 'export const supabase = globalThis.__fakeSb; export const supabaseAnon = globalThis.__fakeSb;' : null; },
  }],
});

try {
  const { runPayrollForMonth } = await server.ssrLoadModule('/src/modules/payroll/services/payrollEngine.js');
  const { getPayrollBlockingEntryIssues } = await server.ssrLoadModule('/src/modules/payroll/services/payrollValidation.js');
  const entry = (id) => db.tables.payroll_entries.find((e) => e.employee_id === id && e.source !== 'manual');

  // ── run 1: before management decides pending/rejected
  const r1 = await runPayrollForMonth({ now: new Date(2026, 10, 2, 12), runId: 'sim-run', year: 2026, month: 10, run: RUN });
  ok(r1.errors.length === 0, 'run 1 has no errors: ' + r1.errors.join('|'));

  const ali = entry('ali');
  ok(ali?.salary_source === 'employee_salary_settings', 'Ali salary source = settings');
  near(ali.base_salary_usd, 300, 'Ali base');
  near(ali.allowances_usd, 10 + 7500 / 131, 'Ali allowances = internet 10 + food 7500 SYP at the RUN frozen rate');
  near(ali.sales_total_usd, 1500, 'Ali sales');
  ok(ali.returns_count === 2 && ali.returns_allowed === 1 && ali.returns_excess === 1, 'Ali returns: 2 / allowed 1 / excess 1');
  near(ali.return_deduction_local, 150, 'Ali return deduction = excess × avg order (150)');
  near(ali.adjusted_increase_local, 350, 'Ali adjusted increase = 500 − 150');
  near(ali.commission_usd, 17.5, 'Ali commission = 350 × 5%');
  near(ali.advance_deduction_usd, 20, 'Ali advance');
  ok(ali.absent_days === 1, 'only the APPROVED absence counts (pending + rejected ignored)');
  near(ali.absence_deduction_usd, 300 / 27, 'Ali absence deduction = base/27 × 1 day');
  near(ali.net_salary_usd, 300 + 10 + 7500 / 131 + 17.5 - 20 - 300 / 27, 'Ali net (before recalculation)');
  ok(/مصدر الراتب: إعدادات الرواتب/.test(ali.notes), 'Ali notes state the salary source');

  const meh = entry('mehmet');
  ok(meh?.salary_source === 'profiles' && meh.team === 'turkey', 'Mehmet: profile salary, Turkey team');
  near(meh.shortfall_local, 15000, 'Mehmet shortfall TRY');
  near(meh.shortfall_deduction_usd, 1500 / 46.8, 'Mehmet shortfall deduction = 10% × 15000 TRY at the run rate');
  near(meh.net_salary_usd, 400 - 1500 / 46.8, 'Mehmet net');

  const zero = entry('zero');
  ok(zero && zero.salary_source === null && zero.base_salary_usd === 0, 'zero-salary employee has NO salary source');
  ok(/لا مصدر راتب/.test(zero.notes), 'zero-salary entry carries the warning');
  ok(getPayrollBlockingEntryIssues(db.tables.payroll_entries.filter((e) => e.source !== 'manual')).zeroSalaryEntries.some((e) => e.employee_id === 'zero'), 'zero salary blocks approval');

  const old = entry('old');
  ok(old.salary_source === 'profiles' && old.base_salary_usd === 200 && old.allowances_usd === 0, 'inactive settings row (999 + 50 allowance) is NOT used');

  const media = entry('media');
  ok(media.commission_exempt === true, 'media staff exempt from commission');
  near(media.net_salary_usd, 250 + 13100 / 131, 'media net = base + food allowance');

  // payroll_excluded: no new entry, stale AUTO entry removed, MANUAL entry kept
  ok(!db.tables.payroll_entries.some((e) => e.id === 'stale-1'), 'excluded employee stale auto entry removed on re-run');
  ok(db.tables.payroll_entries.some((e) => e.id === 'manual-1'), 'manual entry is never deleted');
  ok(db.log.filter((l) => l.op === 'delete').every((l) => l.table === 'payroll_entries'), 'only payroll_entries deletions happened');

  // ── management decides: pending → approved; recalculate
  const countBefore = db.tables.payroll_entries.length;
  db.tables.payroll_absence_reviews.find((r) => r.absence_date === '2026-10-06').status = 'approved';
  const r2 = await runPayrollForMonth({ now: new Date(2026, 10, 2, 12), runId: 'sim-run', year: 2026, month: 10, run: RUN });
  ok(r2.errors.length === 0, 'run 2 has no errors');
  const ali2 = entry('ali');
  ok(ali2.absent_days === 2, 'after approval the second absence counts');
  near(ali2.absence_deduction_usd, (300 / 27) * 2, 'deduction doubles only after the decision');
  near(ali2.net_salary_usd, ali.net_salary_usd - 300 / 27, 'net dropped by exactly one day');
  ok(db.tables.payroll_entries.length === countBefore, 'recalculation updates in place (no duplicate rows)');

  // ── FX frozen on the run: a live rate change must not move this run
  db.tables.exchange_rates.unshift({ from_cur: 'SYP', to_cur: 'USD', rate: 1 / 500, created_at: '2026-10-30' });
  await runPayrollForMonth({ now: new Date(2026, 10, 2, 12), runId: 'sim-run', year: 2026, month: 10, run: RUN });
  near(entry('ali').allowances_usd, 10 + 7500 / 131, 'live FX change does not affect a run with a frozen rate');

  // ── missing rate: no frozen rate and no live rate → flagged, not silently zero-priced
  db.tables.exchange_rates.length = 0;
  const noRateRun = { ...RUN, rate_usd_syp: null, rate_usd_try: null };
  await runPayrollForMonth({ now: new Date(2026, 10, 2, 12), runId: 'sim-run', year: 2026, month: 10, run: noRateRun });
  ok(/سعر صرف ناقص/.test(entry('ali').notes), 'missing FX rate is flagged (blocks approval)');

  // ── unconfirmed month setup refuses to run
  let refused = false;
  try { await runPayrollForMonth({ now: new Date(2026, 10, 2, 12), runId: 'sim-run', year: 2026, month: 10, run: { ...RUN, month_setup_confirmed_at: null } }); } catch { refused = true; }
  ok(refused, 'engine refuses an unconfirmed month setup');

  // ── historical periods are never recalculated (September 2026 and earlier closed outside the app)
  const before = JSON.stringify(db.tables.payroll_entries);
  let histRefused = '';
  try { await runPayrollForMonth({ now: new Date(2026, 10, 2, 12), runId: 'hist-run', year: 2026, month: 9, run: { ...RUN, period_month: 9 } }); } catch (e) { histRefused = e.message; }
  ok(/تاريخية/.test(histRefused), 'engine refuses a historical period (Sept 2026)');
  ok(JSON.stringify(db.tables.payroll_entries) === before, 'refusal wrote nothing');
} finally {
  await server.close();
}

console.log(`payroll engine sim: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
