-- =====================================================================
-- PROPOSED — NOT APPLIED. Requires the owner's explicit approval.
-- 20261024_unified_access_lockdown   (supersedes 20261024_audit_log_lockdown.sql — block 5 is that file)
--
-- Evidence (all READ-ONLY on production, 24 Oct 2026):
--   • 194 tables + 2 views in public, RLS on for all, but ~130 objects carry `USING (true)` policies
--     for role public, i.e. anonymous internet users can read/write/delete them.
--   • Real API traffic (edge_logs, 12 sampled days 12–23 Oct): the app DOES use token-less (anon)
--     requests for ~50 tables (legacy PIN sessions without a Supabase JWT). Closing those would break
--     the app, so they are on the ALLOW list below with only the operations actually observed.
--   • ~85 other exposed objects had ZERO anon requests; 19 sensitive/legacy tables had zero requests
--     from ANY role in 6 sampled days and nothing in the database depends on them.
--
-- What this migration does (NO row is read, changed or deleted; no policy on a data table is changed):
--   1  snapshot every public table/view ACL (+ the one function touched) into _security_backup
--   2  remove the never-needed privileges TRUNCATE / REFERENCES / TRIGGER (/ MAINTAIN on PG17)
--      from anon and authenticated on every public table and view
--   3  anon: default-deny. Every table/view loses SELECT/INSERT/UPDATE/DELETE for anon EXCEPT the
--      operations on the ALLOW list (strictly REDUCTIVE: never grants anything that was not held)
--   4  authenticated: full close of 19 dead sensitive tables (+ employees, which holds PINs):
--      payroll_legacy, passwords/PINs in system_settings, session tokens, OTP codes, legacy finance...
--   5  audit_log lockdown: open policy removed, append-only triggers, write only via SECURITY DEFINER
--      paths (actor = auth.uid()), read for is_admin_user() OR payroll_has_access()
--   6  wh_transfer_stock(): EXECUTE removed from anon/PUBLIC (only authenticated used it)
-- service_role and the table owner are never touched.
--
-- RE-RUNNABLE (idempotent). Rollback: 20261024_unified_access_lockdown_rollback.sql replays the
-- snapshot taken in step 1, so the ACLs come back exactly as they were.
--
-- NOT covered here (needs app/code changes — see the report): the ALLOW-listed tables remain
-- readable/writable by token-less clients; every logged-in employee can still reach most tables
-- (`authenticated` policies are `true`); storage.objects policies (public upload/delete on buckets).
-- =====================================================================
begin;

-- 1) snapshot (taken once; a re-run keeps the pristine one) --------------------------
create schema if not exists _security_backup;
revoke all on schema _security_backup from public, anon, authenticated;
create table if not exists _security_backup.acl_20261024 (
  obj text not null, kind text not null, col text not null default '', grantee text not null, privilege text not null, grantable boolean not null,
  primary key (obj, kind, col, grantee, privilege));
create table if not exists _security_backup.meta_20261024 (k text primary key, v text);
revoke all on _security_backup.acl_20261024, _security_backup.meta_20261024 from public, anon, authenticated;

do $snap$
begin
  if not exists (select 1 from _security_backup.meta_20261024 where k = 'snapshot_taken') then
    insert into _security_backup.acl_20261024 (obj, kind, grantee, privilege, grantable)
    select format('%I.%I', n.nspname, c.relname), 'r',
           case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end, a.privilege_type, a.is_grantable
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm');

    -- column-level privileges (profiles keeps SELECT/UPDATE for anon ONLY at column level)
    insert into _security_backup.acl_20261024 (obj, kind, col, grantee, privilege, grantable)
    select format('%I.%I', n.nspname, c.relname), 'c', at.attname,
           case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end, a.privilege_type, a.is_grantable
    from pg_attribute at join pg_class c on c.oid = at.attrelid join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(at.attacl) a
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') and at.attnum > 0 and not at.attisdropped and at.attacl is not null;

    insert into _security_backup.acl_20261024 (obj, kind, grantee, privilege, grantable)
    select p.oid::regprocedure::text, 'f',
           case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end, a.privilege_type, a.is_grantable
    from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.pronamespace = 'public'::regnamespace and p.proname = 'wh_transfer_stock';

    insert into _security_backup.meta_20261024 values ('snapshot_taken', now()::text);
  end if;
