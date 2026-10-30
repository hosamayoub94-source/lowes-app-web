/* global process */
// FX S1a: runs the REAL S0 + S1a migration files (and the S1a rollback) on PGlite against a schema that mimics production
// (exchange_rates / payroll_runs / profitability_fx_rates with the real column names and the real frozen payroll rates).
// Proves: monthly rows (D2 payroll-frozen, D3 AED) exist and payroll_runs is untouched; fx_rate_for exact/carried/none; legacy S0 rows ignored;
// SYP legacy-unit guard; single write path (admin only, audit, supersede, atomic current-month mirror to exchange_rates, no past-month mirror);
// direct writes denied; rollback restores the S0 shape. run: node test-fx-s1a-sql.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const read = (f) => readFileSync(`supabase/migrations/${f}`, 'utf8');
const s0 = read('20261030900000_fx_monthly_rates_s0.sql');
const s1a = read('20261031000000_fx_s1a_monthly_rate_model.sql');
const s1aRollback = read('20261031000000_fx_s1a_monthly_rate_model_rollback.sql.txt');

const U = { admin: '00000000-0000-0000-0000-00000000a001', manager: '00000000-0000-0000-0000-00000000a002', emp: '00000000-0000-0000-0000-00000000a004' };
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  create table profiles (id uuid primary key, role_type text, is_active boolean default true);
  insert into profiles values ('${U.admin}','admin',true),('${U.manager}','manager',true),('${U.emp}','employee',true);
  create function public.current_role_type() returns text language sql stable security definer as $$ select role_type from public.profiles where id = auth.uid() $$;
  create function public.auth_is_active_staff() returns boolean language sql stable security definer as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active) $$;
  grant execute on all functions in schema public to public;
  grant select on profiles to authenticated;

  create table exchange_rates (id uuid primary key default gen_random_uuid(), from_cur text not null, to_cur text not null, rate numeric not null, set_by uuid, created_at timestamptz not null default now());
  create table payroll_runs (id uuid primary key default gen_random_uuid(), period_year int, period_month int, status text, rate_usd_try numeric, rate_usd_syp numeric, created_at timestamptz default now());
  create table profitability_fx_rates (id uuid primary key default gen_random_uuid(), month date, scope text, currency text, units_per_usd numeric, note text, entered_at timestamptz default now());
  grant all on exchange_rates, payroll_runs, profitability_fx_rates to service_role;
  grant select on exchange_rates, payroll_runs to authenticated;

  -- production values read on 30 Oct 2026
  insert into exchange_rates (from_cur,to_cur,rate,created_at) values
    ('USD','SYP',13000,'2026-05-20'),('USD','TRY',32.5,'2026-05-20'),('USD','TRY',45.9,'2026-06-03'),('USD','SYP',140,'2026-06-03'),('USD','SYP',142,'2026-06-21'),
    ('USD','TRY',46.8,'2026-07-05'),('USD','SYP',131,'2026-09-12'),('USD','SYP',140,'2026-10-26'),('USD','TRY',50,'2026-10-26'),('USD','AED',3.6725,'2026-10-28');
  insert into payroll_runs (period_year,period_month,status,rate_usd_try,rate_usd_syp,created_at) values
    (2026,7,'draft',null,null,'2026-08-01'),(2026,8,'draft',48,131,'2026-09-01'),(2026,9,'draft',46.8,131,'2026-10-22'),(2026,10,'draft',50,140,'2026-10-24');
  insert into profitability_fx_rates (month,scope,currency,units_per_usd,note,entered_at) values ('2026-10-01','all','TRY',49.5,null,'2026-10-18'),('2026-10-01','all','SYP',140,null,'2026-10-18'),('2026-10-01','all','AED',3.68,null,'2026-10-18');
