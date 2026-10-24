-- =====================================================================
-- PROPOSED — NOT APPLIED. Needs the owner's explicit approval before it runs on production.
-- 20261024_payroll_runs_delete_guard
--
-- Closes the last gap in historical-period protection: DELETE on payroll_runs.
-- Today the app hides the delete button for historical periods only in the UI/store; the database still
-- lets anyone with payroll_access delete a closed historical run (and, by FK cascade, all its entries) by
-- calling the REST API directly. payroll_runs_s2_guard allows deleting ANY draft from 2026-09 on, which
-- includes the historical September draft.
--
-- Rule enforced by the database, for EVERY role (no bypass setting):
--   a run may be deleted only if its period is operational (>= 2026-10) AND its status is 'draft'.
--
-- Nothing is updated or deleted by this migration. One function + one trigger, no data touched.
-- Maintenance escape hatch (deliberately not a user-settable flag): a DBA must
--   alter table public.payroll_runs disable trigger payroll_runs_delete_guard;  -- ... then enable it again.
-- Rollback: 20261024_payroll_runs_delete_guard_rollback.sql
-- =====================================================================
create or replace function public.payroll_runs_delete_guard() returns trigger
language plpgsql as $$
begin
  if coalesce(old.period_year * 100 + old.period_month, 0) < 202610 then
    raise exception 'لا يمكن حذف دورة تاريخية (قبل تشرين الأول 2026) — هي سجل للعرض والتدقيق فقط.'
      using errcode = 'insufficient_privilege';
  end if;
  if old.status is distinct from 'draft' then
    raise exception 'لا تُحذف إلا مسودة غير معتمدة — الدورة المعتمدة أو المدفوعة تُعاد فتحها ولا تُحذف.'
      using errcode = 'insufficient_privilege';
  end if;
  return old;
end $$;

create trigger payroll_runs_delete_guard
  before delete on public.payroll_runs
  for each row execute function public.payroll_runs_delete_guard();
