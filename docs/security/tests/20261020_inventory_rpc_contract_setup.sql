-- Disposable inventory authorization fixture for GitHub Actions PostgreSQL.
-- TEST FIXTURE ONLY. This is not a production migration and does not connect to Supabase.
-- It mirrors the production-relevant subset (RPC names/argument names, stock unique
-- key, movement column names, JSONB permission fields, and derived product quantity).
-- Synthetic IDs, isolated schema and reduced data model are deliberate; this is not
-- drop-in production SQL. It models permission-checked, atomic stock + audit mutations.
BEGIN;

DROP SCHEMA IF EXISTS inventory_rehearsal CASCADE;
CREATE SCHEMA inventory_rehearsal;
GRANT USAGE ON SCHEMA inventory_rehearsal TO anon, authenticated;

-- Supabase-like auth.uid() shim for the disposable PostgreSQL fixture only.
-- CI sets this claim explicitly while SET ROLE simulates a PostgREST JWT subject.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $uid$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$uid$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

CREATE TABLE inventory_rehearsal.profiles (
  id uuid PRIMARY KEY,
  role_type text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  extra_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  denied_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  employee_name text,
  warehouse_id uuid,
  order_role text
);

CREATE TABLE inventory_rehearsal.products (
  id uuid PRIMARY KEY,
  is_active boolean NOT NULL DEFAULT true,
  quantity integer NOT NULL DEFAULT 0,
  name text,
  name_en text
);

CREATE TABLE inventory_rehearsal.wh_warehouses (
  id uuid PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('central', 'sales', 'wholesale', 'distributor', 'returns')),
  market text,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE inventory_rehearsal.wh_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES inventory_rehearsal.wh_warehouses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES inventory_rehearsal.products(id) ON DELETE CASCADE,
  -- Production has no CHECK(quantity >= 0); the RPC must enforce the invariant itself.
  quantity integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, product_id)
);

CREATE TABLE inventory_rehearsal.wh_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES inventory_rehearsal.products(id) ON DELETE CASCADE,
  from_warehouse_id uuid REFERENCES inventory_rehearsal.wh_warehouses(id) ON DELETE SET NULL,
  to_warehouse_id uuid REFERENCES inventory_rehearsal.wh_warehouses(id) ON DELETE SET NULL,
  quantity integer NOT NULL,
  type text NOT NULL,
  reason text,
  performed_by text,
  order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  reverses_id uuid
);

INSERT INTO inventory_rehearsal.profiles (id, role_type, is_active, extra_permissions, denied_permissions, employee_name, warehouse_id) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin', true, '[]'::jsonb, '["manage_central_stock","manage_sales_stock"]'::jsonb, 'Fixture Admin', NULL),
  ('00000000-0000-0000-0000-000000000002', 'warehouse_manager', true, '[]'::jsonb, '[]'::jsonb, 'Seller Syria', '10000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000003', 'employee', true, '[]'::jsonb, '[]'::jsonb, 'Ordinary Employee', NULL),
  ('00000000-0000-0000-0000-000000000004', 'manager', true, '[]'::jsonb, '["manage_central_stock"]'::jsonb, 'Order Manager', NULL),
  ('00000000-0000-0000-0000-000000000005', 'employee', true, '["manage_central_stock"]'::jsonb, '[]'::jsonb, 'Central Stock Employee', NULL),
  ('00000000-0000-0000-0000-000000000006', 'employee', false, '["manage_central_stock","manage_sales_stock","manage_orders"]'::jsonb, '[]'::jsonb, 'Inactive Employee', NULL),
  ('00000000-0000-0000-0000-000000000007', 'sales_manager', true, '[]'::jsonb, '[]'::jsonb, 'Sales Manager', NULL),
  ('00000000-0000-0000-0000-000000000008', 'warehouse_manager', true, '[]'::jsonb, '["manage_sales_stock"]'::jsonb, 'Denied Warehouse Manager', NULL),
  ('00000000-0000-0000-0000-000000000009', 'manager', true, '[]'::jsonb, '["manage_orders"]'::jsonb, 'Orders Denied Manager', NULL);

INSERT INTO inventory_rehearsal.profiles
  (id, role_type, is_active, extra_permissions, denied_permissions, employee_name, warehouse_id, order_role)
