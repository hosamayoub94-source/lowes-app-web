// Run from a scratch dir containing node_modules with `@electric-sql/pglite@0.2.17` (NOT the project):
// copy this file there and set PAYROLL_DOCS=<path to docs/payroll/proposed/> then `node test_server_hardening_pglite.mjs`.
// Role-based test of 20261023_payroll_server_hardening.sql on an in-memory Postgres (pglite).
// The clone reproduces PRODUCTION's roles (anon/authenticated/service_role), RLS, policies, table
// grants, function ACLs and the guard/RPC function bodies (read-only dump, 23 Oct 2026).
// Table COLUMNS are reduced to what the logic touches. Never connects to Supabase.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DOCS = process.env.PAYROLL_DOCS || fileURLToPath(new URL('./', import.meta.url));
const read = (f) => readFileSync(DOCS + f, 'utf8').replace(/\r\n/g, '\n');
const db = new PGlite();
let pass = 0, fail = 0; const rows = []; const matrix = [];
const rec = (ok, name, extra = '') => { ok ? pass++ : fail++; rows.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + String(extra).slice(0, 110) : ''}`); };
const exec = async (sql) => { try { return await db.exec(sql); } catch (e) { try { await db.exec('rollback'); } catch { /* none open */ } throw e; } };
const qrows = async (sql) => { try { return (await db.query(sql)).rows; } catch (e) { try { await db.exec('rollback'); } catch { /* none open */ } throw e; } };
const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');

const U = { EMP: '00000000-0000-0000-0000-00000000e001', MGR: '00000000-0000-0000-0000-00000000e002', ADM: '00000000-0000-0000-0000-00000000e003',
  HR: '00000000-0000-0000-0000-00000000e004', ACC: '00000000-0000-0000-0000-00000000e005', FIN: '00000000-0000-0000-0000-00000000e006' };
const ROLE = { VISITOR: ['anon', null], EMPLOYEE: ['authenticated', U.EMP], MANAGER: ['authenticated', U.MGR], ADMIN_NO_ACCESS: ['authenticated', U.ADM],
  HR: ['authenticated', U.HR], ACCOUNTANT: ['authenticated', U.ACC], FINALIZER: ['authenticated', U.FIN] };
const as = async (who) => { const [r, uid] = ROLE[who]; await exec(`reset role; select set_config('request.jwt.claim.sub','${uid ?? ''}',false); set role ${r};`); };
const asSuper = () => exec('reset role');

// classify what happened for an attempted statement (returns text)
const attempt = async (sql) => {
  try {
    const r = await db.query(`with x as (${sql} returning 1) select count(*)::int n from x`);
    return r.rows[0].n > 0 ? `ALLOWED(${r.rows[0].n} rows)` : '0 rows (RLS)';
  } catch (e) {
    try { await db.exec('rollback'); } catch { /* none */ }
    const m = e.message;
    if (/permission denied/.test(m)) return 'denied(privilege)';
    if (/row-level security/.test(m)) return 'denied(RLS)';
    if (/تاريخية/.test(m)) return 'blocked(historical lock)';
    if (/معتمدة|مدفوعة|عبر RPC|لا تُعدَّل|لا تُحذف/.test(m)) return 'blocked(s2 guard)';
    return 'error: ' + m.slice(0, 60);
  }
};
const call = async (sql) => {
  try { const r = await db.query(sql); return 'OK ' + JSON.stringify(Object.values(r.rows[0])[0]); }
  catch (e) { try { await db.exec('rollback'); } catch { /* none */ } return 'rejected: ' + e.message.slice(0, 70); }
};

// ───────────────────────── production-like schema ─────────────────────────
await exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; grant usage on schema auth to anon, authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;

create table public.profiles (id uuid primary key, employee_name text, role_type text, is_active boolean default true);
create table public.payroll_access (profile_id uuid primary key, can_finalize boolean not null default false, note text, added_at timestamptz not null default now());
create table public.payroll_runs (id uuid primary key default gen_random_uuid(), period_year int not null, period_month int not null, status text not null default 'draft',
  total_net_usd numeric, employee_count int, approved_by uuid, finalized_by uuid, finalized_at timestamptz, paid_at timestamptz, archived_at timestamptz,
  rate_usd_try numeric, rate_usd_syp numeric, month_setup_confirmed_at timestamptz, notes text);
create table public.payroll_entries (id uuid primary key default gen_random_uuid(), run_id uuid not null references public.payroll_runs(id), employee_id uuid not null,
  base_salary_usd numeric, allowances_usd numeric, commission_usd numeric, shortfall_deduction_usd numeric, advance_deduction_usd numeric, deductions_usd numeric,
  bonus_usd numeric, net_salary_usd numeric, source text, computed_at timestamptz, unique (run_id, employee_id));
create table public.employee_salary_settings (id uuid primary key default gen_random_uuid(), employee_id uuid, base_salary numeric, updated_at timestamptz default now());
create table public.payroll_allowances (id uuid primary key default gen_random_uuid(), employee_id uuid, amount numeric, updated_at timestamptz default now());
create table public.payroll_absence_reviews (id uuid primary key default gen_random_uuid(), employee_id uuid, absence_date date, status text, updated_at timestamptz default now());
create table public.payroll_run_events (id bigserial primary key, run_id uuid, period int, action text, actor uuid, at timestamptz default now(), reason text, before_snapshot jsonb, changes jsonb);
-- production audit_log exactly as found: RLS on, policy allow_all_anon_aul USING true, full grants to anon + authenticated
create table public.audit_log (id uuid primary key default gen_random_uuid(), actor text, action text, table_name text, record_id text, before_data jsonb, after_data jsonb, created_at timestamptz default now());

-- production functions (verbatim from read-only dump)
create function public.payroll_is_new_period(p_year integer, p_month integer) returns boolean language sql immutable as $$ SELECT coalesce(p_year * 100 + p_month, 0) >= 202609 $$;
create function public.payroll_has_access() returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $$
  SELECT EXISTS (SELECT 1 FROM public.payroll_access pa JOIN public.profiles p ON p.id = pa.profile_id WHERE pa.profile_id = auth.uid() AND p.is_active = true); $$;
create function public.payroll_can_finalize() returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $$
  SELECT EXISTS (SELECT 1 FROM public.payroll_access pa JOIN public.profiles p ON p.id = pa.profile_id WHERE pa.profile_id = auth.uid() AND pa.can_finalize = true AND p.is_active = true); $$;
create function public.payroll_run_is_legacy(p_run_id uuid) returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $$
  SELECT coalesce((SELECT coalesce(r.period_year * 100 + r.period_month, 0) < 202609 FROM public.payroll_runs r WHERE r.id = p_run_id), true); $$;
create function public.payroll_run_is_locked_new(p_run_id uuid) returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $$
  SELECT coalesce((SELECT public.payroll_is_new_period(r.period_year, r.period_month) AND r.status <> 'draft' FROM public.payroll_runs r WHERE r.id = p_run_id), false); $$;
create function public.payroll_s2_authorized_path() returns boolean language sql stable as $$
  SELECT coalesce(current_setting('payroll.s2_path', true), '') = 'rpc' AND current_user NOT IN ('anon', 'authenticated', 'service_role'); $$;
create function public.payroll_s2_entries_snapshot(p_run_id uuid) returns jsonb language sql stable as $$
  SELECT jsonb_build_object('count', count(*), 'total_net_usd', coalesce(sum(e.net_salary_usd), 0),
    'entries', coalesce(jsonb_object_agg(e.employee_id::text, jsonb_build_object('net_salary_usd', e.net_salary_usd, 'base_salary_usd', e.base_salary_usd, 'allowances_usd', e.allowances_usd,
      'commission_usd', e.commission_usd, 'shortfall_deduction_usd', e.shortfall_deduction_usd, 'advance_deduction_usd', e.advance_deduction_usd, 'deductions_usd', e.deductions_usd,
      'bonus_usd', e.bonus_usd, 'source', e.source, 'computed_at', e.computed_at)) FILTER (WHERE e.id IS NOT NULL), '{}'::jsonb))
  FROM public.payroll_entries e WHERE e.run_id = p_run_id; $$;
create function public.payroll_runs_s2_guard() returns trigger language plpgsql as $$
DECLARE old_new boolean := false; new_new boolean := false;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_new := public.payroll_is_new_period(OLD.period_year, OLD.period_month); END IF;
  IF TG_OP <> 'DELETE' THEN new_new := public.payroll_is_new_period(NEW.period_year, NEW.period_month); END IF;
  IF NOT old_new AND NOT new_new THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  IF public.payroll_s2_authorized_path() THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN RAISE EXCEPTION 'دورة أيلول 2026+ تبدأ مسودة فقط — الاعتماد عبر payroll_approve_run (D-090).' USING ERRCODE = 'insufficient_privilege'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'دورة أيلول 2026+ معتمدة/مدفوعة — لا تُحذف (D-090).' USING ERRCODE = 'insufficient_privilege'; END IF;
    RETURN OLD;
  END IF;
  IF old_new AND NOT new_new THEN RAISE EXCEPTION 'لا يمكن نقل دورة أيلول 2026+ إلى شهر قديم (D-090).' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'تغيير حالة دورة أيلول 2026+ عبر payroll_approve_run / payroll_reopen_run / payroll_mark_paid فقط (D-090).' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF OLD.status <> 'draft' THEN
    IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL AND (to_jsonb(NEW) - 'archived_at') = (to_jsonb(OLD) - 'archived_at') THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'دورة أيلول 2026+ معتمدة/مدفوعة — لا تُعدَّل. أعد فتحها أولاً (D-090).' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
create trigger payroll_runs_s2_guard before insert or delete or update on public.payroll_runs for each row execute function public.payroll_runs_s2_guard();
create function public.payroll_entries_s2_guard() returns trigger language plpgsql as $$
BEGIN
  IF (TG_OP <> 'INSERT' AND public.payroll_run_is_locked_new(OLD.run_id)) OR (TG_OP <> 'DELETE' AND public.payroll_run_is_locked_new(NEW.run_id)) THEN
    IF NOT public.payroll_s2_authorized_path() THEN
      RAISE EXCEPTION 'بنود دورة أيلول 2026+ معتمدة/مدفوعة — لا تُضاف ولا تُعدَّل ولا تُحذف. أعد فتح الدورة أولاً (D-090).' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
create trigger payroll_entries_s2_guard before insert or delete or update on public.payroll_entries for each row execute function public.payroll_entries_s2_guard();

create function public.payroll_mark_paid(p_run_id uuid) returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $function$
DECLARE r public.payroll_runs%ROWTYPE;
BEGIN
  IF NOT public.payroll_can_finalize() THEN RAISE EXCEPTION 'تسجيل الدفع لحسام وأماني فقط (D-090).' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT * INTO r FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الدورة غير موجودة.'; END IF;
  IF NOT public.payroll_is_new_period(r.period_year, r.period_month) THEN RAISE EXCEPTION 'هذا المسار لدورات أيلول 2026+ فقط.'; END IF;
  IF r.status <> 'finalized' THEN RAISE EXCEPTION 'الدفع لدورة معتمدة فقط (الحالة: %).', r.status; END IF;
  PERFORM set_config('payroll.s2_path', 'rpc', true);
  UPDATE public.payroll_runs SET status = 'paid', paid_at = now() WHERE id = p_run_id;
  INSERT INTO public.payroll_run_events (run_id, period, action, actor) VALUES (p_run_id, r.period_year * 100 + r.period_month, 'pay', auth.uid());
  PERFORM set_config('payroll.s2_path', '', true);
  RETURN jsonb_build_object('run_id', p_run_id, 'status', 'paid');
END $function$;
create function public.payroll_reopen_run(p_run_id uuid, p_reason text) returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $function$
DECLARE r public.payroll_runs%ROWTYPE; snap jsonb;
BEGIN
  IF NOT public.payroll_can_finalize() THEN RAISE EXCEPTION 'إعادة الفتح لحسام وأماني فقط (D-090).' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN RAISE EXCEPTION 'سبب إعادة الفتح إجباري (5 أحرف على الأقل).'; END IF;
  SELECT * INTO r FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الدورة غير موجودة.'; END IF;
  IF NOT public.payroll_is_new_period(r.period_year, r.period_month) THEN RAISE EXCEPTION 'هذا المسار لدورات أيلول 2026+ فقط.'; END IF;
  IF r.status = 'paid' THEN RAISE EXCEPTION 'الدورة مدفوعة — لا تُعاد فتحها (D-090).'; END IF;
  IF r.status <> 'finalized' THEN RAISE EXCEPTION 'إعادة الفتح من «معتمدة» فقط (الحالة: %).', r.status; END IF;
  snap := public.payroll_s2_entries_snapshot(p_run_id) || jsonb_build_object('approved_by', r.approved_by, 'finalized_at', r.finalized_at, 'rate_usd_try', r.rate_usd_try, 'rate_usd_syp', r.rate_usd_syp);
  PERFORM set_config('payroll.s2_path', 'rpc', true);
  UPDATE public.payroll_runs SET status = 'draft', approved_by = NULL, finalized_by = NULL, finalized_at = NULL, archived_at = NULL WHERE id = p_run_id;
  INSERT INTO public.payroll_run_events (run_id, period, action, actor, reason, before_snapshot) VALUES (p_run_id, r.period_year * 100 + r.period_month, 'reopen', auth.uid(), btrim(p_reason), snap);
  PERFORM set_config('payroll.s2_path', '', true);
  RETURN jsonb_build_object('run_id', p_run_id, 'status', 'draft');
END $function$;
`);
// production approve function BEFORE hardening = the saved file, verbatim
const BEFORE = read('20261023_payroll_approve_run_BEFORE.sql');
await exec(BEFORE);
await exec(`
-- function ACLs as in production: approve/mark_paid/reopen executable by authenticated only (+owner)
revoke all on function public.payroll_approve_run(uuid), public.payroll_mark_paid(uuid), public.payroll_reopen_run(uuid, text) from public, anon;
grant execute on function public.payroll_approve_run(uuid), public.payroll_mark_paid(uuid), public.payroll_reopen_run(uuid, text) to authenticated;
revoke all on function public.payroll_has_access(), public.payroll_can_finalize() from public;
grant execute on function public.payroll_has_access(), public.payroll_can_finalize() to anon, authenticated, service_role;
grant execute on function public.payroll_run_is_legacy(uuid), public.payroll_run_is_locked_new(uuid) to authenticated;

-- RLS + policies + table grants exactly as production
alter table public.payroll_runs enable row level security; alter table public.payroll_entries enable row level security;
alter table public.employee_salary_settings enable row level security; alter table public.payroll_absence_reviews enable row level security;
alter table public.payroll_allowances enable row level security; alter table public.payroll_access enable row level security;
alter table public.payroll_run_events enable row level security; alter table public.audit_log enable row level security;
create policy pay_runs_legacy_access on public.payroll_runs for all to authenticated using (coalesce(period_year*100+period_month,0) < 202609 and payroll_has_access()) with check (coalesce(period_year*100+period_month,0) < 202609 and payroll_has_access());
create policy payroll_new_system on public.payroll_runs for all to authenticated using (coalesce(period_year*100+period_month,0) >= 202609 and payroll_has_access()) with check (coalesce(period_year*100+period_month,0) >= 202609 and payroll_has_access());
create policy pay_entries_legacy_access on public.payroll_entries for all to authenticated using (payroll_run_is_legacy(run_id) and payroll_has_access()) with check (payroll_run_is_legacy(run_id) and payroll_has_access());
create policy pay_entries_legacy_own on public.payroll_entries for select to authenticated using (payroll_run_is_legacy(run_id) and employee_id = auth.uid());
create policy payroll_new_system on public.payroll_entries for all to authenticated using (not payroll_run_is_legacy(run_id) and payroll_has_access()) with check (not payroll_run_is_legacy(run_id) and payroll_has_access());
create policy sal_set_select_own on public.employee_salary_settings for select to authenticated using (employee_id = auth.uid());
create policy salary_settings_payroll_access on public.employee_salary_settings for all to authenticated using (payroll_has_access()) with check (payroll_has_access());
create policy payroll_absence_reviews_management on public.payroll_absence_reviews for all to authenticated using (payroll_has_access()) with check (payroll_has_access());
create policy payroll_allowances_access on public.payroll_allowances for all to authenticated using (payroll_has_access()) with check (payroll_has_access());
create policy payroll_run_events_read on public.payroll_run_events for select to authenticated using (payroll_has_access());
create policy allow_all_anon_aul on public.audit_log for all to public using (true) with check (true);
grant select, insert, update, delete on public.payroll_runs, public.payroll_entries, public.employee_salary_settings, public.payroll_absence_reviews, public.payroll_allowances to authenticated;
grant select on public.payroll_run_events to authenticated;
grant select, insert, update, delete, truncate on public.audit_log to anon, authenticated;
-- payroll_access: RLS on, no policy, no grant (as production)

-- people
insert into profiles values ('${U.EMP}','emp','employee',true),('${U.MGR}','mgr','manager',true),('${U.ADM}','adm','admin',true),('${U.HR}','hr','hr_manager',true),('${U.ACC}','acc','accountant',true),('${U.FIN}','fin','admin',true);
insert into payroll_access values ('${U.HR}', false, 'HR (simulated)'), ('${U.ACC}', false, 'Accountant (simulated)'), ('${U.FIN}', true, 'owner');
`);
// fixtures (superuser, s2 path so finalized/paid rows can be seeded like production history)
const R = { JUN: '11111111-0000-0000-0000-000000000006', JUL: '11111111-0000-0000-0000-000000000007', SEP: '11111111-0000-0000-0000-000000000009',
  SEPF: '11111111-0000-0000-0000-00000000009f', OCT: '11111111-0000-0000-0000-000000000010', NOV: '11111111-0000-0000-0000-000000000011' };
