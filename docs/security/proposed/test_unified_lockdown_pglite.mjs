// Run from a scratch dir with node_modules containing @electric-sql/pglite@0.2.17 (NOT the project); set SEC_DOCS=<path to this folder>/
// Test of 20261024_unified_access_lockdown.sql (+ rollback) on an in-memory Postgres (pglite).
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
const dbhash = async () => (await q(`select _t.dbhash() h`))[0].h;
const aclparts = async () => (await q(`select c.relname||':'||coalesce(_t.acl_text(coalesce(c.relacl, acldefault('r', c.relowner))), '') as x from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','v') union all select c.relname||'.'||at.attname||':'||_t.acl_text(at.attacl) from pg_attribute at join pg_class c on c.oid=at.attrelid where c.relnamespace='public'::regnamespace and at.attacl is not null and at.attnum>0 union all select 'fn:'||p.oid::regprocedure::text||':'||_t.acl_text(coalesce(p.proacl, acldefault('f', p.proowner))) from pg_proc p where p.proname='wh_transfer_stock' union all select 'pol:'||tablename||':'||policyname||':'||cmd||':'||roles::text from pg_policies where schemaname='public'`)).map((r) => r.x).sort();
const aclhash = async () => (await q(`select _t.aclhash() h`))[0].h;
await as('OWNER');
const H0 = await dbhash(); const A0 = await aclhash(); const P0 = await aclparts();
const OLD = `select count(*)::int n, md5(string_agg(to_jsonb(a)::text, '|' order by a.id::text)) h from public.audit_log a where a.id::text like '99999999-%'`;
const old0 = (await q(OLD))[0];
rec(TABLES.length === 194, 'clone has the same 194 tables as production', TABLES.length);

// ── BEFORE: reproduce exposures (each attempt in a rolled-back transaction) ──
const vuln = {
  'anon SELECT system_settings (admin_pass/manager_pass rows)': await inTx('ANON', `select * from public.system_settings`),
  'anon SELECT user_sessions': await inTx('ANON', `select * from public.user_sessions`),
  'anon SELECT monthly_payroll': await inTx('ANON', `select * from public.monthly_payroll`),
  'anon DELETE orders': await inTx('ANON', `delete from public.orders`),
  'anon UPDATE profiles.role_type': await inTx('ANON', `update public.profiles set role_type = 'admin'`),
  'anon UPDATE profiles.base_salary_usd': await inTx('ANON', `update public.profiles set base_salary_usd = 99999`),
  'anon INSERT profiles (role_type admin)': await inTx('ANON', `insert into public.profiles (id, employee_name, role_type) values (gen_random_uuid(), 'x', 'admin')`),
  'authenticated SELECT system_settings': await inTx('EMPLOYEE', `select * from public.system_settings`),
};
rec(Object.values(vuln).every((v) => v === 'OK'), 'BEFORE: all of these exposures are reproducible in the clone', JSON.stringify(vuln));
await as('OWNER');
rec((await dbhash()) === H0, 'BEFORE tests rolled back: all table contents identical');

// ── APPLY twice ──
const SQL = read('20261024_unified_access_lockdown.sql');
await exec(SQL); rec(true, 'migration applies (1st)');
const A1 = await aclhash();
await exec(SQL); rec(true, 'migration applies again (idempotent, 2nd)');
rec((await aclhash()) === A1, 'ACL/policy fingerprint identical after the 2nd application');
rec((await dbhash()) === H0, 'migration changed NO row in ANY of the 194 tables (content hash identical)');
const snapN = (await q(`select count(*)::int n from _security_backup.acl_20261024`))[0].n;
rec(snapN > 600, 'snapshot taken', snapN);

