-- =============================================================
-- Enterprise Inventory, Orders & Warehouse Management — Schema
-- Run in Supabase SQL Editor or via migration tool.
-- Depends on: update_updated_at() function (from files module)
-- =============================================================

-- ── 1. Categories ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL UNIQUE,
  parent_id   UUID        REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT,
  image_url   TEXT,
  position    INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Products ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sku             TEXT        NOT NULL UNIQUE,
  barcode         TEXT,
  name            TEXT        NOT NULL,
  name_ar         TEXT,
  description     TEXT,
  category_id     UUID        REFERENCES categories(id) ON DELETE SET NULL,

  product_type    TEXT        NOT NULL DEFAULT 'physical',
    -- physical | digital | service | bundle

  unit            TEXT        NOT NULL DEFAULT 'piece',
    -- piece | kg | liter | meter | box | pallet

  cost_price      NUMERIC     NOT NULL DEFAULT 0,
  selling_price   NUMERIC     NOT NULL DEFAULT 0,
  currency        TEXT        NOT NULL DEFAULT 'SAR',

  weight_kg       NUMERIC,
  dimensions      JSONB       DEFAULT '{}',  -- { l, w, h }

  images          TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  tags            TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],

  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  is_tracked      BOOLEAN     NOT NULL DEFAULT TRUE,  -- track inventory?

  min_stock_level INTEGER     NOT NULL DEFAULT 0,     -- low stock threshold
  reorder_point   INTEGER     NOT NULL DEFAULT 0,
  reorder_qty     INTEGER     NOT NULL DEFAULT 0,

  supplier_id     UUID,   -- future: suppliers table
  owner_id        UUID    REFERENCES auth.users(id),

  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Product Variants ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_variants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku         TEXT        NOT NULL UNIQUE,
  barcode     TEXT,
  name        TEXT        NOT NULL,  -- e.g. "Red / XL"
  attributes  JSONB       NOT NULL DEFAULT '{}',  -- { color, size, weight }
  cost_price  NUMERIC,
  price       NUMERIC,
  image_url   TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Warehouses ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouses (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  code        TEXT        NOT NULL UNIQUE,
  type        TEXT        NOT NULL DEFAULT 'main',
    -- main | branch | transit | virtual | returns

  address     TEXT,
  city        TEXT,
  country     TEXT        NOT NULL DEFAULT 'SA',

  manager_id  UUID        REFERENCES auth.users(id),
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,

  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. Stock Levels ───────────────────────────────────────────
-- One row per (product, warehouse) pair.
CREATE TABLE IF NOT EXISTS stock_levels (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id      UUID        REFERENCES product_variants(id) ON DELETE CASCADE,
  warehouse_id    UUID        NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,

  quantity_on_hand     INTEGER NOT NULL DEFAULT 0,
  quantity_reserved    INTEGER NOT NULL DEFAULT 0,
  quantity_on_order    INTEGER NOT NULL DEFAULT 0,

  -- computed: quantity_on_hand - quantity_reserved
  batch_number    TEXT,
  expiry_date     DATE,
  location_code   TEXT,   -- e.g. "A-02-3" aisle-row-shelf

  last_counted_at TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (product_id, warehouse_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::UUID))
);

-- ── 6. Stock Movements ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id      UUID        REFERENCES product_variants(id),
  warehouse_id    UUID        NOT NULL REFERENCES warehouses(id),
  dest_warehouse_id UUID      REFERENCES warehouses(id),  -- for transfers

  movement_type   TEXT        NOT NULL DEFAULT 'adjustment',
    -- in | out | transfer | adjustment | return | damage | count

  quantity        INTEGER     NOT NULL,       -- always positive
  unit_cost       NUMERIC     NOT NULL DEFAULT 0,
  reference_type  TEXT,                       -- sales_order | purchase_order | adjustment | transfer
  reference_id    UUID,
  notes           TEXT,

  performed_by    UUID        NOT NULL REFERENCES auth.users(id),
  batch_number    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 7. Purchase Orders ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number       TEXT        NOT NULL UNIQUE,
  supplier_name   TEXT        NOT NULL,
  supplier_email  TEXT,
  supplier_phone  TEXT,

  warehouse_id    UUID        REFERENCES warehouses(id),
  assigned_to     UUID        REFERENCES auth.users(id),
  owner_id        UUID        REFERENCES auth.users(id),

  status          TEXT        NOT NULL DEFAULT 'draft',
    -- draft | sent | confirmed | partial | received | cancelled

  order_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
  expected_date   DATE,
  received_date   DATE,

  subtotal        NUMERIC     NOT NULL DEFAULT 0,
  tax             NUMERIC     NOT NULL DEFAULT 0,
  shipping_cost   NUMERIC     NOT NULL DEFAULT 0,
  total           NUMERIC     NOT NULL DEFAULT 0,
  currency        TEXT        NOT NULL DEFAULT 'SAR',

  notes           TEXT,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 8. Purchase Order Items ────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID    NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id        UUID    NOT NULL REFERENCES products(id),
  variant_id        UUID    REFERENCES product_variants(id),
  quantity_ordered  INTEGER NOT NULL DEFAULT 1,
  quantity_received INTEGER NOT NULL DEFAULT 0,
  unit_cost         NUMERIC NOT NULL DEFAULT 0,
  total_cost        NUMERIC NOT NULL DEFAULT 0
);

