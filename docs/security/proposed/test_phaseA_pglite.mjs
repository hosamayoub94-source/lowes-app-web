// Run from a scratch dir with node_modules containing @electric-sql/pglite@0.2.17 (NOT the project); set SEC_DOCS=<path to this folder>/
// Test of 20261024_phaseA_anon_sensitive_lockdown.sql + phaseA2 profiles (+ rollbacks) on an in-memory Postgres (pglite).
// The clone has the SAME 194 table names + 2 views as production, RLS on everywhere, the open `true`
// policy that production has, Supabase-style default grants (anon/authenticated/service_role = ALL),
// and the production quirks that matter: column-level grants on profiles, FK attendance -> employees,
// audit_log shape. Row data is synthetic. Never connects to Supabase.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const DIR = process.env.SEC_DOCS;
const read = (f) => readFileSync(DIR + f, 'utf8').replace(/\r\n/g, '\n');
const db = new PGlite();
let pass = 0, fail = 0; const out = [];
const rec = (ok, name, extra = '') => { ok ? pass++ : fail++; out.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra !== '' ? ' — ' + String(extra).slice(0, 130) : ''}`); };
const rb = async () => { try { await db.exec('rollback'); } catch { /* none */ } };
const exec = async (sql) => { try { return await db.exec(sql); } catch (e) { await rb(); throw e; } };
const q = async (sql) => { try { return (await db.query(sql)).rows; } catch (e) { await rb(); throw e; } };

const TABLES = `accounting_categories accounting_channels accounting_entries accounting_entries_bak_0006 activity_logs activity_logs_archive ad_campaigns_backup_20260607 ad_daily_logs ad_results advance_requests alert_rules alerts analytics_snapshots announcements app_guides app_settings attachments attendance attendance_events attendance_records attribution_record audit_log backup_log badges bonus_settings bonuses break_sessions campaign_ads campaign_sends campaigns categories challenge_progress challenges channels chat_join_requests chat_last_read chat_messages chat_pinned chat_reactions chat_room_members chat_rooms clients commission_config commission_ledger commission_rules commissions consignments creator_prospect_audit creator_prospects creator_workbench_items crm_clients crm_visits customer_contacts customer_notes customers daily_report_campaigns daily_reports daily_sales_ad_results daily_sales_channel_results daily_sales_reports dashboard_widgets deal_activities deals delivery_results departments employee_badges employee_kpis employee_partnerships employee_requests employee_salary_settings employee_salary_settings_log employees exchange_rates expenses file_activity file_folders file_shares file_versions files finance_ledger_migrated_20260607 followups handler_name_backup_20260607 income integration_state inventory_adjustments inventory_daily_log invoices leads leave_balances leave_requests lozy_chats lozy_knowledge messages mlm_groups mlm_join_requests mlm_rank_rules monthly_commission_adjustments monthly_payroll monthly_sales_records mystery_shopper network_audit notifications online_stores order_code_counters order_delivery_evidence order_status_history order_status_history_failures orders otp_codes partnership_requests partnerships payroll_absence_reviews payroll_access payroll_allowances payroll_backup_bushra_20261022 payroll_backup_hosam_entry_20261023 payroll_backup_hosam_profile_20261023 payroll_backup_profiles_20261022 payroll_backup_salary_settings_20261022 payroll_entries payroll_run_events payroll_runs payroll_s1b_backup_policies performance performance_reviews performance_scores pin_admins pin_s2_backup_func pin_s2_backup_profiles_acl pin_s2_backup_profiles_effective pipeline_stages pipelines price_violations product_economics product_economics_history product_market_prices product_name_map product_variants products profiles profitability_expenses profitability_fx_rates profitability_month_closures profitability_retro_log project_members projects purchase_order_items purchase_orders push_subscriptions quiz_certifications quiz_questions quiz_responses referral_codes rep_level_rules report_ad_results report_exports report_other_sales report_source_platforms report_source_results requests salary_deductions sales_channels sales_notes sales_order_items sales_orders sales_targets saved_reports seller_badges shift_groups shift_partners shift_schedule shifts shipments social_posts stock_levels stock_movements syria_b2b_leads system_settings task_activity task_comments task_points task_subtasks task_timeline tasks territories user_sessions warehouses wh_movements wh_stock wh_warehouses withdrawals zz_bak_product_economics_20261018 zz_bak_product_economics_history_20261018 zz_bak_product_name_map_20261018`.split(' ');
const VIEWS = ['customer_stats', 'sales_value_summary'];
const CUSTOM = new Set(['profiles', 'audit_log', 'employees', 'attendance', 'payroll_access']);

const U = { EMP: '00000000-0000-0000-0000-00000000e001', ADM: '00000000-0000-0000-0000-00000000e006', HR: '00000000-0000-0000-0000-00000000e004' };
const WHO = { ANON: ['anon', null], EMPLOYEE: ['authenticated', U.EMP], HR: ['authenticated', U.HR], ADMIN: ['authenticated', U.ADM], SERVICE_ROLE: ['service_role', null], OWNER: ['postgres', null] };
const as = async (w) => { const [r, uid] = WHO[w]; await exec(`reset role; select set_config('request.jwt.claim.sub','${uid ?? ''}',false); ${r === 'postgres' ? '' : `set role ${r};`}`); };
const classify = (e) => { const m = e.message; if (/permission denied/.test(m)) return 'DENIED'; if (/row-level security/.test(m)) return 'DENIED(RLS)'; if (/للإضافة فقط/.test(m)) return 'BLOCKED(append-only)'; if (/تسجيل التدقيق/.test(m)) return 'REJECTED(no user)'; return 'ERR ' + m.slice(0, 60); };
const attempt = async (sql) => { try { const r = await db.query(sql); return r.affectedRows > 0 ? 'OK' : (r.rows.length ? 'OK' : 'OK(0 rows)'); } catch (e) { await rb(); return classify(e); } };
const inTx = async (w, sql) => { await as(w); await exec('begin'); const r = await attempt(sql); await rb(); return r; };

// ── build the production-like clone ──
await exec(`
set check_function_bodies = off;
grant temporary on database template1 to public;
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create function public.is_admin_user() returns boolean language sql stable security definer set search_path to 'public' as $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.is_active, true) AND p.role_type = 'admin'); $$;
create function public.payroll_has_access() returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $$
  SELECT EXISTS (SELECT 1 FROM public.payroll_access pa JOIN public.profiles p ON p.id = pa.profile_id WHERE pa.profile_id = auth.uid() AND p.is_active = true); $$;
