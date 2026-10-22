-- =====================================================================
-- PROPOSED — NOT APPLIED. Requires explicit owner approval before running.
-- 20261023_payroll_role_tightening
--
-- Problem (proven 23/10/2026 by a rolled-back role simulation on production):
--   • sales_manager / manager WITHOUT payroll_access read all 28 rows of
--     employee_salary_settings and the 6 legacy payroll_runs (+ their entries).
--   • an admin WITHOUT payroll_access can UPDATE all 28 salary settings
--     (legacy policy sal_set_update = any admin), bypassing payroll_access.
-- Fix: payroll data is governed by payroll_has_access() only. The single
-- non-access exception kept: an employee reads their OWN salary row / own
-- legacy payroll entries.
--
-- Not touched: payroll_new_system policies (runs/entries >= 2026-09),
-- salary_settings_payroll_access, payroll_absence_reviews, payroll_allowances,
-- payroll_access itself, any data row.
-- Rollback: 20261023_payroll_role_tightening_rollback.sql
-- =====================================================================
begin;

-- employee_salary_settings: drop legacy role-based policies
drop policy if exists sal_set_select on public.employee_salary_settings;
drop policy if exists sal_set_insert on public.employee_salary_settings;
drop policy if exists sal_set_update on public.employee_salary_settings;
drop policy if exists sal_set_delete on public.employee_salary_settings;
-- salary_settings_payroll_access (ALL, payroll_has_access()) stays as the writer policy.
create policy sal_set_select_own on public.employee_salary_settings
  for select to authenticated
  using (employee_id = auth.uid());

-- legacy payroll_runs (< 2026-09): read/write only with payroll_access
drop policy if exists pay_runs_select on public.payroll_runs;
drop policy if exists pay_runs_insert on public.payroll_runs;
drop policy if exists pay_runs_update on public.payroll_runs;
create policy pay_runs_legacy_access on public.payroll_runs
  for all to authenticated
  using (coalesce(period_year * 100 + period_month, 0) < 202609 and payroll_has_access())
  with check (coalesce(period_year * 100 + period_month, 0) < 202609 and payroll_has_access());

-- legacy payroll_entries: payroll_access, or the employee's own line (read only)
drop policy if exists pay_entries_select on public.payroll_entries;
drop policy if exists pay_entries_insert on public.payroll_entries;
drop policy if exists pay_entries_update on public.payroll_entries;
create policy pay_entries_legacy_access on public.payroll_entries
  for all to authenticated
  using (payroll_run_is_legacy(run_id) and payroll_has_access())
  with check (payroll_run_is_legacy(run_id) and payroll_has_access());
create policy pay_entries_legacy_own on public.payroll_entries
  for select to authenticated
  using (payroll_run_is_legacy(run_id) and employee_id = auth.uid());

commit;

-- ---------------------------------------------------------------------
-- OPTIONAL, SEPARATE STEP — grant payroll access to named Accountant / HR.
-- Production has NO profile with role accountant or hr_manager today
-- (roles: admin 3, manager 3, sales_manager 1, employee 26, media_buyer 1,
-- social_manager 1, warehouse_manager 1). Nobody is granted automatically.
-- Fill the UUIDs only after the owner names the people:
--
-- insert into public.payroll_access (profile_id, can_finalize, note) values
--   ('<ACCOUNTANT_PROFILE_UUID>', false, 'Accountant — prepare/recalculate, no approve/pay'),
--   ('<HR_PROFILE_UUID>',         false, 'HR — absence decisions + recalculate, no approve/pay')
-- on conflict (profile_id) do nothing;
-- can_finalize=true ONLY by explicit owner decision (approve / mark paid / reopen).
-- ---------------------------------------------------------------------