await exec(`
select set_config('payroll.s2_path','rpc',false);
insert into payroll_runs (id, period_year, period_month, status, rate_usd_try, rate_usd_syp, month_setup_confirmed_at) values
 ('${R.JUN}', 2026, 6, 'draft', null, null, null), ('${R.JUL}', 2026, 7, 'paid', null, null, null),
 ('${R.SEP}', 2026, 9, 'draft', 46.8, 131, '2026-10-22'), ('${R.SEPF}', 2026, 9, 'finalized', 46.8, 131, '2026-10-22'),
 ('${R.OCT}', 2026, 10, 'draft', 46.8, 131, '2026-11-01T08:00:00Z'), ('${R.NOV}', 2026, 11, 'paid', 46.8, 131, '2026-12-01');
insert into payroll_entries (run_id, employee_id, base_salary_usd, net_salary_usd, source, computed_at) values
 ('${R.JUN}','${U.EMP}',300,300,'auto','2026-07-01'), ('${R.JUL}','${U.EMP}',300,300,'auto','2026-08-01'), ('${R.SEP}','${U.EMP}',300,300,'auto','2026-10-22'),
 ('${R.SEPF}','${U.EMP}',300,300,'auto','2026-10-22'), ('${R.OCT}','${U.EMP}',300,300,'auto','2026-11-02'), ('${R.NOV}','${U.EMP}',300,300,'auto','2026-12-02');
select set_config('payroll.s2_path','',false);
`);
const snapshot = async () => (await qrows(`select (select count(*) from payroll_runs) r, (select count(*) from payroll_entries) e, (select md5(string_agg(id::text||status, ',' order by id)) from payroll_runs) rs, (select md5(string_agg(id::text||coalesce(net_salary_usd,0)::text, ',' order by id)) from payroll_entries) es`))[0];
const before = await snapshot();
const defMd5 = async () => (await qrows(`select md5(pg_get_functiondef('public.payroll_approve_run(uuid)'::regprocedure)) m, (select proacl::text from pg_proc where oid='public.payroll_approve_run(uuid)'::regprocedure) acl`))[0];
const prodDef = await defMd5();
rec(prodDef.m === md5(BEFORE.slice(0, BEFORE.lastIndexOf(';\n'))), 'clone has the production approve definition (file == installed text)', prodDef.m);
console.log('clone pg_get_functiondef md5 before hardening:', prodDef.m, '(production md5: 39c2095f49bcb07f627999967820c7b7)');