grant execute on function public.is_admin_user(), public.payroll_has_access() to anon, authenticated, service_role;
create function public.wh_transfer_stock(p_from uuid, p_to uuid, p_product uuid, p_qty integer) returns void language sql security definer as $$ select 1 $$;
grant execute on function public.wh_transfer_stock(uuid, uuid, uuid, integer) to public, anon, authenticated, service_role;

create table public.profiles (id uuid primary key default gen_random_uuid(), employee_name text, role_type text default 'employee', is_active boolean default true,
  base_salary_usd numeric, password text, pin text, team text, seller_alias text, job_title text, phone text, avatar_url text, join_date date, total_points int default 0, last_login_at timestamptz,
  auth_id uuid, housing_allowance_usd numeric, transport_allowance_usd numeric, commission_pct numeric, salary_currency text, payroll_commission_exempt boolean, extra_permissions text, denied_permissions text, manager_scope text, employment_status text, resigned_at date, resign_reason text, admin_notes text, wallet_balance numeric, order_role text, order_market text, seller_type text, rep_level text, mlm_rank text, sponsor_id uuid, recruiter_id uuid, invite_code text, qr_token text, blob_user_id text, hire_date date, created_at timestamptz default now());
create table public.employees (id uuid primary key default gen_random_uuid(), name text, pin text);
create table public.attendance (id uuid primary key default gen_random_uuid(), employee_id uuid references public.employees(id), status text);
create table public.payroll_access (profile_id uuid primary key, can_finalize boolean not null default false);
create table public.audit_log (id uuid primary key default gen_random_uuid(), actor text, action text, table_name text, record_id text, before_data jsonb, after_data jsonb, ip_address text, user_agent text, created_at timestamptz default now());
`);
await exec(`
do $b$ declare t text; begin
  foreach t in array string_to_array('${TABLES.filter((t) => !CUSTOM.has(t)).join(' ')}', ' ') loop
    execute format('create table public.%I (id uuid primary key default gen_random_uuid(), v text, created_at timestamptz default now())', t);
  end loop;
  foreach t in array string_to_array('${TABLES.join(' ')}', ' ') loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy allow_all on public.%I for all to public using (true) with check (true)', t);
    execute format('grant all on public.%I to anon, authenticated, service_role', t);
    if t <> 'payroll_access' then execute format('insert into public.%I (id, %s) select gen_random_uuid(), %s from generate_series(1,3) g', t,
      case t when 'payroll_access' then 'can_finalize' when 'profiles' then 'employee_name' when 'employees' then 'name' when 'attendance' then 'status' when 'audit_log' then 'actor' else 'v' end, '''row-'' || g'); end if;
  end loop;
end $b$;
alter policy allow_all on public.audit_log rename to allow_all_anon_aul;
-- production: payroll/salary tables were never granted to anon
revoke all on public.payroll_runs, public.payroll_entries, public.payroll_access, public.payroll_absence_reviews, public.payroll_allowances, public.payroll_run_events, public.employee_salary_settings, public.employee_salary_settings_log from anon;
-- production quirk: profiles has NO table-level SELECT/UPDATE for anon, only column-level (+ table-level INSERT)
revoke select, update, delete on public.profiles from anon;
do $g$ declare sel text; upd text; begin
  select string_agg(quote_ident(column_name), ',') into sel from information_schema.columns where table_schema='public' and table_name='profiles' and column_name not in ('password','pin');
  select string_agg(quote_ident(column_name), ',') into upd from information_schema.columns where table_schema='public' and table_name='profiles' and column_name <> 'pin';
  execute 'grant select (' || sel || ') on public.profiles to anon';
  execute 'grant update (' || upd || ') on public.profiles to anon';
end $g$;
create view public.customer_stats with (security_invoker = true) as select id, v from public.orders;
create view public.sales_value_summary with (security_invoker = true) as select id, v from public.orders;
grant all on public.customer_stats, public.sales_value_summary to anon, authenticated, service_role;
insert into public.profiles (id, employee_name, role_type, is_active) values ('${U.ADM}', 'admin1', 'admin', true), ('${U.EMP}', 'emp1', 'employee', true), ('${U.HR}', 'hr1', 'hr_manager', true);
insert into public.payroll_access values ('${U.HR}', false);
insert into public.system_settings (id, v) values (gen_random_uuid(), 'admin_pass'), (gen_random_uuid(), 'manager_pass');
`);
// 22 audit rows with fixed ids for the old-row check
await exec(`delete from public.audit_log; insert into public.audit_log (id, actor, action, table_name, record_id, after_data, created_at)
  select ('99999999-0000-0000-0000-' || lpad(g::text,12,'0'))::uuid, 'u'||g, 'insert', 'requests', 'r'||g, jsonb_build_object('n', g), '2026-05-01'::timestamptz + (g||' hours')::interval from generate_series(1,22) g;`);

// content + ACL fingerprints
await exec(`
create schema _t; create function _t.acl_text(a aclitem[]) returns text language sql as $f$ select string_agg(x, ',' order by x) from (select (case when e.grantee=0 then 'PUBLIC' else pg_get_userbyid(e.grantee) end)||'='||e.privilege_type x from aclexplode(a) e) z $f$;
create function _t.dbhash() returns text language plpgsql as $f$
declare r record; acc text := ''; h text;
begin
  for r in select c.relname from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' order by 1 loop
    execute format('select md5(coalesce(string_agg(to_jsonb(x)::text, ''|'' order by to_jsonb(x)::text), '''')) from public.%I x', r.relname) into h;
    acc := acc || r.relname || ':' || h || ';';
  end loop;
  return md5(acc);
