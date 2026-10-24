-- Rollback for 20261024_payroll_runs_delete_guard (removes the trigger and its function; no data involved).
drop trigger if exists payroll_runs_delete_guard on public.payroll_runs;
drop function if exists public.payroll_runs_delete_guard();
