/* global process */
// Owner rules of 24 Oct 2026, proven against the REAL engine on an in-memory fake Supabase:
//  • allowances are per employee: food only / internet only / both / none — nothing by default
//  • amount, currency and the rate used are stored on the entry (allowances_detail)
//  • owner + sponsored staff are excluded WITH a reason; manual entries (Petra) are never recalculated
//  • the run header (employee_count / total_net_usd) always equals its entries
import { createServer } from 'vite';
import path from 'node:path';
import { makeDb } from './test-support/fakeSupabase.mjs';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const near = (a, b, m, eps = 0.011) => ok(Math.abs(Number(a) - b) <= eps, `${m} (got ${a}, want ${b})`);

const RUN = {
  id: 'oct-run', status: 'draft', period_year: 2026, period_month: 10,
  month_setup_confirmed_at: '2026-11-01T08:00:00Z',
  target_syria_usd: 1000, above_target_pct_syria: 5, target_turkey_try: 70000, above_target_pct_turkey: 5,
  rate_usd_try: 46.8, rate_usd_syp: 131,
};
const mk = (id, name, extra = {}) => ({
  id, employee_name: name, role_type: 'employee', is_active: true, team: 'سوريا', seller_alias: null,
  base_salary_usd: 0, housing_allowance_usd: 0, transport_allowance_usd: 0, commission_pct: 0,
  payroll_commission_exempt: true, payroll_excluded: false, payroll_excluded_reason: null,
  join_date: '2025-01-01', resigned_at: null, ...extra,
});
const setting = (employee_id, extra = {}) => ({
  employee_id, base_salary: 200, currency: 'USD', internet_allowance: 0, food_allowance: 0,
  sales_commission_pct: 0, is_active: true, effective_from: '2026-06-01', ...extra,
});

function seedFor() {
  return {
    profiles: [
      mk('food', 'Food Only', { base_salary_usd: 250 }),                       // profile salary + food row (Fadi-like)
      mk('net', 'Internet Only'),                                              // settings internet 10
      mk('both', 'Both Allowances'),                                           // settings internet 10 + food row
      mk('none', 'No Allowances'),                                             // settings, internet 0
      mk('dup', 'Double Source'),                                              // settings food col + food row → counted once
      mk('setfood', 'Settings Food'),                                          // food only from the settings column
      mk('future', 'Future Row'),                                              // newer row dated next month
      mk('bare', 'Profile Only', { base_salary_usd: 120 }),                    // profile salary, nothing else
      mk('nofx', 'Missing Rate'),                                              // food in SYP while no SYP rate
      mk('petra', 'Petra Manual', { base_salary_usd: 140 }),                   // manual entry — never recalculated
      mk('resig', 'Resigned 1 Oct', { is_active: false, resigned_at: '2026-10-01', payroll_commission_exempt: false }), // like Petra Dahdouh
      mk('hosam', 'hosam ayoub', { role_type: 'admin', team: null, base_salary_usd: 200, payroll_excluded: true, payroll_excluded_reason: 'owner/no salary' }),
      mk('reem', 'Reem alkshki', { role_type: 'admin', team: null, base_salary_usd: 1000, payroll_excluded: true, payroll_excluded_reason: 'UAE sponsor — no salary from the Syria cycle' }),
      mk('arwa', 'Arwa Mohammed', { team: 'تركيا', payroll_excluded: true, payroll_excluded_reason: 'paid by Reem (UAE) — outside the Syria cycle' }),
    ],
    employee_salary_settings: [
      setting('net', { internet_allowance: 10 }),
      setting('both', { internet_allowance: 10 }),
      setting('none', { internet_allowance: 0 }),
      setting('dup', { food_allowance: 13100, currency: 'SYP', base_salary: 26200 }),
      setting('setfood', { food_allowance: 20 }),
      setting('future', { internet_allowance: 10, effective_from: '2026-06-01' }),
      setting('future', { internet_allowance: 0, effective_from: '2026-11-01' }),
      setting('nofx', {}),
      setting('arwa', { internet_allowance: 10 }),
      setting('resig', { base_salary: 140, internet_allowance: 10 }),
    ],
    payroll_allowances: [
      { employee_id: 'food', kind: 'food', amount: 7500, currency: 'SYP', is_active: true },
      { employee_id: 'both', kind: 'food', amount: 7500, currency: 'SYP', is_active: true },
      { employee_id: 'dup', kind: 'food', amount: 7500, currency: 'SYP', is_active: true },
      { employee_id: 'nofx', kind: 'food', amount: 7500, currency: 'SYP', is_active: true },
    ],
    exchange_rates: [{ from_cur: 'TRY', to_cur: 'USD', rate: 1 / 46.8, created_at: '2026-10-01' }, { from_cur: 'SYP', to_cur: 'USD', rate: 1 / 131, created_at: '2026-10-01' }],
    orders: [], employee_requests: [], payroll_absence_reviews: [], commission_rules: [], attendance: [], attendance_records: [],
    payroll_runs: [{ id: 'oct-run', period_year: 2026, period_month: 10, status: 'draft', employee_count: 0, total_net_usd: 0 }],
    payroll_entries: [
      { id: 'petra-manual', run_id: 'oct-run', employee_id: 'petra', employee_name: 'Petra Manual', source: 'manual', base_salary_usd: 25, allowances_usd: 0, net_salary_usd: 25, notes: '✍️ مبلغ ثابت 25$ بقرار حسام' },
      { id: 'stale-hosam', run_id: 'oct-run', employee_id: 'hosam', source: 'auto', base_salary_usd: 200, allowances_usd: 0, net_salary_usd: 200 },
    ],
  };
}

