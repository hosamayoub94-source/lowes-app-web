-- ================================================================
-- Seller System Migration — منظومة البائع
-- Apply in Supabase SQL Editor
-- ================================================================

-- 1. orders: add paid_amount column (for partial payments)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_amount numeric;

-- 2. profiles: add commission_pct column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS commission_pct numeric DEFAULT 10;

-- CRITICAL: column-level grants for profiles (required or login breaks)
GRANT SELECT (commission_pct) ON profiles TO anon;
GRANT SELECT (commission_pct) ON profiles TO authenticated;
GRANT UPDATE (commission_pct) ON profiles TO authenticated;