`);

const as = async (role, uid, sql) => {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    if (uid) await db.exec(`set local app.uid = '${uid}'`);
    const r = await db.query(sql);
    await db.exec('rollback');
    return { err: null, rows: r.rows, n: r.rows.length };
  } catch (e) { await db.exec('rollback'); return { err: String(e.message || e), rows: [], n: 0 }; }
};
// a call that must COMMIT inside one test step (to test supersede history), run as a role
const asCommit = async (role, uid, sql) => {
  await db.exec('begin');
  try { await db.exec(`set local role ${role}`); if (uid) await db.exec(`set local app.uid = '${uid}'`); const r = await db.query(sql); await db.exec('commit'); return { err: null, rows: r.rows }; }
  catch (e) { await db.exec('rollback'); return { err: String(e.message || e), rows: [] }; }
};
const denied = (r) => !!r.err && /permission denied|row-level security|admin only|42501/i.test(r.err);
const one = async (sql) => (await db.query(sql)).rows;

// ── apply S0 (as applied in production) then snapshot payroll_runs, then S1a
ok((await db.exec(s0).then(() => null, (e) => String(e.message))) === null, 'S0 applies cleanly');
const payrollBefore = JSON.stringify(await one(`select * from payroll_runs order by id`));
const exBefore = JSON.stringify(await one(`select id from exchange_rates order by id`));
const s0Rows = (await one(`select count(*)::int n from fx_monthly_rates`))[0].n;
ok(s0Rows === 19 - 0 || s0Rows > 0, `S0 backfilled rows present (${s0Rows})`);
const e1 = await db.exec(s1a).then(() => null, (e) => String(e.message));
ok(e1 === null, 'S1a applies cleanly: ' + e1);
ok((await db.exec(s1a).then(() => null, (e) => String(e.message))) === null, 'S1a is idempotent (second run clean)');
ok(JSON.stringify(await one(`select * from payroll_runs order by id`)) === payrollBefore, 'payroll_runs untouched (D2: read only)');
ok(JSON.stringify(await one(`select id from exchange_rates order by id`)) === exBefore, 'exchange_rates untouched by the migration itself');

// ── monthly rows
const monthly = await one(`select currency, period_month::text m, units_per_usd::float8 r, source from fx_monthly_rates where purpose='delivery_accounting' and period_month is not null order by currency, period_month`);
const get = (c, m) => monthly.find((x) => x.currency === c && x.m === m)?.r;
ok(get('TRY', '2026-08-01') === 48 && get('TRY', '2026-09-01') === 46.8 && get('TRY', '2026-10-01') === 50, 'D2: TRY months = frozen payroll rates (48 / 46.8 / 50)');
ok(get('SYP', '2026-08-01') === 131 && get('SYP', '2026-09-01') === 131 && get('SYP', '2026-10-01') === 140, 'D2: SYP months = frozen payroll rates (131 / 131 / 140)');
ok(['2026-08-01', '2026-09-01', '2026-10-01'].every((m) => get('AED', m) === 3.6725), 'D3: AED 3.6725 explicit for Aug/Sep/Oct');
ok(monthly.filter((x) => x.currency === 'AED').every((x) => /^owner_decision:D3/.test(x.source)), 'D3 rows record their source');
ok(monthly.every((x) => x.m >= '2026-08-01') && monthly.length === 9, 'no monthly row before Aug 2026; exactly 9 rows (3 currencies x 3 months)');
ok((await one(`select count(*)::int n from fx_monthly_rates where units_per_usd > 5000`))[0].n === 0, 'legacy SYP 13000 never copied');
ok((await one(`select count(*)::int n from fx_monthly_rates where period_month is null`))[0].n === s0Rows, 'S0 copies kept as history (period_month null)');

// ── fx_rate_for
const rate = async (p, c, m, mk = null) => (await as('authenticated', U.emp, `select * from fx_rate_for('${p}','${c}','${m}',${mk ? `'${mk}'` : 'null'})`)).rows[0] || null;
let r = await rate('delivery_accounting', 'TRY', '2026-10-17');
ok(r && +r.units_per_usd === 50 && r.exact === true, 'Oct mid-month → Oct rate, exact');
r = await rate('delivery_accounting', 'TRY', '2026-09-30');
ok(r && +r.units_per_usd === 46.8 && r.exact === true, 'Sep → 46.8 (not today\'s 50)');
r = await rate('delivery_accounting', 'AED', '2026-09-10');
ok(r && +r.units_per_usd === 3.6725 && r.exact === true, 'AED Sep resolves (was unconverted before D3)');
r = await rate('delivery_accounting', 'TRY', '2026-11-05');
ok(r && +r.units_per_usd === 50 && r.exact === false && new Date(r.period_month).toISOString().startsWith('2026-10'), 'Nov has no row → carried from CONFIRMED Oct, exact=false');
ok((await rate('delivery_accounting', 'TRY', '2026-07-10')) === null, 'Jul (before any confirmed month) → no row = unconverted');
ok((await rate('profitability', 'TRY', '2026-10-10')) === null, 'purposes are separate: no profitability monthly row => none (S0 copy ignored)');
ok((await rate('payroll', 'TRY', '2026-10-10')) === null, 'payroll purpose has no monthly rows in S1a');

// ── units
const unit = async (c, d) => { const x = await as('authenticated', U.emp, `select fx_unit_for('${c}','${d}') u`); if (x.err) console.error('UNIT ERR', x.err); return x.rows[0]?.u; };
ok((await unit('SYP', '2025-11-15')) === 'legacy' && (await unit('SYP', '2026-02-01')) === 'current' && (await unit('TRY', '2025-11-15')) === 'current', 'SYP Oct-Dec 2025 = legacy unit; 2026 = current; TRY unaffected');
ok((await one(`select status from fx_currency_units where currency='SYP' order by valid_from`)).every((x) => x.status === 'proposed'), 'cut-over is PROPOSED until the owner confirms');

// ── single write path
ok(denied(await as('authenticated', U.admin, `insert into fx_monthly_rates(purpose,currency,units_per_usd,effective_from,source) values('payroll','TRY',1,current_date,'x')`)), 'even admin cannot INSERT directly (single write path)');
for (const t of ['fx_monthly_rates', 'fx_currency_units', 'fx_period_approvals']) {
  ok(denied(await as('authenticated', U.manager, `update ${t} set note = 'x'`)) || (await as('authenticated', U.manager, `update ${t} set note='x' returning 1`)).n === 0, `manager cannot UPDATE ${t}`);
  ok(denied(await as('authenticated', U.admin, `delete from ${t}`)), `admin cannot DELETE ${t}`);
  ok(denied(await as('anon', null, `select 1 from ${t}`)), `anon cannot read ${t}`);
  ok((await as('authenticated', U.emp, `select 1 from ${t} limit 1`)).err === null, `staff can read ${t}`);
}
ok(denied(await as('authenticated', U.emp, `select fx_set_monthly_rate('delivery_accounting','TRY','2026-11-01',51)`)), 'employee cannot call fx_set_monthly_rate');
ok(denied(await as('authenticated', U.manager, `select fx_set_monthly_rate('delivery_accounting','TRY','2026-11-01',51)`)), 'manager cannot call fx_set_monthly_rate (admin only)');
ok(denied(await as('anon', null, `select fx_set_monthly_rate('delivery_accounting','TRY','2026-11-01',51)`)), 'anon cannot call fx_set_monthly_rate');
ok(denied(await as('authenticated', U.emp, `select fx_approve_period('delivery_accounting','2026-11-01')`)), 'employee cannot approve a period');
ok((await as('authenticated', U.admin, `select fx_approve_period('delivery_accounting','2026-11-15','carried TRY from Oct','[{"currency":"TRY","from":"2026-10-01"}]'::jsonb)`)).err === null, 'admin can approve a period (recorded)');
for (const [rt, label] of [[0, 'zero'], [-5, 'negative']]) ok(!!(await as('authenticated', U.admin, `select fx_set_monthly_rate('delivery_accounting','TRY','2026-11-01',${rt})`)).err, `${label} rate rejected`);
ok(!!(await as('authenticated', U.admin, `select fx_set_monthly_rate('delivery_accounting','USD','2026-11-01',1)`)).err, 'USD rate rejected');
ok(!!(await as('authenticated', U.admin, `select fx_set_monthly_rate('nonsense','TRY','2026-11-01',1)`)).err, 'unknown purpose rejected');

// a superseded (or legacy-unit) row must never be a source, even if it is newer than every confirmed row
await db.exec("insert into fx_monthly_rates(purpose,currency,units_per_usd,effective_from,source,period_month,status) values ('delivery_accounting','TRY',99,'2026-11-01','t:superseded','2026-11-01','superseded')");
await db.exec("insert into fx_monthly_rates(purpose,currency,units_per_usd,effective_from,source,period_month,currency_unit) values ('delivery_accounting','TRY',77,'2026-11-01','t:legacy','2026-11-01','legacy')");
r = await rate('delivery_accounting', 'TRY', '2026-11-20');
ok(r && +r.units_per_usd === 50 && r.exact === false, 'superseded and legacy-unit rows are never used or carried (still Oct 50)');
await db.exec("delete from fx_monthly_rates where source in ('t:superseded','t:legacy')");

// ── admin write: supersede + audit + mirror rules
const thisMonth = (await one(`select date_trunc('month', (now() at time zone 'Europe/Istanbul'))::date::text m`))[0].m;
const exCount = async () => (await one(`select count(*)::int n from exchange_rates`))[0].n;
const ex0 = await exCount();
let w = await asCommit('authenticated', U.admin, `select fx_set_monthly_rate('delivery_accounting','TRY','2026-08-01',48.5,null,'correction')`);
ok(!w.err, 'admin sets a past month: ' + w.err);
ok((await exCount()) === ex0, 'a PAST month is never mirrored into exchange_rates');
let hist = await one(`select status, units_per_usd::float8 r, entered_by::text eb, superseded_by is not null sb from fx_monthly_rates where purpose='delivery_accounting' and currency='TRY' and period_month='2026-08-01' order by created_at, status`);
ok(hist.length === 2 && hist.filter((x) => x.status === 'confirmed').length === 1 && hist.find((x) => x.status === 'superseded')?.r === 48 && hist.find((x) => x.status === 'superseded')?.sb, 'old rate kept as superseded (history), new one confirmed, link recorded');
ok(hist.find((x) => x.status === 'confirmed').eb === U.admin, 'audit: entered_by = the admin');
r = await rate('delivery_accounting', 'TRY', '2026-08-20');
ok(+r.units_per_usd === 48.5, 'resolver uses the new confirmed rate, never a superseded one');
r = await rate('delivery_accounting', 'TRY', '2026-12-01');
ok(+r.units_per_usd === 50 && r.exact === false, 'carry source is the latest CONFIRMED month (Oct), superseded Aug is not a source');

w = await asCommit('authenticated', U.admin, `select fx_set_monthly_rate('delivery_accounting','AED','${thisMonth}',3.6725)`);
ok(!w.err && (await exCount()) === ex0 + 1, 'current month of delivery_accounting IS mirrored (one legacy row)');
const mirrored = (await one(`select from_cur, to_cur, rate::float8 r, set_by::text sb from exchange_rates order by created_at desc, id limit 1`))[0];
ok(mirrored.from_cur === 'USD' && mirrored.to_cur === 'AED' && mirrored.r === 3.6725 && mirrored.sb === U.admin, 'mirror row = USD->AED, same rate, set_by = admin');
w = await asCommit('authenticated', U.admin, `select fx_set_monthly_rate('delivery_accounting','AED','${thisMonth}',3.67,'uae','market specific')`);
ok(!w.err && (await exCount()) === ex0 + 1, 'a market-specific rate is not mirrored');
w = await asCommit('authenticated', U.admin, `select fx_set_monthly_rate('profitability','TRY','${thisMonth}',49.5)`);
ok(!w.err && (await exCount()) === ex0 + 1, 'other purposes are never mirrored');

// atomicity: if the legacy mirror fails, NOTHING is written (no half-write)
await db.exec(`create function _boom() returns trigger language plpgsql as $$ begin raise exception 'mirror down'; end $$; create trigger _boom before insert on exchange_rates for each row execute function _boom();`);
const before = JSON.stringify(await one(`select id,status from fx_monthly_rates order by id`));
w = await asCommit('authenticated', U.admin, `select fx_set_monthly_rate('delivery_accounting','SYP','${thisMonth}',141)`);
ok(!!w.err, 'mirror failure makes the call fail');
ok(JSON.stringify(await one(`select id,status from fx_monthly_rates order by id`)) === before, 'atomic: monthly table unchanged when the mirror fails (no superseded-without-replacement)');
await db.exec(`drop trigger _boom on exchange_rates; drop function _boom();`);

// one confirmed per key (DB-level guard)
ok(!!(await db.exec(`insert into fx_monthly_rates(purpose,currency,units_per_usd,effective_from,source,period_month) values ('delivery_accounting','TRY',99,'2026-10-01','dup','2026-10-01')`).then(() => null, (e) => String(e.message))), 'DB refuses a second confirmed rate for the same key');

// ── rollback restores the S0 shape
const rb = await db.exec(s1aRollback).then(() => null, (e) => String(e.message));
ok(rb === null, 'rollback runs: ' + rb);
const cols = (await one(`select column_name from information_schema.columns where table_name='fx_monthly_rates'`)).map((x) => x.column_name);
ok(!['market', 'period_month', 'currency_unit', 'status', 'superseded_by'].some((c) => cols.includes(c)), 'rollback removes the S1a columns');
ok((await one(`select to_regclass('public.fx_currency_units') a, to_regclass('public.fx_period_approvals') b`))[0].a === null, 'rollback drops the S1a tables');
ok(!!(await db.exec(`insert into fx_monthly_rates(purpose,currency,units_per_usd,effective_from,source) values ('commission','TRY',1,current_date,'z')`).then(() => null, (e) => String(e.message))), 'rollback restores the 3-purpose check');
ok((await one(`select count(*)::int n from fx_monthly_rates`))[0].n === s0Rows, 'S0 rows survive the rollback');
ok(JSON.stringify(await one(`select * from payroll_runs order by id`)) === payrollBefore, 'payroll_runs still untouched after everything');

console.log(`\nنتيجة: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
