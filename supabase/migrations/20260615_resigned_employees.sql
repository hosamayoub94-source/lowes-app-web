-- ============================================================
-- Resigned (former) employees — preserve data, block login, keep accessible
-- Run ONCE in Supabase SQL Editor.
-- ============================================================

-- 1. New columns on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS employment_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS resigned_at       date,
  ADD COLUMN IF NOT EXISTS resign_reason     text;

-- Optional sanity constraint (active | resigned)
DO $$ BEGIN
  ALTER TABLE profiles
    ADD CONSTRAINT profiles_employment_status_chk
    CHECK (employment_status IN ('active','resigned'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. ⚠️ CRITICAL (CLAUDE.md): profiles uses column-level grants.
--    Any new column MUST be granted SELECT to anon, authenticated or login breaks.
GRANT SELECT (employment_status) ON profiles TO anon, authenticated;
GRANT SELECT (resigned_at)       ON profiles TO anon, authenticated;
GRANT SELECT (resign_reason)     ON profiles TO anon, authenticated;

-- Admin edits these from the app (authenticated) — allow updating them.
GRANT UPDATE (employment_status, resigned_at, resign_reason) ON profiles TO authenticated;

-- 3. Helpful index for the "resigned employees" list
CREATE INDEX IF NOT EXISTS idx_profiles_employment_status ON profiles (employment_status);