end $f$;
create function _t.aclhash() returns text language sql as $f$
  select md5(coalesce((select string_agg(x, '|' order by x) from (
    select c.relname||':'||coalesce(_t.acl_text(coalesce(c.relacl, acldefault('r', c.relowner))), '') as x
      from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','v')
    union all
    select c.relname||'.'||at.attname||':'||_t.acl_text(at.attacl)
      from pg_attribute at join pg_class c on c.oid=at.attrelid where c.relnamespace='public'::regnamespace and at.attacl is not null and at.attnum>0
    union all select 'fn:'||p.oid::regprocedure::text||':'||_t.acl_text(coalesce(p.proacl, acldefault('f', p.proowner))) from pg_proc p where p.proname='wh_transfer_stock'
    union all select 'pol:'||tablename||':'||policyname||':'||cmd||':'||roles::text from pg_policies where schemaname='public'
  ) s), ''))
$f$;
`);
const _dbhash = async () => (await q(`select _t.dbhash() h`))[0].h;
const _aclparts = async () => (await q(`select c.relname||':'||coalesce(_t.acl_text(coalesce(c.relacl, acldefault('r', c.relowner))), '') as x from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','v') union all select c.relname||'.'||at.attname||':'||_t.acl_text(at.attacl) from pg_attribute at join pg_class c on c.oid=at.attrelid where c.relnamespace='public'::regnamespace and at.attacl is not null and at.attnum>0 union all select 'fn:'||p.oid::regprocedure::text||':'||_t.acl_text(coalesce(p.proacl, acldefault('f', p.proowner))) from pg_proc p where p.proname='wh_transfer_stock' union all select 'pol:'||tablename||':'||policyname||':'||cmd||':'||roles::text from pg_policies where schemaname='public'`)).map((r) => r.x).sort();
const _aclhash = async () => (await q(`select _t.aclhash() h`))[0].h;
await as('OWNER');
const dbhash = async () => { await as('OWNER'); return _dbhash(); };
const aclhash = async () => { await as('OWNER'); return _aclhash(); };
const aclparts = async () => { await as('OWNER'); return _aclparts(); };
const H0 = await dbhash(); const A0 = await aclhash(); const P0 = await aclparts();
const OLD = `select count(*)::int n, md5(string_agg(to_jsonb(a)::text, '|' order by a.id::text)) h from public.audit_log a where a.id::text like '99999999-%'`;
const old0 = (await q(OLD))[0];
rec(TABLES.length === 194, 'clone has the same 194 tables as production', TABLES.length);

