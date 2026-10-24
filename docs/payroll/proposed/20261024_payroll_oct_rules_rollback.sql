-- Rollback for 20261024_payroll_oct_rules.
-- Data lost by rolling back: payroll_excluded_reason texts and every entry's allowances_detail
-- (the amounts/currency/rate breakdown). Export them first if you need them:
--   create table payroll_backup_oct_rules_20261024 as select id, allowances_detail from payroll_entries where allowances_detail <> '[]';
drop trigger if exists payroll_runs_zz_consistency_gate on public.payroll_runs;
drop function if exists public.payroll_run_consistency_gate();
drop trigger if exists payroll_entries_sync_run_summary on public.payroll_entries;
drop function if exists public.payroll_sync_run_summary();
alter table public.payroll_entries drop column if exists allowances_detail;
alter table public.profiles drop constraint if exists profiles_excluded_needs_reason;
alter table public.profiles drop column if exists payroll_excluded_reason;
drop function if exists public.payroll_period_is_operational(int, int);
