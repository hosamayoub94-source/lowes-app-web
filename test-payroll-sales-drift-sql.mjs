/* global process */
// D-181 server-side lock (docs/proposed/20261102_payroll_sales_drift_gate.sql) on an in-memory Postgres (PGlite).
// No real database. Production function bodies (payroll_approve_run, s2 guard, consistency gate, can_finalize,
// current_role_type, s2_authorized_path) are copied as they were on 1 Nov 2026; the proposed SQL is applied on top.
// Proves: (1) SQL live sales = the JS payroll pipeline on the SAME fixture, (2) approval with changed sales is refused
// on every path (RPC, direct UPDATE, definer path), (3) unrelated changes don't block, (4) fail-closed, (5) rollback.
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import path from 'node:path';
import { makeDb } from './test-support/fakeSupabase.mjs';
import { FINANCE_CONFIRMED_AFFECTS_PAYROLL } from './src/utils/deliveryAccounting.js';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };

let PGlite = null; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { /* not installed */ }
if (!PGlite) { console.log('⚠️ PGlite غير مثبت — تُخطّى اختبار SQL (npm i --no-save @electric-sql/pglite)'); process.exit(0); }

ok(FINANCE_CONFIRMED_AFFECTS_PAYROLL === true, 'SQL uses p_use_finance_confirmations=true — must match the JS constant (change both together)');

// ── shared fixture (same rows feed the JS fake and PGlite)
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const P = { hosam: U(1), clerk: U(2), mgr: U(3), hla: U(11), haneen: U(12), taj: U(13), dina: U(14), media: U(15) };
const profiles = [
  { id: P.hosam, employee_name: 'hosam ayoub', role_type: 'admin', team: null, seller_alias: null },
  { id: P.clerk, employee_name: 'Clerk', role_type: 'employee', team: null, seller_alias: null },
  { id: P.mgr, employee_name: 'Manager NoPayroll', role_type: 'admin', team: null, seller_alias: null },
  { id: P.hla, employee_name: 'Hla Al Namra', role_type: 'employee', team: 'تركيا', seller_alias: null },
  { id: P.haneen, employee_name: 'Haneen Mohamad', role_type: 'employee', team: 'سوريا', seller_alias: null },
  { id: P.taj, employee_name: 'Taj Mahmoud', role_type: 'employee', team: ' سوريا ', seller_alias: 'taj  mahmoud' }, // alias = own name → counted twice (as the JS does)
  { id: P.dina, employee_name: 'Dina Turk', role_type: 'employee', team: 'تركيا', seller_alias: 'D. Turk' },
  { id: P.media, employee_name: 'Media Person', role_type: 'employee', team: 'ميديا', seller_alias: null },
].map((p) => ({ is_active: true, payroll_excluded: false, ...p }));
let on = 0;
// delivered_at is only set when given: the fake's select() returns whole rows, so a `delivered_at: null` key would
// overwrite the RPC's date when the service merges the order's extra fields (production selects only EXTRA_COLS).
const o = (handler, amount, currency, order_date, extra = {}) => ({ id: U(1000 + (++on)), order_id: `T-${on}`, handler_name: handler, amount, currency, order_date, market: currency === 'SYP' ? 'syria' : 'turkey', status: 'delivered', deleted_at: null, fc_delivered_at: null, no_delivery_date: false, payment_method: 'cash', ...extra });
const LATE = U(1002);
const orders = [
  o('Hla Al Namra', 1700, 'TRY', '2026-10-02T09:00:00Z', { delivered_at: '2026-10-05T09:00:00Z' }),
  o('Hla Al Namra', 1300, 'TRY', '2026-09-28T21:51:00Z', { no_delivery_date: true }),            // TL-29869-like: legacy → September
  o('Hla Al Namra', 1700, 'TRY', '2026-10-03T09:00:00Z', { delivered_at: '2026-10-06T09:00:00Z' }),
  o('Hla Al Namra', 1000, 'TRY', '2026-10-10T09:00:00Z', { no_delivery_date: true }),            // legacy → October
  o('Hla Al Namra', 800, 'TRY', '2026-10-20T09:00:00Z', { delivered_at: '2026-10-31T20:59:00Z' }), // 23:59 Istanbul → October
  o('Hla Al Namra', 900, 'TRY', '2026-10-20T09:00:00Z', { delivered_at: '2026-10-31T21:00:00Z' }), // 00:00 Istanbul 1 Nov → not October
  o('Haneen Mohamad', 2000, 'SYP', '2026-10-04T09:00:00Z'),
  o(' haneen   mohamad ', 4400, 'SYP', '2026-10-05T09:00:00Z'),
  o('Haneen Mohamad', 1500, 'TRY', '2026-10-06T09:00:00Z'),
  o('Haneen Mohamad', 20, 'USD', '2026-10-07T09:00:00Z'),
  o('Haneen Mohamad', 15, null, '2026-10-08T09:00:00Z', { market: 'syria' }),                    // no currency → USD
  o('Haneen Mohamad', 1000, 'SYP', '2026-10-09T09:00:00Z', { status: 'settled' }),               // settled with delivery → counts
  o('Haneen Mohamad', 900, 'SYP', '2026-10-09T09:00:00Z', { status: 'settled', no_delivery_date: true }), // settled, no delivery → no
  o('Haneen Mohamad', 3000, 'SYP', '2026-10-09T09:00:00Z', { status: 'returned' }),
  o('Haneen Mohamad', 100, 'AED', '2026-10-09T09:00:00Z', { market: 'uae' }),
  o('Haneen Mohamad', 5000, 'SYP', '2026-10-09T09:00:00Z', { deleted_at: '2026-10-20T00:00:00Z' }),
  o('Haneen Mohamad', 7000, 'SYP', '2026-05-01T09:00:00Z', { delivered_at: '2026-10-05T09:00:00Z' }), // created > 120 days before → no seller name
  o('Taj Mahmoud', 1600, 'SYP', '2026-10-11T09:00:00Z'),
  o('D. Turk', 2000, 'TRY', '2026-10-12T09:00:00Z'),
  o('Dina Turk', 50, 'AED', '2026-10-12T09:00:00Z'),                                            // rate from exchange_rates (USD→AED)
  o('Dina Turk', 10, 'EUR', '2026-10-12T09:00:00Z'),                                            // no rate → 0 value, still an order
  o('Media Person', 500, 'USD', '2026-10-12T09:00:00Z'),                                        // no sales team
];
const exchange_rates = [
  { from_cur: 'USD', to_cur: 'TRY', rate: 46.8, created_at: '2026-07-05T00:00:00Z' },
  { from_cur: 'TRY', to_cur: 'USD', rate: 0.03, created_at: '2026-05-01T00:00:00Z' },
  { from_cur: 'USD', to_cur: 'AED', rate: 3.6725, created_at: '2026-10-28T00:00:00Z' },
  { from_cur: 'USD', to_cur: 'SYP', rate: 140, created_at: '2026-10-26T00:00:00Z' },
];
const RUN = { period_year: 2026, period_month: 10, status: 'draft', month_setup_confirmed_at: '2026-11-01T13:36:26Z', rate_usd_try: 50, rate_usd_syp: 143.2, target_syria_usd: 1000, target_turkey_try: 70000 };
const SALES_EMPS = [P.hla, P.haneen, P.taj, P.dina, P.media];