// ── BEFORE: reproduce the exposures (each inside a rolled-back transaction) ──
const vuln = {
  'anon SELECT system_settings (admin_pass/manager_pass rows)': await inTx('ANON', `select * from public.system_settings`),
  'anon SELECT user_sessions': await inTx('ANON', `select * from public.user_sessions`),
  'anon SELECT monthly_payroll': await inTx('ANON', `select * from public.monthly_payroll`),
  'anon DELETE finance_ledger_migrated_20260607': await inTx('ANON', `delete from public.finance_ledger_migrated_20260607`),
  'anon SELECT audit_log': await inTx('ANON', `select * from public.audit_log`),
  'anon INSERT audit_log (forge)': await inTx('ANON', `insert into public.audit_log (actor, action, table_name) values ('forged','x','y')`),
  'anon UPDATE profiles.role_type': await inTx('ANON', `update public.profiles set role_type = 'admin'`),
  'anon UPDATE profiles.base_salary_usd': await inTx('ANON', `update public.profiles set base_salary_usd = 99999`),
};
rec(Object.values(vuln).every((v) => v === 'OK'), 'BEFORE: all these exposures reproduce in the clone', JSON.stringify(vuln).slice(0, 110));
await as('OWNER');
rec((await dbhash()) === H0, 'BEFORE tests rolled back: all 194 tables unchanged');

