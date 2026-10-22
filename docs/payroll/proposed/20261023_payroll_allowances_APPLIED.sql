-- APPLIED to production on 23 Oct 2026 via apply_migration `payroll_allowances_20261023` (kept here for the record).
-- Recurring per-employee allowances kept in their own currency (e.g. food allowance in new SYP for hall staff).
-- The payroll engine converts them to USD at the run's frozen rate. Managed from the payroll screen («🍽️ البدلات»).
-- The seed rows (which employees, which amount) are intentionally NOT committed — they are compensation data.
CREATE TABLE public.payroll_allowances (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'food' CHECK (kind IN ('food','other')),
  amount      numeric NOT NULL CHECK (amount >= 0),
  currency    text NOT NULL DEFAULT 'SYP' CHECK (currency IN ('SYP','USD','TRY')),
  is_active   boolean NOT NULL DEFAULT true,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, kind)
);
ALTER TABLE public.payroll_allowances ENABLE ROW LEVEL SECURITY;
CREATE POLICY payroll_allowances_access ON public.payroll_allowances
  FOR ALL TO authenticated USING (public.payroll_has_access()) WITH CHECK (public.payroll_has_access());
REVOKE ALL ON public.payroll_allowances FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.payroll_allowances FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_allowances TO authenticated;

-- ROLLBACK (only together with reverting the engine/UI that read this table):
-- DROP TABLE public.payroll_allowances;
