-- 20261030_d175_close_write_holes.sql  (D-175, stage A — APPLIED to production 2026-10-30 as migration d175_close_write_holes, on the owner's explicit approval)
-- Closes write access that should never have been open on the four tables that feed commission, FX display and delivery dates:
--   commission_rules, monthly_commission_adjustments, exchange_rates, order_status_history.
-- Reads are deliberately NOT touched here (manual-session accounts may still read as anon; that is the existing F-01 batch B1/B2 work).
-- Exact rollback: 20261030_d175_close_write_holes_rollback.sql
-- Pre-conditions (all verified read-only on 2026-10-30): helpers public.current_role_type() and public.auth_is_active_staff() exist;
-- the only app writers are: exchange_rates <- AdminSettingsScreen (admin) ; commission_rules <- OrdersScreen editor (manager/admin/sales_manager) ;
-- order_status_history <- recordStatusChange (INSERT only) ; monthly_commission_adjustments <- none since D-174 ; edge functions use SB_SECRET_KEY (bypass RLS).

-- ───────────── order_status_history: append-only for signed-in staff ─────────────
drop policy if exists osh_all on public.order_status_history;
drop policy if exists osh_select_staff on public.order_status_history;
drop policy if exists osh_insert_staff on public.order_status_history;
create policy osh_select_staff on public.order_status_history for select to authenticated using ((select public.auth_is_active_staff()));
create policy osh_insert_staff on public.order_status_history for insert to authenticated with check ((select public.auth_is_active_staff()));
revoke update, delete, truncate, references, trigger on public.order_status_history from authenticated;
revoke all on public.order_status_history from anon;

-- ───────────── exchange_rates: append-only, admin inserts only (exchange_rates_insert already exists and is admin-only) ─────────────
drop policy if exists exrates_all on public.exchange_rates;
revoke update, delete, truncate, references, trigger on public.exchange_rates from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.exchange_rates from anon;

-- ───────────── commission_rules: write only for the roles the editor already allows ─────────────
drop policy if exists "admin write commission_rules" on public.commission_rules;
drop policy if exists commission_rules_insert_managers on public.commission_rules;
drop policy if exists commission_rules_update_managers on public.commission_rules;
create policy commission_rules_insert_managers on public.commission_rules for insert to authenticated
  with check ((select public.current_role_type()) in ('admin', 'manager', 'sales_manager'));
create policy commission_rules_update_managers on public.commission_rules for update to authenticated
  using ((select public.current_role_type()) in ('admin', 'manager', 'sales_manager'))
  with check ((select public.current_role_type()) in ('admin', 'manager', 'sales_manager'));
revoke delete, truncate, references, trigger on public.commission_rules from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.commission_rules from anon;

-- ───────────── monthly_commission_adjustments: admin only (no UI writer remains after D-174) ─────────────
drop policy if exists "admin write adjustments" on public.monthly_commission_adjustments;
drop policy if exists mca_insert_admin on public.monthly_commission_adjustments;
drop policy if exists mca_update_admin on public.monthly_commission_adjustments;
create policy mca_insert_admin on public.monthly_commission_adjustments for insert to authenticated
  with check ((select public.current_role_type()) = 'admin');
create policy mca_update_admin on public.monthly_commission_adjustments for update to authenticated
  using ((select public.current_role_type()) = 'admin') with check ((select public.current_role_type()) = 'admin');
revoke delete, truncate, references, trigger on public.monthly_commission_adjustments from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.monthly_commission_adjustments from anon;