// privilege matrix before (anon/authenticated/service_role x every object x 7 privileges)
const PRIVS = ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'];
const ALLOBJ = [...TABLES, ...VIEWS];
const matrixPriv = async () => { await as('OWNER'); const m = {}; for (const r of ['anon', 'authenticated', 'service_role']) for (const o of ALLOBJ) for (const p of PRIVS) m[`${r}|${o}|${p}`] = (await q(`select has_table_privilege('${r}','public.${o}','${p}') b`))[0].b; return m; };
const PB = await matrixPriv();

// ── APPLY phase A (twice) ──
const SQLA = read('20261024_phaseA_anon_sensitive_lockdown.sql');
const SENS = [...SQLA.split('foreach t in array array[')[1].split('] loop')[0].matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]);
rec(SENS.length === 52 && SENS.every((t) => ALLOBJ.includes(t)), 'phase A sensitive list = 52 real tables/views (parsed from the file)', SENS.length);
await exec(SQLA); rec(true, 'phase A applies on the test database (1st)');
const A1 = await aclhash();
await exec(SQLA); rec(true, 'phase A applies again (idempotent, 2nd)');
rec((await aclhash()) === A1, 'ACL/policy fingerprint identical after the 2nd application');
rec((await dbhash()) === H0, 'phase A changed NO row in ANY of the 194 tables (payroll, finance, orders, audit - content hash identical)');
rec((await q(`select count(*)::int n from _security_backup.acl_phasea_20261024`))[0].n > 600, 'snapshot taken');
const PA = await matrixPriv();
const diffs = { anonSensitiveStillOpen: [], anonOtherChanged: [], authChanged: [], svcChanged: [], grew: [] };
for (const k of Object.keys(PB)) {
  const [r, o, p] = k.split('|');
  if (PA[k] && !PB[k]) diffs.grew.push(k);
  if (r === 'service_role' && PA[k] !== PB[k]) diffs.svcChanged.push(k);
  if (r === 'authenticated' && PA[k] !== PB[k] && o !== 'audit_log') diffs.authChanged.push(k);
  if (r === 'anon') {
    if (SENS.includes(o) || o === 'audit_log') { if (PA[k]) diffs.anonSensitiveStillOpen.push(k); }
    else if (PA[k] !== PB[k] && !['truncate', 'references', 'trigger'].includes(p)) diffs.anonOtherChanged.push(k);
  }
}
rec(diffs.anonSensitiveStillOpen.length === 0, 'anon has NO privilege left on the 52 sensitive tables or audit_log', diffs.anonSensitiveStillOpen.slice(0, 3).join(','));
rec(diffs.anonOtherChanged.length === 0, 'anon is unchanged on every other table (only TRUNCATE/REFERENCES/TRIGGER removed)', diffs.anonOtherChanged.slice(0, 3).join(','));
rec(diffs.authChanged.length === 0, 'authenticated is unchanged on every table except audit_log', diffs.authChanged.slice(0, 3).join(','));
rec(diffs.svcChanged.length === 0, 'service_role is unchanged everywhere (bridges / edge functions unaffected)', diffs.svcChanged.slice(0, 3).join(','));
rec(diffs.grew.length === 0, 'strictly reductive: no privilege was granted that did not exist before');
rec(!Object.keys(PA).some((k) => k.startsWith('anon|') && ['truncate', 'references', 'trigger'].includes(k.split('|')[2]) && PA[k]), 'anon has no TRUNCATE/REFERENCES/TRIGGER anywhere');
rec(['truncate', 'references', 'trigger'].every((p) => ALLOBJ.filter((o) => o !== 'audit_log').every((o) => PA[`authenticated|${o}|${p}`] === PB[`authenticated|${o}|${p}`])), 'authenticated TRUNCATE/REFERENCES/TRIGGER untouched on every table except audit_log (phase A is anon-only)');