// ── JS side: the real computeLiveTeamSales over the fake Supabase
const fake = makeDb({ profiles, orders, exchange_rates, payroll_entries: [], payroll_runs: [] });
globalThis.__fakeSb = fake.client;
const server = await createServer({
  configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: { '@utils': path.resolve('src/utils'), '@': path.resolve('src') } },
  plugins: [{ name: 'fake-supabase', enforce: 'pre',
    resolveId(s) { return s === '@services/supabase' ? '\0fake-sb' : s === '@services/deliveryAccountingService' ? path.resolve('src/services/deliveryAccountingService.js') : null; },
    load(id) { return id === '\0fake-sb' ? 'export const supabase = globalThis.__fakeSb; export const supabaseAnon = globalThis.__fakeSb;' : null; } }],
});
const { computeLiveTeamSales } = await server.ssrLoadModule('/src/modules/payroll/services/payrollEngine.js');
const jsLive = async () => computeLiveTeamSales({ year: 2026, month: 10, run: RUN, employees: profiles.filter((p) => SALES_EMPS.includes(p.id)) });

// ── SQL side
const db = new PGlite();
const q = (sql, params) => db.query(sql, params);
const err = async (sql, params) => { try { await db.query(sql, params); return null; } catch (e) { await db.exec('ROLLBACK').catch(() => {}); return String(e.message || e); } };
const asUser = (uid) => db.exec(`SELECT set_config('test.uid', '${uid}', false)`);
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, employee_name text, role_type text, team text, seller_alias text, is_active boolean, payroll_excluded boolean DEFAULT false);
CREATE TABLE public.payroll_access (profile_id uuid PRIMARY KEY, can_finalize boolean);
CREATE TABLE public.orders (id uuid PRIMARY KEY, order_id text, handler_name text, amount numeric, currency text, order_date timestamptz, market text, status text,
  deleted_at timestamptz, delivered_at timestamptz, fc_delivered_at timestamptz, no_delivery_date boolean, payment_method text);
