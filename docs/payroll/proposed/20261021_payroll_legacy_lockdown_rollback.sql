-- ROLLBACK for 20261021_payroll_legacy_lockdown.sql — PROPOSED, NOT APPLIED.
-- Restores the exact previous state (policies copied from pg_policies, grants from role_table_grants, 21 Oct 2026).
-- Re-opens the hole: use only for an emergency.
BEGIN;

CREATE POLICY payroll_runs_all ON public.payroll_runs FOR ALL TO public
  USING ((COALESCE(((period_year * 100) + period_month), 0) < 202609) AND true)
  WITH CHECK ((COALESCE(((period_year * 100) + period_month), 0) < 202609) AND true);

CREATE POLICY payroll_entries_all ON public.payroll_entries FOR ALL TO public
  USING (payroll_run_is_legacy(run_id) AND true)
  WITH CHECK (payroll_run_is_legacy(run_id) AND true);

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.payroll_runs, public.payroll_entries, public.payroll_absence_reviews TO anon;
GRANT TRUNCATE, REFERENCES, TRIGGER
  ON public.payroll_runs, public.payroll_entries, public.payroll_absence_reviews TO authenticated;

COMMIT;