// ── RLS-style role matrix after phase A ──
const MT = ['system_settings', 'user_sessions', 'monthly_payroll', 'employees', 'finance_ledger_migrated_20260607', 'expenses', 'audit_log', 'orders', 'tasks', 'accounting_entries', 'payroll_runs', 'sales_value_summary', 'customer_stats'];
const OPS = { SELECT: (t) => `select * from public.${t}`, INSERT: (t) => `insert into public.${t} (v) values ('x')`, UPDATE: (t) => `update public.${t} set v = 'y'`, DELETE: (t) => `delete from public.${t}` };
const matrix = {};
for (const w of ['ANON', 'EMPLOYEE', 'HR', 'ADMIN', 'SERVICE_ROLE']) {
  matrix[w] = {};
  for (const t of MT) {
    const cells = [];
    for (const [op, f] of Object.entries(OPS)) {
      if (['customer_stats', 'sales_value_summary'].includes(t) && op !== 'SELECT') { cells.push('..'); continue; }
      let sql = f(t);
      if (t === 'audit_log') sql = { SELECT: f(t), INSERT: `insert into public.audit_log (actor, action, table_name) values ('forged','x','y')`, UPDATE: `update public.audit_log set actor = 'x'`, DELETE: `delete from public.audit_log` }[op];
      if (t === 'employees') sql = { SELECT: f(t), INSERT: `insert into public.employees (name) values ('x')`, UPDATE: `update public.employees set name = 'y'`, DELETE: `delete from public.employees where false` }[op];
      const r = await inTx(w, sql);
      cells.push(r.startsWith('OK') ? 'ok' : r.startsWith('DENIED') ? '--' : r.startsWith('BLOCKED') ? 'BLK' : '??');
    }
    matrix[w][t] = cells.join(' ');
  }
}
await as('OWNER');
rec((await dbhash()) === H0, 'after the whole role matrix (rolled-back transactions) every table is unchanged');
for (const t of ['system_settings', 'user_sessions', 'monthly_payroll', 'employees', 'finance_ledger_migrated_20260607', 'expenses', 'audit_log']) rec(!/ok|BLK|\?\?/.test(matrix.ANON[t]), `anon: no read/insert/update/delete on ${t}`, matrix.ANON[t]);
rec(matrix.ANON.orders === 'ok ok ok ok', 'anon orders: unchanged in phase A (the app still works; closing orders is a later phase needing app changes)', matrix.ANON.orders);
rec(matrix.ANON.tasks === 'ok ok ok ok' && matrix.ANON.accounting_entries === 'ok ok ok ok', 'anon tasks / accounting_entries unchanged in phase A', `${matrix.ANON.tasks} / ${matrix.ANON.accounting_entries}`);
rec(matrix.ANON.sales_value_summary.startsWith('--') && matrix.ANON.customer_stats.startsWith('ok'), 'anon: sales_value_summary closed, customer_stats (used by the app) kept');
for (const w of ['EMPLOYEE', 'ADMIN']) {
  for (const t of ['system_settings', 'user_sessions', 'monthly_payroll', 'finance_ledger_migrated_20260607', 'expenses']) rec(matrix[w][t] === 'ok ok ok ok', `${w} (authenticated) unchanged on ${t} - phase A does not touch authenticated`, matrix[w][t]);
}
rec(matrix.ADMIN.audit_log.startsWith('ok -- -- --') && matrix.HR.audit_log.startsWith('ok -- -- --') && matrix.EMPLOYEE.audit_log.split(' ').slice(1).join(' ') === '-- -- --', 'audit_log: admin & HR read, nobody can forge/update/delete; employee cannot write', `${matrix.ADMIN.audit_log} | ${matrix.HR.audit_log} | ${matrix.EMPLOYEE.audit_log}`);
rec((await inTx('EMPLOYEE', `select * from public.audit_log`)) === 'OK(0 rows)', 'employee reads 0 audit rows (RLS)');
rec(matrix.SERVICE_ROLE.system_settings === 'ok ok ok ok' && matrix.SERVICE_ROLE.monthly_payroll === 'ok ok ok ok', 'service_role keeps full access to sensitive tables');
rec(matrix.SERVICE_ROLE.audit_log === 'ok ok BLK BLK', 'service_role: audit_log append-only (insert ok, update/delete blocked)', matrix.SERVICE_ROLE.audit_log);