// ───────────────────────── baseline weakness (before hardening) ─────────────────────────
await as('FINALIZER');
const weak1 = await attempt(`update payroll_runs set archived_at = now() where id='${R.JUN}'`);
rec(/ALLOWED/.test(weak1), 'BASELINE: finalizer CAN edit a historical run today (the gap)', weak1);
const weak2 = await attempt(`update payroll_entries set net_salary_usd = net_salary_usd where run_id='${R.JUL}'`);
rec(/ALLOWED/.test(weak2), 'BASELINE: finalizer CAN edit entries of the PAID July run today', weak2);
await as('VISITOR');
const weak3 = await attempt(`insert into audit_log (actor, action, table_name) values ('forged','DELETE','payroll_entries')`);
rec(/ALLOWED/.test(weak3), 'BASELINE: anonymous visitor can FORGE rows in public.audit_log (why it cannot be the payroll audit trail)', weak3);
await asSuper();
await exec(`update payroll_runs set archived_at = null where id='${R.JUN}'`);

// ───────────────────────── apply hardening (twice: idempotent) ─────────────────────────
const SQL = read('20261023_payroll_server_hardening.sql');
await exec(SQL); rec(true, 'hardening SQL applies (1st time)');
const state1 = (await qrows(`select (select string_agg(tgname, ',' order by tgname) from pg_trigger where not tgisinternal) trg, (select count(*) from pg_policies where tablename='payroll_audit_log') pol`))[0];
const hardDef1 = await defMd5();
try { await exec(SQL); rec(true, 'hardening SQL applies again (idempotent, 2nd time)'); } catch (e) { rec(false, 'hardening SQL applies again (idempotent, 2nd time)', e.message.slice(0, 100)); }
const state2 = (await qrows(`select (select string_agg(tgname, ',' order by tgname) from pg_trigger where not tgisinternal) trg, (select count(*) from pg_policies where tablename='payroll_audit_log') pol`))[0];
const hardDef2 = await defMd5();
rec(JSON.stringify(state1) === JSON.stringify(state2) && hardDef1.m === hardDef2.m, 'state after 2nd application is identical (triggers, policies, function)');
rec(hardDef1.acl === prodDef.acl, 'approve function ACL unchanged by create or replace', hardDef1.acl);