// The engine captures the client once at import time, so it gets a proxy that always points at the current fake db.
globalThis.__current = null;
globalThis.__fakeSb = { from: (...a) => globalThis.__current.from(...a) };
const use = (d) => { globalThis.__current = d.client; return d; };

const server = await createServer({
  configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: { '@utils': path.resolve('src/utils'), '@': path.resolve('src') } },
  plugins: [{
    name: 'fake-supabase', enforce: 'pre',
    resolveId(s) { return s === '@services/supabase' ? '\0fake-sb' : null; },
    load(id) { return id === '\0fake-sb' ? 'export const supabase = globalThis.__fakeSb; export const supabaseAnon = globalThis.__fakeSb;' : null; },
  }],
});

try {
  const { runPayrollForMonth } = await server.ssrLoadModule('/src/modules/payroll/services/payrollEngine.js');
  const { getPayrollBlockingEntryIssues, checkRunSummary } = await server.ssrLoadModule('/src/modules/payroll/services/payrollValidation.js');
  const { buildAllowanceBreakdown } = await server.ssrLoadModule('/src/modules/payroll/utils/allowances.js');
  const { pickSalarySettings } = await server.ssrLoadModule('/src/modules/payroll/utils/salaryResolution.js');

  // ── main run ───────────────────────────────────────────────
  let db = use(makeDb(seedFor(), { syncRunSummary: true }));
  // The UI passes manual entries as "skip" (handleRunEngine): Petra must stay manual and untouched.
  const res = await runPayrollForMonth({ now: new Date(2026, 10, 2, 12), runId: 'oct-run', year: 2026, month: 10, run: RUN, skipEmployeeIds: new Set(['petra']) });
  const e = (id) => db.tables.payroll_entries.find((x) => x.employee_id === id && x.source !== 'manual');
  const detail = (id) => e(id).allowances_detail;

  // 1) food only
  near(e('food').allowances_usd, 7500 / 131, 'food-only: allowance = 7500 SYP at the run rate');
  ok(detail('food').length === 1 && detail('food')[0].kind === 'food', 'food-only: exactly one item (food)');
  near(e('food').net_salary_usd, 250 + 7500 / 131, 'food-only: net = base + food');
  const f = detail('food')[0];
  ok(f.amount === 7500 && f.currency === 'SYP' && Math.abs(f.rate_to_usd - 1 / 131) < 1e-9 && f.source === 'payroll_allowances', 'food item keeps amount, currency, rate used and source');

  // 2) internet only
  near(e('net').allowances_usd, 10, 'internet-only: 10 USD');
  ok(detail('net').length === 1 && detail('net')[0].kind === 'internet' && detail('net')[0].rate_to_usd === 1, 'internet-only: one item (internet) at rate 1');

  // 3) both
  near(e('both').allowances_usd, 10 + 7500 / 131, 'both: internet 10 + food 7500 SYP');
  ok(detail('both').map((i) => i.kind).sort().join() === 'food,internet', 'both: two items (food + internet)');

  // 4) none — nothing is added by default
  ok(e('none').allowances_usd === 0 && detail('none').length === 0, 'none: zero allowances and empty detail (no default internet allowance)');
  ok(e('bare').allowances_usd === 0 && detail('bare').length === 0, 'profile-only employee gets NO allowance by default');
  ok(e('bare').salary_source === 'profiles', 'profile-only employee keeps profile salary source');

  // 5) never double counted
  near(e('dup').allowances_usd, 7500 / 131, 'food in both settings (13100) and payroll_allowances (7500): only the allowance row counts');
  ok(detail('dup').length === 1 && detail('dup')[0].source === 'payroll_allowances', 'double-source: single item from payroll_allowances');
  near(e('setfood').allowances_usd, 20, 'food from the settings column alone is counted');
  ok(detail('setfood')[0].source === 'employee_salary_settings', 'settings-only food keeps its source');

  // 6) effective by month: a row dated next month must not leak into October
  near(e('future').allowances_usd, 10, 'row effective 2026-11-01 ignored in October; the 2026-06 row applies');
  const nov = pickSalarySettings(seedFor().employee_salary_settings, '2026-11-30').get('future');
  ok(nov.internet_allowance === 0, 'the same employee in November picks the newer row (internet 0)');

  // 7) arithmetic: header == entries, and every net re-adds
  const lines = db.tables.payroll_entries;
  const header = db.tables.payroll_runs[0];
  ok(header.employee_count === lines.length, `header employee_count (${header.employee_count}) = entries (${lines.length})`);
  near(header.total_net_usd, lines.reduce((s, x) => s + x.net_salary_usd, 0), 'header total_net_usd = sum of entries');
  ok(res.summary?.ok === true, 'engine read-back confirms the summary matches: ' + res.summary?.message);
  ok(lines.every((x) => x.source === 'manual' || Math.abs(x.net_salary_usd - ((x.base_salary_usd || 0) + (x.allowances_usd || 0) + (x.commission_usd || 0) - (x.absence_deduction_usd || 0) - (x.advance_deduction_usd || 0) - (x.shortfall_deduction_usd || 0))) < 0.011), 'every auto entry: net = base + allowances + commission − deductions');
  ok(lines.every((x) => x.source === 'manual' || Math.abs((x.allowances_usd || 0) - (x.allowances_detail || []).reduce((s, i) => s + i.usd, 0)) < 0.011), 'every auto entry: allowances_usd = sum of allowances_detail');

  // KNOWN BEHAVIOUR (owner decision pending): a seller who resigned on 1 Oct enters the October run for one day.
  // Base is pro-rated (140/31), the internet allowance is NOT, and the target shortfall (10% of the full 1000$) is NOT.
  near(e('resig').base_salary_usd, 140 / 31, 'resigned-1-Oct seller: base pro-rated to 1 day');
  near(e('resig').allowances_usd, 10, 'resigned-1-Oct seller: internet allowance is NOT pro-rated');
  near(e('resig').net_salary_usd, 140 / 31 + 10 - 100, 'resigned-1-Oct seller: net is NEGATIVE (full-target shortfall) — approval needs an owner decision');

  ok(getPayrollBlockingEntryIssues(lines).negativeNetEntries.some((x) => x.employee_id === 'resig'), 'a negative net is surfaced as a warning list');
  ok(getPayrollBlockingEntryIssues([e('resig')]).blockingEntries === 0, 'a negative net warns but does not block by itself');

  // cost centers: derived from the team, in the run result only; UAE/Reem is never assigned implicitly
  ok(res.costCenters && Object.keys(res.costCenters).every((c) => ['SYRIA', 'TURKEY', 'MEDIA', 'MGMT'].includes(c)), 'run result carries per-cost-center totals using only the active centers');
  ok(!('UAE_REEM' in res.costCenters) && !('OWNER' in res.costCenters), 'UAE_REEM / OWNER are not active centers');
  near(Object.values(res.costCenters).reduce((t, v) => t + v.netUsd, 0), lines.filter((x) => x.source !== 'manual').reduce((t, x) => t + x.net_salary_usd, 0), 'cost-center totals add up to the calculated entries');

  // 8) exclusions with reasons; Petra untouched
  ok(!lines.some((x) => ['hosam', 'reem', 'arwa'].includes(x.employee_id) && x.source !== 'manual'), 'owner / Reem / Arwa never enter the cycle');
  ok(!lines.some((x) => x.id === 'stale-hosam'), 'a stale auto entry of an excluded person is removed on re-run');
  ok(res.excluded.length === 3 && res.excluded.every((x) => x.reason), 'engine reports the 3 exclusions, each with a reason');
  ok(res.excluded.find((x) => x.name === 'hosam ayoub').reason === 'owner/no salary', 'owner reason is "owner/no salary"');
  const petra = lines.find((x) => x.id === 'petra-manual');
  ok(petra && petra.source === 'manual' && petra.net_salary_usd === 25 && petra.base_salary_usd === 25 && !('allowances_detail' in petra), 'Petra stays manual: 25$, untouched by the calculation');
  ok(res.count === 10 && lines.length === 11, `10 calculated + 1 manual = 11 entries (calculated ${res.count}, total ${lines.length})`);

  // 9) missing rate is flagged and blocks approval; it is never silently priced at zero
  const noRate = use(makeDb(seedFor(), { syncRunSummary: true }));
  noRate.tables.exchange_rates.length = 0;
  await runPayrollForMonth({ now: new Date(2026, 10, 2, 12), runId: 'oct-run', year: 2026, month: 10, run: { ...RUN, rate_usd_syp: null, rate_usd_try: null }, skipEmployeeIds: new Set(['petra']) });
  const nf = noRate.tables.payroll_entries.find((x) => x.employee_id === 'nofx' && x.source !== 'manual');
  ok(nf.allowances_detail[0].missing_rate === true && nf.allowances_detail[0].usd === 0 && nf.allowances_detail[0].rate_to_usd === null, 'missing SYP rate: item flagged, usd 0, no invented rate');
  ok(/سعر صرف ناقص/.test(nf.notes) && getPayrollBlockingEntryIssues([nf]).missingRateEntries.length === 1, 'missing rate blocks approval');

  // 10) frozen run rate beats a later live rate
  db = use(makeDb(seedFor(), { syncRunSummary: true }));
  db.tables.exchange_rates.unshift({ from_cur: 'SYP', to_cur: 'USD', rate: 1 / 500, created_at: '2026-10-30' });
  await runPayrollForMonth({ now: new Date(2026, 10, 2, 12), runId: 'oct-run', year: 2026, month: 10, run: RUN, skipEmployeeIds: new Set(['petra']) });
  near(db.tables.payroll_entries.find((x) => x.employee_id === 'food').allowances_usd, 7500 / 131, 'live SYP rate change does not move a run with a frozen rate');

  // 11) a header that disagrees with its entries is detected (no trigger = mismatch)
  use(makeDb(seedFor(), { syncRunSummary: false }));
  const r3 = await runPayrollForMonth({ now: new Date(2026, 10, 2, 12), runId: 'oct-run', year: 2026, month: 10, run: RUN, skipEmployeeIds: new Set(['petra']) });
  ok(r3.summary?.ok === false && r3.errors.some((m) => /ملخص الدورة لا يطابق القيود/.test(m)), 'header ≠ entries is reported as an error that blocks approval');

  // 12) an exclusion without a reason is rejected
  const noReason = seedFor();
  noReason.profiles.find((p) => p.id === 'reem').payroll_excluded_reason = null;
  use(makeDb(noReason, { syncRunSummary: true }));
  const r4 = await runPayrollForMonth({ now: new Date(2026, 10, 2, 12), runId: 'oct-run', year: 2026, month: 10, run: RUN, skipEmployeeIds: new Set(['petra']) });
  ok(r4.errors.some((m) => /مستبعدون بلا سبب مكتوب: Reem alkshki/.test(m)), 'excluded without a written reason is flagged');

  // ── deploying the code BEFORE migration 20261024 is safe: the run is loud and writes nothing
  const errChain = (error) => { const c = new Proxy({}, { get: (_, p) => (p === 'then' ? (res) => Promise.resolve({ data: null, error }).then(res) : () => c) }); return c; };
  {
    // (a) profiles.payroll_excluded_reason does not exist yet -> engine falls back, exclusions still honoured
    const seedA = seedFor(); seedA.profiles.forEach((p) => { delete p.payroll_excluded_reason; }); // the column really does not exist yet
    const a = use(makeDb(seedA, { syncRunSummary: true }));
    const from = a.client.from;
    a.client.from = (t) => { const q = from(t); if (t === 'profiles') { const sel = q.select; q.select = (cols) => (/payroll_excluded_reason/.test(cols || '') ? errChain({ message: 'column profiles.payroll_excluded_reason does not exist' }) : sel(cols)); } return q; };
    const rA = await runPayrollForMonth({ now: new Date(2026, 10, 2, 12), runId: 'oct-run', year: 2026, month: 10, run: RUN, skipEmployeeIds: new Set(['petra']) });
    ok(rA.count > 0 && !rA.errors.some((m) => /مستبعدون بلا سبب/.test(m)), 'pre-migration: missing reason column does not break the run nor raise a false "no reason" error');
    ok(!a.tables.payroll_entries.some((x) => ['hosam', 'reem', 'arwa'].includes(x.employee_id) && x.source !== 'manual'), 'pre-migration: owner / Reem / Arwa are still excluded');
    ok(rA.excluded.length === 3 && rA.excluded.every((x) => x.reason === null), 'pre-migration: exclusions are reported with an unknown (null) reason');

    // (b) payroll_entries.allowances_detail does not exist yet -> loud Arabic error naming the migration, nothing saved
    const b = use(makeDb(seedFor(), { syncRunSummary: true }));
    const fromB = b.client.from;
    b.client.from = (t) => { const q = fromB(t); if (t === 'payroll_entries') q.upsert = () => errChain({ message: "Could not find the 'allowances_detail' column of 'payroll_entries' in the schema cache" }); return q; };
    const before = JSON.stringify(b.tables.payroll_entries);
    let msg = ''; try { await runPayrollForMonth({ now: new Date(2026, 10, 2, 12), runId: 'oct-run', year: 2026, month: 10, run: RUN, skipEmployeeIds: new Set(['petra']) }); } catch (e) { msg = e.message; }
    ok(/allowances_detail/.test(msg) && /20261024_payroll_oct_rules/.test(msg), 'pre-migration: the run stops with a clear message naming the migration: ' + msg.slice(0, 70));
    ok(JSON.stringify(b.tables.payroll_entries) === before, 'pre-migration: nothing was saved (no partial run)');
  }

  // pure helpers
  ok(checkRunSummary({ runCount: 2, runNet: 30.1, entries: [{ net_salary_usd: 10.05 }, { net_salary_usd: 20.05 }] }).ok, 'summary check tolerates float noise (whole cents)');
  ok(!checkRunSummary({ runCount: 3, runNet: 30.1, entries: [{ net_salary_usd: 10.05 }, { net_salary_usd: 20.05 }] }).ok, 'summary check catches a count mismatch');
  ok(!checkRunSummary({ runCount: 2, runNet: 30.0, entries: [{ net_salary_usd: 10.05 }, { net_salary_usd: 20.05 }] }).ok, 'summary check catches a net mismatch');
  ok(buildAllowanceBreakdown({}).items.length === 0, 'no inputs → no allowances');
} finally {
  await server.close();
}

console.log(`payroll allowances/exclusions sim: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