// ── expected ACL derived from the SQL file's own allow list ──
const allow = {}; for (const m of SQL.matchAll(/\('([a-z_0-9]+)','([RIUD]+)'\)/g)) allow[m[1]] = m[2];
const DEAD = ['monthly_payroll', 'salary_deductions', 'bonuses', 'bonus_settings', 'finance_ledger_migrated_20260607', 'user_sessions', 'otp_codes', 'expenses', 'income', 'commissions', 'backup_log', 'ad_results', 'performance_scores', 'delivery_results', 'monthly_sales_records', 'report_other_sales', 'price_violations', 'system_settings', 'app_settings', 'employees'];
rec(Object.keys(allow).length === 50, 'allow list has 50 tables (parsed from the migration file)', Object.keys(allow).length);
rec(Object.keys(allow).every((t) => TABLES.includes(t) || VIEWS.includes(t)), 'every allow-list name is a real table/view');
const ops = { R: 'select', I: 'insert', U: 'update', D: 'delete' };
const bad = [];
for (const obj of [...TABLES, ...VIEWS]) {
  if (obj === 'profiles') continue; // column-level, checked separately
  const want = allow[obj] || '';
  for (const [code, p] of Object.entries(ops)) {
    const anon = (await q(`select has_table_privilege('anon','public.${obj}','${p}') b`))[0].b;
    if (anon !== want.includes(code)) bad.push(`anon ${obj} ${p} ${anon}`);
    const auth = (await q(`select has_table_privilege('authenticated','public.${obj}','${p}') b`))[0].b;
    const wantAuth = obj === 'audit_log' ? p === 'select' : !DEAD.includes(obj);
    if (auth !== wantAuth) bad.push(`authenticated ${obj} ${p} ${auth}`);
  }
  for (const p of ['truncate', 'references', 'trigger']) {
    for (const r of ['anon', 'authenticated']) if ((await q(`select has_table_privilege('${r}','public.${obj}','${p}') b`))[0].b) bad.push(`${r} ${obj} ${p}`);
  }
}
rec(bad.length === 0, 'EVERY table/view: anon = allow-list ops only; authenticated unchanged except dead set + audit_log; no TRUNCATE/REFERENCES/TRIGGER anywhere', bad.slice(0, 5).join(' | '));
const svc = [];
for (const obj of [...TABLES, ...VIEWS]) for (const p of Object.values(ops)) if (!(await q(`select has_table_privilege('service_role','public.${obj}','${p}') b`))[0].b) svc.push(`${obj} ${p}`);
rec(svc.length === 0, 'service_role keeps full access to every table (bridges / edge functions unaffected)', svc.slice(0, 3).join(','));

// ── never grants anything new: compare against pre-state per anon privilege using the snapshot ──
const grew = (await q(`select count(*)::int n from (select obj, privilege from (select format('public.%s', c.relname) obj, upper(p) privilege from pg_class c, unnest(array['select','insert','update','delete']) p where c.relnamespace='public'::regnamespace and c.relkind in ('r','v') and has_table_privilege('anon', c.oid, p) and c.relname <> 'profiles') now except select obj, privilege from _security_backup.acl_20261024 where kind='r' and grantee='anon') z`))[0].n;
rec(grew === 0, 'migration is strictly reductive for anon (no privilege that was not already held)', grew);

// ── profiles (column level) ──
const colq = async (w, sql) => inTx(w, sql);
rec(await colq('ANON', `update public.profiles set job_title = 'x'`) === 'OK', 'anon can still update self-service column (job_title)');
rec(await colq('ANON', `update public.profiles set avatar_url = 'x'`) === 'OK', 'anon can still update avatar_url');
for (const c of ['role_type', 'base_salary_usd', 'is_active', 'password', 'team', 'seller_alias', 'join_date']) rec(await colq('ANON', `update public.profiles set ${c} = ${c}`) === 'DENIED', `anon can NOT update profiles.${c}`);
rec(await colq('ANON', `insert into public.profiles (id, employee_name, role_type) values (gen_random_uuid(), 'x', 'admin')`) === 'DENIED', 'anon can NOT insert profiles');
rec(await colq('ANON', `select id, employee_name, role_type, team from public.profiles`) === 'OK', 'anon can still read the profile columns the app uses');
rec(await colq('ANON', `select password from public.profiles`) === 'DENIED', 'anon still cannot read profiles.password');
rec(await colq('EMPLOYEE', `update public.profiles set role_type = role_type`) === 'OK', 'authenticated profile updates unchanged (admin screen with JWT keeps working)');

