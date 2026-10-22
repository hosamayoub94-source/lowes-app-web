-- =====================================================================
-- PROPOSED — NOT APPLIED. For review by حسام before any execution.
-- Closes a second hole found on 22 Oct 2026 (same class as the legacy-payroll one):
-- employee_salary_settings (28 salary rows) has `sal_settings_all` = FOR ALL TO public USING (true), plus
-- `salary_settings_all` = any logged-in user can write, plus full table grants to `anon`.
-- Verified (rolled-back simulation): as `anon` the table returns 28 rows and UPDATE affects 28 rows.
--
-- What this does:
--   1. Drops sal_settings_all and salary_settings_all. Existing restrictive policies remain:
--        sal_set_select  (admin / manager / sales_manager read; an employee reads OWN row)
--        sal_set_insert / sal_set_update / sal_set_delete  (admin only)
--   2. Adds salary_settings_payroll_access: holders of payroll_access (payroll_has_access()) can read/write — keeps
--      the payroll screens working for non-admin payroll staff in the future.
--   3. Revokes all privileges from anon, and TRUNCATE/REFERENCES/TRIGGER from authenticated.
--
-- Side effects: a "manual session" user (no Supabase Auth account) can no longer read salary settings.
-- Only authenticated clients use this table in src (AdminSettingsScreen.jsx, payroll module).
-- Independent of 20261022_salary_alignment_and_exclusion.sql; recommended to apply this one FIRST or together.
-- =====================================================================
BEGIN;

DROP POLICY IF EXISTS sal_settings_all    ON public.employee_salary_settings;
DROP POLICY IF EXISTS salary_settings_all ON public.employee_salary_settings;

DROP POLICY IF EXISTS salary_settings_payroll_access ON public.employee_salary_settings;
CREATE POLICY salary_settings_payroll_access ON public.employee_salary_settings
  FOR ALL TO authenticated
  USING (public.payroll_has_access()) WITH CHECK (public.payroll_has_access());

REVOKE ALL ON public.employee_salary_settings FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.employee_salary_settings FROM authenticated;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.employee_salary_settings', 'SELECT') THEN
    RAISE EXCEPTION 'anon still has SELECT — aborting';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'employee_salary_settings'
              AND policyname IN ('sal_settings_all', 'salary_settings_all')) THEN
    RAISE EXCEPTION 'permissive policy still present — aborting';
  END IF;
END $$;
COMMIT;
-- AFTER: as anon with the public key, GET /rest/v1/employee_salary_settings must return 401/42501.
