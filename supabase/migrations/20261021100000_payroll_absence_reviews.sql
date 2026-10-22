-- Daily absence decisions used by payroll.
-- A missing check-in is only a pending case; payroll deducts approved rows.
CREATE TABLE IF NOT EXISTS public.payroll_absence_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  employee_name text NOT NULL,
  absence_date date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, absence_date)
);

CREATE INDEX IF NOT EXISTS idx_payroll_absence_reviews_month
  ON public.payroll_absence_reviews (absence_date, status);
CREATE INDEX IF NOT EXISTS idx_payroll_absence_reviews_employee
  ON public.payroll_absence_reviews (employee_id, absence_date);

ALTER TABLE public.payroll_absence_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payroll_absence_reviews_management" ON public.payroll_absence_reviews;
CREATE POLICY "payroll_absence_reviews_management"
  ON public.payroll_absence_reviews FOR ALL TO authenticated
  USING (public.payroll_has_access())
  WITH CHECK (public.payroll_has_access());

GRANT SELECT, INSERT, UPDATE ON public.payroll_absence_reviews TO authenticated;
