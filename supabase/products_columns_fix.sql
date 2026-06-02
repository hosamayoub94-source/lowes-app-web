-- ============================================================
-- Products catalog — add columns the admin screen needs
--
-- AdminProductsScreen uses name_en / category / price_usd / price_try /
-- discount_pct / description / is_active, but the products table only had
-- `name`. Adding the missing columns (idempotent) makes the full screen work
-- instead of crashing/showing blanks. Existing 32 products keep their names;
-- prices/categories get filled in by the admin.
-- Safe to re-run.
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS name_en      text,
  ADD COLUMN IF NOT EXISTS category     text DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS price_usd    numeric,
  ADD COLUMN IF NOT EXISTS price_try    numeric,
  ADD COLUMN IF NOT EXISTS discount_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description  text,
  ADD COLUMN IF NOT EXISTS is_active    boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at   timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz DEFAULT now();

-- Make sure existing rows are active so they show up
UPDATE public.products SET is_active = true WHERE is_active IS NULL;