// ───────────────────────── per-role matrix ─────────────────────────
const ROLES = Object.keys(ROLE);
const readCounts = async (who) => {
  await as(who);
  const out = {};
  for (const [k, sql] of Object.entries({ runs: 'payroll_runs', entries: 'payroll_entries', settings: 'employee_salary_settings', absence: 'payroll_absence_reviews', allowances: 'payroll_allowances', events: 'payroll_run_events', audit: 'payroll_audit_log', access_tbl: 'payroll_access' })) {
    try { out[k] = (await qrows(`select count(*)::int n from ${sql}`))[0].n; } catch (e) { try { await db.exec('rollback'); } catch { /* none */ } out[k] = /permission denied/.test(e.message) ? 'denied' : 'err'; }
  }
  return out;
};
const WRITES = {
  'edit historical run (Jun)':     `update payroll_runs set archived_at = now() where id='${R.JUN}'`,
  'delete historical draft run':   `delete from payroll_runs where id='${R.JUN}'`,
  'edit entries of PAID Jul run':  `update payroll_entries set net_salary_usd = 1 where run_id='${R.JUL}'`,
  'edit entries of historical Sept': `update payroll_entries set net_salary_usd = 1 where run_id='${R.SEP}'`,
  'edit PAID Nov run':             `update payroll_runs set notes = 'x' where id='${R.NOV}'`,
  'edit Oct draft entry':          `update payroll_entries set net_salary_usd = 300 where run_id='${R.OCT}'`,
};
for (const who of ROLES) {
  const reads = await readCounts(who);
  const res = { who, reads };
  for (const [name, sql] of Object.entries(WRITES)) {
    await as(who);
    // a user trying the old "unlock" trick first
    await db.exec(`set payroll.historical_unlock = 'on'`).catch(() => {});
    res[name] = await attempt(sql);
  }
  await as(who);
  res['SET payroll.s2_path=rpc then edit PAID Nov'] = await (async () => { try { await db.exec(`set payroll.s2_path = 'rpc'`); } catch { /* ignore */ } return attempt(`update payroll_runs set notes='x' where id='${R.NOV}'`); })();
  await db.exec(`reset payroll.s2_path`).catch(() => {});
  res['approve Oct'] = who === 'FINALIZER' ? '(see gates below)' : await call(`select payroll_approve_run('${R.OCT}')`);
  matrix.push(res);
}
await asSuper();
const after = await snapshot();
rec(after.r === before.r && after.e === before.e && after.rs === before.rs && after.es === before.es, 'NO role changed any historical/paid data (runs & entries fingerprints identical to before)');

