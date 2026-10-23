-- =====================================================================
-- PROPOSED — NOT APPLIED. Requires explicit owner approval before running.
-- 20261023_hosam_exclude_from_payroll
--
-- Owner decision (Hosam, 23/10/2026): hosam ayoub is excluded from payroll.
-- Effect:
--   1. profiles.payroll_excluded = true for hosam ayoub (a68d72e4…)
--      -> the engine and the HR absence panel ignore him from now on.
--   2. his MANUAL zero entry (a3c812e1…) is removed from the September 2026
--      DRAFT run (0d65a1ec…). That entry blocked approval ("1 موظف بلا راتب").
-- Untouched: the other 33 September entries, any approved/paid run, salary
-- settings, payroll_access (he keeps his access/can_finalize), his profile data.
-- Net total of the run does not change (the removed entry was 0).
--
-- Safety: backups first (RLS on, no grants to anon/authenticated); every
-- statement asserts exactly 1 affected row or the whole transaction aborts.
-- Dry-run on production (rolled back) 23/10/2026: entries 34 -> 33,
-- net 4698.90 -> 4698.90, other 33 entries byte-identical.
-- Rollback: 20261023_hosam_exclude_from_payroll_rollback.sql
-- =====================================================================
begin;

create table public.payroll_backup_hosam_entry_20261023 as
  select * from public.payroll_entries where id = 'a3c812e1-368a-41af-9330-a22e66ef9adb';
alter table public.payroll_backup_hosam_entry_20261023 enable row level security;
revoke all on public.payroll_backup_hosam_entry_20261023 from anon, authenticated, public;

create table public.payroll_backup_hosam_profile_20261023 as
  select id, payroll_excluded from public.profiles where id = 'a68d72e4-8c88-4554-a8c4-70f5ac813a20';
alter table public.payroll_backup_hosam_profile_20261023 enable row level security;
revoke all on public.payroll_backup_hosam_profile_20261023 from anon, authenticated, public;

do $$
declare n int;
begin
  update public.profiles
     set payroll_excluded = true
   where id = 'a68d72e4-8c88-4554-a8c4-70f5ac813a20' and payroll_excluded = false;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'profile update affected % rows (expected 1)', n; end if;

  delete from public.payroll_entries
   where id = 'a3c812e1-368a-41af-9330-a22e66ef9adb'
     and run_id = '0d65a1ec-bbbb-46e5-934a-646b4dace00e'
     and employee_id = 'a68d72e4-8c88-4554-a8c4-70f5ac813a20'
     and source = 'manual'
     and net_salary_usd = 0;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'entry delete affected % rows (expected 1)', n; end if;
end $$;

commit;
