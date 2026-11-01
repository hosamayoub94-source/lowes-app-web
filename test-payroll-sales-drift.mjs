/* global process */
// Payroll «stale results» gate on DELIVERY data (not only payroll inputs).
// Replays the real October 2026 case through the REAL engine on an in-memory fake Supabase:
// a finance delivery confirmation (TL-29869, 1,300 TRY, Turkey) landed after the last calculation.
// Stored entry (production, read-only check 1 Nov 2026): 34 orders / ₺57,100, shortfall deduction $25.80, net $114.20.
// No network, no production data.
import { createServer } from 'vite';
import path from 'node:path';
import { makeDb } from './test-support/fakeSupabase.mjs';
import { detectSalesDrift, getPayrollStaleness } from './src/modules/payroll/services/payrollValidation.js';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const near = (a, b, m, eps = 0.011) => ok(Math.abs(Number(a) - b) <= eps, `${m} (got ${a}, want ${b})`);

// ── pure: detectSalesDrift + staleness wiring
{
  const entries = [
    { employee_id: 'h', team: 'turkey', target_currency: 'TRY', sales_local: 57100, sales_orders_count: 34, source: 'auto', computed_at: '2026-11-01T17:57:13Z' },
    { employee_id: 'm', team: 'syria', sales_local: 444.59, sales_orders_count: 25, source: 'auto', computed_at: '2026-11-01T17:57:13Z' },
    { employee_id: 'x', team: null, sales_local: 0, sales_orders_count: 0, source: 'auto', computed_at: '2026-11-01T17:57:13Z' },
    { employee_id: 'man', team: 'turkey', sales_local: 1, sales_orders_count: 1, source: 'manual' },
  ];
  const same = new Map([['h', { value: 57100, count: 34 }], ['m', { value: 444.59, count: 25 }]]);
  ok(!detectSalesDrift({ entries, live: same }).stale, 'identical live sales → not stale (manual + no-team entries ignored)');
  const moved = new Map([['h', { value: 58400, count: 35 }], ['m', { value: 444.59, count: 25 }]]);
  const d = detectSalesDrift({ entries, live: moved, names: new Map([['h', 'Hla Al Namra']]) });
  ok(d.stale && d.rows.length === 1 && d.rows[0].name === 'Hla Al Namra', 'one late confirmation → exactly one employee drifts');
  ok(d.rows[0].storedLocal === 57100 && d.rows[0].liveLocal === 58400 && d.rows[0].storedCount === 34 && d.rows[0].liveCount === 35, 'drift row carries before/after');
  ok(!detectSalesDrift({ entries, live: new Map([['h', { value: 57100.004, count: 34 }], ['m', { value: 444.59, count: 25 }]]) }).stale, 'sub-cent float noise is not drift');
  ok(detectSalesDrift({ entries, live: new Map([['m', { value: 444.59, count: 25 }]]) }).stale, 'employee whose sales vanished (live missing) is drift');

  const base = { entries, run: { month_setup_confirmed_at: '2026-11-01T13:36:26Z' }, inputsUpdatedAt: {} };
  ok(!getPayrollStaleness(base).stale, 'old callers (no salesDrift arg) keep the previous behaviour');
  ok(getPayrollStaleness({ ...base, salesDrift: null }).stale, 'sales check failed (null) → stale: approval never rests on unverified sales');
  const s = getPayrollStaleness({ ...base, salesDrift: d });
  ok(s.stale && s.reasons.some((r) => r.includes('Hla Al Namra') && r.includes('34→35')), 'drift blocks approval with a readable reason');
  ok(!getPayrollStaleness({ ...base, salesDrift: { stale: false, rows: [] } }).stale, 'clean drift check → not stale');
}