const get = (who) => matrix.find((m) => m.who === who);
// historical / paid protection for every role that could otherwise write
for (const who of ROLES) {
  const m = get(who);
  for (const name of ['edit historical run (Jun)', 'delete historical draft run', 'edit entries of PAID Jul run', 'edit entries of historical Sept', 'edit PAID Nov run']) {
    rec(!/ALLOWED/.test(m[name]), `${who}: ${name}`, m[name]);
  }
  rec(!/ALLOWED/.test(m['SET payroll.s2_path=rpc then edit PAID Nov']), `${who}: cannot bypass via SET payroll.s2_path`, m['SET payroll.s2_path=rpc then edit PAID Nov']);
}
// who may edit an October draft
for (const who of ['HR', 'ACCOUNTANT', 'FINALIZER']) rec(/ALLOWED/.test(get(who)['edit Oct draft entry']), `${who} (payroll_access) can edit an October draft entry`, get(who)['edit Oct draft entry']);
for (const who of ['EMPLOYEE', 'MANAGER', 'ADMIN_NO_ACCESS', 'VISITOR']) rec(!/ALLOWED/.test(get(who)['edit Oct draft entry']), `${who} (no payroll_access) cannot edit October entries`, get(who)['edit Oct draft entry']);
// approval
for (const who of ROLES.filter((w) => w !== 'FINALIZER')) rec(/rejected|permission denied/.test(get(who)['approve Oct']), `${who} cannot approve (no can_finalize)`, get(who)['approve Oct']);
// reads
rec(get('VISITOR').reads.runs === 'denied' && get('VISITOR').reads.entries === 'denied' && get('VISITOR').reads.settings === 'denied' && get('VISITOR').reads.audit === 'denied', 'VISITOR cannot read payroll tables', JSON.stringify(get('VISITOR').reads));
for (const who of ['EMPLOYEE', 'MANAGER', 'ADMIN_NO_ACCESS']) rec(get(who).reads.runs === 0 && get(who).reads.audit === 0 && get(who).reads.events === 0 && get(who).reads.access_tbl === 'denied', `${who} sees no runs / audit / events and cannot read payroll_access`, JSON.stringify(get(who).reads));
for (const who of ['HR', 'ACCOUNTANT', 'FINALIZER']) rec(get(who).reads.runs > 0 && get(who).reads.access_tbl === 'denied', `${who} reads payroll data but not payroll_access`, JSON.stringify(get(who).reads));

