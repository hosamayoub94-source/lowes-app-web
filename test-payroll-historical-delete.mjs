/* global process */
// Historical payroll runs (before Oct 2026) can never be run, approved, paid, reopened or DELETED — and an
// operational run can be deleted only while it is a draft, only by Hosam or Amany. Proven on the REAL store,
// service and engine over an in-memory fake Supabase; any write that reaches the fake is a failure.
import { createServer } from 'vite';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { makeDb } from './test-support/fakeSupabase.mjs';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };

const mkRun = (id, y, m, status) => ({ id, period_year: y, period_month: m, status, month_setup_confirmed_at: '2026-10-20T00:00:00Z', rate_usd_try: 46.8, rate_usd_syp: 131 });
const RUNS = {
  sep:  mkRun('r-sep', 2026, 9, 'draft'),      // the live case: historical DRAFT
  aug:  mkRun('r-aug', 2026, 8, 'draft'),
  jul:  mkRun('r-jul', 2026, 7, 'paid'),
  jun:  mkRun('r-jun', 2026, 6, 'finalized'),
  octD: mkRun('r-octD', 2026, 10, 'draft'),    // operational, deletable draft
  octD2: mkRun('r-octD2', 2026, 10, 'draft'),
  octF: mkRun('r-octF', 2026, 10, 'finalized'),
  novP: mkRun('r-novP', 2026, 11, 'paid'),
};
const seed = () => ({
  payroll_runs: Object.values(RUNS).map((r) => ({ ...r })),
  payroll_entries: Object.values(RUNS).map((r) => ({ id: `e-${r.id}`, run_id: r.id, employee_id: 'x', net_salary_usd: 100, source: 'auto' })),
  profiles: [], employee_salary_settings: [], payroll_allowances: [], exchange_rates: [], orders: [],
});

