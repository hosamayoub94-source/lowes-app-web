-- =====================================================================
-- PROPOSED — NOT APPLIED. For review by حسام before any execution.
-- Closes the legacy-payroll hole found in QA 2026-10-21 (docs/QA_PAYROLL_REPORT_2026-10-21.md, finding 1).
--
-- Problem (verified live): payroll_runs_all / payroll_entries_all are `FOR ALL TO public USING (true)`
-- for periods < 202609, and `anon` holds full table grants → anyone with the public anon key can
-- read AND update all 6 legacy runs / 221 legacy entries.
--
-- What this does:
--   1. Drops the two permissive `true` policies. The stricter existing policies remain:
--        pay_runs_select / pay_entries_select  (admin, manager, sales_manager read; employee reads OWN entries)
--        pay_runs_insert/update, pay_entries_insert/update (admin only)
--      and payroll_new_system (periods >= 202609, requires payroll_has_access()).
--   2. Revokes all table privileges from `anon` on the three payroll tables.
--   3. Revokes TRUNCATE/REFERENCES/TRIGGER from `authenticated` (TRUNCATE bypasses RLS).
--
-- Dry-run result (executed inside a transaction that was rolled back, production untouched):
--   anon          : read/update/insert all denied (permission denied)
--   hosam (admin) : runs 6, entries 221, legacy update OK, new-run insert OK
--   fadi (manager): read 6/221, no write
--   haya (sales)  : read 6/221, no write
--   hamza (employee): runs 0, entries 6 (own only), no write
--
-- KNOWN SIDE EFFECTS (decide before applying):
--   * Any user on a "manual session" (anon, no Supabase Auth user) loses payroll access entirely.
--     Both payroll_access holders (hosam, Amany) have auth.users rows, so they are unaffected.
--   * manager / sales_manager can still READ legacy salaries (existing pay_* policy design). If that is
--     not wanted, run the OPTIONAL block at the bottom.
-- =====================================================================

-- ---- 0. BEFORE snapshot (run, save the output) ------------------------
-- select (select count(*) from payroll_runs) runs, (select count(*) from payroll_entries) entries,
--        (select md5(string_agg(e::text, '|' order by e.id)) from payroll_entries e) entries_fp,
--        (select md5(string_agg(r::text, '|' order by r.id)) from payroll_runs r) runs_fp;

BEGIN;

DROP POLICY IF EXISTS payroll_runs_all    ON public.payroll_runs;
DROP POLICY IF EXISTS payroll_entries_all ON public.payroll_entries;

REVOKE ALL ON public.payroll_runs, public.payroll_entries, public.payroll_absence_reviews FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON public.payroll_runs, public.payroll_entries, public.payroll_absence_reviews FROM authenticated;

-- Safety check: abort the whole transaction if anon can still touch payroll.
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.payroll_runs', 'SELECT')
     OR has_table_privilege('anon', 'public.payroll_entries', 'SELECT')
     OR has_table_privilege('anon', 'public.payroll_absence_reviews', 'SELECT') THEN
    RAISE EXCEPTION 'anon still has SELECT on a payroll table — aborting';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE tablename IN ('payroll_runs','payroll_entries')
                AND policyname IN ('payroll_runs_all','payroll_entries_all')) THEN
    RAISE EXCEPTION 'permissive policy still present — aborting';
  END IF;
END $$;

COMMIT;

-- ---- AFTER: re-run the section-0 snapshot; counts and fingerprints must be IDENTICAL.
-- ---- Then verify as anon with the public key via REST: GET /rest/v1/payroll_runs must return 401/42501.

-- =====================================================================
-- OPTIONAL (separate decision, NOT included above): restrict legacy reads to payroll_access holders only
-- (removes manager / sales_manager read of legacy salaries; keeps employee reading own payslip).
-- DROP POLICY IF EXISTS pay_runs_select ON public.payroll_runs;
-- CREATE POLICY pay_runs_select ON public.payroll_runs FOR SELECT TO authenticated
--   USING (COALESCE(period_year*100+period_month,0) < 202609 AND public.payroll_has_access());
-- DROP POLICY IF EXISTS pay_entries_select ON public.payroll_entries;
-- CREATE POLICY pay_entries_select ON public.payroll_entries FOR SELECT TO authenticated
--   USING (public.payroll_run_is_legacy(run_id) AND (auth.uid() = employee_id OR public.payroll_has_access()));
-- =====================================================================
