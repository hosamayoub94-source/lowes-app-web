-- =====================================================================
-- PROPOSED — NOT APPLIED. Do not run without the owner naming the people.
-- 20261023_grant_payroll_access_accountant_hr
--
-- Grants payroll_access to a named Accountant and a named HR user.
-- Production has NO profile with role accountant or hr_manager today, so this
-- file is inert until the two UUIDs below are filled in by the owner.
--
-- can_finalize = false  → can read, recalculate, edit entries and decide absences;
--                         CANNOT approve / mark paid / reopen (those stay with owner).
-- can_finalize = true   → only by explicit owner decision, in a separate statement.
--
-- Safety: the DO block aborts (nothing inserted) if a placeholder is left or the
-- profile does not exist, so a half-edited file cannot grant access to nobody/wrong id.
-- Rollback: 20261023_grant_payroll_access_accountant_hr_rollback.sql
-- =====================================================================
begin;

do $$
declare
  v_accountant uuid := null;  -- <ACCOUNTANT_PROFILE_UUID>  (owner fills)
  v_hr         uuid := null;  -- <HR_PROFILE_UUID>          (owner fills)
begin
  if v_accountant is null or v_hr is null then
    raise exception 'Fill ACCOUNTANT and HR profile UUIDs first — nothing was granted.';
  end if;
  if not exists (select 1 from public.profiles where id = v_accountant)
     or not exists (select 1 from public.profiles where id = v_hr) then
    raise exception 'A given UUID is not a profile — nothing was granted.';
  end if;

  insert into public.payroll_access (profile_id, can_finalize, note) values
    (v_accountant, false, 'Accountant — prepare/recalculate, no approve/pay'),
    (v_hr,         false, 'HR — absence decisions + recalculate, no approve/pay')
  on conflict (profile_id) do nothing;
end $$;

commit;

-- Verify after applying (read-only):
--   select p.employee_name, p.role_type, a.can_finalize, a.note
--   from public.payroll_access a join public.profiles p on p.id = a.profile_id;