// ── audit_log: old rows + actor cannot be forged ──
await as('ADMIN');
await exec(`select set_config('request.headers', '{"x-forwarded-for":"198.51.100.7, 10.0.0.1","user-agent":"UA/9"}', false)`);
const id1 = (await q(`select public.log_audit_event('probe','orders','o1','{"a":1}'::jsonb,'{"actor":"someone-else"}'::jsonb) id`))[0].id;
await as('OWNER');
const row = (await q(`select actor, action, user_agent, after_data from public.audit_log where id='${id1}'`))[0];
rec(row.actor === U.ADM && row.action === 'app:probe' && row.user_agent === 'UA/9' && row.after_data.actor === 'someone-else', 'log_audit_event: actor = auth.uid(), no actor/ip parameter, payload "actor" is only data');
await as('ANON'); rec(/DENIED/.test(await attempt(`select public.log_audit_event('x','y')`)), 'anon can not call log_audit_event');
await as('OWNER'); await exec(`create table public.t_demo (id uuid primary key default gen_random_uuid(), v int); grant all on public.t_demo to authenticated;
  create trigger t_demo_audit after insert or update or delete on public.t_demo for each row execute function public.audit_row_change();`);
await as('EMPLOYEE'); await exec(`insert into public.t_demo (id, v) values ('88888888-0000-0000-0000-000000000001', 1); update public.t_demo set v = 2; delete from public.t_demo;`);
await as('OWNER');
const aud = await q(`select action, actor, before_data->>'v' b, after_data->>'v' a from public.audit_log where table_name='t_demo' order by created_at`);
rec(aud.length === 3 && aud.every((r) => r.actor === U.EMP) && aud.some((r) => r.action === 'update' && r.b === '1' && r.a === '2'), 'trigger still creates correct audit rows (actor = auth.uid(), before=1 after=2) from a user with NO privilege on audit_log');
await as('EMPLOYEE'); rec(/DENIED/.test(await attempt(`select public.audit_row_change()`)), 'user can not call the trigger function directly');
for (const [w, op] of [['OWNER', 'update public.audit_log set actor = $$x$$'], ['OWNER', 'delete from public.audit_log'], ['SERVICE_ROLE', 'delete from public.audit_log'], ['OWNER', 'truncate public.audit_log']]) rec(/BLOCKED/.test(await inTx(w, op)), `audit_log append-only: ${w} ${op.split(' ')[0]} blocked`);
await as('OWNER');
const oldNow = (await q(OLD))[0];
rec(oldNow.n === 22 && oldNow.h === old0.h, 'the 22 original audit rows are byte-identical after everything', oldNow.h);
await exec('drop trigger t_demo_audit on public.t_demo; drop table public.t_demo;');

