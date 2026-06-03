-- ================================================================
-- Warehouse System — Phase 1 (lean, PIN-auth compatible)
-- Apply via Supabase SQL Editor or Management API.
-- ================================================================

-- 1. Warehouses
CREATE TABLE IF NOT EXISTS wh_warehouses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  type        text NOT NULL DEFAULT 'sales',   -- central | sales | distributor | returns
  owner_name  text,
  market      text,                            -- syria | turkey | null
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Stock per (warehouse, product)
CREATE TABLE IF NOT EXISTS wh_stock (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES wh_warehouses(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity     int  NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, product_id)
);

-- 3. Movement audit trail
CREATE TABLE IF NOT EXISTS wh_movements (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  from_warehouse_id  uuid REFERENCES wh_warehouses(id) ON DELETE SET NULL,
  to_warehouse_id    uuid REFERENCES wh_warehouses(id) ON DELETE SET NULL,
  quantity           int  NOT NULL,
  type               text NOT NULL,            -- receive | allocate | reserve | release | adjust | return
  reason             text,
  performed_by       text,
  order_id           uuid,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wh_stock_wh   ON wh_stock (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wh_stock_prod ON wh_stock (product_id);
CREATE INDEX IF NOT EXISTS idx_wh_mov_prod   ON wh_movements (product_id, created_at DESC);

-- RLS: open (PIN-auth model — same as other app tables), gated in app layer
ALTER TABLE wh_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE wh_stock      ENABLE ROW LEVEL SECURITY;
ALTER TABLE wh_movements  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wh_warehouses_all ON wh_warehouses;
DROP POLICY IF EXISTS wh_stock_all      ON wh_stock;
DROP POLICY IF EXISTS wh_movements_all  ON wh_movements;
CREATE POLICY wh_warehouses_all ON wh_warehouses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY wh_stock_all      ON wh_stock      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY wh_movements_all  ON wh_movements  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON wh_warehouses, wh_stock, wh_movements TO anon, authenticated;

-- Seed the three Phase-1 warehouses (idempotent by name)
INSERT INTO wh_warehouses (name, type, owner_name, market)
SELECT 'المخزن المركزي', 'central', NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM wh_warehouses WHERE name = 'المخزن المركزي');

INSERT INTO wh_warehouses (name, type, owner_name, market)
SELECT 'مبيعات سوريا', 'sales', 'Yousef Alkshki', 'syria'
WHERE NOT EXISTS (SELECT 1 FROM wh_warehouses WHERE name = 'مبيعات سوريا');

INSERT INTO wh_warehouses (name, type, owner_name, market)
SELECT 'مبيعات تركيا', 'sales', 'Fatima Ayoub', 'turkey'
WHERE NOT EXISTS (SELECT 1 FROM wh_warehouses WHERE name = 'مبيعات تركيا');
