-- 20261027_unused_sensitive_tables.sql  (audit F-01/F-02, batch "u1")
-- 17 tables that hold payroll / commission / OTP / session / settings data and that NOTHING in this application reads or writes:
--   * no reference in src/, supabase/functions/ or google-apps-script/ (checked 2026-10-25),
--   * zero REST requests in the Supabase gateway logs for the last 24 h,
--   * only reachable today through the open `Allow all` policies by anon and by every signed-in employee.
-- Both API roles lose all table privileges (service_role / postgres are untouched, RLS policies are untouched, no data is changed).
-- If an external tool turns out to use one of them, restore it with:  select public.security_restore_role('u1', 'anon');  (and 'authenticated').
select public.security_revoke_role('u1', 'anon',          array['ad_results','app_settings','backup_log','bonus_settings','bonuses','commissions','delivery_results','expenses','finance_ledger_migrated_20260607','monthly_payroll','monthly_sales_records','otp_codes','performance_scores','report_other_sales','salary_deductions','system_settings','user_sessions']);
select public.security_revoke_role('u1', 'authenticated', array['ad_results','app_settings','backup_log','bonus_settings','bonuses','commissions','delivery_results','expenses','finance_ledger_migrated_20260607','monthly_payroll','monthly_sales_records','otp_codes','performance_scores','report_other_sales','salary_deductions','system_settings','user_sessions']);