globalThis.__current = null; globalThis.__rpc = [];
globalThis.__fakeSb = { from: (...a) => globalThis.__current.from(...a), rpc: (...a) => { if (a[0] === 'profitability_orders') return globalThis.__current.rpc(...a); globalThis.__rpc.push(a); return Promise.resolve({ data: null, error: null }); } };
const use = (d) => { globalThis.__current = d.client; globalThis.__rpc = []; return d; };

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
  const { checkRunDeletable, isDeleteAllowedUser } = await server.ssrLoadModule('/src/modules/payroll/utils/runDeletePolicy.js');
  const store = (await server.ssrLoadModule('/src/modules/payroll/store/usePayrollStore.js')).default;
  const { runPayrollForMonth } = await server.ssrLoadModule('/src/modules/payroll/services/payrollEngine.js');
  const { deletePayrollRun } = await server.ssrLoadModule('/src/modules/payroll/services/payrollService.js');
  const rejects = async (fn) => { try { await fn(); return null; } catch (e) { return String(e.message || e); } };
  const writes = (db) => db.log.filter((l) => l.op !== 'select');

  // ── 1) policy matrix: runs × people ─────────────────────────────────────
  const people = {
    'hosam ayoub': true, 'Hosam Ayoub ': true, 'Amany alkshki': true, 'AMANY ALKSHKI': true,
    'Reem alkshki': false, 'yousef alkshke': false, 'Fadi Jarrouge': false, '': false, null: false,
  };
  for (const [who, allowed] of Object.entries(people)) {
    const name = who === 'null' ? null : who;
    ok(isDeleteAllowedUser(name) === allowed, `isDeleteAllowedUser(${JSON.stringify(name)}) = ${allowed}`);
    for (const key of ['sep', 'aug', 'jul', 'jun']) ok(!checkRunDeletable(RUNS[key], name).allowed, `HISTORICAL ${key} is never deletable (${JSON.stringify(name)})`);
    for (const key of ['octF', 'novP']) ok(!checkRunDeletable(RUNS[key], name).allowed, `operational non-draft ${key} is never deletable (${JSON.stringify(name)})`);
    ok(checkRunDeletable(RUNS.octD, name).allowed === allowed, `operational DRAFT deletable by ${JSON.stringify(name)} = ${allowed}`);
  }
  ok(checkRunDeletable(RUNS.sep, 'hosam ayoub').code === 'historical' && checkRunDeletable(RUNS.sep, 'Amany alkshki').code === 'historical', 'Hosam and Amany are refused on September for the HISTORICAL reason');
  ok(checkRunDeletable(RUNS.octF, 'hosam ayoub').code === 'not_draft', 'an approved October run is refused as not-a-draft');
  ok(!checkRunDeletable(null, 'hosam ayoub').allowed && !checkRunDeletable(undefined).allowed, 'a missing run is never deletable');

  // ── 2) the full refusal matrix on the REAL store / engine / service ────────
  const db = use(makeDb(seed()));
  store.setState({ runs: Object.values(RUNS).map((r) => ({ ...r })), selectedRunId: null, entries: [] });
  const S = () => store.getState();
  const before = JSON.stringify(db.tables);
  for (const key of ['sep', 'aug', 'jul', 'jun']) {
    const r = RUNS[key];
    const out = {
      run: await rejects(() => runPayrollForMonth({ runId: r.id, year: r.period_year, month: r.period_month, run: r })),
      approve: await rejects(() => S().approveRun(r.id)),
      pay: await rejects(() => S().markRunPaid(r.id)),
      reopen: await rejects(() => S().reopenRun(r.id, 'attempt to reopen a historical run')),
      delete: await rejects(() => S().deleteRun(r.id)),
      deleteViaService: await rejects(() => deletePayrollRun(r.id)),
    };
    for (const [action, err] of Object.entries(out)) ok(err !== null, `HISTORICAL ${key}: ${action} is REFUSED (${err ? err.slice(0, 60) : 'WENT THROUGH'})`);
    ok(/تاريخية/.test(out.run) && /تاريخية/.test(out.delete) && /تاريخية/.test(out.deleteViaService), `HISTORICAL ${key}: run/delete refusals state the historical reason`);
    if (r.status === 'draft') ok(/تاريخية/.test(out.approve) && /تاريخية/.test(out.pay) && /تاريخية/.test(out.reopen), `HISTORICAL ${key}: approve/pay/reopen refusals state the historical reason`);
  }
  ok(JSON.stringify(db.tables) === before && writes(db).length === 0, 'NOTHING was written to the database by any refused action');
  ok(globalThis.__rpc.length === 0, 'no database function (approve/pay/reopen RPC) was even called for a historical run');
  ok(S().runs.some((r) => r.id === 'r-sep'), 'September is still in the store after the attempts');

  // ── 3) operational runs: only a draft goes ────────────────────────────────
  ok(await rejects(() => S().deleteRun('r-octF')) !== null && await rejects(() => deletePayrollRun('r-novP')) !== null, 'operational approved/paid runs are refused by store AND service');
  ok(writes(db).length === 0, 'still nothing written');
  ok(await rejects(() => S().deleteRun('r-octD')) === null, 'an operational DRAFT is deleted through the store');
  ok(!db.tables.payroll_runs.some((r) => r.id === 'r-octD') && db.log.filter((l) => l.op === 'delete' && l.table === 'payroll_runs').length === 1, 'exactly that one run was deleted');
  ok(!S().runs.some((r) => r.id === 'r-octD') && db.tables.payroll_runs.some((r) => r.id === 'r-sep'), 'the store dropped October draft; September remains');
  ok(await rejects(() => deletePayrollRun('r-octD2')) === null, 'the service also deletes an operational draft');

  // a delete that RLS silently turns into 0 rows must NOT be reported as success
  const rls = use(makeDb(seed()));
  rls.client.from = ((orig) => (t) => {
    const q = orig(t);
    if (t !== 'payroll_runs') return q;
    const del = q.delete; q.delete = () => { const d = del(); d.then = (res) => Promise.resolve({ data: [], error: null }).then(res); return d; };
    return q;
  })(rls.client.from);
  globalThis.__current = rls.client;
  const silent = await rejects(() => deletePayrollRun('r-octD'));
  ok(silent && /لم تُحذف/.test(silent), 'a delete that removed 0 rows is reported as a failure, never as success: ' + silent);

  // ── 4) the dashboard wiring (source-level) ────────────────────────────────
  const dash = readFileSync('src/modules/payroll/pages/PayrollDashboard.jsx', 'utf8');
  ok(/\{checkRunDeletable\(run, name\)\.allowed && \(/.test(dash), 'the delete button renders only when the shared policy allows it');
  ok(!/canDeleteRun && run\.status === PAYROLL_STATUS\.DRAFT/.test(dash), 'the old name+status-only condition is gone');
  ok(/const verdict = checkRunDeletable\(run, name\);\s*\n\s*if \(!verdict\.allowed\)/.test(dash.replace(/\r/g, '')), 'the click handler re-checks the policy before asking for confirmation');
} finally {
  await server.close();
}

console.log(`payroll historical-delete matrix: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
