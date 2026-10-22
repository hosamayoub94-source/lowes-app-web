-- Rollback for 20261023_payroll_role_tightening — restores the exact policy
-- definitions read from production on 23/10/2026 (pg_policies).
begin;

drop policy if exists sal_set_select_own on public.employee_salary_settings;
create policy sal_set_select on public.employee_salary_settings for select to public
  using ((auth.uid() = employee_id) or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role_type = any (array['admin','manager','sales_manager'])));
create policy sal_set_insert on public.employee_salary_settings for insert to public
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role_type = 'admin'));
create policy sal_set_update on public.employee_salary_settings for update to public
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role_type = 'admin'));
create policy sal_set_delete on public.employee_salary_settings for delete to public
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role_type = 'admin'));

drop policy if exists pay_runs_legacy_access on public.payroll_runs;
create policy pay_runs_select on public.payroll_runs for select to public
  using ((coalesce(period_year * 100 + period_month, 0) < 202609) and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role_type = any (array['admin','manager','sales_manager'])));
create policy pay_runs_insert on public.payroll_runs for insert to public
  with check ((coalesce(period_year * 100 + period_month, 0) < 202609) and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role_type = 'admin'));
create policy pay_runs_update on public.payroll_runs for update to public
  using ((coalesce(period_year * 100 + period_month, 0) < 202609) and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role_type = 'admin'));

drop policy if exists pay_entries_legacy_access on public.payroll_entries;
drop policy if exists pay_entries_legacy_own on public.payroll_entries;
create policy pay_entries_select on public.payroll_entries for select to public
  using (payroll_run_is_legacy(run_id) and ((auth.uid() = employee_id) or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role_type = any (array['admin','manager','sales_manager']))));
create policy pay_entries_insert on public.payroll_entries for insert to public
  with check (payroll_run_is_legacy(run_id) and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role_type = 'admin'));
create policy pay_entries_update on public.payroll_entries for update to public
  using (payroll_run_is_legacy(run_id) and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role_type = 'admin'));

commit;