VALUES
  ('00000000-0000-0000-0000-000000000010', 'employee', true, '[]'::jsonb, '[]'::jsonb, 'Fulfillment Tester', NULL, 'fulfillment'),
  ('00000000-0000-0000-0000-000000000011', 'employee', true, '[]'::jsonb, '["manage_orders"]'::jsonb, 'Denied Owner Tester', NULL, NULL);

INSERT INTO inventory_rehearsal.wh_warehouses (id, type, market, is_active) VALUES
  ('10000000-0000-0000-0000-000000000001', 'central', 'turkey', true),
  ('10000000-0000-0000-0000-000000000002', 'sales', 'turkey', true),
  ('10000000-0000-0000-0000-000000000003', 'distributor', 'syria', true),
  ('10000000-0000-0000-0000-000000000004', 'sales', 'syria', true),
  ('10000000-0000-0000-0000-000000000005', 'sales', 'uae', true);

INSERT INTO inventory_rehearsal.products (id, is_active, name, name_en)
VALUES
  ('20000000-0000-0000-0000-000000000001', true, 'Rosemary Oil', 'Rosemary Oil'),
  ('20000000-0000-0000-0000-000000000002', true, 'Vitamin C Serum', 'Vitamin C Serum');

-- Mirror the live trg_wh_stock_sync dependency: products.quantity is derived from
-- the sum of wh_stock and must remain correct after authorized mutations.
CREATE TABLE inventory_rehearsal.orders (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  market text NOT NULL,
  brand text,
  source text,
  handler_name text,
  items jsonb,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inventory_rehearsal.product_aliases (
  alias_norm text PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES inventory_rehearsal.products(id)
);

INSERT INTO inventory_rehearsal.product_aliases (alias_norm, product_id)
VALUES ('rosemaryserum', '20000000-0000-0000-0000-000000000001');

CREATE OR REPLACE FUNCTION inventory_rehearsal.sync_product_quantity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, inventory_rehearsal
AS $sync$
DECLARE
  v_product_id uuid;
BEGIN
  v_product_id := COALESCE(NEW.product_id, OLD.product_id);
  UPDATE inventory_rehearsal.products AS p
  SET quantity = (
    SELECT COALESCE(SUM(s.quantity), 0)
    FROM inventory_rehearsal.wh_stock AS s
    WHERE s.product_id = v_product_id
  )
  WHERE p.id = v_product_id;
  RETURN NULL;
END
$sync$;

CREATE TRIGGER rehearsal_wh_stock_sync
AFTER INSERT OR UPDATE OR DELETE ON inventory_rehearsal.wh_stock
FOR EACH ROW EXECUTE FUNCTION inventory_rehearsal.sync_product_quantity();

INSERT INTO inventory_rehearsal.wh_stock (warehouse_id, product_id, quantity) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 20),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 5);
 
-- Seed order workflows use only synthetic fixture rows; extra warehouse stock is
-- intentionally added later in the order-specific tests, after the core ACL tests.

ALTER TABLE inventory_rehearsal.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_rehearsal.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_rehearsal.wh_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_rehearsal.wh_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_rehearsal.wh_movements ENABLE ROW LEVEL SECURITY;