// ───────────────────────── audit trail permissions & content ─────────────────────────
await as('FINALIZER');
await exec(`insert into payroll_entries (run_id, employee_id, base_salary_usd, net_salary_usd, source, computed_at) values ('${R.OCT}','${U.MGR}',150,150,'manual',null)`);
await exec(`update payroll_entries set net_salary_usd = 140 where run_id='${R.OCT}' and employee_id='${U.MGR}'`);
await as('HR');
await exec(`insert into payroll_absence_reviews (employee_id, absence_date, status) values ('${U.EMP}','2026-10-05','pending')`);
await exec(`update payroll_absence_reviews set status='approved', updated_at='2026-10-01' where employee_id='${U.EMP}'`);
const aud = await qrows(`select action, table_name, actor::text a, db_role, before_data->>'net_salary_usd' b, after_data->>'net_salary_usd' af from payroll_audit_log order by id`);
rec(aud.some((x) => x.table_name === 'payroll_entries' && x.action === 'UPDATE' && x.a === U.FIN && x.b === '150' && x.af === '140'), 'entry edit audited: actor + before/after (150→140)');
rec(aud.some((x) => x.table_name === 'payroll_absence_reviews' && x.action === 'INSERT' && x.a === U.HR), 'HR absence decision audited with actor');
await as('HR');
rec(await attempt(`update payroll_audit_log set action='x'`).then((r) => !/ALLOWED/.test(r)), 'HR cannot UPDATE the audit trail');
try { await db.query(`delete from payroll_audit_log`); rec(false, 'HR cannot DELETE audit rows', 'deleted'); } catch (e) { try { await db.exec('rollback'); } catch { /* none */ } rec(/permission denied/.test(e.message), 'HR cannot DELETE audit rows', e.message.slice(0, 50)); }
try { await db.query(`insert into payroll_audit_log (action, table_name) values ('forged','x')`); rec(false, 'HR cannot INSERT/forge audit rows', 'inserted'); } catch (e) { try { await db.exec('rollback'); } catch { /* none */ } rec(/permission denied/.test(e.message), 'HR cannot INSERT/forge audit rows', e.message.slice(0, 50)); }
try { await db.query(`select payroll_audit_fn()`); rec(false, 'HR cannot call the audit function directly'); } catch (e) { try { await db.exec('rollback'); } catch { /* none */ } rec(/permission denied|trigger/.test(e.message), 'HR cannot call the audit function directly', e.message.slice(0, 60)); }
await as('EMPLOYEE');
rec((await qrows(`select count(*)::int n from payroll_audit_log`))[0].n === 0, 'ordinary employee sees 0 audit rows');
await as('VISITOR');
try { await db.query(`select count(*) from payroll_audit_log`); rec(false, 'visitor cannot read the audit trail'); } catch (e) { try { await db.exec('rollback'); } catch { /* none */ } rec(/permission denied/.test(e.message), 'visitor cannot read the audit trail', e.message.slice(0, 50)); }