// ── phase A2: profiles (separate decision) ──
rec(await inTx('ANON', `update public.profiles set role_type = 'admin'`) === 'OK', 'before A2: anon can still change profiles.role_type (the open finding)');
const SQLA2 = read('20261024_phaseA2_profiles_anon_columns.sql');
const A_beforeA2 = await aclhash();
await exec(SQLA2); rec(true, 'phase A2 applies (profiles anon columns)');
await exec(SQLA2); rec(true, 'phase A2 idempotent (2nd)');
for (const c of ['role_type', 'base_salary_usd', 'is_active', 'password', 'team', 'seller_alias', 'join_date']) rec(await inTx('ANON', `update public.profiles set ${c} = ${c}`) === 'DENIED', `A2: anon can NOT update profiles.${c}`);
rec(await inTx('ANON', `insert into public.profiles (id, employee_name, role_type) values (gen_random_uuid(), 'x', 'admin')`) === 'DENIED', 'A2: anon can NOT insert profiles');
rec(await inTx('ANON', `update public.profiles set job_title = 'x'`) === 'OK' && await inTx('ANON', `update public.profiles set avatar_url = 'x'`) === 'OK', 'A2: anon still updates self-service columns');
rec(await inTx('ANON', `select id, employee_name, role_type, team from public.profiles`) === 'OK' && await inTx('ANON', `select password from public.profiles`) === 'DENIED', 'A2: anon reads the app columns, still not password');
rec(await inTx('EMPLOYEE', `update public.profiles set role_type = role_type`) === 'OK', 'A2: authenticated profile updates unchanged');
await as('OWNER');
await exec(read('20261024_phaseA2_profiles_anon_columns_rollback.sql')); rec(true, 'A2 rollback applies');
rec((await aclhash()) === A_beforeA2, 'A2 rollback restores profiles ACLs exactly');
rec(await inTx('ANON', `update public.profiles set role_type = 'admin'`) === 'OK', 'after A2 rollback the old exposure is back - as documented');
await as('OWNER');

// ── phase A rollback ──
await exec('alter table public.audit_log disable trigger audit_log_no_update_delete');
await exec(`delete from public.audit_log where id = '${id1}' or table_name = 't_demo'`);
await exec('alter table public.audit_log enable trigger audit_log_no_update_delete');
const H1 = await dbhash();
await exec(read('20261024_phaseA_anon_sensitive_lockdown_rollback.sql')); rec(true, 'phase A rollback applies');
const P1 = await aclparts(); const dA = P0.filter((x) => !P1.includes(x)); const dB = P1.filter((x) => !P0.includes(x)); if (dA.length || dB.length) console.log('DIFF', dA.slice(0, 4), dB.slice(0, 4));
rec((await aclhash()) === A0, 'rollback restores ALL ACLs, column grants and policies exactly (fingerprint == pre-migration)');
const PR = await matrixPriv();
rec(Object.keys(PB).every((k) => PB[k] === PR[k]), 'rollback: every privilege cell identical to the original', Object.keys(PB).length);
rec((await dbhash()) === H1, 'rollback changed no row');
rec((await q(`select to_regclass('_security_backup.acl_phasea_20261024') r`))[0].r === null, 'snapshot table removed');
rec((await q(OLD))[0].h === old0.h, 'original audit rows untouched by rollback');
rec(await inTx('ANON', `select * from public.system_settings`) === 'OK', 'after rollback the old exposure is back - as documented');
await as('OWNER'); await exec(SQLA); rec(true, 're-apply after rollback works');
rec((await aclhash()) === A1, 'second lock reaches the same fingerprint as the first');

console.log('=== ROLE MATRIX after phase A  (SELECT INSERT UPDATE DELETE ; ok=allowed --=denied BLK=trigger-blocked ..=n/a) ===');
for (const [w, tabs] of Object.entries(matrix)) { console.log(`\n[${w}]`); for (const [t, c] of Object.entries(tabs)) console.log(`   ${t.padEnd(34)} ${c}`); }
console.log('\n=== BEFORE (exposures reproduced in the clone) ===\n' + Object.entries(vuln).map(([k, v]) => `   ${k.padEnd(60)} ${v}`).join('\n'));
console.log('\n=== CHECKS ===\n' + out.join('\n'));
console.log(`\nSUMMARY: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