-- ── 9. Sales Orders ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_orders (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    TEXT        NOT NULL UNIQUE,
  customer_id     UUID        REFERENCES customers(id),   -- CRM link
  contact_name    TEXT,
  contact_email   TEXT,
  contact_phone   TEXT,

  warehouse_id    UUID        REFERENCES warehouses(id),
  assigned_to     UUID        REFERENCES auth.users(id),
  owner_id        UUID        REFERENCES auth.users(id),

  status          TEXT        NOT NULL DEFAULT 'quotation',
    -- quotation | pending | confirmed | paid | packed | shipped | delivered | returned | cancelled

  order_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_date   DATE,
  delivered_at    TIMESTAMPTZ,

  subtotal        NUMERIC     NOT NULL DEFAULT 0,
  discount        NUMERIC     NOT NULL DEFAULT 0,
  tax             NUMERIC     NOT NULL DEFAULT 0,
  shipping_cost   NUMERIC     NOT NULL DEFAULT 0,
  total           NUMERIC     NOT NULL DEFAULT 0,
  currency        TEXT        NOT NULL DEFAULT 'SAR',

  payment_status  TEXT        NOT NULL DEFAULT 'unpaid',
    -- unpaid | partial | paid | refunded

  payment_method  TEXT,
  notes           TEXT,
  tags            TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],

  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 10. Sales Order Items ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_order_items (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id  UUID    NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id      UUID    NOT NULL REFERENCES products(id),
  variant_id      UUID    REFERENCES product_variants(id),
  quantity        INTEGER NOT NULL DEFAULT 1,
  unit_price      NUMERIC NOT NULL DEFAULT 0,
  discount        NUMERIC NOT NULL DEFAULT 0,
  total_price     NUMERIC NOT NULL DEFAULT 0,
  reserved        BOOLEAN NOT NULL DEFAULT FALSE
);

-- ── 11. Shipments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_number TEXT        NOT NULL UNIQUE,
  sales_order_id  UUID        REFERENCES sales_orders(id) ON DELETE CASCADE,
  warehouse_id    UUID        REFERENCES warehouses(id),

  carrier         TEXT,
  carrier_url     TEXT,
  method          TEXT        NOT NULL DEFAULT 'standard',
    -- standard | express | same_day | pickup

  status          TEXT        NOT NULL DEFAULT 'pending',
    -- pending | picked | packed | dispatched | in_transit | out_for_delivery | delivered | failed | returned

  shipped_at      TIMESTAMPTZ,
  estimated_at    TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,

  recipient_name  TEXT,
  recipient_phone TEXT,
  address         TEXT,
  city            TEXT,
  country         TEXT        NOT NULL DEFAULT 'SA',

  weight_kg       NUMERIC,
  cost            NUMERIC     NOT NULL DEFAULT 0,
  currency        TEXT        NOT NULL DEFAULT 'SAR',

  notes           TEXT,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 12. Inventory Adjustments ──────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id      UUID        REFERENCES product_variants(id),
  warehouse_id    UUID        NOT NULL REFERENCES warehouses(id),

  reason          TEXT        NOT NULL DEFAULT 'count',
    -- count | damage | theft | expiry | return | correction | sample

  quantity_before INTEGER     NOT NULL DEFAULT 0,
  quantity_after  INTEGER     NOT NULL DEFAULT 0,
  quantity_delta  INTEGER     NOT NULL DEFAULT 0,  -- after - before

  notes           TEXT,
  performed_by    UUID        NOT NULL REFERENCES auth.users(id),
  approved_by     UUID        REFERENCES auth.users(id),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_category    ON products (category_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_sku         ON products (sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode     ON products (barcode);
CREATE INDEX IF NOT EXISTS idx_products_name_fts    ON products USING gin(to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_variants_product     ON product_variants (product_id);
CREATE INDEX IF NOT EXISTS idx_variants_sku         ON product_variants (sku);
CREATE INDEX IF NOT EXISTS idx_stock_product        ON stock_levels (product_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_warehouse      ON stock_levels (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_movements_product    ON stock_movements (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_warehouse  ON stock_movements (warehouse_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_type       ON stock_movements (movement_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_po_status            ON purchase_orders (status, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_so_status            ON sales_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_so_customer          ON sales_orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_so_number            ON sales_orders (order_number);
CREATE INDEX IF NOT EXISTS idx_shipments_order      ON shipments (sales_order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status     ON shipments (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking   ON shipments (tracking_number);
CREATE INDEX IF NOT EXISTS idx_adjustments_product  ON inventory_adjustments (product_id, created_at DESC);

-- ── Triggers ──────────────────────────────────────────────────
CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_product_variants_updated_at
  BEFORE UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_warehouses_updated_at
  BEFORE UPDATE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_stock_levels_updated_at
  BEFORE UPDATE ON stock_levels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_sales_orders_updated_at
  BEFORE UPDATE ON sales_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_shipments_updated_at
  BEFORE UPDATE ON shipments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE categories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_levels          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read; write = authenticated
CREATE POLICY "categories_all"         ON categories            FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "products_all"           ON products              FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "variants_all"           ON product_variants      FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "warehouses_all"         ON warehouses            FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "stock_levels_all"       ON stock_levels          FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "stock_movements_all"    ON stock_movements       FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "purchase_orders_all"    ON purchase_orders       FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "po_items_all"           ON purchase_order_items  FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "sales_orders_all"       ON sales_orders          FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "so_items_all"           ON sales_order_items     FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "shipments_all"          ON shipments             FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "adjustments_all"        ON inventory_adjustments FOR ALL USING (auth.uid() IS NOT NULL);

-- ── Seed: default warehouse ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM warehouses WHERE code = 'MAIN') THEN
    INSERT INTO warehouses (name, code, type, city, country)
    VALUES ('المستودع الرئيسي', 'MAIN', 'main', 'الرياض', 'SA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'general') THEN
    INSERT INTO categories (name, slug, description, position)
    VALUES ('عام', 'general', 'فئة عامة', 0);
  END IF;
END $$;