end $snap$;

-- 2) privileges the REST API never needs ---------------------------------------------
do $glob$
declare r record;
begin
  for r in select format('%I.%I', n.nspname, c.relname) as obj
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') loop
    execute format('revoke truncate, references, trigger on table %s from anon, authenticated', r.obj);
    if current_setting('server_version_num')::int >= 170000 then
      execute format('revoke maintain on table %s from anon, authenticated', r.obj);
    end if;
  end loop;
end $glob$;

-- 3) anon: default deny, keep only what real traffic used ---------------------------------
-- ops: R=select I=insert U=update D=delete. Source: edge_logs 12–23 Oct 2026 (non-OPTIONS, no user JWT).
-- POST implies I+U (PostgREST upsert); PATCH implies R+U (filters need SELECT); INSERT-only tables keep R
-- so `return=representation` keeps working. mlm_join_requests: public join form (assumed, unobserved).
create temp table _anon_allow (tbl text primary key, ops text not null) on commit drop;
insert into _anon_allow (tbl, ops) values
 ('orders','RIU'), ('attendance','RIU'), ('attendance_records','R'), ('profiles','RU'), ('notifications','RIU'),
 ('tasks','RIUD'), ('task_activity','RIU'), ('task_comments','R'), ('task_points','RIU'), ('announcements','R'),
 ('shift_partners','RU'), ('shift_groups','R'), ('shift_schedule','R'), ('commission_rules','R'), ('leave_requests','R'),
 ('lozy_chats','R'), ('customer_stats','R'), ('products','R'), ('accounting_channels','R'), ('accounting_entries','R'),
 ('inventory_daily_log','RIU'), ('wh_movements','RIU'), ('wh_warehouses','R'), ('daily_reports','RIU'), ('campaigns','R'),
 ('campaign_ads','R'), ('campaign_sends','R'), ('report_ad_results','RIUD'), ('report_source_results','RIUD'),
 ('report_source_platforms','R'), ('product_economics','R'), ('product_name_map','R'), ('referral_codes','R'),
 ('quiz_certifications','R'), ('quiz_questions','R'), ('activity_logs','RI'), ('order_status_history','RIU'),
 ('project_members','R'), ('performance_reviews','R'), ('syria_b2b_leads','RIUD'), ('app_guides','R'),
 ('chat_room_members','RIU'), ('chat_join_requests','R'), ('chat_reactions','R'), ('chat_pinned','R'),
 ('chat_messages','R'), ('chat_last_read','RIU'), ('chat_rooms','R'), ('crm_visits','R'), ('mlm_join_requests','I');

do $anon$
declare r record; a text; p text; code text;
begin
  for r in select format('%I.%I', n.nspname, c.relname) as obj, c.relname as tbl
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') loop
    select ops into a from _anon_allow where tbl = r.tbl;
    a := coalesce(a, '');
    foreach p in array array['select', 'insert', 'update', 'delete'] loop
      code := case p when 'select' then 'R' when 'insert' then 'I' when 'update' then 'U' else 'D' end;
      if position(code in a) = 0 then
        execute format('revoke %s on table %s from anon', p, r.obj);
      end if;
    end loop;
  end loop;
end $anon$;