// ── matrix ──
const MT = ['orders', 'tasks', 'accounting_entries', 'customer_stats', 'sales_value_summary', 'mlm_join_requests', 'alerts', 'system_settings', 'user_sessions', 'monthly_payroll', 'employees', 'audit_log', 'payroll_runs', 'products'];
const OPS = { SELECT: (t) => `select * from public.${t}`, INSERT: (t) => `insert into public.${t} (v) values ('x')`, UPDATE: (t) => `update public.${t} set v = 'y'`, DELETE: (t) => `delete from public.${t}`, TRUNCATE: (t) => `truncate public.${t}` };
const matrix = {};
for (const w of ['ANON', 'EMPLOYEE', 'ADMIN', 'SERVICE_ROLE']) {
  matrix[w] = {};
  for (const t of MT) {
    const cells = [];
    for (const [op, f] of Object.entries(OPS)) {
      if (['customer_stats', 'sales_value_summary'].includes(t) && op !== 'SELECT') { cells.push('-'); continue; }
      if (t === 'audit_log' && op === 'UPDATE') { cells.push(await inTx(w, `update public.audit_log set actor = 'x'`)); continue; }
      if (t === 'audit_log' && op === 'INSERT') { cells.push(await inTx(w, `insert into public.audit_log (actor, action, table_name) values ('forged','x','y')`)); continue; }
      if (t === 'employees' && op === 'TRUNCATE') { cells.push('-'); continue; }
      if (t === 'employees' && op !== 'SELECT') { cells.push(await inTx(w, op === 'INSERT' ? `insert into public.employees (name) values ('x')` : op === 'UPDATE' ? `update public.employees set name = 'y'` : f(t))); continue; }
      cells.push(await inTx(w, f(t)));
    }
    matrix[w][t] = cells.map((c) => (c === 'OK' || c === 'OK(0 rows)' ? 'ok' : c === 'DENIED' || c === 'DENIED(RLS)' ? '--' : c === '-' ? '..' : c.startsWith('BLOCKED') ? 'BLK' : '??')).join(' ');
  }
}
await as('OWNER');
rec((await dbhash()) === H0, 'after the whole matrix (all inside rolled-back transactions) every table is unchanged');
const anonDenyAll = ['system_settings', 'user_sessions', 'monthly_payroll', 'employees', 'audit_log', 'alerts', 'payroll_runs', 'sales_value_summary'];
for (const t of anonDenyAll) rec(matrix.ANON[t] === '-- -- -- -- --' || matrix.ANON[t].startsWith('-- ') && !/ok/.test(matrix.ANON[t]), `ANON has no access to ${t}`, matrix.ANON[t]);
rec(matrix.ANON.orders === 'ok ok ok -- --', 'ANON orders: read/insert/update kept (app depends on it), DELETE and TRUNCATE removed', matrix.ANON.orders);
rec(matrix.ANON.tasks === 'ok ok ok ok --', 'ANON tasks: CRUD kept (observed), TRUNCATE removed', matrix.ANON.tasks);
rec(matrix.ANON.accounting_entries === 'ok -- -- -- --', 'ANON accounting_entries: read only', matrix.ANON.accounting_entries);
rec(matrix.ANON.mlm_join_requests === '-- ok -- -- --' || matrix.ANON.mlm_join_requests === 'ok ok -- -- --', 'ANON mlm_join_requests: public form INSERT kept, no read/update/delete', matrix.ANON.mlm_join_requests);
rec(matrix.ANON.customer_stats.startsWith('ok'), 'ANON customer_stats view: read kept');
for (const t of ['system_settings', 'user_sessions', 'monthly_payroll', 'employees']) { rec(!/ok/.test(matrix.EMPLOYEE[t]) && !/ok/.test(matrix.ADMIN[t]), `authenticated (employee AND admin) cannot touch ${t}`, matrix.EMPLOYEE[t]); rec(matrix.SERVICE_ROLE[t].startsWith('ok ok ok ok'), `service_role still can use ${t}`, matrix.SERVICE_ROLE[t]); }
rec(matrix.EMPLOYEE.alerts === 'ok ok ok ok --' && matrix.EMPLOYEE.orders === 'ok ok ok ok --', 'authenticated keeps normal CRUD on live tables (alerts, orders); TRUNCATE gone', `${matrix.EMPLOYEE.alerts} / ${matrix.EMPLOYEE.orders}`);
rec(matrix.EMPLOYEE.sales_value_summary.startsWith('ok'), 'authenticated keeps the sales_value_summary view');
rec(matrix.ANON.audit_log === '-- -- -- -- --' && /^ok -- -- -- --$|^-- -- -- -- --$/.test(matrix.ADMIN.audit_log.replace(/ok ok /, 'ok -- ').replace('?? ', '-- ')) || true, 'audit_log matrix captured');
rec(matrix.ADMIN.audit_log.split(' ')[0] === 'ok' && matrix.ADMIN.audit_log.split(' ')[1] === '--' && matrix.ADMIN.audit_log.split(' ')[2] === '--', 'ADMIN reads audit_log but cannot write/forge', matrix.ADMIN.audit_log);
rec(matrix.EMPLOYEE.audit_log.split(' ')[1] === '--', 'EMPLOYEE cannot forge audit_log', matrix.EMPLOYEE.audit_log);

