-- =====================================================================
-- PROPOSED — NOT APPLIED. SEPARATE DECISION from phase A (it can affect one admin workflow).
-- 20261024_phaseA2_profiles_anon_columns
--
-- Production today (read-only proof): anon has table-level INSERT on public.profiles and COLUMN-level
-- UPDATE on almost every column (role_type, base_salary_usd, is_active, password, team, join_date ...),
-- while the policies are "ALL USING (true)". Any request without a login can change a role or the
-- base salary that the payroll engine uses. Anon SELECT of the columns the app reads is NOT touched.
--
-- Effect: anon loses INSERT and UPDATE on the privilege-bearing columns only; self-service columns
-- (job_title, phone, bio, avatar_url, face_*, total_points, last_login_at ...) keep working.
-- authenticated is not changed (admin screens with a JWT keep working).
-- Possible impact: an admin who edits users from a PIN session WITHOUT a Supabase JWT will get
-- "permission denied" until they sign in with a JWT.
-- No row is read or changed. Rollback: 20261024_phaseA2_profiles_anon_columns_rollback.sql
-- =====================================================================
begin;

create schema if not exists _security_backup;
revoke all on schema _security_backup from public, anon, authenticated;
create table if not exists _security_backup.acl_profiles_20261024 (
  obj text not null, kind text not null, col text not null default '', grantee text not null, privilege text not null, grantable boolean not null,
  primary key (obj, kind, col, grantee, privilege));
create table if not exists _security_backup.meta_profiles_20261024 (k text primary key, v text);
revoke all on _security_backup.acl_profiles_20261024, _security_backup.meta_profiles_20261024 from public, anon, authenticated;

do $snap$
begin
  if not exists (select 1 from _security_backup.meta_profiles_20261024 where k = 'snapshot_taken') then
    insert into _security_backup.acl_profiles_20261024 (obj, kind, grantee, privilege, grantable)
    select 'public.profiles', 'r', case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end, a.privilege_type, a.is_grantable
    from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where c.oid = 'public.profiles'::regclass;
    insert into _security_backup.acl_profiles_20261024 (obj, kind, col, grantee, privilege, grantable)
    select 'public.profiles', 'c', at.attname, case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end, a.privilege_type, a.is_grantable
    from pg_attribute at cross join lateral aclexplode(at.attacl) a
    where at.attrelid = 'public.profiles'::regclass and at.attnum > 0 and not at.attisdropped and at.attacl is not null;
    insert into _security_backup.meta_profiles_20261024 values ('snapshot_taken', now()::text);
  end if;
end $snap$;

revoke insert on table public.profiles from anon;
revoke update (id, auth_id, role_type, is_active, password, base_salary_usd, housing_allowance_usd, transport_allowance_usd,
               commission_pct, salary_currency, payroll_commission_exempt, extra_permissions, denied_permissions,
               manager_scope, employment_status, resigned_at, resign_reason, admin_notes, wallet_balance,
               order_role, order_market, seller_type, rep_level, mlm_rank, sponsor_id, recruiter_id, invite_code,
               qr_token, blob_user_id, hire_date, join_date, created_at, team, seller_alias)
  on public.profiles from anon;

insert into _security_backup.meta_profiles_20261024 values ('applied_at', now()::text)
  on conflict (k) do update set v = excluded.v;
commit;
