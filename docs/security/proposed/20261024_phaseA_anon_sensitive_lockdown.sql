-- =====================================================================
-- PROPOSED — NOT APPLIED. Requires the owner's explicit approval.
-- 20261024_phaseA_anon_sensitive_lockdown   (production-scoped subset of 20261024_unified_access_lockdown)
--
-- Scope = ONLY what the owner approved in principle on 24 Oct 2026:
--   "close anon on the sensitive tables", with snapshot + rollback + RLS tests + audit rows unchanged.
--   • anon only: no authenticated privilege on any data table is changed
--   • no policy on any data table is changed; no row is read, changed or deleted
--   • payroll / finance / orders data are NOT touched (grants only)
--   • audit_log is included because it is open to anon AND nothing uses it (22 old rows are preserved)
--
-- Evidence (read-only): the 52 tables below are exposed to anon AND had ZERO token-less requests in the
-- API logs of 12 sampled days (12–23 Oct 2026) AND are not used through the anon client in the code base.
-- Tables the app really uses without a JWT (orders, tasks, profiles reads, ...) are NOT here.
--
-- 1 snapshot ACLs (+ column ACLs)   2 remove anon-only never-needed privileges (TRUNCATE/REFERENCES/TRIGGER/MAINTAIN)
-- 3 revoke ALL from anon on the 52 sensitive tables   4 audit_log lockdown (see 20261024_audit_log_lockdown.sql)
-- RE-RUNNABLE. Rollback: 20261024_phaseA_anon_sensitive_lockdown_rollback.sql replays the snapshot.
-- =====================================================================
begin;

-- 1) snapshot (taken once) ---------------------------------------------------------------
create schema if not exists _security_backup;
revoke all on schema _security_backup from public, anon, authenticated;
create table if not exists _security_backup.acl_phasea_20261024 (
  obj text not null, kind text not null, col text not null default '', grantee text not null, privilege text not null, grantable boolean not null,
  primary key (obj, kind, col, grantee, privilege));
create table if not exists _security_backup.meta_phasea_20261024 (k text primary key, v text);
revoke all on _security_backup.acl_phasea_20261024, _security_backup.meta_phasea_20261024 from public, anon, authenticated;

do $snap$
begin
  if not exists (select 1 from _security_backup.meta_phasea_20261024 where k = 'snapshot_taken') then
    insert into _security_backup.acl_phasea_20261024 (obj, kind, grantee, privilege, grantable)
    select format('%I.%I', n.nspname, c.relname), 'r',
           case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end, a.privilege_type, a.is_grantable
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm');

    insert into _security_backup.acl_phasea_20261024 (obj, kind, col, grantee, privilege, grantable)
    select format('%I.%I', n.nspname, c.relname), 'c', at.attname,
           case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end, a.privilege_type, a.is_grantable
    from pg_attribute at join pg_class c on c.oid = at.attrelid join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(at.attacl) a
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') and at.attnum > 0 and not at.attisdropped and at.attacl is not null;

    insert into _security_backup.meta_phasea_20261024 values ('snapshot_taken', now()::text);
  end if;
end $snap$;

-- 2) privileges the REST API never needs, anon only -----------------------------------------
do $glob$
declare r record;
begin
  for r in select format('%I.%I', n.nspname, c.relname) as obj
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') loop
    execute format('revoke truncate, references, trigger on table %s from anon', r.obj);
    if current_setting('server_version_num')::int >= 170000 then
      execute format('revoke maintain on table %s from anon', r.obj);
    end if;
  end loop;
end $glob$;

-- 3) sensitive tables: anon loses everything --------------------------------------------------
do $sens$
declare t text;
begin
  foreach t in array array[
   'monthly_payroll', 'daily_sales_reports', 'sales_orders', 'purchase_orders',
   'finance_ledger_migrated_20260607', 'mystery_shopper', 'commissions', 'customer_contacts', 'customers',
   'daily_sales_ad_results', 'delivery_results', 'leads', 'monthly_sales_records', 'product_variants',
   'report_other_sales', 'shipments', 'expenses', 'income', 'price_violations', 'purchase_order_items',
   'sales_notes', 'sales_order_items', 'warehouses', 'ad_results', 'advance_requests', 'bonus_settings',
   'bonuses', 'customer_notes', 'deal_activities', 'deals', 'employee_kpis', 'employee_requests', 'employees',
   'followups', 'leave_balances', 'otp_codes', 'performance_scores', 'requests', 'salary_deductions',
   'stock_movements', 'user_sessions', 'app_settings', 'backup_log', 'commission_config', 'exchange_rates',
   'messages', 'network_audit', 'push_subscriptions', 'sales_targets', 'sales_value_summary',
   'system_settings', 'wh_stock'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from anon', t);
    end if;
  end loop;
end $sens$;

-- 4) audit_log ------------------------------------------------------------------------------------
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

insert into _security_backup.meta_phasea_20261024 values ('applied_at', now()::text)
  on conflict (k) do update set v = excluded.v;

commit;