-- 4) authenticated: close dead sensitive tables (zero API traffic from any role in 6 sampled days;
--    no policy, function or view depends on them; FK checks run as owner so they are unaffected)
do $dead$
declare t text;
begin
  foreach t in array array[
    'monthly_payroll', 'salary_deductions', 'bonuses', 'bonus_settings', 'finance_ledger_migrated_20260607',
    'user_sessions', 'otp_codes', 'expenses', 'income', 'commissions', 'backup_log', 'ad_results',
    'performance_scores', 'delivery_results', 'monthly_sales_records', 'report_other_sales', 'price_violations',
    'system_settings', 'app_settings',
    'employees'   -- holds `pin`; only legacy employeeService.js reads it, no request in the sampled days.
                  -- If an admin screen still needs it, delete this line and use a column-level grant instead.
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $dead$;

-- 4b) profiles: token-less (anon) requests may PATCH self-service columns only -------------------
-- Production today: anon holds column-level UPDATE on almost every profiles column, with policy
-- "ALL USING true" => any anonymous request can change role_type, base_salary_usd (the payroll salary
-- source), is_active, password, permissions... INSERT is removed by step 3 (profiles ops = RU).
-- Self-service columns (job_title, phone, bio, avatar_url, face_*, total_points, last_login_at ...) keep working.
-- If an admin still edits users from a PIN session WITHOUT a Supabase JWT, that screen will get
-- "permission denied" until the admin signs in with a JWT. To skip this hardening delete this block.
revoke update (id, auth_id, role_type, is_active, password, base_salary_usd, housing_allowance_usd, transport_allowance_usd,
               commission_pct, salary_currency, payroll_commission_exempt, extra_permissions, denied_permissions,
               manager_scope, employment_status, resigned_at, resign_reason, admin_notes, wallet_balance,
               order_role, order_market, seller_type, rep_level, mlm_rank, sponsor_id, recruiter_id, invite_code,
               qr_token, blob_user_id, hire_date, join_date, created_at, team, seller_alias)
  on public.profiles from anon;

-- 5) audit_log (see 20261024_audit_log_lockdown.sql for the rationale and tests) --------
drop policy if exists allow_all_anon_aul on public.audit_log;
alter table public.audit_log enable row level security;
revoke all on public.audit_log from public, anon, authenticated;
grant select on public.audit_log to authenticated;
drop policy if exists audit_log_read_authorised on public.audit_log;
create policy audit_log_read_authorised on public.audit_log
  for select to authenticated using (public.is_admin_user() or public.payroll_has_access());

create or replace function public.audit_log_append_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'سجل التدقيق للإضافة فقط — لا تعديل ولا حذف.' using errcode = 'insufficient_privilege';
end $$;
revoke all on function public.audit_log_append_only() from public, anon, authenticated;
drop trigger if exists audit_log_no_update_delete on public.audit_log;
create trigger audit_log_no_update_delete before update or delete on public.audit_log
  for each row execute function public.audit_log_append_only();
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_append_only();

create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  insert into public.audit_log (actor, action, table_name, record_id, before_data, after_data)
  values (coalesce(auth.uid()::text, 'system'), lower(tg_op), tg_table_name, r ->> 'id',
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.audit_row_change() from public, anon, authenticated;

create or replace function public.log_audit_event(
  p_action text, p_table_name text, p_record_id text default null,
  p_before jsonb default null, p_after jsonb default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_id uuid; h jsonb;
begin
  if v_uid is null then
    raise exception 'تسجيل التدقيق يتطلب مستخدماً مسجّلاً.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_action), '') = '' or coalesce(btrim(p_table_name), '') = '' then
    raise exception 'الإجراء واسم الجدول مطلوبان.';
  end if;
  begin h := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then h := null; end;
  insert into public.audit_log (actor, action, table_name, record_id, before_data, after_data, ip_address, user_agent)
  values (v_uid::text, 'app:' || left(btrim(p_action), 60), left(btrim(p_table_name), 128), left(p_record_id, 128),
          p_before, p_after,
          nullif(btrim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), ''), left(h ->> 'user-agent', 300))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.log_audit_event(text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.log_audit_event(text, text, text, jsonb, jsonb) to authenticated;

-- 6) one mutating RPC that anonymous callers never used -------------------------------------
do $fn$
begin
  if to_regprocedure('public.wh_transfer_stock(uuid,uuid,uuid,integer)') is not null then
    revoke all on function public.wh_transfer_stock(uuid, uuid, uuid, integer) from public, anon;
    grant execute on function public.wh_transfer_stock(uuid, uuid, uuid, integer) to authenticated, service_role;
  end if;
end $fn$;

insert into _security_backup.meta_20261024 values ('applied_at', now()::text)
  on conflict (k) do update set v = excluded.v;

commit;
