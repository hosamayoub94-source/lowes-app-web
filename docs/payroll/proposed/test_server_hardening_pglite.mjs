// Run with: npm i @electric-sql/pglite@0.2.17 (in a scratch dir, NOT the project) then node this-file. In-memory Postgres; never touches Supabase.
// Isolated test of 20261023_payroll_server_hardening.sql on an in-memory Postgres (pglite).
// Stub schema mirrors the production objects the SQL touches (functions copied from the
// read-only production dump of 23 Oct 2026). NOT production, NOT a Supabase project.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const REPO = 'C:/Users/acer/AppData/Local/Temp/claude/C--Users-acer-Desktop-LOWES---------------/4cf87ca3-862d-43b7-afa0-954263be2ecd/scratchpad/wt-qa/docs/payroll/proposed/';
const db = new PGlite();
let pass = 0, fail = 0; const results = [];
const rec = (ok, name, extra = '') => { ok ? pass++ : fail++; results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const run = async (sql) => { try { return await db.exec(sql); } catch (e) { try { await db.exec('rollback'); } catch {} throw e; } };
const q = async (sql, params) => { try { return (await db.query(sql, params)).rows; } catch (e) { try { await db.exec('rollback'); } catch {} throw e; } };
const expectErr = async (name, sql, re) => {
  try { await run(sql); rec(false, name, 'no error raised'); }
  catch (e) { rec(re.test(e.message), name, e.message.slice(0, 90)); }
};
const expectOk = async (name, sql) => { try { await run(sql); rec(true, name); } catch (e) { rec(false, name, e.message.slice(0, 120)); } };
const asUser = (uid) => run(`select set_config('request.jwt.claim.sub','${uid}',false)`);

const HOSAM = '00000000-0000-0000-0000-0000000000a1';
const NOBODY = '00000000-0000-0000-0000-0000000000b2';
const EMP = '00000000-0000-0000-0000-0000000000c3';

try {
await run(`
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create table public.profiles (id uuid primary key, employee_name text, is_active boolean default true);
create table public.payroll_access (profile_id uuid primary key, can_finalize boolean not null default false, note text, added_at timestamptz not null default now());
create table public.payroll_runs (id uuid primary key default gen_random_uuid(), period_year int not null, period_month int not null, status text not null default 'draft',
  total_net_usd numeric, employee_count int, approved_by uuid, finalized_by uuid, finalized_at timestamptz, paid_at timestamptz, archived_at timestamptz,
  rate_usd_try numeric, rate_usd_syp numeric, month_setup_confirmed_at timestamptz, created_at timestamptz default now());
create table public.payroll_entries (id uuid primary key default gen_random_uuid(), run_id uuid not null references public.payroll_runs(id), employee_id uuid not null,
  base_salary_usd numeric, allowances_usd numeric, commission_usd numeric, shortfall_deduction_usd numeric, advance_deduction_usd numeric, deductions_usd numeric,
  bonus_usd numeric, net_salary_usd numeric, source text, computed_at timestamptz, unique (run_id, employee_id));
create table public.employee_salary_settings (id uuid primary key default gen_random_uuid(), employee_id uuid, base_salary numeric, updated_at timestamptz default now());
create table public.payroll_allowances (id uuid primary key default gen_random_uuid(), employee_id uuid, amount numeric, updated_at timestamptz default now());
create table public.payroll_absence_reviews (id uuid primary key default gen_random_uuid(), employee_id uuid, absence_date date, status text, updated_at timestamptz default now());
create table public.audit_log (id uuid primary key default gen_random_uuid(), actor text, action text, table_name text, record_id text, before_data jsonb, after_data jsonb, ip_address text, user_agent text, created_at timestamptz default now());
create table public.payroll_run_events (id bigserial primary key, run_id uuid, period int, action text, actor uuid, at timestamptz default now(), reason text, before_snapshot jsonb, changes jsonb);

-- production functions (verbatim from the read-only dump)
create function public.payroll_is_new_period(p_year integer, p_month integer) returns boolean language sql immutable as $$ SELECT coalesce(p_year * 100 + p_month, 0) >= 202609 $$;
create function public.payroll_can_finalize() returns boolean language sql stable as $$
  SELECT EXISTS (SELECT 1 FROM public.payroll_access pa JOIN public.profiles p ON p.id = pa.profile_id WHERE pa.profile_id = auth.uid() AND pa.can_finalize = true AND p.is_active = true) $$;
create function public.payroll_run_is_locked_new(p_run_id uuid) returns boolean language sql stable as $$
  SELECT coalesce((SELECT public.payroll_is_new_period(r.period_year, r.period_month) AND r.status <> 'draft' FROM public.payroll_runs r WHERE r.id = p_run_id), false) $$;
create function public.payroll_s2_authorized_path() returns boolean language sql stable as $$
  SELECT coalesce(current_setting('payroll.s2_path', true), '') = 'rpc' AND current_user NOT IN ('anon', 'authenticated', 'service_role') $$;
create function public.payroll_s2_entries_snapshot(p_run_id uuid) returns jsonb language sql stable as $$
  SELECT jsonb_build_object('count', count(*), 'total_net_usd', coalesce(sum(e.net_salary_usd), 0),
    'entries', coalesce(jsonb_object_agg(e.employee_id::text, jsonb_build_object('net_salary_usd', e.net_salary_usd, 'computed_at', e.computed_at)) FILTER (WHERE e.id IS NOT NULL), '{}'::jsonb))
  FROM public.payroll_entries e WHERE e.run_id = p_run_id $$;
create function public.payroll_runs_s2_guard() returns trigger language plpgsql as $$
DECLARE old_new boolean := false; new_new boolean := false;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_new := public.payroll_is_new_period(OLD.period_year, OLD.period_month); END IF;
  IF TG_OP <> 'DELETE' THEN new_new := public.payroll_is_new_period(NEW.period_year, NEW.period_month); END IF;
  IF NOT old_new AND NOT new_new THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  IF public.payroll_s2_authorized_path() THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP = 'INSERT' THEN IF NEW.status <> 'draft' THEN RAISE EXCEPTION 'دورة تبدأ مسودة فقط' USING ERRCODE = 'insufficient_privilege'; END IF; RETURN NEW; END IF;
  IF TG_OP = 'DELETE' THEN IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'معتمدة/مدفوعة — لا تُحذف' USING ERRCODE = 'insufficient_privilege'; END IF; RETURN OLD; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'تغيير الحالة عبر RPC فقط' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'معتمدة/مدفوعة — لا تُعدَّل' USING ERRCODE = 'insufficient_privilege'; END IF;
  RETURN NEW;
END $$;
create trigger payroll_runs_s2_guard before insert or delete or update on public.payroll_runs for each row execute function public.payroll_runs_s2_guard();
create function public.payroll_entries_s2_guard() returns trigger language plpgsql as $$
BEGIN
  IF (TG_OP <> 'INSERT' AND public.payroll_run_is_locked_new(OLD.run_id)) OR (TG_OP <> 'DELETE' AND public.payroll_run_is_locked_new(NEW.run_id)) THEN
    IF NOT public.payroll_s2_authorized_path() THEN RAISE EXCEPTION 'بنود معتمدة/مدفوعة — لا تُعدَّل' USING ERRCODE = 'insufficient_privilege'; END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
create trigger payroll_entries_s2_guard before insert or delete or update on public.payroll_entries for each row execute function public.payroll_entries_s2_guard();

-- production approve function BEFORE hardening (verbatim)
create function public.payroll_approve_run(p_run_id uuid) returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $function$
DECLARE r public.payroll_runs%ROWTYPE; n int; total numeric; stale int; last_ev public.payroll_run_events%ROWTYPE; cur jsonb; chg jsonb := NULL;
BEGIN
  IF NOT public.payroll_can_finalize() THEN RAISE EXCEPTION 'الاعتماد لحسام وأماني فقط (D-090).' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT * INTO r FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الدورة غير موجودة.'; END IF;
  IF NOT public.payroll_is_new_period(r.period_year, r.period_month) THEN RAISE EXCEPTION 'هذا المسار لدورات أيلول 2026+ فقط.'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'الدورة ليست مسودة (الحالة: %).', r.status; END IF;
  IF r.month_setup_confirmed_at IS NULL THEN RAISE EXCEPTION 'إعداد الشهر غير مؤكَّد.'; END IF;
  IF NOT (coalesce(r.rate_usd_try, 0) > 0 AND coalesce(r.rate_usd_syp, 0) > 0) THEN RAISE EXCEPTION 'سعر الصرف للدورة ناقص (D-090 البند 15).'; END IF;
  SELECT count(*), coalesce(sum(net_salary_usd), 0), count(*) FILTER (WHERE computed_at IS NULL OR computed_at < r.month_setup_confirmed_at) INTO n, total, stale FROM public.payroll_entries WHERE run_id = p_run_id;
  IF n = 0 THEN RAISE EXCEPTION 'لا بنود بالدورة — شغّل الحسبة أولاً.'; END IF;
  IF stale > 0 THEN RAISE EXCEPTION 'تغيّر إعداد الشهر بعد آخر حسبة لـ% بند — أعد تشغيل الدورة.', stale; END IF;
  SELECT * INTO last_ev FROM public.payroll_run_events WHERE run_id = p_run_id ORDER BY id DESC LIMIT 1;
  IF FOUND AND last_ev.action = 'reopen' THEN cur := public.payroll_s2_entries_snapshot(p_run_id); chg := jsonb_build_object('total_net_after', cur -> 'total_net_usd'); END IF;
  PERFORM set_config('payroll.s2_path', 'rpc', true);
  UPDATE public.payroll_runs SET status = 'finalized', approved_by = auth.uid(), finalized_by = auth.uid(), finalized_at = now(), total_net_usd = total, employee_count = n WHERE id = p_run_id;
  INSERT INTO public.payroll_run_events (run_id, period, action, actor, changes) VALUES (p_run_id, r.period_year * 100 + r.period_month, 'approve', auth.uid(), chg);
  PERFORM set_config('payroll.s2_path', '', true);
  RETURN jsonb_build_object('run_id', p_run_id, 'status', 'finalized', 'employee_count', n, 'total_net_usd', total, 'changes', chg);
END $function$;

insert into profiles values ('${HOSAM}','hosam',true),('${NOBODY}','nobody',true),('${EMP}','emp',true);
insert into payroll_access values ('${HOSAM}', true, 'owner');
`);

// ── baseline data: historical runs (June, July paid), Sept draft, Oct draft
await run(`
insert into payroll_runs (id, period_year, period_month, status) values
 ('11111111-0000-0000-0000-000000000006', 2026, 6, 'draft'),
 ('11111111-0000-0000-0000-000000000007', 2026, 7, 'paid'),
 ('11111111-0000-0000-0000-000000000009', 2026, 9, 'draft');
insert into payroll_runs (id, period_year, period_month, status, rate_usd_try, rate_usd_syp, month_setup_confirmed_at) values
 ('11111111-0000-0000-0000-000000000010', 2026, 10, 'draft', 46.8, 131, '2026-11-01T08:00:00Z');
insert into payroll_entries (run_id, employee_id, base_salary_usd, net_salary_usd, source, computed_at) values
 ('11111111-0000-0000-0000-000000000007','${EMP}',300,300,'auto','2026-08-01'),
 ('11111111-0000-0000-0000-000000000009','${EMP}',300,300,'auto','2026-10-22');
`);
const before = await q(`select (select count(*) from payroll_runs) r, (select count(*) from payroll_entries) e`);

// ── A) hardening applies cleanly
const sql = readFileSync(REPO + '20261023_payroll_server_hardening.sql', 'utf8');
await expectOk('hardening SQL applies without error', sql);

// ── A) historical lock
await asUser(HOSAM);
await expectErr('UPDATE historical (June) run is blocked', `update payroll_runs set notes_dummy = 1 where id='11111111-0000-0000-0000-000000000006'`.replace('notes_dummy = 1', 'archived_at = now()'), /تاريخية/);
await expectErr('DELETE historical draft run is blocked', `delete from payroll_runs where id='11111111-0000-0000-0000-000000000006'`, /تاريخية/);
await expectErr('UPDATE entry of historical PAID run (July) is blocked', `update payroll_entries set net_salary_usd = 1 where run_id='11111111-0000-0000-0000-000000000007'`, /تاريخية/);
await expectErr('INSERT entry into Sept (historical) run is blocked', `insert into payroll_entries (run_id, employee_id, base_salary_usd, source) values ('11111111-0000-0000-0000-000000000009','${NOBODY}',5,'manual')`, /تاريخية/);
await expectErr('INSERT a new historical run is blocked', `insert into payroll_runs (period_year, period_month) values (2026, 8)`, /تاريخية/);
await expectOk('INSERT October run is allowed', `insert into payroll_runs (id, period_year, period_month) values ('11111111-0000-0000-0000-000000000011', 2026, 11)`);
await run(`set payroll.historical_unlock = 'on'`);
await expectOk('explicit unlock setting allows a controlled correction', `update payroll_runs set archived_at = null where id='11111111-0000-0000-0000-000000000006'`);
await run(`set payroll.historical_unlock = 'off'`);
const afterHist = await q(`select (select count(*) from payroll_runs) r, (select count(*) from payroll_entries) e`);
rec(Number(afterHist[0].e) === Number(before[0].e), 'historical entries count unchanged by blocked attempts');

// ── C) audit trail
const RUN10 = '11111111-0000-0000-0000-000000000010';
await run(`delete from audit_log`);
await run(`insert into payroll_entries (run_id, employee_id, base_salary_usd, net_salary_usd, source, computed_at) values ('${RUN10}','${EMP}',300,300,'auto','2026-11-02')`);
await run(`update payroll_entries set net_salary_usd = 290 where run_id='${RUN10}'`);
await run(`insert into payroll_absence_reviews (employee_id, absence_date, status) values ('${EMP}','2026-10-05','pending')`);
await run(`update payroll_absence_reviews set status='approved', updated_at = '2026-10-01' where employee_id='${EMP}'`);
await run(`insert into payroll_allowances (employee_id, amount, updated_at) values ('${EMP}', 10, '2026-10-01')`);
await run(`insert into payroll_access values ('${NOBODY}', false, 'test')`);
await run(`delete from payroll_access where profile_id='${NOBODY}'`);
const audit = await q(`select table_name, action, actor from audit_log order by created_at, table_name`);
const has = (t, a) => audit.some((r) => r.table_name === t && r.action === a && r.actor === HOSAM);
rec(has('payroll_entries', 'INSERT') && has('payroll_entries', 'UPDATE'), 'entry insert + update audited with actor');
rec(has('payroll_absence_reviews', 'INSERT') && has('payroll_absence_reviews', 'UPDATE'), 'absence decisions audited');
rec(has('payroll_allowances', 'INSERT'), 'allowances audited');
rec(has('payroll_access', 'INSERT') && has('payroll_access', 'DELETE'), 'payroll_access grant/revoke audited');
const upd = await q(`select before_data->>'net_salary_usd' b, after_data->>'net_salary_usd' a from audit_log where table_name='payroll_entries' and action='UPDATE'`);
rec(upd[0] && Number(upd[0].b) === 300 && Number(upd[0].a) === 290, 'audit keeps before/after values', JSON.stringify(upd[0]));

// ── B) approve gates
const approve = (id = RUN10) => `select payroll_approve_run('${id}')`;
await asUser(NOBODY);
await expectErr('non-finalizer cannot approve', approve(), /لحسام وأماني/);
await asUser(HOSAM);
await expectErr('historical (Sept) run cannot be approved', approve('11111111-0000-0000-0000-000000000009'), /تاريخية/);
// make inputs newer than the calculation (computed_at 2026-11-02)
await run(`update employee_salary_settings set updated_at = now() where false`); // no-op baseline
await run(`insert into employee_salary_settings (employee_id, base_salary, updated_at) values ('${EMP}', 300, '2026-11-05')`);
await expectErr('salary settings changed after calc → approval blocked', approve(), /تغيّرت الرواتب/);
await run(`update employee_salary_settings set updated_at = '2026-10-01'`);
await run(`update payroll_allowances set updated_at = '2026-11-05'`);
await expectErr('allowance changed after calc → approval blocked', approve(), /تغيّرت الرواتب/);
await run(`update payroll_allowances set updated_at = '2026-10-01'`);
await run(`update payroll_absence_reviews set updated_at = '2026-11-05'`);
await expectErr('absence decision changed after calc → approval blocked', approve(), /تغيّرت الرواتب/);
await run(`update payroll_absence_reviews set updated_at = '2026-10-01'`);
await run(`insert into payroll_entries (run_id, employee_id, base_salary_usd, net_salary_usd, source, computed_at) values ('${RUN10}','${NOBODY}',0,0,'auto','2026-11-02')`);
await expectErr('zero-salary entry → approval blocked', approve(), /راتب أساسي صفر/);
await run(`update payroll_entries set base_salary_usd = 150, net_salary_usd = 150 where employee_id='${NOBODY}' and run_id='${RUN10}'`);
await run(`update payroll_entries set computed_at = '2026-11-02' where run_id='${RUN10}'`);
const ok1 = await q(approve());
rec(ok1[0].payroll_approve_run.status === 'finalized', 'fresh run with valid entries approves', JSON.stringify(ok1[0].payroll_approve_run).slice(0, 80));
const ev = await q(`select action, actor from payroll_run_events where run_id='${RUN10}'`);
rec(ev.length === 1 && ev[0].action === 'approve' && ev[0].actor === HOSAM, 'approve event logged');
await expectErr('approved run entries are still locked (existing guard intact)', `update payroll_entries set net_salary_usd = 1 where run_id='${RUN10}'`, /معتمدة|لا تُعدَّل/);

// ── idempotency + rollback
try { await run(sql); rec(false, 'second application of the file', 'applied twice without error (unexpected)'); }
catch (e) { rec(true, 'second application fails safely (not re-runnable; transaction rolled back)', e.message.slice(0, 70)); }
const rb = readFileSync(REPO + '20261023_payroll_server_hardening_rollback.sql', 'utf8');
await expectOk('rollback SQL applies', rb);
const trg = await q(`select tgname from pg_trigger where not tgisinternal and tgname like '%historical_lock%' or tgname like '%_audit'`);
rec(trg.length === 0, 'rollback removed lock + audit triggers', JSON.stringify(trg));

} catch (e) { results.push('ABORT ' + String(e.message).slice(0, 300)); fail++; }
console.log(results.join('\n'));
console.log(`\nSUMMARY: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
