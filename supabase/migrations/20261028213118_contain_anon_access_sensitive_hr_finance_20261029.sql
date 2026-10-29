-- Backfilled 29 Oct 2026 from production supabase_migrations.schema_migrations (version 20261028213118).
-- Already applied to fghdumrgimoeqsafdhhh on 28 Oct 2026 21:31 UTC; this file only records it in the repo. Text is verbatim.
DO $block$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounting_categories','accounting_channels','accounting_entries','activity_logs',
    'attendance','attendance_events','attendance_records','break_sessions',
    'employee_salary_settings','employee_salary_settings_log','invoices',
    'leave_requests','salary_deductions','monthly_payroll','payroll_runs',
    'payroll_entries','payroll_access','advance_requests','salary_settings',
    'employee_requests','performance_reviews','salary_advances','salary_payments'
  ] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', t);
    END IF;
  END LOOP;
END
$block$;
