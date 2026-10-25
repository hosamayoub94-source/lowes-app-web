-- 20261026_rbac_primitives.sql  (audit phase 2/3)
-- Database-side RBAC building blocks so RLS policies and SECURITY DEFINER functions can enforce the SAME role model the app uses.
-- Source of truth for defaults = src/data/permissions.js; mirrored in supabase/functions/_shared/rolePermissions.js;
-- this table is seeded from it and test-rbac-sync.mjs fails if any of the three drift.
-- admin = every permission (no rows). Per-user extra_permissions / denied_permissions are read from profiles.
create table if not exists public.app_role_permissions (
  role       text not null,
  permission text not null,
  primary key (role, permission)
);
alter table public.app_role_permissions enable row level security;
revoke all on public.app_role_permissions from anon, authenticated;

insert into public.app_role_permissions (role, permission) values
  ('manager','approve_leaves'),
  ('manager','assign_tasks'),
  ('manager','delete_task'),
  ('manager','edit_task'),
  ('manager','manage_attendance'),
  ('manager','manage_campaigns'),
  ('manager','manage_central_stock'),
  ('manager','manage_guides'),
  ('manager','manage_kpi'),
  ('manager','manage_orders'),
  ('manager','manage_payroll'),
  ('manager','manage_products'),
  ('manager','manage_sales_stock'),
  ('manager','send_whatsapp'),
  ('manager','view_all_attendance'),
  ('manager','view_all_tasks'),
  ('manager','view_analytics'),
  ('manager','view_campaign_cost'),
  ('manager','view_finance'),
  ('manager','view_inventory'),
  ('manager','view_media_buyer_board'),
  ('media_buyer','assign_tasks'),
  ('media_buyer','delete_task'),
  ('media_buyer','edit_task'),
  ('media_buyer','manage_campaigns'),
  ('media_buyer','manage_orders'),
  ('media_buyer','view_all_tasks'),
  ('media_buyer','view_analytics'),
  ('media_buyer','view_campaign_cost'),
  ('media_buyer','view_media_buyer_board'),
  ('sales_manager','assign_tasks'),
  ('sales_manager','delete_task'),
  ('sales_manager','edit_task'),
  ('sales_manager','manage_campaigns'),
  ('sales_manager','manage_kpi'),
  ('sales_manager','manage_orders'),
  ('sales_manager','manage_products'),
  ('sales_manager','view_all_attendance'),
  ('sales_manager','view_all_tasks'),
  ('sales_manager','view_analytics'),
  ('sales_manager','view_inventory'),
  ('sales_manager','view_media_buyer_board'),
  ('social_manager','assign_tasks'),
  ('social_manager','delete_task'),
  ('social_manager','edit_task'),
  ('social_manager','manage_campaigns'),
  ('social_manager','view_all_attendance'),
  ('social_manager','view_all_tasks'),
  ('social_manager','view_media_buyer_board'),
  ('accountant','manage_payroll'),
  ('accountant','view_finance'),
  ('hr_manager','approve_leaves'),
  ('hr_manager','manage_payroll'),
  ('hr_manager','view_all_attendance'),
  ('warehouse_manager','manage_central_stock'),
  ('warehouse_manager','manage_sales_stock'),
  ('warehouse_manager','view_inventory'),
  ('marketing_manager','manage_campaigns'),
  ('marketing_manager','view_all_tasks'),
  ('marketing_manager','view_analytics'),
  ('marketing_manager','view_campaign_cost'),
  ('marketing_manager','view_media_buyer_board')
on conflict do nothing;

-- Who is calling? 'service' (service_role JWT) | 'db' (direct DB connection, no JWT: SQL editor / pg_cron / migrations) | 'anon' | 'authenticated'
create or replace function public.app_caller_kind()
 returns text language sql stable
 set search_path = public, pg_temp
as $$
  select case
    when coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'service_role' then 'service'
    when coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'authenticated' then 'authenticated'
    when coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'anon' then 'anon'
    when current_setting('role', true) in ('anon', 'authenticated') then current_setting('role', true)
    else 'db'
  end
$$;

create or replace function public.app_profile_ok()
 returns boolean language sql stable security definer
 set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active is not false)
$$;

create or replace function public.app_role()
 returns text language sql stable security definer
 set search_path = public, pg_temp
as $$
  select p.role_type from public.profiles p where p.id = auth.uid() and p.is_active is not false
$$;

create or replace function public.app_has_permission(p_permission text)
 returns boolean language sql stable security definer
 set search_path = public, pg_temp
as $$
  select coalesce((
    select case
      when p.role_type = 'admin' then true
      when p.denied_permissions ? p_permission then false
      when p.extra_permissions ? p_permission then true
      else exists (select 1 from public.app_role_permissions r where r.role = p.role_type and r.permission = p_permission)
    end
    from public.profiles p where p.id = auth.uid() and p.is_active is not false
  ), false)
$$;

-- Guard helpers for SECURITY DEFINER functions: raise unless the caller is trusted (service/db) or a qualifying signed-in user.
create or replace function public.app_require_authenticated()
 returns void language plpgsql stable
 set search_path = public, pg_temp
as $$
begin
  if public.app_caller_kind() in ('service', 'db') then return; end if;
  if auth.uid() is null or not public.app_profile_ok() then
    raise exception 'authentication required' using errcode = '28000';
  end if;
end
$$;

create or replace function public.app_require_permission(p_permissions text[])
 returns void language plpgsql stable
 set search_path = public, pg_temp
as $$
begin
  if public.app_caller_kind() in ('service', 'db') then return; end if;
  if auth.uid() is null or not public.app_profile_ok() then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (select 1 from unnest(p_permissions) x where public.app_has_permission(x)) then
    raise exception 'insufficient privilege' using errcode = '42501';
  end if;
end
$$;

revoke all on function public.app_caller_kind(), public.app_profile_ok(), public.app_role(), public.app_has_permission(text),
  public.app_require_authenticated(), public.app_require_permission(text[]) from public, anon;
grant execute on function public.app_caller_kind(), public.app_profile_ok(), public.app_role(), public.app_has_permission(text),
  public.app_require_authenticated(), public.app_require_permission(text[]) to authenticated, service_role;