// ───────────────────────── approval gates (finalizer) ─────────────────────────
// Inputs are edited as REAL roles WITHOUT touching updated_at: the DB trigger must advance it.
const resetInputs = async () => {
  await asSuper();
  await exec(`delete from employee_salary_settings; delete from payroll_allowances; delete from payroll_absence_reviews;
    insert into employee_salary_settings (employee_id, base_salary, updated_at) values ('${U.EMP}', 300, now() - interval '2 hours');
    insert into payroll_allowances (employee_id, amount, updated_at) values ('${U.EMP}', 10, now() - interval '2 hours');
    insert into payroll_absence_reviews (employee_id, absence_date, status, updated_at) values ('${U.EMP}', '2026-10-05', 'pending', now() - interval '2 hours');
    update payroll_runs set month_setup_confirmed_at = now() - interval '3 hours' where id = '${R.OCT}'; update payroll_entries set computed_at = now() - interval '1 hour' where run_id = '${R.OCT}';`);
};
await resetInputs();
await as('FINALIZER');
const sepTry = await call(`select payroll_approve_run('${R.SEP}')`);
rec(/تاريخية/.test(sepTry), 'FINALIZER cannot approve historical Sept', sepTry);

await as('FINALIZER');
await exec(`update employee_salary_settings set base_salary = 310`);               // no updated_at given
await as('FINALIZER'); rec(/تغيّرت الرواتب/.test(await call(`select payroll_approve_run('${R.OCT}')`)), 'salary setting edited after calculation → approval blocked (updated_at advanced by DB trigger)');
await resetInputs(); await as('FINALIZER');
await exec(`update payroll_allowances set amount = 20`);
rec(/تغيّرت الرواتب/.test(await call(`select payroll_approve_run('${R.OCT}')`)), 'allowance edited after calculation → approval blocked');
await resetInputs(); await as('HR');
await exec(`update payroll_absence_reviews set status = 'approved'`);
await as('FINALIZER');
rec(/تغيّرت الرواتب/.test(await call(`select payroll_approve_run('${R.OCT}')`)), 'absence decision (by HR) after calculation → approval blocked');
await resetInputs(); await as('FINALIZER');
await exec(`update payroll_entries set base_salary_usd = 0 where run_id='${R.OCT}' and employee_id='${U.MGR}'`);
rec(/راتب أساسي صفر/.test(await call(`select payroll_approve_run('${R.OCT}')`)), 'zero-salary entry → approval blocked');
await exec(`update payroll_entries set base_salary_usd = 150 where run_id='${R.OCT}' and employee_id='${U.MGR}'`);
await resetInputs(); await as('FINALIZER');
// definer RPCs cannot be abused to touch historical rows (no bypass exists)
rec(/تاريخية|rejected/.test(await call(`select payroll_mark_paid('${R.SEPF}')`)), 'mark_paid RPC cannot touch a historical (Sept) finalized run', await call(`select payroll_mark_paid('${R.SEPF}')`));
await as('FINALIZER');
rec(/تاريخية|rejected/.test(await call(`select payroll_reopen_run('${R.SEPF}', 'test reopen reason')`)), 'reopen RPC cannot touch a historical (Sept) finalized run', await call(`select payroll_reopen_run('${R.SEPF}', 'test reopen reason')`));
await as('FINALIZER');
const ok1 = await call(`select payroll_approve_run('${R.OCT}')`);
rec(/finalized/.test(ok1), 'FINALIZER approves a fresh October run', ok1);
await asSuper();
rec((await qrows(`select count(*)::int n from payroll_run_events where run_id='${R.OCT}' and action='approve' and actor='${U.FIN}'`))[0].n === 1, 'approve event recorded with actor');
await as('FINALIZER');
rec(/ALLOWED/.test(await attempt(`update payroll_entries set net_salary_usd = 1 where run_id='${R.OCT}'`)) === false, 'approved October entries are locked again (existing guard intact)');