// ── real engine replay
const RUN = {
  id: 'oct-run', status: 'draft', period_year: 2026, period_month: 10,
  month_setup_confirmed_at: '2026-11-01T13:36:26Z',
  target_syria_usd: 1000, above_target_pct_syria: 0,
  target_turkey_try: 70000, above_target_pct_turkey: 5,
  rate_usd_try: 50, rate_usd_syp: 143.2,
};
const order = (amount, day, extra = {}) => ({ handler_name: 'Hla Al Namra', amount, currency: 'TRY', status: 'delivered', market: 'turkey', payment_method: 'cash', order_date: day, ...extra });
const hlaOrders = [...Array.from({ length: 33 }, (_, i) => order(1700, `2026-10-${String(1 + (i % 28)).padStart(2, '0')}T09:00:00Z`)), order(1000, '2026-10-30T09:00:00Z')];
const seed = {
  profiles: [{ id: 'hla', employee_name: 'Hla Al Namra', role_type: 'employee', is_active: true, team: 'تركيا', seller_alias: null, base_salary_usd: 0, housing_allowance_usd: 0, transport_allowance_usd: 0, commission_pct: 0, payroll_commission_exempt: false, payroll_excluded: false, join_date: '2025-01-01', resigned_at: null }],
  employee_salary_settings: [{ employee_id: 'hla', base_salary: 130, currency: 'USD', internet_allowance: 10, food_allowance: 0, sales_commission_pct: 0, is_active: true, effective_from: '2026-01-01' }],
  payroll_allowances: [],
  exchange_rates: [{ from_cur: 'USD', to_cur: 'TRY', rate: 50, created_at: '2026-10-26' }, { from_cur: 'USD', to_cur: 'SYP', rate: 143, created_at: '2026-11-01' }],
  orders: [
    ...hlaOrders,
    // TL-29869: ordered 29 Sep, no trusted delivery date at calculation time (counts in September)
    order(1300, '2026-09-29T00:51:00Z', { id: 'tl-29869', order_id: 'TL-29869' }),
  ],
  employee_requests: [], payroll_absence_reviews: [], commission_rules: [], attendance: [], attendance_records: [], payroll_entries: [],
  payroll_runs: [{ id: 'oct-run', period_year: 2026, period_month: 10, status: 'draft', employee_count: 0, total_net_usd: 0 }],
};
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
  const { fetchLiveSalesDrift } = await server.ssrLoadModule('/src/modules/payroll/services/payrollInputs.js');
  const entry = () => db.tables.payroll_entries.find((e) => e.employee_id === 'hla' && e.source !== 'manual');
  const now = new Date(2026, 10, 1, 20, 57);

  const r1 = await runPayrollForMonth({ now, runId: 'oct-run', year: 2026, month: 10, run: RUN });
  ok(r1.errors.length === 0, 'calc 1 ok: ' + r1.errors.join('|'));
  const before = { ...entry() };
  ok(before.sales_orders_count === 34, `calc 1 = production entry: 34 orders (got ${before.sales_orders_count})`);
  near(before.sales_local, 57100, 'calc 1 sales ₺57,100 (production entry)');
  near(before.shortfall_deduction_usd, 25.8, 'calc 1 shortfall deduction $25.80 = 12,900 × 10% / 50 (production entry)');
  near(before.net_salary_usd, 114.2, 'calc 1 net $114.20 (production entry)');

  const d0 = await fetchLiveSalesDrift(RUN, db.tables.payroll_entries);
  ok(d0 && !d0.stale, 'right after the calculation: no drift');

  // Unrelated data changes must not mark October stale: a November delivery and a September delivery.
  db.tables.orders.push(order(5000, '2026-11-02T09:00:00Z', { id: 'nov-1' }), order(4000, '2026-09-15T09:00:00Z', { id: 'sep-1' }));
  const dOther = await fetchLiveSalesDrift(RUN, db.tables.payroll_entries);
  ok(dOther && !dOther.stale, 'deliveries in other months do not make October stale');

  // The finance confirmation arrives (1 Nov 18:45 UTC): delivered 31 Oct 23:59 Istanbul.
  db.tables.orders.find((o) => o.id === 'tl-29869').fc_delivered_at = '2026-10-31T20:59:00Z';
  const d1 = await fetchLiveSalesDrift(RUN, db.tables.payroll_entries);
  ok(d1?.stale && d1.rows.length === 1, 'late confirmation → stale');
  ok(d1.rows[0].storedCount === 34 && d1.rows[0].liveCount === 35 && d1.rows[0].liveLocal === 58400, 'drift = +1 order / +₺1,300');
  const gate = getPayrollStaleness({ entries: db.tables.payroll_entries, run: RUN, inputsUpdatedAt: {}, salesDrift: d1 });
  ok(gate.stale, 'approval gate closed until recalculated');

  // What-if recalculation (draft only — the real October run is finalized and is NOT touched).
  const r2 = await runPayrollForMonth({ now, runId: 'oct-run', year: 2026, month: 10, run: RUN });
  ok(r2.errors.length === 0, 'calc 2 ok');
  const after = entry();
  ok(after.sales_orders_count === 35, 'after: 35 orders');
  near(after.sales_local, 58400, 'after: ₺58,400');
  near(after.shortfall_deduction_usd, 23.2, 'after: deduction $23.20 = 11,600 × 10% / 50');
  near(after.net_salary_usd, 116.8, 'after: net $116.80 (+$2.60)');
  ok(after.commission_usd === 0 && after.returns_allowed === before.returns_allowed, 'still below target: no commission; allowed returns unchanged (ceil(35×3%)=2)');
  const d2 = await fetchLiveSalesDrift(RUN, db.tables.payroll_entries);
  ok(d2 && !d2.stale, 'after recalculation the gate opens again');

  // Fail-closed: if the sales source errors, the check returns null (→ stale).
  const realRpc = db.client.rpc; db.client.rpc = () => Promise.resolve({ data: null, error: { message: 'boom' } });
  const dErr = await fetchLiveSalesDrift(RUN, db.tables.payroll_entries);
  ok(dErr === null, 'sales source failure → null (gate treats as unverifiable)');
  db.client.rpc = realRpc;
} finally {
  await server.close();
}

console.log(`payroll sales drift: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
