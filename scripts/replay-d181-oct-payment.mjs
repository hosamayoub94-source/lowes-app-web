/* global process */
// D-181 — replay of the October 2026 payment against the proposed lock, on REAL October data, in memory (PGlite).
// Nothing is written anywhere except an in-memory database. Production is never contacted.
//
// Input: a read-only snapshot JSON taken from production (NOT committed — it holds employee data):
//   { taken_at, rpc: [[id, order_code, market, status, order_date, amount, currency, delivered_at, delivery_basis], ...]  ← profitability_orders(Oct, true)
//     orders: [[id, handler_name, deleted_at, order_date, status], ...], run: {...}, entries: [...], profiles: [...], access: [...],
//     xr: [[from_cur, to_cur, rate, created_at], ...] }
// Usage: node scripts/replay-d181-oct-payment.mjs <snapshot.json>
//
// Scenarios:
//   A  as in production now      → payroll_mark_paid must be refused, naming only the drifting employee(s); nothing changes
//   B  correction in the CYCLE   → reopen, Hla's entry replaced by the engine-verified recalculation, re-approve, pay
//   C  correction in the SOURCE  → TL-29869's late finance confirmation withdrawn (order back to «no trusted date»): pay as approved
//   D  rollback                  → production bodies restored byte-for-byte; the old behaviour (pay despite drift) returns
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const snapPath = process.argv[2];
if (!snapPath) { console.error('usage: node scripts/replay-d181-oct-payment.mjs <snapshot.json>'); process.exit(2); }
const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
const HOSAM = 'a68d72e4-8c88-4554-a8c4-70f5ac813a20';
const HLA = '5d2ee8ae-5b01-40f1-93ef-0e18e2373e00';
const TL29869 = 'cd7d1ff0-3338-4b77-a553-38713bf6c756';
const PROD_MD5 = { payroll_run_consistency_gate: '8a108d81cd819569e6463ed949471264', payroll_mark_paid: '3f497248357e0d76cca334cd4b671658',
  payroll_approve_run: 'dd5ab3f6bb14e99b85d66e2ddacca9da', payroll_reopen_run: '6925d8bb9474d717e4df2e2cdafe5b72', payroll_s2_entries_snapshot: '81c551755950936aac1335a56c883945' };

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const log = (...a) => console.log(...a);

// integer columns as in production (payroll_runs / payroll_entries)
const INT_COLS = new Set(['period_year', 'period_month', 'employee_count', 'sales_orders_count', 'absent_days', 'working_days', 'returns_count', 'returns_allowed', 'returns_excess']);
const colType = (k, v) => {
  if (['id', 'run_id', 'employee_id', 'created_by', 'approved_by', 'finalized_by', 'month_setup_confirmed_by', 'profile_id'].includes(k)) return 'uuid';
  if (INT_COLS.has(k)) return 'integer';
  if (/_at$/.test(k)) return 'timestamptz';
  if (typeof v === 'number') return 'numeric';
  if (typeof v === 'boolean') return 'boolean';
  if (v && typeof v === 'object') return 'jsonb';
  return 'text';
};
const cols = (rows) => { const m = new Map(); for (const r of rows) for (const [k, v] of Object.entries(r)) if (!m.has(k) || (m.get(k) === 'text' && v !== null)) m.set(k, v === null ? (m.get(k) || colType(k, '')) : colType(k, v)); return m; };