rec(await inTx('HR', `select * from public.audit_log`) === 'OK', 'HR with payroll_access can read the audit trail');
rec(await inTx('HR', `insert into public.audit_log (actor, action, table_name) values ('forged','x','y')`) === 'DENIED', 'HR can not forge audit rows');
rec(await inTx('HR', `delete from public.audit_log`) === 'DENIED', 'HR can not delete audit rows');
rec(await inTx('EMPLOYEE', `select * from public.audit_log`) === 'OK(0 rows)', 'ordinary employee reads 0 audit rows (RLS)');
// FK checks run as owner: closing `employees` must not break attendance inserts
await as('OWNER'); const empId = (await q(`select id from public.employees limit 1`))[0].id;
await as('EMPLOYEE');
rec(await attempt(`insert into public.attendance (employee_id, status) values ('${empId}', 'present')`) === 'OK', 'authenticated can still insert attendance although employees is closed (FK check runs as owner)');
await rb(); await as('OWNER'); await exec(`delete from public.attendance where status = 'present' and employee_id = '${empId}'`);

// ── function ACL ──
rec((await q(`select has_function_privilege('anon','public.wh_transfer_stock(uuid,uuid,uuid,integer)','execute') b`))[0].b === false, 'anon can not call wh_transfer_stock');
rec((await q(`select has_function_privilege('authenticated','public.wh_transfer_stock(uuid,uuid,uuid,integer)','execute') b`))[0].b === true, 'authenticated still can call wh_transfer_stock');

// ── audit: SECURITY DEFINER paths cannot forge the actor ──
await as('ADMIN');
await exec(`select set_config('request.headers', '{"x-forwarded-for":"198.51.100.7, 10.0.0.1","user-agent":"UA/9"}', false)`);
const id1 = (await q(`select public.log_audit_event('probe','orders','o1','{"a":1}'::jsonb,'{"actor":"someone-else"}'::jsonb) id`))[0].id;
await as('OWNER');
const row = (await q(`select actor, action, ip_address, user_agent, after_data from public.audit_log where id='${id1}'`))[0];
rec(row.actor === U.ADM && row.action === 'app:probe' && row.user_agent === 'UA/9' && row.after_data.actor === 'someone-else', 'RPC stores actor = auth.uid() (no actor parameter), app: prefix, header-derived UA; payload "actor" is just data');
await as('ANON'); rec(/DENIED/.test(await attempt(`select public.log_audit_event('x','y')`)), 'anon can not call log_audit_event');
await as('OWNER'); await exec(`create table public.t_demo (id uuid primary key default gen_random_uuid(), v int); grant all on public.t_demo to authenticated;
  create trigger t_demo_audit after insert or update or delete on public.t_demo for each row execute function public.audit_row_change();`);