// ───────────────────────── rollback ─────────────────────────
await asSuper();
const RB = read('20261023_payroll_server_hardening_rollback.sql');
try { await exec(RB); rec(true, 'rollback applies'); } catch (e) { rec(false, 'rollback applies', e.message.slice(0, 120)); }
const rbDef = await defMd5();
rec(rbDef.m === prodDef.m, 'rollback restores payroll_approve_run character-for-character (md5 equal to pre-hardening)', `${rbDef.m} vs ${prodDef.m}`);
rec(rbDef.acl === prodDef.acl, 'rollback keeps the function ACL', rbDef.acl);
const left = (await qrows(`select (select count(*) from pg_trigger where not tgisinternal and (tgname like '%historical_lock%' or tgname like '%_audit' or tgname = 'payroll_touch_updated_at')) trg, (select count(*) from pg_proc where proname in ('payroll_period_is_historical','payroll_audit_fn','payroll_touch_updated_at','payroll_historical_runs_lock','payroll_historical_entries_lock')) fn, to_regclass('public.payroll_audit_log') tbl`))[0];
rec(left.trg === 0 && left.fn === 0 && left.tbl === null, 'rollback removed all added triggers, functions and the audit table', JSON.stringify(left));
await as('FINALIZER');
rec(/ALLOWED/.test(await attempt(`update payroll_runs set archived_at = now() where id='${R.JUN}'`)), 'after rollback the old behaviour is back (historical editable again)');
await asSuper(); await exec(`update payroll_runs set archived_at = null where id='${R.JUN}'`);
try { await exec(SQL); rec(true, 're-applying after rollback works (apply → rollback → apply cycle)'); } catch (e) { rec(false, 're-applying after rollback works', e.message.slice(0, 100)); }

console.log('\n=== MATRIX (what each role could do) ===');
for (const m of matrix) {
  console.log(`\n[${m.who}] reads: ${JSON.stringify(m.reads)}`);
  for (const [k, v] of Object.entries(m)) if (!['who', 'reads'].includes(k)) console.log(`   ${k.padEnd(46)} ${v}`);
}
console.log('\n=== CHECKS ===');
console.log(rows.join('\n'));
console.log(`\nSUMMARY: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
