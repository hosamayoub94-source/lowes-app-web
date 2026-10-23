-- ROLLBACK for 20261023_payroll_server_hardening — PROPOSED, NOT APPLIED.
-- Triggers/functions added by the hardening file are dropped. payroll_approve_run must be
-- restored from the production definition saved BEFORE applying (pg_get_functiondef backup).
begin;
drop trigger if exists payroll_runs_historical_lock on public.payroll_runs;
drop trigger if exists payroll_entries_historical_lock on public.payroll_entries;
drop trigger if exists payroll_entries_audit on public.payroll_entries;
drop trigger if exists payroll_absence_reviews_audit on public.payroll_absence_reviews;
drop trigger if exists payroll_allowances_audit on public.payroll_allowances;
drop trigger if exists payroll_access_audit on public.payroll_access;
drop function if exists public.payroll_historical_runs_lock();
drop function if exists public.payroll_historical_entries_lock();
drop function if exists public.payroll_audit_fn();
-- keep payroll_period_is_historical: payroll_approve_run (new version) references it until restored.
-- Then restore the saved payroll_approve_run definition and finally:
-- drop function if exists public.payroll_period_is_historical(int, int);
commit;
