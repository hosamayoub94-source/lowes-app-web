-- ROLLBACK for 20261022_salary_settings_lockdown.sql — PROPOSED, NOT APPLIED. Re-opens the hole; emergency only.
BEGIN;
DROP POLICY IF EXISTS salary_settings_payroll_access ON public.employee_salary_settings;
CREATE POLICY sal_settings_all ON public.employee_salary_settings FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY salary_settings_all ON public.employee_salary_settings FOR ALL TO public USING (auth.uid() IS NOT NULL);
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.employee_salary_settings TO anon;
GRANT TRUNCATE, REFERENCES, TRIGGER ON public.employee_salary_settings TO authenticated;
COMMIT;