CREATE TABLE public.exchange_rates (id serial, from_cur text, to_cur text, rate numeric, created_at timestamptz);
CREATE TABLE public.payroll_runs (id uuid PRIMARY KEY, period_year int, period_month int, status text, total_net_usd numeric, employee_count int,
  month_setup_confirmed_at timestamptz, rate_usd_try numeric, rate_usd_syp numeric, target_syria_usd numeric, target_turkey_try numeric,
  approved_by uuid, finalized_by uuid, finalized_at timestamptz, archived_at timestamptz, paid_at timestamptz);
CREATE TABLE public.payroll_entries (id serial PRIMARY KEY, run_id uuid, employee_id uuid, source text, team text, sales_local numeric, sales_orders_count int,
  computed_at timestamptz, net_salary_usd numeric, base_salary_usd numeric, allowances_usd numeric DEFAULT 0, commission_usd numeric DEFAULT 0, bonus_usd numeric DEFAULT 0,
  deductions_usd numeric DEFAULT 0, absence_deduction_usd numeric DEFAULT 0, shortfall_deduction_usd numeric DEFAULT 0, advance_deduction_usd numeric DEFAULT 0, allowances_detail jsonb DEFAULT '[]',
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status = ANY (ARRAY['pending','paid','hold'])), paid_at timestamptz);
ALTER TABLE public.payroll_runs ADD CONSTRAINT payroll_runs_status_check CHECK (status = ANY (ARRAY['draft','finalized','paid']));
CREATE TABLE public.payroll_run_events (id serial PRIMARY KEY, run_id uuid, period int, action text, actor uuid, at timestamptz DEFAULT now(), changes jsonb, reason text, before_snapshot jsonb);
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- production bodies (1 Nov 2026)
CREATE FUNCTION public.current_role_type() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$ select role_type from public.profiles where id = auth.uid() $$;
CREATE FUNCTION public.payroll_can_finalize() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT EXISTS (SELECT 1 FROM public.payroll_access pa JOIN public.profiles p ON p.id = pa.profile_id WHERE pa.profile_id = auth.uid() AND pa.can_finalize = true AND p.is_active = true); $$;
CREATE FUNCTION public.payroll_is_new_period(p_year integer, p_month integer) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT coalesce(p_year * 100 + p_month, 0) >= 202609 $$;
CREATE FUNCTION public.payroll_period_is_operational(p_year integer, p_month integer) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ select coalesce(p_year * 100 + p_month, 0) >= 202610 $$;
CREATE FUNCTION public.payroll_s2_authorized_path() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('payroll.s2_path', true), '') = 'rpc' AND current_user NOT IN ('anon', 'authenticated', 'service_role'); $$;
CREATE FUNCTION public.payroll_s2_entries_snapshot(p uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;

-- profitability_orders stand-in with the SAME semantics as test-support/fakeSupabase.mjs (and the production role gate)
CREATE FUNCTION public.profitability_orders(p_from timestamptz, p_to timestamptz, p_use_finance_confirmations boolean DEFAULT true)
RETURNS TABLE(id uuid, order_code text, market text, status text, order_date timestamptz, amount numeric, currency text, delivered_at timestamptz, delivery_basis text, return_at timestamptz)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH allowed AS (SELECT public.current_role_type() IN ('admin','manager','sales_manager') AS ok),
  x AS (SELECT o.*, (o.status = 'delivered' AND o.fc_delivered_at IS NOT NULL) AS fc FROM orders o, allowed WHERE allowed.ok AND o.status IN ('delivered','settled','returned')),
  y AS (SELECT x.*, (x.status = 'returned' OR (x.fc AND NOT p_use_finance_confirmations) OR (coalesce(x.no_delivery_date, false) AND NOT (x.fc AND p_use_finance_confirmations))) AS unk FROM x),
  z AS (SELECT y.*, CASE WHEN unk THEN NULL WHEN fc THEN fc_delivered_at ELSE coalesce(y.delivered_at, y.order_date) END AS d FROM y)
  SELECT z.id, z.order_id, z.market, z.status, z.order_date, z.amount, z.currency, z.d,
         CASE WHEN unk THEN 'unknown' WHEN fc THEN 'finance_confirmed' ELSE 'carrier' END,
         CASE WHEN z.status = 'returned' THEN z.order_date END
    FROM z
   WHERE (unk AND z.status <> 'returned' AND z.order_date >= p_from - interval '60 days' AND z.order_date < p_to)
      OR (NOT unk AND z.d >= p_from AND z.d < p_to)
      OR (z.status = 'returned' AND z.order_date >= p_from AND z.order_date < p_to) $$;
`);
await db.exec(readFileSync('test-support/payroll-prod-bodies-20261101.sql', 'utf8'));
const insertRows = async (table, rows) => { for (const r of rows) { const k = Object.keys(r); await q(`INSERT INTO public.${table} (${k.join(',')}) VALUES (${k.map((_, i) => `$${i + 1}`).join(',')})`, k.map((c) => r[c])); } };
await insertRows('profiles', profiles);
await insertRows('payroll_access', [{ profile_id: P.hosam, can_finalize: true }, { profile_id: P.clerk, can_finalize: true }]);
await insertRows('orders', orders);
await insertRows('exchange_rates', exchange_rates);
// payroll_mark_paid as in production (1 Nov 2026)
await db.exec(`CREATE FUNCTION public.payroll_mark_paid(p_run_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE r public.payroll_runs%ROWTYPE;
BEGIN
  IF NOT public.payroll_can_finalize() THEN
    RAISE EXCEPTION 'تسجيل الدفع لحسام وأماني فقط (D-090).' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO r FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الدورة غير موجودة.'; END IF;
  IF NOT public.payroll_is_new_period(r.period_year, r.period_month) THEN
    RAISE EXCEPTION 'هذا المسار لدورات أيلول 2026+ فقط.';
  END IF;
  IF r.status <> 'finalized' THEN RAISE EXCEPTION 'الدفع لدورة معتمدة فقط (الحالة: %).', r.status; END IF;
  PERFORM set_config('payroll.s2_path', 'rpc', true);
  UPDATE public.payroll_runs SET status = 'paid', paid_at = now() WHERE id = p_run_id;
  INSERT INTO public.payroll_run_events (run_id, period, action, actor) VALUES (p_run_id, r.period_year * 100 + r.period_month, 'pay', auth.uid());
  PERFORM set_config('payroll.s2_path', '', true);
  RETURN jsonb_build_object('run_id', p_run_id, 'status', 'paid');
END $function$;
CREATE FUNCTION public.payroll_run_is_locked_new(p_run_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT coalesce((SELECT public.payroll_is_new_period(r.period_year, r.period_month) AND r.status <> 'draft' FROM public.payroll_runs r WHERE r.id = p_run_id), false); $$;
CREATE FUNCTION public.payroll_entries_s2_guard() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF (TG_OP <> 'INSERT' AND public.payroll_run_is_locked_new(OLD.run_id))
     OR (TG_OP <> 'DELETE' AND public.payroll_run_is_locked_new(NEW.run_id)) THEN
    IF NOT public.payroll_s2_authorized_path() THEN
      RAISE EXCEPTION 'بنود دورة أيلول 2026+ معتمدة/مدفوعة — لا تُضاف ولا تُعدَّل ولا تُحذف. أعد فتح الدورة أولاً (D-090).'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $function$;
CREATE TRIGGER payroll_entries_s2_guard BEFORE INSERT OR DELETE OR UPDATE ON public.payroll_entries FOR EACH ROW EXECUTE FUNCTION payroll_entries_s2_guard();`);
const objects = async () => (await q(`SELECT
  (SELECT string_agg(tgrelid::regclass || '.' || tgname, ',' ORDER BY tgname) FROM pg_trigger WHERE NOT tgisinternal) AS triggers,
  (SELECT string_agg(md5(pg_get_functiondef(p.oid)), ',' ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public') AS funcs`)).rows[0];
const before = await objects();
const gateBefore = (await q(`SELECT pg_get_functiondef('public.payroll_run_consistency_gate()'::regprocedure) d`)).rows[0].d;

await db.exec(readFileSync('docs/proposed/20261102_payroll_sales_drift_gate.sql', 'utf8'));
await asUser(P.hosam);

const sqlLive = async (runId) => new Map((await q('SELECT employee_id, live_local, live_count FROM public.payroll_live_team_sales($1)', [runId])).rows.map((r) => [r.employee_id, { value: Number(r.live_local), count: r.live_count }]));
const newRun = async (id, live) => {
  await insertRows('payroll_runs', [{ id, ...RUN }]);
  const rows = SALES_EMPS.map((e) => ({ run_id: id, employee_id: e, source: 'auto', team: e === P.media ? null : (profiles.find((p) => p.id === e).team.trim() === 'سوريا' ? 'syria' : 'turkey'),
    sales_local: live.get(e)?.value ?? 0, sales_orders_count: live.get(e)?.count ?? 0, computed_at: '2026-11-01T17:57:13Z', net_salary_usd: 100, base_salary_usd: 100 }));
  rows.push({ run_id: id, employee_id: P.hla, source: 'manual', team: 'turkey', sales_local: 999999, sales_orders_count: 999, computed_at: '2026-11-01T17:57:13Z', net_salary_usd: 5, base_salary_usd: 5 });
  await insertRows('payroll_entries', rows);
  await q('UPDATE public.payroll_runs SET employee_count = $2, total_net_usd = $3 WHERE id = $1', [id, rows.length, rows.reduce((t, r) => t + r.net_salary_usd, 0)]);
};
const status = async (id) => (await q('SELECT status FROM public.payroll_runs WHERE id = $1', [id])).rows[0].status;

try {
  // ── A) parity: SQL = JS on the same rows
  const R1 = U(501), R2 = U(502);
  await insertRows('payroll_runs', [{ id: U(500), ...RUN }]);
  await insertRows('payroll_entries', SALES_EMPS.map((e) => ({ run_id: U(500), employee_id: e, source: 'auto', team: 'turkey', sales_local: 0, sales_orders_count: 0, computed_at: '2026-11-01T00:00:00Z', net_salary_usd: 0, base_salary_usd: 0 })));
  const js = await jsLive(), sql = await sqlLive(U(500));
  for (const e of SALES_EMPS) {
    const a = js.get(e), b = sql.get(e);
    ok((!a && !b) || (a && b && Math.abs(a.value - b.value) <= 0.01 && a.count === b.count), `parity ${profiles.find((p) => p.id === e).employee_name}: JS ${JSON.stringify(a)} vs SQL ${JSON.stringify(b)}`);
  }
  ok(!sql.has(P.media) && !js.has(P.media), 'employee without a sales team has no live sales on either side');
  ok(sql.get(P.hla).count === 4 && sql.get(P.hla).value === 5200, `Hla: 2×1700 + legacy 1000 + boundary 800 (not the 1 Nov 00:00 one, not the September legacy one) = 4 / 5200 — got ${JSON.stringify(sql.get(P.hla))}`);
  ok(sql.get(P.taj).count === 2, 'alias equal to own name counts twice — same quirk as employeeNames (parity, documented)');
  ok(sql.get(P.haneen).count === 6, `Haneen: 2 SYP (name variants) + TRY + USD + null-currency + settled-with-delivery = 6 — got ${sql.get(P.haneen).count}`);
  ok(sql.get(P.dina).count === 3, 'Dina: alias order + AED + EUR (no rate) = 3');

  // ── B) clean run approves
  await newRun(R1, sql);
  ok((await q('SELECT count(*)::int n FROM public.payroll_sales_drift($1)', [R1])).rows[0].n === 0, 'fresh run: no drift (manual entry ignored)');
  // a November delivery does not make October stale
  await insertRows('orders', [o('Hla Al Namra', 999, 'TRY', '2026-11-01T09:00:00Z', { delivered_at: '2026-11-02T09:00:00Z' })]);
  ok((await q('SELECT count(*)::int n FROM public.payroll_sales_drift($1)', [R1])).rows[0].n === 0, 'November delivery → October still not stale');
  ok(await err('SELECT public.payroll_approve_run($1)', [R1]) === null && await status(R1) === 'finalized', 'clean run approves through the RPC');
  // payment 1: approved and sales unchanged → payment recorded
  ok(await err('SELECT public.payroll_mark_paid($1)', [R1]) === null && await status(R1) === 'paid', 'PAY: approved run with unchanged sales → payroll_mark_paid succeeds');
  // R3: approved now (clean), paid only AFTER the delivery data changes below
  const R3 = U(503);
  await newRun(R3, sql);
  ok(await err('SELECT public.payroll_approve_run($1)', [R3]) === null && await status(R3) === 'finalized', 'R3 approved while sales were current');

  // ── C) late finance confirmation → every path refused
  await newRun(R2, sql);
  await q('UPDATE public.orders SET fc_delivered_at = $2 WHERE id = $1', [LATE, '2026-10-31T20:59:00Z']);
  const drift = (await q('SELECT * FROM public.payroll_sales_drift($1)', [R2])).rows;
  ok(drift.length === 1 && drift[0].employee_id === P.hla && drift[0].stored_count === 4 && drift[0].live_count === 5 && Number(drift[0].live_local) === 6500, `drift = Hla 4→5 / 5200→6500 — got ${JSON.stringify(drift)}`);
  const jsAfter = (await (async () => { fake.tables.orders.find((x) => x.id === LATE).fc_delivered_at = '2026-10-31T20:59:00Z'; return jsLive(); })()).get(P.hla);
  ok(jsAfter.count === 5 && jsAfter.value === 6500, 'the browser check sees the same drift (UI gate = server gate)');

  const e1 = await err('SELECT public.payroll_approve_run($1)', [R2]);
  ok(e1 && e1.includes('مبيعات التسليمات تغيّرت') && e1.includes('Hla Al Namra'), 'RPC approve refused with a readable reason: ' + e1);
  ok(await status(R2) === 'draft', 'run stays draft');
  ok((await q("SELECT count(*)::int n FROM public.payroll_run_events WHERE run_id = $1", [R2])).rows[0].n === 0, 'no approve event written (whole transaction rolled back)');

  await db.exec('SET ROLE authenticated');
  const e2 = await err("UPDATE public.payroll_runs SET status = 'finalized' WHERE id = $1", [R2]);
  await db.exec('RESET ROLE');
  ok(e2 && /payroll_approve_run/.test(e2), 'direct UPDATE by an app user refused (existing s2 guard): ' + e2);

  let e3 = null;
  try { await db.exec("BEGIN; SELECT set_config('payroll.s2_path', 'rpc', true); UPDATE public.payroll_runs SET status = 'finalized' WHERE id = '" + R2 + "'; COMMIT;"); }
  catch (e) { e3 = String(e.message || e); await db.exec('ROLLBACK').catch(() => {}); }
  ok(e3 && e3.includes('مبيعات التسليمات تغيّرت'), 'even a privileged/definer UPDATE that passes the s2 guard is refused by the trigger: ' + e3);
  ok(await status(R2) === 'draft', 'still draft after the privileged attempt');

  await db.exec('SET ROLE authenticated');
  const e4 = await err('SELECT * FROM public.payroll_live_team_sales($1)', [R2]);
  await db.exec('RESET ROLE');
  ok(e4 && /permission denied/i.test(e4), 'app users cannot call the internal live-sales function: ' + e4);

  await asUser(P.mgr);
  const e5 = await err('SELECT * FROM public.payroll_sales_drift($1)', [R2]);
  ok(e5 && e5.includes('لحسام وأماني فقط'), 'non-finalizer cannot read the drift check');
  await asUser(P.clerk); // can_finalize but a role that cannot read sales → fail closed
  const e6 = await err('SELECT public.payroll_approve_run($1)', [R2]);
  ok(e6 && e6.includes('تعذّر التحقق من مبيعات التسليمات'), 'finalizer whose role cannot read sales: refused (fail-closed), not approved with zero sales: ' + e6);
  ok(await status(R2) === 'draft', 'still draft');
  await asUser(P.hosam);

  // ── E) payment after approval: the delivery data changed between approval and payment (R3)
  const p1 = await err('SELECT public.payroll_mark_paid($1)', [R3]);
  ok(p1 && p1.includes('لا يُسجَّل الدفع') && p1.includes('Hla Al Namra') && p1.includes('4→5') && p1.includes('5200.00→6500.00'), 'PAY: change between approval and payment detected — RPC refused with names and differences: ' + p1);
  ok(await status(R3) === 'finalized', 'PAY: run stays finalized (approved run, entries and status untouched)');
  ok((await q("SELECT count(*)::int n FROM public.payroll_run_events WHERE run_id = $1 AND action = 'pay'", [R3])).rows[0].n === 0, 'PAY: no pay event written');

  await db.exec('SET ROLE authenticated');
  const p2 = await err("UPDATE public.payroll_runs SET status = 'paid', paid_at = now() WHERE id = $1", [R3]);
  await db.exec('RESET ROLE');
  ok(p2 && /payroll_mark_paid/.test(p2), 'PAY: direct UPDATE by an app user refused: ' + p2);

  let p3 = null;
  try { await db.exec("BEGIN; SELECT set_config('payroll.s2_path', 'rpc', true); UPDATE public.payroll_runs SET status = 'paid', paid_at = now() WHERE id = '" + R3 + "'; COMMIT;"); }
  catch (e) { p3 = String(e.message || e); await db.exec('ROLLBACK').catch(() => {}); }
  ok(p3 && p3.includes('لا يُسجَّل الدفع'), 'PAY: privileged UPDATE that passes the s2 guard is still refused by the trigger: ' + p3);

  let p3b = null;
  try { await db.exec("BEGIN; SELECT set_config('payroll.s2_path', 'rpc', true); UPDATE public.payroll_runs SET status = 'paid', paid_at = now() WHERE id = '" + R2 + "'; COMMIT;"); }
  catch (e) { p3b = String(e.message || e); await db.exec('ROLLBACK').catch(() => {}); }
  ok(p3b && p3b.includes('مبيعات التسليمات تغيّرت') && await status(R2) === 'draft', 'PAY: draft → paid directly (privileged, skipping approval) is refused by the same checks: ' + p3b);

  // privileged path with NO signed-in user (service/SQL editor style): cannot verify → refused
  await asUser('');
  let p4 = null;
  try { await db.exec("BEGIN; SELECT set_config('payroll.s2_path', 'rpc', true); UPDATE public.payroll_runs SET status = 'paid' WHERE id = '" + R3 + "'; COMMIT;"); }
  catch (e) { p4 = String(e.message || e); await db.exec('ROLLBACK').catch(() => {}); }
  ok(p4 && p4.includes('لحسام وأماني فقط'), 'PAY: privileged UPDATE without a user cannot run the check → refused: ' + p4);
  await asUser(P.hosam);

  // reading the delivery data fails → payment refused
  await db.exec(`ALTER FUNCTION public.profitability_orders(timestamptz, timestamptz, boolean) RENAME TO profitability_orders_ok;
    CREATE FUNCTION public.profitability_orders(p_from timestamptz, p_to timestamptz, p_use_finance_confirmations boolean DEFAULT true)
    RETURNS TABLE(id uuid, order_code text, market text, status text, order_date timestamptz, amount numeric, currency text, delivered_at timestamptz, delivery_basis text, return_at timestamptz)
    LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'delivery source unavailable'; END $f$;`);
  const p5 = await err('SELECT public.payroll_mark_paid($1)', [R3]);
  ok(p5 && p5.includes('delivery source unavailable') && await status(R3) === 'finalized', 'PAY: delivery data unreadable → refused, run unchanged: ' + p5);
  await db.exec(`DROP FUNCTION public.profitability_orders(timestamptz, timestamptz, boolean);
    ALTER FUNCTION public.profitability_orders_ok(timestamptz, timestamptz, boolean) RENAME TO profitability_orders;`);
  await asUser(P.clerk);
  const p6 = await err('SELECT public.payroll_mark_paid($1)', [R3]);
  ok(p6 && p6.includes('تعذّر التحقق من مبيعات التسليمات'), 'PAY: finalizer whose role cannot read sales → refused (fail-closed): ' + p6);
  await asUser(P.hosam);

  // entry-level payment markers on an operational run
  const eid = (await q("SELECT id FROM public.payroll_entries WHERE run_id = $1 AND source = 'auto' LIMIT 1", [R2])).rows[0].id;
  const p7 = await err("UPDATE public.payroll_entries SET payment_status = 'paid' WHERE id = $1", [eid]);
  ok(p7 && p7.includes('للدورة كاملة'), 'ENTRY: marking a single entry paid is refused (draft run): ' + p7);
  const p8 = await err('UPDATE public.payroll_entries SET paid_at = now() WHERE id = $1', [eid]);
  ok(p8 && p8.includes('للدورة كاملة'), 'ENTRY: setting paid_at on an entry is refused');
  const p9 = await err("INSERT INTO public.payroll_entries (run_id, employee_id, source, payment_status) VALUES ($1, $2, 'manual', 'paid')", [R2, P.dina]);
  ok(p9 && p9.includes('للدورة كاملة'), 'ENTRY: inserting an already-paid entry is refused');
  ok(await err("UPDATE public.payroll_entries SET payment_status = 'hold' WHERE id = $1", [eid]) === null, 'ENTRY: hold (not a payment) still allowed on a draft run');
  await q("UPDATE public.payroll_entries SET payment_status = 'pending' WHERE id = $1", [eid]);
  let p10 = null;
  try { await db.exec("BEGIN; SELECT set_config('payroll.s2_path', 'rpc', true); UPDATE public.payroll_entries SET payment_status = 'paid' WHERE run_id = '" + R3 + "'; COMMIT;"); }
  catch (e) { p10 = String(e.message || e); await db.exec('ROLLBACK').catch(() => {}); }
  ok(p10 && p10.includes('للدورة كاملة'), 'ENTRY: even the privileged path cannot mark entries of an approved run paid: ' + p10);

  // escaping the check by moving the run to a month outside the policy, or creating it already paid
  const p11 = await err('UPDATE public.payroll_runs SET period_month = 9 WHERE id = $1', [R2]);
  ok(p11 && p11.includes('لا يُغيَّر شهر'), 'BYPASS: moving a draft October run to September is refused: ' + p11);
  const RS = U(509);
  await insertRows('payroll_runs', [{ id: RS, ...RUN, period_month: 9, status: 'draft' }]);
  const p12 = await err('UPDATE public.payroll_runs SET period_month = 10 WHERE id = $1', [RS]);
  ok(p12 && p12.includes('لا يُغيَّر شهر'), 'BYPASS: moving a September run into October is refused');
  let p13 = null;
  try { await db.exec("BEGIN; SELECT set_config('payroll.s2_path', 'rpc', true); INSERT INTO public.payroll_runs (id, period_year, period_month, status) VALUES ('" + U(510) + "', 2026, 10, 'paid'); COMMIT;"); }
  catch (e) { p13 = String(e.message || e); await db.exec('ROLLBACK').catch(() => {}); }
  ok(p13 && p13.includes('تبدأ مسودة فقط'), 'BYPASS: inserting an October run already paid is refused even on the privileged path: ' + p13);

  // runs outside the new policy are unaffected
  // September 2026 (s2 period, not operational): approve + pay with stale entries still works
  await q("INSERT INTO public.payroll_entries (run_id, employee_id, source, team, sales_local, sales_orders_count, computed_at, net_salary_usd, base_salary_usd) VALUES ($1, $2, 'auto', 'turkey', 1, 1, '2026-11-01T17:57:13Z', 100, 100)", [RS, P.hla]);
  await q('UPDATE public.payroll_runs SET employee_count = 1, total_net_usd = 100 WHERE id = $1', [RS]);
  ok(await err('SELECT public.payroll_approve_run($1)', [RS]) === null && await err('SELECT public.payroll_mark_paid($1)', [RS]) === null && await status(RS) === 'paid', 'SCOPE: September 2026 run (outside policy) approves and pays as before');
  // legacy period (August 2026, < s2): direct status update to paid as before
  const RL = U(511);
  await insertRows('payroll_runs', [{ id: RL, ...RUN, period_month: 8, status: 'finalized' }]);
  await insertRows('payroll_entries', [{ run_id: RL, employee_id: P.hla, source: 'auto', team: 'turkey', sales_local: 1, sales_orders_count: 1, computed_at: '2026-09-01T00:00:00Z', net_salary_usd: 1, base_salary_usd: 1 }]);
  ok(await err("UPDATE public.payroll_runs SET status = 'paid', paid_at = now() WHERE id = $1", [RL]) === null && await status(RL) === 'paid', 'SCOPE: legacy August run keeps its old direct path');
  ok(await err("UPDATE public.payroll_entries SET payment_status = 'paid' WHERE run_id = $1", [RL]) === null, 'SCOPE: entry payment flags on legacy runs untouched by the new guard');

  // recalculation (entries updated to the live figures) reopens the path
  await q('UPDATE public.payroll_entries SET sales_local = 6500, sales_orders_count = 5, computed_at = $2 WHERE run_id = $1 AND employee_id = $3 AND source = $4', [R2, '2026-11-01T19:00:00Z', P.hla, 'auto']);
  ok((await q('SELECT count(*)::int n FROM public.payroll_sales_drift($1)', [R2])).rows[0].n === 0, 'after recalculation: no drift');

  // ── D) rollback restores the previous gate exactly and removes the functions
  await q('UPDATE public.payroll_entries SET sales_local = 5200, sales_orders_count = 4 WHERE run_id = $1 AND employee_id = $2 AND source = $3', [R2, P.hla, 'auto']); // stale again
  await db.exec(readFileSync('docs/proposed/20261102_payroll_sales_drift_gate_rollback.sql', 'utf8'));
  const gateAfter = (await q(`SELECT pg_get_functiondef('public.payroll_run_consistency_gate()'::regprocedure) d`)).rows[0].d;
  ok(gateAfter === gateBefore, 'rollback restores the gate byte-for-byte');
  ok((await q("SELECT count(*)::int n FROM pg_proc WHERE proname IN ('payroll_sales_drift','payroll_live_team_sales','payroll_norm_name','payroll_assert_sales_fresh','payroll_runs_period_guard','payroll_entries_payment_guard')")).rows[0].n === 0, 'rollback drops every new function');
  const after = await objects();
  ok(after.triggers === before.triggers, `rollback: trigger set identical to before (${after.triggers})`);
  ok(after.funcs === before.funcs, 'rollback: every public function body identical to before (md5 of all definitions)');
  ok(await err('SELECT public.payroll_approve_run($1)', [R2]) === null, 'after rollback the old behaviour returns (stale run approvable) — proves the lock came from this migration');
  ok(await err('SELECT public.payroll_mark_paid($1)', [U(503)]) === null, 'after rollback a stale approved run can be paid again (old behaviour)');
} finally {
  await server.close();
}

console.log(`payroll sales drift SQL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
