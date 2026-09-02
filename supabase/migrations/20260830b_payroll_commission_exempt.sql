-- =============================================================
-- Migration 20260830b — Payroll commission-exempt employees
-- Project: fghdumrgimoeqsafdhhh (lowes-production)
--
-- SAFE: ADD COLUMN IF NOT EXISTS + targeted UPDATE by employee_name
-- only for the named non-sales staff (social/media/admin/management).
-- No drops, no renames, no other rows touched.
--
-- Owner rule (2026-08-30): these employees are NOT sellers — the
-- target/commission/returns pipeline must never apply to them. They
-- are paid base salary + allowances only, with no team requirement
-- and no payroll approval gate blocking them.
-- =============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS payroll_commission_exempt boolean NOT NULL DEFAULT false;

-- profiles uses column-level grants — new columns must be granted or
-- reads/writes on profiles break for anon/authenticated (project rule).
GRANT SELECT (payroll_commission_exempt) ON profiles TO anon;
GRANT SELECT (payroll_commission_exempt) ON profiles TO authenticated;
GRANT UPDATE (payroll_commission_exempt) ON profiles TO authenticated;

-- Mirror flag on payroll_entries so a computed entry keeps its exempt
-- reason even if the profile's flag changes later.
ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS commission_exempt boolean NOT NULL DEFAULT false;

UPDATE profiles SET payroll_commission_exempt = true
WHERE employee_name IN (
  'Fatima Ayoub', 'Reem alkshki', 'hosam ayoub', 'Rama ayoub',
  'Haya Almarouf', 'Amany alkshki', 'Wasim Alkshki', 'Fadi Jarrouge',
  'Yousef Alkshki'
);

-- =============================================================
-- DONE — profiles(1) + grants, payroll_entries(1), 9 rows updated.
-- =============================================================