async function build({ withdrawLateConfirmation = false } = {}) {
  const db = new PGlite();
  const q = (s, p) => db.query(s, p);
  const ins = async (table, rows) => {
    for (const r of rows) { const k = Object.keys(r); await q(`INSERT INTO public.${table} (${k.join(',')}) VALUES (${k.map((_, i) => `$${i + 1}`).join(',')})`, k.map((c) => (r[c] !== null && typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c]))); }
  };
  const entryCols = cols(snap.entries); const runCols = cols([snap.run]); const profCols = cols(snap.profiles);
  entryCols.set('payment_status', 'text'); entryCols.set('paid_at', 'timestamptz');
  const ddl = (m, extra = '') => [...m.entries()].map(([k, t]) => `${k} ${t}${k === 'id' ? ' PRIMARY KEY' : ''}`).join(', ') + extra;
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE TABLE public.profiles (${ddl(profCols)});
    CREATE TABLE public.payroll_access (profile_id uuid PRIMARY KEY, can_finalize boolean);
    CREATE TABLE public.orders (id uuid PRIMARY KEY, handler_name text, deleted_at timestamptz, order_date timestamptz, status text);
    CREATE TABLE public.exchange_rates (from_cur text, to_cur text, rate numeric, created_at timestamptz);
    CREATE TABLE public.payroll_runs (${ddl(runCols)}, CONSTRAINT payroll_runs_status_check CHECK (status = ANY (ARRAY['draft','finalized','paid'])));
    CREATE TABLE public.payroll_entries (${ddl(entryCols)});
    ALTER TABLE public.payroll_entries ALTER COLUMN payment_status SET DEFAULT 'pending';
    CREATE TABLE public.payroll_run_events (id serial PRIMARY KEY, run_id uuid, period int, action text, actor uuid, at timestamptz DEFAULT now(), changes jsonb, reason text, before_snapshot jsonb);
    CREATE TABLE public._rpc (id uuid, order_code text, market text, status text, order_date timestamptz, amount numeric, currency text, delivered_at timestamptz, delivery_basis text);`);
  await db.exec(readFileSync('test-support/payroll-prod-bodies-20261101.sql', 'utf8'));
  await db.exec(readFileSync('test-support/payroll-prod-bodies-reopen-20261102.sql', 'utf8'));
  // profitability_orders: the production function's OUTPUT for October (snapshot), behind the same role gate
  await db.exec(`CREATE FUNCTION public.profitability_orders(p_from timestamptz, p_to timestamptz, p_use_finance_confirmations boolean DEFAULT true)
    RETURNS TABLE(id uuid, order_code text, market text, status text, order_date timestamptz, amount numeric, currency text, delivered_at timestamptz, delivery_basis text)
    LANGUAGE sql STABLE SET search_path TO 'public' AS $$
      SELECT r.* FROM public._rpc r WHERE public.current_role_type() IN ('admin','manager','sales_manager')
        AND p_from = '2026-10-01T00:00:00+03:00'::timestamptz AND p_to = '2026-11-01T00:00:00+03:00'::timestamptz AND p_use_finance_confirmations $$;`);
  const md5 = Object.fromEntries((await q('SELECT proname, md5(prosrc) m FROM pg_proc WHERE proname = ANY($1)', [Object.keys(PROD_MD5)])).rows.map((r) => [r.proname, r.m]));
  for (const [k, v] of Object.entries(PROD_MD5)) ok(md5[k] === v, `fixture ${k} = production md5`);

  const rpc = snap.rpc.map(([id, order_code, market, status, order_date, amount, currency, delivered_at, delivery_basis]) =>
    (withdrawLateConfirmation && id === TL29869 ? { id, order_code, market, status, order_date, amount, currency, delivered_at: null, delivery_basis: 'unknown' }
      : { id, order_code, market, status, order_date, amount, currency, delivered_at, delivery_basis }));
  await db.exec('BEGIN');
  for (const r of rpc) await q('INSERT INTO public._rpc VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [r.id, r.order_code, r.market, r.status, r.order_date, r.amount, r.currency, r.delivered_at, r.delivery_basis]);
  for (const [id, h, del, od, st] of snap.orders) await q('INSERT INTO public.orders VALUES ($1,$2,$3,$4,$5)', [id, h, del, od, st]);
  for (const [f, t, rate, at] of snap.xr) await q('INSERT INTO public.exchange_rates VALUES ($1,$2,$3,$4)', [f, t, rate, at]);
  await db.exec('COMMIT');
  await ins('profiles', snap.profiles);
  await ins('payroll_access', snap.access.map((a) => ({ profile_id: a.profile_id, can_finalize: a.can_finalize })));

  // the run exactly as in production: inserted as draft with its 33 entries, then put in its real state (finalized + archived)
  await ins('payroll_runs', [{ ...snap.run, status: 'draft', finalized_at: null, finalized_by: null, approved_by: null, archived_at: null }]);
  await ins('payroll_entries', snap.entries);
  await db.exec('ALTER TABLE public.payroll_runs DISABLE TRIGGER USER');
  await q('UPDATE public.payroll_runs SET status = $2, finalized_at = $3, finalized_by = $4, approved_by = $5, archived_at = $6, employee_count = $7, total_net_usd = $8 WHERE id = $1',
    [snap.run.id, snap.run.status, snap.run.finalized_at, snap.run.finalized_by, snap.run.approved_by, snap.run.archived_at, snap.run.employee_count, snap.run.total_net_usd]);
  await db.exec('ALTER TABLE public.payroll_runs ENABLE TRIGGER USER');
  await q(`INSERT INTO public.payroll_run_events (run_id, period, action, actor, at) VALUES ($1, 202610, 'approve', $2, $3)`, [snap.run.id, HOSAM, snap.run.finalized_at]);
  await db.exec(readFileSync('docs/proposed/20261102_payroll_sales_drift_gate.sql', 'utf8'));
  await db.exec(`SELECT set_config('test.uid', '${HOSAM}', false)`);
  return { db, q };
}
const tryQ = async (db, sql, p) => { try { const r = await db.query(sql, p); return { r }; } catch (e) { await db.exec('ROLLBACK').catch(() => {}); return { e: String(e.message || e) }; } };
const runRow = async (q) => (await q('SELECT status, employee_count, total_net_usd, paid_at FROM public.payroll_runs WHERE id = $1', [snap.run.id])).rows[0];
const entriesMd5 = async (q) => (await q("SELECT md5(string_agg(row_to_json(e)::text, '|' ORDER BY e.id)) m FROM public.payroll_entries e WHERE run_id = $1", [snap.run.id])).rows[0].m;

log(`snapshot taken ${snap.taken_at}: ${snap.rpc.length} sales-source rows, ${snap.orders.length} orders, run ${snap.run.status} (${snap.run.employee_count} / $${snap.run.total_net_usd}), archived ${snap.run.archived_at}`);

// ── A) production as it is now
{
  const { db, q } = await build();
  const r0 = await runRow(q);
  ok(r0.status === 'finalized' && r0.employee_count === 33 && Number(r0.total_net_usd) === 5105.66, `A: replayed run = production (${r0.status}, ${r0.employee_count}, ${r0.total_net_usd})`);
  const checked = (await q("SELECT count(*)::int n FROM public.payroll_entries WHERE run_id = $1 AND source IS DISTINCT FROM 'manual' AND team IN ('syria','turkey')", [snap.run.id])).rows[0].n;
  const drift = (await q('SELECT * FROM public.payroll_sales_drift($1)', [snap.run.id])).rows;
  log(`A: ${checked} sales entries checked; drift:`, JSON.stringify(drift.map((d) => ({ name: d.employee_name, n: `${d.stored_count}→${d.live_count}`, local: `${d.stored_local}→${d.live_local}` }))));
  ok(checked === 18, 'A: 18 sales entries checked (same as the production read-only check)');
  ok(drift.length === 1 && drift[0].employee_id === HLA && drift[0].stored_count === 34 && drift[0].live_count === 35
     && Number(drift[0].stored_local) === 57100 && Number(drift[0].live_local) === 58400, 'A: the ONLY difference is Hla 34→35 / ₺57,100→₺58,400');
  const before = await entriesMd5(q);
  const pay = await tryQ(db, 'SELECT public.payroll_mark_paid($1)', [snap.run.id]);
  log('A: payroll_mark_paid →', pay.e || 'PAID');
  ok(pay.e && pay.e.includes('لا يُسجَّل الدفع') && pay.e.includes('Hla Al Namra'), 'A: payment refused with the employee and the difference');
  const r1 = await runRow(q);
  ok(r1.status === 'finalized' && r1.paid_at === null && await entriesMd5(q) === before, 'A: run, entries and payment status unchanged');
  ok((await q("SELECT count(*)::int n FROM public.payroll_run_events WHERE action = 'pay'")).rows[0].n === 0, 'A: no pay event');

  // ── D) rollback on the same real data
  await db.exec(readFileSync('docs/proposed/20261102_payroll_sales_drift_gate_rollback.sql', 'utf8'));
  ok((await q("SELECT md5(prosrc) m FROM pg_proc WHERE proname = 'payroll_run_consistency_gate'")).rows[0].m === PROD_MD5.payroll_run_consistency_gate, 'D: rollback restores the production gate byte-for-byte');
  const payOld = await tryQ(db, 'SELECT public.payroll_mark_paid($1)', [snap.run.id]);
  ok(!payOld.e && (await runRow(q)).status === 'paid', 'D: without the lock (today\'s production behaviour) October would be paid despite the difference');
}

// ── B) correction in the cycle: reopen, recalculated Hla entry, re-approve, pay
{
  const { db, q } = await build();
  const re = await tryQ(db, 'SELECT public.payroll_reopen_run($1, $2)', [snap.run.id, 'D-181 replay: تأكيد تسليم TL-29869 بعد الاعتماد']);
  ok(!re.e && (await runRow(q)).status === 'draft', 'B: reopen allowed (finalized, not paid) ' + (re.e || ''));
  // engine-verified values (test-payroll-sales-drift.mjs replays the real engine): 35 / 58,400 → shortfall 11,600 × 10% / 50 = 23.20 → net 116.80
  await q(`UPDATE public.payroll_entries SET sales_local = 58400, sales_orders_count = 35, shortfall_local = 11600, shortfall_deduction_usd = 23.2, net_salary_usd = 116.8, computed_at = now()
           WHERE run_id = $1 AND employee_id = $2`, [snap.run.id, HLA]);
  const ap = await tryQ(db, 'SELECT public.payroll_approve_run($1) AS j', [snap.run.id]);
  const chg = ap.r?.rows?.[0]?.j?.changes;
  log('B: re-approve →', ap.e || JSON.stringify({ net_before: chg?.total_net_before, net_after: chg?.total_net_after, employees: (chg?.employees || []).map((x) => x.employee_id) }));
  ok(!ap.e && Number(chg?.total_net_before) === 5105.66 && Number(chg?.total_net_after) === 5108.26, 'B: re-approval passes; total 5,105.66 → 5,108.26');
  ok(chg?.employees?.length === 1 && chg.employees[0].employee_id === HLA, 'B: the approval change report lists ONLY Hla (no other employee touched)');
  const pay = await tryQ(db, 'SELECT public.payroll_mark_paid($1)', [snap.run.id]);
  const r = await runRow(q);
  ok(!pay.e && r.status === 'paid' && Number(r.total_net_usd) === 5108.26, 'B: payment passes the lock after the correction ' + (pay.e || ''));
}

// ── C) correction in the source: the late confirmation is withdrawn → the approved figures are current again
{
  const { db, q } = await build({ withdrawLateConfirmation: true });
  const drift = (await q('SELECT count(*)::int n FROM public.payroll_sales_drift($1)', [snap.run.id])).rows[0].n;
  ok(drift === 0, 'C: without TL-29869\'s confirmation the approved October run has no difference at all');
  const pay = await tryQ(db, 'SELECT public.payroll_mark_paid($1)', [snap.run.id]);
  const r = await runRow(q);
  ok(!pay.e && r.status === 'paid' && Number(r.total_net_usd) === 5105.66, 'C: payment passes as approved (5,105.66) ' + (pay.e || ''));
}

console.log(`D-181 October replay: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
