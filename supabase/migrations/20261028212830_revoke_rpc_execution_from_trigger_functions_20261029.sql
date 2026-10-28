-- Trigger functions are invoked by their attached triggers, not through the Data API.
-- Remove direct execution rights from API roles and PUBLIC while preserving trigger behavior.
REVOKE EXECUTE ON FUNCTION public.assign_order_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.employee_salary_settings_log_fn() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_create_advance_entry_on_approval() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_deduct_leave_on_approval() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_commission() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_network_join() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.payroll_guard_profile_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.payroll_run_consistency_gate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.payroll_sync_run_summary() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profitability_guard_closed_month() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tasks_track_status_after() FROM PUBLIC, anon, authenticated;
