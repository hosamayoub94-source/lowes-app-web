-- Disposable inventory authorization fixture for GitHub Actions PostgreSQL.
-- TEST FIXTURE ONLY. This is not a production migration and does not connect to Supabase.
-- It models the intended contract: mutation via authenticated, permission-checked
-- SECURITY DEFINER functions; stock and movement log commit in one SQL statement.
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
  denied_permissions jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE inventory_rehearsal.products (
  id uuid PRIMARY KEY,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE inventory_rehearsal.wh_warehouses (
  id uuid PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('central', 'sales')),
  market text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE inventory_rehearsal.wh_stock (
  warehouse_id uuid NOT NULL REFERENCES inventory_rehearsal.wh_warehouses(id),
  product_id uuid NOT NULL REFERENCES inventory_rehearsal.products(id),
  quantity integer NOT NULL CHECK (quantity >= 0),
  PRIMARY KEY (warehouse_id, product_id)
);

CREATE TABLE inventory_rehearsal.wh_movements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  movement_type text NOT NULL CHECK (movement_type IN ('delta', 'transfer')),
  product_id uuid NOT NULL REFERENCES inventory_rehearsal.products(id),
  from_warehouse_id uuid REFERENCES inventory_rehearsal.wh_warehouses(id),
  to_warehouse_id uuid REFERENCES inventory_rehearsal.wh_warehouses(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  delta integer,
  actor_id uuid NOT NULL REFERENCES inventory_rehearsal.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO inventory_rehearsal.profiles (id, role_type, is_active, extra_permissions, denied_permissions) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin', true, '[]'::jsonb, '["manage_central_stock","manage_sales_stock"]'::jsonb),
  ('00000000-0000-0000-0000-000000000002', 'warehouse_manager', true, '[]'::jsonb, '[]'::jsonb),
  ('00000000-0000-0000-0000-000000000003', 'employee', true, '[]'::jsonb, '[]'::jsonb),
  ('00000000-0000-0000-0000-000000000004', 'manager', true, '[]'::jsonb, '["manage_central_stock"]'::jsonb),
  ('00000000-0000-0000-0000-000000000005', 'employee', true, '["manage_central_stock"]'::jsonb, '[]'::jsonb),
  ('00000000-0000-0000-0000-000000000006', 'employee', false, '["manage_central_stock","manage_sales_stock"]'::jsonb, '[]'::jsonb),
  ('00000000-0000-0000-0000-000000000007', 'sales_manager', true, '[]'::jsonb, '[]'::jsonb),
  ('00000000-0000-0000-0000-000000000008', 'warehouse_manager', true, '[]'::jsonb, '["manage_sales_stock"]'::jsonb);

INSERT INTO inventory_rehearsal.wh_warehouses (id, type, market, is_active) VALUES
  ('10000000-0000-0000-0000-000000000001', 'central', 'turkey', true),
  ('10000000-0000-0000-0000-000000000002', 'sales', 'turkey', true);

INSERT INTO inventory_rehearsal.products (id, is_active)
VALUES ('20000000-0000-0000-0000-000000000001', true);

INSERT INTO inventory_rehearsal.wh_stock (warehouse_id, product_id, quantity) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 20),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 5);

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
  ELSIF v_warehouse_type = 'sales' THEN
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

CREATE OR REPLACE FUNCTION inventory_rehearsal.apply_stock_delta(
  p_warehouse_id uuid,
  p_product_id uuid,
  p_delta integer
)
RETURNS void
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
  IF NOT inventory_rehearsal.has_stock_permission(p_warehouse_id) THEN
    RAISE EXCEPTION 'stock permission required for this warehouse' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM inventory_rehearsal.products AS p
    WHERE p.id = p_product_id AND p.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'active product required' USING ERRCODE = '23503';
  END IF;

  INSERT INTO inventory_rehearsal.wh_stock AS current_stock (warehouse_id, product_id, quantity)
  VALUES (p_warehouse_id, p_product_id, p_delta)
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET quantity = current_stock.quantity + EXCLUDED.quantity
  WHERE current_stock.quantity + EXCLUDED.quantity >= 0
  RETURNING quantity INTO v_new_quantity;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient stock' USING ERRCODE = '23514';
  END IF;

  -- The movement is inserted in the same database transaction as the quantity change.
  INSERT INTO inventory_rehearsal.wh_movements
    (movement_type, product_id, from_warehouse_id, to_warehouse_id, quantity, delta, actor_id)
  VALUES
    ('delta', p_product_id,
     CASE WHEN p_delta < 0 THEN p_warehouse_id ELSE NULL END,
     CASE WHEN p_delta > 0 THEN p_warehouse_id ELSE NULL END,
     abs(p_delta), p_delta, v_actor);
END
$delta$;

CREATE OR REPLACE FUNCTION inventory_rehearsal.transfer_stock(
  p_from_warehouse_id uuid,
  p_to_warehouse_id uuid,
  p_product_id uuid,
  p_quantity integer
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
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'quantity must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_from_warehouse_id = p_to_warehouse_id THEN
    RAISE EXCEPTION 'source and destination must differ' USING ERRCODE = '22023';
  END IF;
  IF NOT inventory_rehearsal.has_stock_permission(p_from_warehouse_id)
     OR NOT inventory_rehearsal.has_stock_permission(p_to_warehouse_id) THEN
    RAISE EXCEPTION 'stock permission required for both warehouses' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM inventory_rehearsal.products AS p
    WHERE p.id = p_product_id AND p.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'active product required' USING ERRCODE = '23503';
  END IF;

  SELECT s.quantity INTO v_source_quantity
  FROM inventory_rehearsal.wh_stock AS s
  WHERE s.warehouse_id = p_from_warehouse_id AND s.product_id = p_product_id
  FOR UPDATE;

  IF NOT FOUND OR v_source_quantity < p_quantity THEN
    RAISE EXCEPTION 'insufficient source stock' USING ERRCODE = '23514';
  END IF;

  UPDATE inventory_rehearsal.wh_stock
  SET quantity = quantity - p_quantity
  WHERE warehouse_id = p_from_warehouse_id AND product_id = p_product_id;

  INSERT INTO inventory_rehearsal.wh_stock AS destination_stock
    (warehouse_id, product_id, quantity)
  VALUES (p_to_warehouse_id, p_product_id, p_quantity)
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET quantity = destination_stock.quantity + EXCLUDED.quantity;

  INSERT INTO inventory_rehearsal.wh_movements
    (movement_type, product_id, from_warehouse_id, to_warehouse_id, quantity, delta, actor_id)
  VALUES
    ('transfer', p_product_id, p_from_warehouse_id, p_to_warehouse_id, p_quantity, NULL, v_actor);
END
$transfer$;

-- SECURITY DEFINER APIs have no public/default EXECUTE path.
REVOKE ALL ON FUNCTION inventory_rehearsal.has_stock_permission(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory_rehearsal.apply_stock_delta(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory_rehearsal.transfer_stock(uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION inventory_rehearsal.apply_stock_delta(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_rehearsal.transfer_stock(uuid, uuid, uuid, integer) TO authenticated;

COMMIT;