-- Explicitly remove direct client table access. The rehearsal intentionally tests
-- mutation authorization; it does not define the production inventory read contract.
REVOKE ALL ON ALL TABLES IN SCHEMA inventory_rehearsal FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA inventory_rehearsal FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION inventory_rehearsal.has_stock_permission(p_warehouse_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, inventory_rehearsal
AS $permission$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_active boolean;
  v_extra jsonb;
  v_denied jsonb;
  v_warehouse_type text;
  v_permission text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.role_type, p.is_active, p.extra_permissions, p.denied_permissions
    INTO v_role, v_active, v_extra, v_denied
  FROM inventory_rehearsal.profiles AS p
  WHERE p.id = v_uid;

  IF NOT FOUND OR v_active IS DISTINCT FROM true THEN
    RETURN false;
  END IF;

  SELECT w.type INTO v_warehouse_type
  FROM inventory_rehearsal.wh_warehouses AS w
  WHERE w.id = p_warehouse_id AND w.is_active IS TRUE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Match src/data/permissions.js defaults: admin is unrestricted; manager and
  -- warehouse_manager default to both stock capabilities. Explicit denials
  -- override defaults for non-admin users; extras only add their named capability.
  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  IF v_warehouse_type = 'central' THEN
    v_permission := 'manage_central_stock';
  ELSIF v_warehouse_type IN ('sales', 'wholesale', 'distributor', 'returns') THEN
    v_permission := 'manage_sales_stock';
  ELSE
    RETURN false;
  END IF;

  IF COALESCE(pg_catalog.jsonb_typeof(v_denied) = 'array' AND v_denied ? v_permission, false) THEN
    RETURN false;
  END IF;

  IF v_role IN ('manager', 'warehouse_manager') THEN
    RETURN true;
  END IF;

  RETURN COALESCE(pg_catalog.jsonb_typeof(v_extra) = 'array' AND v_extra ? v_permission, false);
END
$permission$;

CREATE OR REPLACE FUNCTION inventory_rehearsal.wh_apply_stock_delta(
  p_warehouse uuid,
  p_product uuid,
  p_delta integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, inventory_rehearsal
AS $delta$
DECLARE
  v_actor uuid := auth.uid();
  v_new_quantity integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'delta must be nonzero' USING ERRCODE = '22023';
  END IF;
  IF NOT inventory_rehearsal.has_stock_permission(p_warehouse) THEN
    RAISE EXCEPTION 'stock permission required for this warehouse' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM inventory_rehearsal.products AS p
    WHERE p.id = p_product AND p.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'active product required' USING ERRCODE = '23503';
  END IF;

  IF p_delta < 0 THEN
    -- Do not let a negative UPSERT insert a new negative row. UPDATE must match
    -- an existing stock row and leave enough units; row locking makes this atomic.
    UPDATE inventory_rehearsal.wh_stock AS current_stock
    SET quantity = current_stock.quantity + p_delta,
        updated_at = pg_catalog.now()
    WHERE current_stock.warehouse_id = p_warehouse
      AND current_stock.product_id = p_product
      AND current_stock.quantity >= -p_delta
    RETURNING current_stock.quantity INTO v_new_quantity;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'insufficient stock' USING ERRCODE = '23514';
    END IF;
  ELSE
    -- Positive deltas may create a missing row. This branch can never create
    -- negative quantity because p_delta is known to be strictly positive.
    INSERT INTO inventory_rehearsal.wh_stock AS current_stock
      (warehouse_id, product_id, quantity, updated_at)
    VALUES (p_warehouse, p_product, p_delta, pg_catalog.now())
    ON CONFLICT (warehouse_id, product_id)
    DO UPDATE SET quantity = current_stock.quantity + EXCLUDED.quantity,
                  updated_at = pg_catalog.now()
    RETURNING quantity INTO v_new_quantity;
  END IF;

  -- The movement is inserted in the same database transaction as the quantity change.
  INSERT INTO inventory_rehearsal.wh_movements
    (product_id, from_warehouse_id, to_warehouse_id, quantity, type, reason, performed_by)
  VALUES
    (p_product,
     CASE WHEN p_delta < 0 THEN p_warehouse ELSE NULL END,
     CASE WHEN p_delta > 0 THEN p_warehouse ELSE NULL END,
     abs(p_delta), 'adjust', 'delta=' || p_delta::text, v_actor::text);
  RETURN v_new_quantity;
END
$delta$;

CREATE OR REPLACE FUNCTION inventory_rehearsal.wh_transfer_stock(
  p_from uuid,
  p_to uuid,
  p_product uuid,
  p_qty integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, inventory_rehearsal
AS $transfer$
DECLARE
  v_actor uuid := auth.uid();
  v_source_quantity integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'quantity must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_from = p_to THEN
    RAISE EXCEPTION 'source and destination must differ' USING ERRCODE = '22023';
  END IF;
  IF NOT inventory_rehearsal.has_stock_permission(p_from)
     OR NOT inventory_rehearsal.has_stock_permission(p_to) THEN
    RAISE EXCEPTION 'stock permission required for both warehouses' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM inventory_rehearsal.products AS p
    WHERE p.id = p_product AND p.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'active product required' USING ERRCODE = '23503';
  END IF;

  SELECT s.quantity INTO v_source_quantity
  FROM inventory_rehearsal.wh_stock AS s
  WHERE s.warehouse_id = p_from AND s.product_id = p_product
  FOR UPDATE;

  IF NOT FOUND OR v_source_quantity < p_qty THEN
    RAISE EXCEPTION 'insufficient source stock' USING ERRCODE = '23514';
  END IF;

  UPDATE inventory_rehearsal.wh_stock
  SET quantity = quantity - p_qty, updated_at = pg_catalog.now()
  WHERE warehouse_id = p_from AND product_id = p_product;

  INSERT INTO inventory_rehearsal.wh_stock AS destination_stock
    (warehouse_id, product_id, quantity, updated_at)
  VALUES (p_to, p_product, p_qty, pg_catalog.now())
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET quantity = destination_stock.quantity + EXCLUDED.quantity,
                updated_at = pg_catalog.now();

  INSERT INTO inventory_rehearsal.wh_movements
    (product_id, from_warehouse_id, to_warehouse_id, quantity, type, performed_by)
  VALUES
    (p_product, p_from, p_to, p_qty, 'allocate', v_actor::text);
END
$transfer$;

-- Exact-count adjustment API. Replaces the legacy client-side upsert so the
-- exact quantity and its audit movement share a transaction and actor identity.
CREATE OR REPLACE FUNCTION inventory_rehearsal.wh_set_stock_quantity(
  p_warehouse uuid,
  p_product uuid,
  p_quantity integer,
  p_reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, inventory_rehearsal
AS $set_quantity$
DECLARE
  v_actor uuid := auth.uid();
  v_new_quantity integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 0 THEN
    RAISE EXCEPTION 'quantity must be non-negative' USING ERRCODE = '22023';
  END IF;
  IF NOT inventory_rehearsal.has_stock_permission(p_warehouse) THEN
    RAISE EXCEPTION 'stock permission required for this warehouse' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM inventory_rehearsal.products AS p
    WHERE p.id = p_product AND p.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'active product required' USING ERRCODE = '23503';
  END IF;

  INSERT INTO inventory_rehearsal.wh_stock AS current_stock
    (warehouse_id, product_id, quantity, updated_at)
  VALUES (p_warehouse, p_product, p_quantity, pg_catalog.now())
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET quantity = EXCLUDED.quantity,
                updated_at = pg_catalog.now()
  RETURNING quantity INTO v_new_quantity;

  -- Match the current UI contract (movement quantity stores the set quantity),
  -- while deriving the actor on the server and writing the audit in this transaction.
  INSERT INTO inventory_rehearsal.wh_movements
    (product_id, from_warehouse_id, to_warehouse_id, quantity, type, reason, performed_by)
  VALUES
    (p_product, p_warehouse, p_warehouse, p_quantity, 'adjust',
     COALESCE(NULLIF(pg_catalog.btrim(p_reason), ''), 'جرد/تصحيح'), v_actor::text);

  RETURN v_new_quantity;
END
$set_quantity$;

-- Normalize product names in the same broad way as warehouseService.js.
-- Alias matching is a fixture abstraction; this is not an app-wide catalog migration.
CREATE OR REPLACE FUNCTION inventory_rehearsal.normalize_product_name(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $normalize$
  SELECT pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(
      pg_catalog.lower(pg_catalog.translate(
        COALESCE(p_value, ''),
        'İıŞşĞğÇçÖöÜü',
        'iissggccoouu'
      )),
      '[^a-z0-9؀-ۿ]', '', 'g'
    ),
    '^lowes', ''
  )
$normalize$;

CREATE OR REPLACE FUNCTION inventory_rehearsal.has_order_permission()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, inventory_rehearsal
AS $order_permission$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_active boolean;
  v_extra jsonb;
  v_denied jsonb;
  v_order_role text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.role_type, p.is_active, p.extra_permissions, p.denied_permissions, p.order_role
    INTO v_role, v_active, v_extra, v_denied, v_order_role
  FROM inventory_rehearsal.profiles AS p
  WHERE p.id = v_uid;

  IF NOT FOUND OR v_active IS DISTINCT FROM true THEN
    RETURN false;
  END IF;

  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  IF COALESCE(pg_catalog.jsonb_typeof(v_denied) = 'array' AND v_denied ? 'manage_orders', false) THEN
    RETURN false;
  END IF;

  IF v_role IN ('manager', 'sales_manager', 'media_buyer')
     OR v_order_role = 'fulfillment' THEN
    RETURN true;
  END IF;

  RETURN COALESCE(pg_catalog.jsonb_typeof(v_extra) = 'array' AND v_extra ? 'manage_orders', false);
END
$order_permission$;

-- One server-side status transition is the transaction boundary:
-- it reads the persisted order (including items/source/brand), reconciles stock,
-- records reservation/release movements, and only then persists the new status.
-- The caller supplies only the order id and target status, never a stock delta.
CREATE OR REPLACE FUNCTION inventory_rehearsal.wh_transition_order_status(
  p_order_id uuid,
  p_new_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, inventory_rehearsal
AS $order_transition$
DECLARE
  v_uid uuid := auth.uid();
  v_actor inventory_rehearsal.profiles%ROWTYPE;
  v_order inventory_rehearsal.orders%ROWTYPE;
  v_item jsonb;
  v_item_name text;
  v_qty_text text;
  v_qty integer;
  v_product_id uuid;
  v_warehouse_id uuid;
  v_should_be_out boolean;
  v_net record;
  v_new_qty integer;
  v_desired_items jsonb := '{}'::jsonb;
  v_desired_qty integer;
  v_delta integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT p.* INTO v_actor
  FROM inventory_rehearsal.profiles AS p
  WHERE p.id = v_uid AND p.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active profile required' USING ERRCODE = '42501';
  END IF;
  IF p_new_status IS NULL OR p_new_status NOT IN (
    'pending', 'preparing', 'ready', 'motor_prep', 'at_center', 'shipped',
    'on_way', 'special_delivery', 'motor', 'prepaid', 'delivered', 'settled',
    'waiting', 'not_received', 'returning', 'returned', 'cancelled'
  ) THEN
    RAISE EXCEPTION 'unsupported order status' USING ERRCODE = '22023';
  END IF;

  SELECT o.* INTO v_order
  FROM inventory_rehearsal.orders AS o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  -- Match the live OrdersScreen authorization shape: manager/admin/sales-manager
  -- and fulfillment sessions may advance orders globally; other active users may
  -- advance their own order only. Use persisted profile/order fields, never client
  -- state. An explicit manage_orders denial blocks even an owner fallback.
  IF NOT inventory_rehearsal.has_order_permission() THEN
    IF v_order.handler_name IS DISTINCT FROM v_actor.employee_name
       OR COALESCE(
         pg_catalog.jsonb_typeof(v_actor.denied_permissions) = 'array'
         AND v_actor.denied_permissions ? 'manage_orders',
         false
       ) THEN
      RAISE EXCEPTION 'order-management permission or order ownership required' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Mirror the market-specific status lists in src/data/orderStatus.js.
  IF (v_order.market = 'turkey' AND p_new_status <> ALL (ARRAY[
        'preparing','delivered','not_received','on_way','at_center','shipped',
        'returning','prepaid','waiting','special_delivery','motor_prep','settled','cancelled','motor','pending'
      ]::text[]))
     OR (v_order.market = 'syria' AND p_new_status <> ALL (ARRAY[
        'pending','preparing','shipped','at_center','on_way','delivered','waiting','returned','settled','cancelled'
      ]::text[]))
     OR (v_order.market = 'uae' AND p_new_status <> ALL (ARRAY[
        'preparing','shipped','on_way','delivered','not_received','waiting','settled','returned','cancelled','pending'
      ]::text[]))
     OR v_order.market NOT IN ('turkey','syria','uae') THEN
    RAISE EXCEPTION 'status is not enabled for order market' USING ERRCODE = '22023';
  END IF;

  -- Desired state is derived from persisted order status + brand/source.
  -- If an order's brand/source changes to an externally-stocked path, old net
  -- reservations must be released rather than silently left on the ledger.
  v_should_be_out := p_new_status IN (
    'preparing', 'ready', 'motor_prep', 'at_center', 'shipped',
    'on_way', 'special_delivery', 'motor', 'prepaid', 'delivered', 'settled'
  ) AND COALESCE(v_order.brand, 'lowes') = 'lowes'
    AND COALESCE(v_order.source, '') NOT IN ('star_network', 'uae_sheet_import');

  IF v_should_be_out THEN
    -- Prefer the handler's linked active warehouse when its market matches;
    -- otherwise use the active sales warehouse for this order's market.
    SELECT w.id INTO v_warehouse_id
    FROM inventory_rehearsal.profiles AS p
    JOIN inventory_rehearsal.wh_warehouses AS w ON w.id = p.warehouse_id
    WHERE p.employee_name = v_order.handler_name
      AND p.is_active IS TRUE
      AND w.is_active IS TRUE
      AND (w.market IS NULL OR w.market = v_order.market)
    ORDER BY p.id
    LIMIT 1;

    IF v_warehouse_id IS NULL THEN
      SELECT w.id INTO v_warehouse_id
      FROM inventory_rehearsal.wh_warehouses AS w
      WHERE w.type = 'sales'
        AND w.market = v_order.market
        AND w.is_active IS TRUE
      ORDER BY w.id
      LIMIT 1;
    END IF;

    IF v_warehouse_id IS NULL THEN
      RAISE EXCEPTION 'no active stock warehouse for order market' USING ERRCODE = '23514';
    END IF;

    -- Aggregate all matched items by product ID. This makes a repeated call
    -- reconcile exact quantities (including line edits), not merely ask whether
    -- any positive reservation exists. Untracked add-ons remain intentionally skipped.
    FOR v_item IN
      SELECT e.value
      FROM pg_catalog.jsonb_array_elements(
        CASE WHEN pg_catalog.jsonb_typeof(v_order.items) = 'array'
             THEN v_order.items ELSE '[]'::jsonb END
      ) AS e(value)
    LOOP
      v_item_name := v_item ->> 'name';
      v_qty_text := COALESCE(NULLIF(pg_catalog.btrim(v_item ->> 'qty'), ''), '1');
      IF v_qty_text !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'invalid order item quantity' USING ERRCODE = '22023';
      END IF;
      v_qty := v_qty_text::integer;
      IF v_qty <= 0 OR COALESCE(v_item_name, '') = '' THEN
        CONTINUE;
      END IF;

      SELECT p.id INTO v_product_id
      FROM inventory_rehearsal.products AS p
      WHERE p.is_active IS TRUE
        AND (
          inventory_rehearsal.normalize_product_name(v_item_name)
            = inventory_rehearsal.normalize_product_name(p.name)
          OR inventory_rehearsal.normalize_product_name(v_item_name)
            = inventory_rehearsal.normalize_product_name(p.name_en)
          OR EXISTS (
            SELECT 1 FROM inventory_rehearsal.product_aliases AS a
            WHERE a.product_id = p.id
              AND a.alias_norm = inventory_rehearsal.normalize_product_name(v_item_name)
          )
        )
      ORDER BY
        CASE WHEN inventory_rehearsal.normalize_product_name(v_item_name)
                       IN (inventory_rehearsal.normalize_product_name(p.name),
                           inventory_rehearsal.normalize_product_name(p.name_en))
             THEN 0 ELSE 1 END,
        p.id
      LIMIT 1;

      IF v_product_id IS NULL THEN
        CONTINUE;
      END IF;

      v_desired_qty := COALESCE((v_desired_items ->> v_product_id::text)::integer, 0) + v_qty;
      v_desired_items := pg_catalog.jsonb_set(
        v_desired_items,
        ARRAY[v_product_id::text],
        pg_catalog.to_jsonb(v_desired_qty),
        true
      );
    END LOOP;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM inventory_rehearsal.wh_movements AS m
    WHERE m.order_id = p_order_id
      AND m.type IN ('reserve', 'release')
    GROUP BY m.product_id, COALESCE(m.from_warehouse_id, m.to_warehouse_id)
    HAVING pg_catalog.sum(CASE WHEN m.type = 'reserve' THEN m.quantity ELSE -m.quantity END) < 0
  ) THEN
    RAISE EXCEPTION 'reservation ledger is inconsistent' USING ERRCODE = '23514';
  END IF;

  -- Compare every existing net reservation line with the desired line map.
  -- Differences are applied in deterministic product/warehouse order so repeated
  -- calls and order-item edits add/remove only the delta. All changes, audit rows,
  -- and the status update remain in this transaction.
  FOR v_net IN
    WITH actual AS (
      SELECT m.product_id,
             COALESCE(m.from_warehouse_id, m.to_warehouse_id) AS warehouse_id,
             pg_catalog.sum(CASE WHEN m.type = 'reserve' THEN m.quantity ELSE -m.quantity END)::integer AS quantity
      FROM inventory_rehearsal.wh_movements AS m
      WHERE m.order_id = p_order_id
        AND m.type IN ('reserve', 'release')
      GROUP BY m.product_id, COALESCE(m.from_warehouse_id, m.to_warehouse_id)
    ),
    desired AS (
      SELECT e.key::uuid AS product_id,
             v_warehouse_id AS warehouse_id,
             e.value::integer AS quantity
      FROM pg_catalog.jsonb_each_text(v_desired_items) AS e
    ),
    combined AS (
      SELECT COALESCE(a.product_id, d.product_id) AS product_id,
             COALESCE(a.warehouse_id, d.warehouse_id) AS warehouse_id,
             COALESCE(a.quantity, 0)::integer AS actual_quantity,
             COALESCE(d.quantity, 0)::integer AS desired_quantity
      FROM actual AS a
      FULL OUTER JOIN desired AS d
        ON d.product_id = a.product_id AND d.warehouse_id = a.warehouse_id
    )
    SELECT c.product_id, c.warehouse_id, c.actual_quantity,
           c.desired_quantity, c.desired_quantity - c.actual_quantity AS delta
    FROM combined AS c
    WHERE c.actual_quantity <> c.desired_quantity
    ORDER BY c.product_id, c.warehouse_id
  LOOP
    v_delta := v_net.delta;

    IF v_delta > 0 THEN
      -- Increasing the reservation consumes only stock available inside this
      -- transaction. Missing rows, concurrent depletion, or insufficient stock fail closed.
      UPDATE inventory_rehearsal.wh_stock AS s
      SET quantity = s.quantity - v_delta,
          updated_at = pg_catalog.now()
      WHERE s.warehouse_id = v_net.warehouse_id
        AND s.product_id = v_net.product_id
        AND s.quantity >= v_delta
      RETURNING s.quantity INTO v_new_qty;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'insufficient stock for order reconciliation' USING ERRCODE = '23514';
      END IF;

      INSERT INTO inventory_rehearsal.wh_movements
        (product_id, from_warehouse_id, to_warehouse_id, quantity, type, reason, performed_by, order_id)
      VALUES
        (v_net.product_id, v_net.warehouse_id, NULL, v_delta, 'reserve',
         'order status/reconciliation: ' || p_new_status, v_actor.employee_name, p_order_id);
    ELSIF v_delta < 0 THEN
      v_delta := -v_delta;

      INSERT INTO inventory_rehearsal.wh_stock AS current_stock
        (warehouse_id, product_id, quantity, updated_at)
      VALUES (v_net.warehouse_id, v_net.product_id, v_delta, pg_catalog.now())
      ON CONFLICT (warehouse_id, product_id)
      DO UPDATE SET quantity = current_stock.quantity + EXCLUDED.quantity,
                    updated_at = pg_catalog.now();

      INSERT INTO inventory_rehearsal.wh_movements
        (product_id, from_warehouse_id, to_warehouse_id, quantity, type, reason, performed_by, order_id)
      VALUES
        (v_net.product_id, NULL, v_net.warehouse_id, v_delta, 'release',
         'order status/reconciliation: ' || p_new_status, v_actor.employee_name, p_order_id);
    END IF;
  END LOOP;

  UPDATE inventory_rehearsal.orders
  SET status = p_new_status, updated_at = pg_catalog.now(),
      updated_by = v_actor.employee_name
  WHERE id = p_order_id;
END
$order_transition$;

-- SECURITY DEFINER APIs have no public/default EXECUTE path.
REVOKE ALL ON FUNCTION inventory_rehearsal.has_stock_permission(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory_rehearsal.wh_apply_stock_delta(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory_rehearsal.wh_transfer_stock(uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory_rehearsal.wh_set_stock_quantity(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory_rehearsal.normalize_product_name(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory_rehearsal.has_order_permission() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory_rehearsal.wh_transition_order_status(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION inventory_rehearsal.wh_apply_stock_delta(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_rehearsal.wh_transfer_stock(uuid, uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_rehearsal.wh_set_stock_quantity(uuid, uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_rehearsal.wh_transition_order_status(uuid, text) TO authenticated;

COMMIT;
