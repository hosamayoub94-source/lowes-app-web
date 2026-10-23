-- ROLLBACK for 20261023_grant_payroll_access_accountant_hr — PROPOSED, NOT APPLIED.
-- Fill the same two UUIDs. Removes only these two grants, only if can_finalize is still false.
begin;
delete from public.payroll_access
where profile_id in ('00000000-0000-0000-0000-000000000000'::uuid /* ACCOUNTANT */,
                     '00000000-0000-0000-0000-000000000000'::uuid /* HR */)
  and can_finalize = false
  and note in ('Accountant — prepare/recalculate, no approve/pay',
               'HR — absence decisions + recalculate, no approve/pay');
commit;
