-- =============================================================
-- Finance staff access to «المصاريف والشحن» (accounting) — 29 Oct 2026
--
-- Cause: 20261028213542 tighten_customer_and_accounting_rls dropped the permissive
-- acc_entries_all / accounting_channels_write_all / acc_cats_all policies. What was left
-- were older policies narrower than the app's own rule:
--   accounting_entries  SELECT/INSERT admin+manager, UPDATE/DELETE admin only
--   accounting_channels SELECT only (nobody could add a source/channel any more)
--   accounting_categories write admin only
-- Measured 29 Oct (rolled-back session simulation): Fadi Jarrouge (hr_manager + view_finance)
-- and Haya (sales_manager) saw 0 of 960 entries; Fadi recorded 130 entries in the 45 days
-- before and none since 27 Oct.
--
-- Fix: the database now follows the SAME rule as the screen (AccountingScreen.jsx canEnter /
-- isAdmin, ProtectedRoute roles OR perm):
--   read + record entries, categories, channels : admin, manager, accountant, sales_manager,
--                                                 or anyone holding view_finance (app_has_permission)
--   edit / void / delete entries, edit/delete channels : admin, manager
--   an employee still reads entries about themself (employee_id = auth.uid()), as before.
-- anon stays fully locked out (no grants; every policy is TO authenticated).
-- Rollback: section at the end of this file.
-- =============================================================

create or replace function public.app_finance_access()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select p.role_type in ('admin', 'manager', 'accountant', 'sales_manager')
           or public.app_has_permission('view_finance')
    from public.profiles p
    where p.id = auth.uid() and p.is_active is not false
  ), false)
$$;

create or replace function public.app_finance_manager()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select p.role_type in ('admin', 'manager')
    from public.profiles p
    where p.id = auth.uid() and p.is_active is not false
  ), false)
$$;

revoke all on function public.app_finance_access()  from public, anon;
revoke all on function public.app_finance_manager() from public, anon;
grant execute on function public.app_finance_access()  to authenticated;
grant execute on function public.app_finance_manager() to authenticated;

-- ── accounting_entries ──────────────────────────────────────────
drop policy if exists acct_select       on public.accounting_entries;
drop policy if exists acct_insert       on public.accounting_entries;
drop policy if exists acct_update_admin on public.accounting_entries;
drop policy if exists acct_delete_admin on public.accounting_entries;

create policy acct_select on public.accounting_entries
  for select to authenticated
  using (employee_id = (select auth.uid()) or public.app_finance_access());

create policy acct_insert on public.accounting_entries
  for insert to authenticated
  with check (public.app_finance_access());

create policy acct_update_finance_manager on public.accounting_entries
  for update to authenticated
  using (public.app_finance_manager())
  with check (public.app_finance_manager());

create policy acct_delete_finance_manager on public.accounting_entries
  for delete to authenticated
  using (public.app_finance_manager());

-- ── accounting_categories (SELECT already open to staff via acct_cat_select; admin keeps acct_cat_write) ──
drop policy if exists acct_cat_insert_finance on public.accounting_categories;
create policy acct_cat_insert_finance on public.accounting_categories
  for insert to authenticated
  with check (public.app_finance_access());

-- ── accounting_channels (SELECT already open via accounting_channels_select_all) ──
drop policy if exists accounting_channels_insert_finance  on public.accounting_channels;
drop policy if exists accounting_channels_update_manager  on public.accounting_channels;
drop policy if exists accounting_channels_delete_manager  on public.accounting_channels;

create policy accounting_channels_insert_finance on public.accounting_channels
  for insert to authenticated
  with check (public.app_finance_access());

create policy accounting_channels_update_manager on public.accounting_channels
  for update to authenticated
  using (public.app_finance_manager())
  with check (public.app_finance_manager());

create policy accounting_channels_delete_manager on public.accounting_channels
  for delete to authenticated
  using (public.app_finance_manager());

-- =============================================================
-- Rollback (restores the state left by 20261028213542):
--   drop policy accounting_channels_insert_finance, accounting_channels_update_manager,
--        accounting_channels_delete_manager on public.accounting_channels;
--   drop policy acct_cat_insert_finance on public.accounting_categories;
--   drop policy acct_select, acct_insert, acct_update_finance_manager, acct_delete_finance_manager on public.accounting_entries;
--   create policy acct_select on public.accounting_entries for select using ((auth.uid() = employee_id) or exists
--     (select 1 from profiles where profiles.id = auth.uid() and profiles.role_type = any (array['admin','manager'])));
--   create policy acct_insert on public.accounting_entries for insert with check (exists
--     (select 1 from profiles where profiles.id = auth.uid() and profiles.role_type = any (array['admin','manager'])));
--   create policy acct_update_admin on public.accounting_entries for update using (exists
--     (select 1 from profiles where profiles.id = auth.uid() and profiles.role_type = 'admin'));
--   create policy acct_delete_admin on public.accounting_entries for delete using (exists
--     (select 1 from profiles where profiles.id = auth.uid() and profiles.role_type = 'admin'));
--   drop function public.app_finance_access(); drop function public.app_finance_manager();
-- =============================================================
