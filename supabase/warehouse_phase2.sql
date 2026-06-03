-- ================================================================
-- Warehouse System — Phase 2: order reservation + brand isolation
-- Apply via Supabase SQL Editor or Management API.
-- ================================================================

-- Brand tag on orders (lowes | la_ronven_glow) — isolates Zina/Khedr's
-- separate-brand orders from Lowe's stock deduction.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS brand text DEFAULT 'lowes';

-- Optional per-seller warehouse link (distributors). null = use the
-- default sales warehouse matching the order's market.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES wh_warehouses(id) ON DELETE SET NULL;

-- CRITICAL: column-level grants for profiles (required or login breaks)
GRANT SELECT (warehouse_id) ON profiles TO anon, authenticated;
GRANT UPDATE (warehouse_id) ON profiles TO authenticated;

-- Tag the separate-brand sellers' existing orders.
UPDATE orders SET brand = 'la_ronven_glow'
WHERE handler_name ILIKE '%zina%' OR handler_name ILIKE '%zena%'
   OR handler_name ILIKE '%khedr%' OR handler_name ILIKE '%khidr%';