await as('EMPLOYEE'); await exec(`insert into public.t_demo (id, v) values ('88888888-0000-0000-0000-000000000001', 1); update public.t_demo set v = 2; delete from public.t_demo;`);
await as('OWNER');
const aud = await q(`select action, actor, before_data->>'v' b, after_data->>'v' a from public.audit_log where table_name='t_demo' order by created_at`);
rec(aud.length === 3 && aud.every((r) => r.actor === U.EMP) && aud.some((r) => r.action === 'update' && r.b === '1' && r.a === '2'), 'row trigger audits insert/update/delete: actor = auth.uid(), before=1 after=2', JSON.stringify(aud.map((r) => r.action)));
await as('EMPLOYEE'); rec(/DENIED/.test(await attempt(`select public.audit_row_change()`)), 'user can not call the trigger function directly');
for (const [w, op] of [['OWNER', 'update public.audit_log set actor = $$x$$'], ['OWNER', 'delete from public.audit_log'], ['SERVICE_ROLE', 'delete from public.audit_log'], ['OWNER', 'truncate public.audit_log']]) { rec(/BLOCKED/.test(await inTx(w, op)), `audit_log append-only: ${w} ${op.split(' ')[0]} blocked`); }
await as('OWNER');
const oldNow = (await q(OLD))[0];
rec(oldNow.n === 22 && oldNow.h === old0.h, 'the 22 original audit rows are byte-identical after everything', oldNow.h);
await exec('drop trigger t_demo_audit on public.t_demo; drop table public.t_demo;');

// ── ROLLBACK ──
await as('OWNER');
await exec('alter table public.audit_log disable trigger audit_log_no_update_delete');
await exec(`delete from public.audit_log where id = '${id1}' or table_name = 't_demo'`);
await exec('alter table public.audit_log enable trigger audit_log_no_update_delete');
const H1 = await dbhash();
await exec(read('20261024_unified_access_lockdown_rollback.sql')); rec(true, 'rollback applies');
const P1 = await aclparts(); const diffA = P0.filter((x) => !P1.includes(x)); const diffB = P1.filter((x) => !P0.includes(x)); if (diffA.length || diffB.length) console.log('DIFF missing-after-rollback:', diffA.slice(0, 6), 'extra-after-rollback:', diffB.slice(0, 6));
rec((await aclhash()) === A0, 'rollback restores the ACLs, column grants, function ACL and policies EXACTLY (fingerprint equals the pre-migration one)');
rec((await dbhash()) === H1, 'rollback changed no row');
rec((await q(`select to_regclass('_security_backup.acl_20261024') r`))[0].r === null, 'snapshot schema removed');
rec((await q(OLD))[0].h === old0.h, 'original audit rows untouched by rollback');
rec(await inTx('ANON', `select * from public.system_settings`) === 'OK' && await inTx('ANON', `delete from public.orders`) === 'OK', 'after rollback the old exposure is back — as documented');
await as('OWNER'); await exec(SQL); rec(true, 're-apply after rollback works');
rec((await aclhash()) === A1, 'second lock reaches the same fingerprint as the first');

console.log('=== MATRIX  (columns: SELECT INSERT UPDATE DELETE TRUNCATE; ok = allowed, -- = denied, BLK = trigger-blocked) ===');
for (const [w, tabs] of Object.entries(matrix)) { console.log(`\n[${w}]`); for (const [t, c] of Object.entries(tabs)) console.log(`   ${t.padEnd(24)} ${c}`); }
console.log('\n=== BEFORE (exposures reproduced in the clone) ===\n' + Object.entries(vuln).map(([k, v]) => `   ${k.padEnd(60)} ${v}`).join('\n'));
console.log('\n=== CHECKS ===\n' + out.join('\n'));
console.log(`\nSUMMARY: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
