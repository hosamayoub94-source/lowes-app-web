-- LOWE'S P0 warehouse-access hardening candidate
-- STATUS: CANDIDATE ONLY. DO NOT APPLY TO PRODUCTION.
-- Intended for an isolated, restorable staging clone after frontend release coordination.
-- This candidate replaces the four audited permissive policies with role-scoped access,
-- routes stock mutations through SECURITY DEFINER operations with server-side permission
-- checks, and writes inventory movement rows in the same database transaction.
--
-- Dependencies verified against the 2026-10-19 read-only catalog:
--   profiles(id, employee_name, role_type, is_active, employment_status,
--            extra_permissions, denied_permissions, warehouse_id)
--   products(id, name, name_en, is_active)
--   wh_warehouses(id, name, type, market, is_active)
--   wh_stock(warehouse_id, product_id, quantity, updated_at), unique warehouse/product
--   wh_movements(product_id, from_warehouse_id, to_warehouse_id, quantity, type,
--                reason, performed_by, order_id, reverses_id, created_at)
--   orders(id, market, status, items, handler_name, brand, source)
--
-- Existing UI permission names/defaults mirrored from src/data/permissions.js:
--   manage_central_stock, manage_sales_stock, manage_orders, manage_products, view_inventory.
-- Extra permissions and denied permissions are evaluated for non-admin users.
--
-- This is a draft. It must pass the companion disposable-PostgreSQL tests and actual
-- app integration tests before any deployment. It does not secure orders/profiles globally.

BEGIN;

-- Fail closed if live policy state drifted since the source audit. Do not silently layer
-- a new policy over an unknown permissive policy: permissive policies combine with OR.
DO $preflight$
DECLARE
  v_count integer;
BEGIN
  IF to_regclass('public.profiles') IS NULL
     OR to_regclass('public.products') IS NULL
     OR to_regclass('public.wh_warehouses') IS NULL
     OR to_regclass('public.wh_stock') IS NULL
     OR to_regclass('public.wh_movements') IS NULL
     OR to_regclass('public.orders') IS NULL THEN
    RAISE EXCEPTION 'WAREHOUSE_HARDENING_ABORT: one or more required tables are missing';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('products', 'wh_warehouses', 'wh_stock', 'wh_movements');

  IF v_count <> 4
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='products' AND policyname='products_all')
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='wh_warehouses' AND policyname='wh_warehouses_all')
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='wh_stock' AND policyname='wh_stock_all')
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='wh_movements' AND policyname='wh_movements_all') THEN
    RAISE EXCEPTION 'WAREHOUSE_HARDENING_ABORT: policy inventory differs from reviewed 2026-10-19 baseline';
  END IF;
END
$preflight$;

-- Normalize product names consistently with the current warehouseService client mapping.
CREATE OR REPLACE FUNCTION public.lowes_normalize_product_name(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT regexp_replace(
    regexp_replace(
      translate(
        replace(lower(coalesce(p_value, '')), 'i̇', 'i'),
        'ıişğçöü',
        'iisgcou'
      ),
      '[^a-z0-9؀-ۿ]',
      '',
      'g'
    ),
    '^lowes',
    ''
  );
$function$;

CREATE OR REPLACE FUNCTION public.lowes_canonical_order_item_name(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT CASE public.lowes_normalize_product_name(p_value)
    WHEN 'rosemaryserum' THEN 'rosemaryoil'
    WHEN 'bodytoner' THEN public.lowes_normalize_product_name('PORE TIHGTENNING & PURIFINE TONER')
    WHEN 'sakalvebiyikserumu' THEN 'beardserum'
    WHEN 'gogusbakimserum' THEN 'breastcareserum'
    WHEN 'whithingcream' THEN 'whiteningcream'
    ELSE public.lowes_normalize_product_name(p_value)
  END;
$function$;

-- Database-side permission resolver matching the relevant role defaults from the app.
-- It intentionally derives identity from auth.uid(), never from a caller-supplied profile ID.
CREATE OR REPLACE FUNCTION public.lowes_staff_has_permission(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND coalesce(p.is_active, true) = true
      AND (
        p.role_type = 'admin'
        OR (
          NOT (coalesce(p.denied_permissions, '[]'::jsonb) ? p_permission)
          AND (
            coalesce(p.extra_permissions, '[]'::jsonb) ? p_permission
            OR CASE p.role_type
              WHEN 'manager' THEN p_permission = ANY (ARRAY[
                'manage_orders', 'manage_products', 'manage_central_stock',
                'manage_sales_stock', 'view_inventory'
              ]::text[])
              WHEN 'sales_manager' THEN p_permission = ANY (ARRAY[
                'manage_orders', 'manage_products', 'view_inventory'
              ]::text[])
              WHEN 'media_buyer' THEN p_permission = 'manage_orders'
              WHEN 'warehouse_manager' THEN p_permission = ANY (ARRAY[
                'manage_central_stock', 'manage_sales_stock', 'view_inventory'
              ]::text[])
              ELSE false
            END
          )
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.lowes_normalize_product_name(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lowes_canonical_order_item_name(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lowes_staff_has_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lowes_normalize_product_name(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lowes_canonical_order_item_name(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lowes_staff_has_permission(text) TO authenticated, service_role;

-- Manual stock receipt + movement audit are one transaction.
CREATE OR REPLACE FUNCTION public.wh_receive_stock(
  p_product uuid,
  p_warehouse uuid,
  p_quantity integer,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_actor text;
BEGIN
  IF NOT public.lowes_staff_has_permission('manage_central_stock') THEN
    RAISE EXCEPTION 'warehouse: manage_central_stock permission required' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'quantity must be > 0' USING ERRCODE = '22023';
  END IF;
  SELECT p.employee_name INTO v_actor FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = p_product) THEN
    RAISE EXCEPTION 'product not found' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.wh_warehouses w WHERE w.id = p_warehouse AND w.is_active = true
  ) THEN
    RAISE EXCEPTION 'active warehouse not found' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.wh_stock (warehouse_id, product_id, quantity, updated_at)
  VALUES (p_warehouse, p_product, p_quantity, now())
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET quantity = public.wh_stock.quantity + EXCLUDED.quantity, updated_at = now();

  INSERT INTO public.wh_movements
    (product_id, from_warehouse_id, to_warehouse_id, quantity, type, reason, performed_by)
  VALUES
    (p_product, NULL, p_warehouse, p_quantity, 'receive', nullif(btrim(coalesce(p_reason, '')), ''), v_actor);
END;
$function$;

-- Atomic inter-warehouse transfer, with permission check and audit row.
CREATE OR REPLACE FUNCTION public.wh_transfer_stock(
  p_from uuid,
  p_to uuid,
  p_product uuid,
  p_qty integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_from_qty integer;
  v_actor text;
BEGIN
  IF NOT public.lowes_staff_has_permission('manage_central_stock') THEN
    RAISE EXCEPTION 'warehouse: manage_central_stock permission required' USING ERRCODE = '42501';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'qty must be > 0' USING ERRCODE = '22023';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from = p_to THEN
    RAISE EXCEPTION 'source and destination must be different warehouses' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = p_product) THEN
    RAISE EXCEPTION 'product not found' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.wh_warehouses w WHERE w.id = p_from AND w.is_active = true)
     OR NOT EXISTS (SELECT 1 FROM public.wh_warehouses w WHERE w.id = p_to AND w.is_active = true) THEN
    RAISE EXCEPTION 'active source and destination warehouses required' USING ERRCODE = '23503';
  END IF;

  PERFORM 1
  FROM public.wh_stock s
  WHERE s.product_id = p_product AND s.warehouse_id IN (p_from, p_to)
  ORDER BY s.warehouse_id
  FOR UPDATE;

  SELECT s.quantity INTO v_from_qty
  FROM public.wh_stock s
  WHERE s.warehouse_id = p_from AND s.product_id = p_product;

  IF coalesce(v_from_qty, 0) < p_qty THEN
    RAISE EXCEPTION 'insufficient stock: have %, need %', coalesce(v_from_qty, 0), p_qty
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.wh_stock
  SET quantity = quantity - p_qty, updated_at = now()
  WHERE warehouse_id = p_from AND product_id = p_product;

  INSERT INTO public.wh_stock (warehouse_id, product_id, quantity, updated_at)
  VALUES (p_to, p_product, p_qty, now())
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET quantity = public.wh_stock.quantity + EXCLUDED.quantity, updated_at = now();

  SELECT p.employee_name INTO v_actor FROM public.profiles p WHERE p.id = auth.uid();
  INSERT INTO public.wh_movements
    (product_id, from_warehouse_id, to_warehouse_id, quantity, type, reason, performed_by)
  VALUES (p_product, p_from, p_to, p_qty, 'allocate', NULL, v_actor);
END;
$function$;

-- Exact stocktake correction + audit are atomic.
CREATE OR REPLACE FUNCTION public.wh_adjust_stock(
  p_product uuid,
  p_warehouse uuid,
  p_new_quantity integer,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_actor text;
BEGIN
  IF NOT (
    public.lowes_staff_has_permission('manage_central_stock')
    OR public.lowes_staff_has_permission('manage_sales_stock')
  ) THEN
    RAISE EXCEPTION 'warehouse: stock adjustment permission required' USING ERRCODE = '42501';
  END IF;
  IF p_new_quantity IS NULL OR p_new_quantity < 0 THEN
    RAISE EXCEPTION 'new quantity must be >= 0' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = p_product) THEN
    RAISE EXCEPTION 'product not found' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.wh_warehouses w WHERE w.id = p_warehouse AND w.is_active = true) THEN
    RAISE EXCEPTION 'active warehouse not found' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.wh_stock (warehouse_id, product_id, quantity, updated_at)
  VALUES (p_warehouse, p_product, p_new_quantity, now())
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now();

  SELECT p.employee_name INTO v_actor FROM public.profiles p WHERE p.id = auth.uid();
  INSERT INTO public.wh_movements
    (product_id, from_warehouse_id, to_warehouse_id, quantity, type, reason, performed_by)
  VALUES (p_product, p_warehouse, p_warehouse, p_new_quantity, 'adjust',
          coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'جرد/تصحيح'), v_actor);
END;
$function$;

-- Waste/write-off checks and changes quantity under the same row lock/transaction.
CREATE OR REPLACE FUNCTION public.wh_write_off_stock(
  p_product uuid,
  p_warehouse uuid,
  p_quantity integer,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_have integer;
  v_actor text;
BEGIN
  IF NOT (
    public.lowes_staff_has_permission('manage_central_stock')
    OR public.lowes_staff_has_permission('manage_sales_stock')
  ) THEN
    RAISE EXCEPTION 'warehouse: stock write-off permission required' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'quantity must be > 0' USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'write-off reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT s.quantity INTO v_have
  FROM public.wh_stock s
  WHERE s.warehouse_id = p_warehouse AND s.product_id = p_product
  FOR UPDATE;

  IF coalesce(v_have, 0) < p_quantity THEN
    RAISE EXCEPTION 'insufficient stock: have %, need %', coalesce(v_have, 0), p_quantity
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.wh_stock
  SET quantity = quantity - p_quantity, updated_at = now()
  WHERE warehouse_id = p_warehouse AND product_id = p_product;

  SELECT p.employee_name INTO v_actor FROM public.profiles p WHERE p.id = auth.uid();
  INSERT INTO public.wh_movements
    (product_id, from_warehouse_id, to_warehouse_id, quantity, type, reason, performed_by)
  VALUES (p_product, p_warehouse, NULL, p_quantity, 'waste',
          nullif(btrim(p_reason), ''), v_actor);
END;
$function$;

-- Reversal is idempotent and writes the counter-movement with the stock change in one txn.
CREATE OR REPLACE FUNCTION public.wh_reverse_movement(p_movement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_original public.wh_movements%ROWTYPE;
  v_actor text;
BEGIN
  IF NOT public.lowes_staff_has_permission('manage_central_stock') THEN
    RAISE EXCEPTION 'warehouse: manage_central_stock permission required' USING ERRCODE = '42501';
  END IF;

  SELECT m.* INTO v_original
  FROM public.wh_movements m
  WHERE m.id = p_movement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'movement not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_original.type NOT IN ('receive', 'allocate', 'waste') THEN
    RAISE EXCEPTION 'movement type cannot be reversed' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.wh_movements m WHERE m.reverses_id = v_original.id) THEN
    RAISE EXCEPTION 'movement already reversed' USING ERRCODE = '23505';
  END IF;

  SELECT p.employee_name INTO v_actor FROM public.profiles p WHERE p.id = auth.uid();

  IF v_original.type = 'receive' THEN
    IF v_original.to_warehouse_id IS NULL THEN RAISE EXCEPTION 'receive movement missing destination'; END IF;
    INSERT INTO public.wh_stock (warehouse_id, product_id, quantity, updated_at)
    VALUES (v_original.to_warehouse_id, v_original.product_id, -v_original.quantity, now())
    ON CONFLICT (warehouse_id, product_id)
    DO UPDATE SET quantity = public.wh_stock.quantity + EXCLUDED.quantity, updated_at = now();

    INSERT INTO public.wh_movements
      (product_id, from_warehouse_id, to_warehouse_id, quantity, type, reason, performed_by, reverses_id)
    VALUES (v_original.product_id, v_original.to_warehouse_id, NULL, v_original.quantity,
            'reverse', 'تراجع عن استلام', v_actor, v_original.id);

  ELSIF v_original.type = 'waste' THEN
    IF v_original.from_warehouse_id IS NULL THEN RAISE EXCEPTION 'waste movement missing source'; END IF;
    INSERT INTO public.wh_stock (warehouse_id, product_id, quantity, updated_at)
    VALUES (v_original.from_warehouse_id, v_original.product_id, v_original.quantity, now())
    ON CONFLICT (warehouse_id, product_id)
    DO UPDATE SET quantity = public.wh_stock.quantity + EXCLUDED.quantity, updated_at = now();

    INSERT INTO public.wh_movements
      (product_id, from_warehouse_id, to_warehouse_id, quantity, type, reason, performed_by, reverses_id)
    VALUES (v_original.product_id, NULL, v_original.from_warehouse_id, v_original.quantity,
            'reverse', 'تراجع عن إتلاف', v_actor, v_original.id);

  ELSE
    IF v_original.from_warehouse_id IS NULL OR v_original.to_warehouse_id IS NULL THEN
      RAISE EXCEPTION 'allocate movement missing source/destination';
    END IF;

    PERFORM 1
    FROM public.wh_stock s
    WHERE s.product_id = v_original.product_id
      AND s.warehouse_id IN (v_original.from_warehouse_id, v_original.to_warehouse_id)
    ORDER BY s.warehouse_id
    FOR UPDATE;

    INSERT INTO public.wh_stock (warehouse_id, product_id, quantity, updated_at)
    VALUES (v_original.from_warehouse_id, v_original.product_id, v_original.quantity, now())
    ON CONFLICT (warehouse_id, product_id)
    DO UPDATE SET quantity = public.wh_stock.quantity + EXCLUDED.quantity, updated_at = now();

    INSERT INTO public.wh_stock (warehouse_id, product_id, quantity, updated_at)
    VALUES (v_original.to_warehouse_id, v_original.product_id, -v_original.quantity, now())
    ON CONFLICT (warehouse_id, product_id)
    DO UPDATE SET quantity = public.wh_stock.quantity + EXCLUDED.quantity, updated_at = now();

    INSERT INTO public.wh_movements
      (product_id, from_warehouse_id, to_warehouse_id, quantity, type, reason, performed_by, reverses_id)
    VALUES (v_original.product_id, v_original.to_warehouse_id, v_original.from_warehouse_id,
            v_original.quantity, 'reverse', 'تراجع عن تخصيص', v_actor, v_original.id);
  END IF;
END;
$function$;

-- Server-side order-status stock sync. It reads the persisted order, maps its items to
-- catalog products, chooses the same source warehouse, and writes reserve/release rows.
-- Caller cannot pass an arbitrary product, warehouse, actor name, or quantity.
CREATE OR REPLACE FUNCTION public.wh_sync_order_stock(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_actor text;
  v_desired_out boolean;
  v_current_net bigint;
  v_warehouse uuid;
  v_handler_warehouse uuid;
  v_handler_market text;
  v_item jsonb;
  v_item_name text;
  v_name_key text;
  v_product uuid;
  v_qty integer;
  v_move record;
BEGIN
  IF NOT public.lowes_staff_has_permission('manage_orders') THEN
    RAISE EXCEPTION 'warehouse: manage_orders permission required' USING ERRCODE = '42501';
  END IF;

  SELECT o.* INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF coalesce(v_order.brand, 'lowes') <> 'lowes'
     OR coalesce(v_order.source, '') IN ('star_network', 'uae_sheet_import') THEN
    RETURN;
  END IF;

  v_desired_out := v_order.status IN (
    'preparing', 'ready', 'motor_prep', 'at_center', 'shipped',
    'on_way', 'special_delivery', 'motor', 'prepaid', 'delivered', 'settled'
  );

  SELECT coalesce(sum(CASE WHEN m.type = 'reserve' THEN m.quantity ELSE -m.quantity END), 0)
  INTO v_current_net
  FROM public.wh_movements m
  WHERE m.order_id = v_order.id AND m.type IN ('reserve', 'release');

  SELECT p.employee_name INTO v_actor FROM public.profiles p WHERE p.id = auth.uid();

  -- Match the original client behavior: reserve only if no net reservation exists;
  -- release only when a reservation exists. The order row lock serializes concurrent syncs.
  IF v_desired_out AND v_current_net > 0 THEN
    RETURN;
  ELSIF NOT v_desired_out AND v_current_net <= 0 THEN
    RETURN;
  END IF;

  IF v_desired_out THEN
    v_warehouse := NULL;

    IF v_order.handler_name IS NOT NULL THEN
      SELECT p.warehouse_id, w.market
      INTO v_handler_warehouse, v_handler_market
      FROM public.profiles p
      LEFT JOIN public.wh_warehouses w ON w.id = p.warehouse_id
      WHERE p.employee_name = v_order.handler_name
      LIMIT 1;

      IF v_handler_warehouse IS NOT NULL
         AND (v_handler_market IS NULL OR v_handler_market = v_order.market) THEN
        v_warehouse := v_handler_warehouse;
      END IF;
    END IF;

    IF v_warehouse IS NULL THEN
      SELECT w.id INTO v_warehouse
      FROM public.wh_warehouses w
      WHERE w.type = 'sales'
        AND w.market = v_order.market
        AND w.is_active = true
      ORDER BY w.created_at
      LIMIT 1;
    END IF;

    IF v_warehouse IS NULL THEN
      RETURN;
    END IF;

    FOR v_item IN
      SELECT e.value
      FROM jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) AS e(value)
    LOOP
      v_item_name := v_item ->> 'name';
      v_name_key := public.lowes_canonical_order_item_name(v_item_name);
      IF coalesce(v_name_key, '') = '' THEN CONTINUE; END IF;

      SELECT p.id INTO v_product
      FROM public.products p
      WHERE public.lowes_normalize_product_name(p.name) = v_name_key
         OR public.lowes_normalize_product_name(p.name_en) = v_name_key
      LIMIT 1;

      IF NOT FOUND THEN CONTINUE; END IF;

      v_qty := coalesce(nullif(v_item ->> 'qty', '')::integer, 1);
      IF v_qty <= 0 THEN CONTINUE; END IF;

      INSERT INTO public.wh_stock (warehouse_id, product_id, quantity, updated_at)
      VALUES (v_warehouse, v_product, -v_qty, now())
      ON CONFLICT (warehouse_id, product_id)
      DO UPDATE SET quantity = public.wh_stock.quantity + EXCLUDED.quantity, updated_at = now();

      INSERT INTO public.wh_movements
        (product_id, from_warehouse_id, to_warehouse_id, quantity, type, reason, performed_by, order_id)
      VALUES (v_product, v_warehouse, NULL, v_qty, 'reserve', 'حجز طلب (في التجهيز)', v_actor, v_order.id);
    END LOOP;

  ELSE
    FOR v_move IN
      SELECT
        CASE WHEN m.type = 'reserve' THEN m.from_warehouse_id ELSE m.to_warehouse_id END AS warehouse_id,
        m.product_id,
        sum(CASE WHEN m.type = 'reserve' THEN m.quantity ELSE -m.quantity END)::integer AS net_quantity
      FROM public.wh_movements m
      WHERE m.order_id = v_order.id AND m.type IN ('reserve', 'release')
      GROUP BY 1, 2
      HAVING sum(CASE WHEN m.type = 'reserve' THEN m.quantity ELSE -m.quantity END) > 0
      ORDER BY 1, 2
    LOOP
      IF v_move.warehouse_id IS NULL OR v_move.net_quantity <= 0 THEN CONTINUE; END IF;

      INSERT INTO public.wh_stock (warehouse_id, product_id, quantity, updated_at)
      VALUES (v_move.warehouse_id, v_move.product_id, v_move.net_quantity, now())
      ON CONFLICT (warehouse_id, product_id)
      DO UPDATE SET quantity = public.wh_stock.quantity + EXCLUDED.quantity, updated_at = now();

      INSERT INTO public.wh_movements
        (product_id, from_warehouse_id, to_warehouse_id, quantity, type, reason, performed_by, order_id)
      VALUES (v_move.product_id, NULL, v_move.warehouse_id, v_move.net_quantity,
              'release', 'استرداد للمخزون', v_actor, v_order.id);
    END LOOP;
  END IF;
END;
$function$;

-- Assignment helper avoids a browser-side UPDATE to profiles.warehouse_id.
CREATE OR REPLACE FUNCTION public.wh_assign_seller_warehouse(
  p_profile_id uuid,
  p_warehouse_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF NOT public.lowes_staff_has_permission('manage_central_stock') THEN
    RAISE EXCEPTION 'warehouse: manage_central_stock permission required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_profile_id) THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_warehouse_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.wh_warehouses w WHERE w.id = p_warehouse_id AND w.is_active = true
     ) THEN
    RAISE EXCEPTION 'active warehouse not found' USING ERRCODE = '23503';
  END IF;

  UPDATE public.profiles SET warehouse_id = p_warehouse_id WHERE id = p_profile_id;
END;
$function$;

-- Close RPC execution to anon/PUBLIC. Only real authenticated sessions may call these
-- entry points; each function still verifies the business permission itself.
REVOKE ALL ON FUNCTION public.wh_apply_stock_delta(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wh_transfer_stock(uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wh_receive_stock(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wh_adjust_stock(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wh_write_off_stock(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wh_reverse_movement(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wh_sync_order_stock(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wh_assign_seller_warehouse(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.wh_transfer_stock(uuid, uuid, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wh_receive_stock(uuid, uuid, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wh_adjust_stock(uuid, uuid, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wh_write_off_stock(uuid, uuid, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wh_reverse_movement(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wh_sync_order_stock(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wh_assign_seller_warehouse(uuid, uuid) TO authenticated, service_role;

-- Replace all broad table privileges for the target tables. Explicit column ACLs exist on
-- products.cost_usd and products.ad_cost_per_unit_usd; revoke their anon writes separately.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.wh_stock, public.wh_movements, public.wh_warehouses, public.products
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT (cost_usd, ad_cost_per_unit_usd), UPDATE (cost_usd, ad_cost_per_unit_usd)
  ON TABLE public.products FROM anon;

GRANT SELECT ON TABLE public.wh_stock, public.wh_movements, public.wh_warehouses TO authenticated;
GRANT SELECT ON TABLE public.products TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.wh_warehouses TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.products TO authenticated;

-- Drop the exact baseline policies before installing the operation-specific rules.
DROP POLICY IF EXISTS wh_stock_all ON public.wh_stock;
DROP POLICY IF EXISTS wh_movements_all ON public.wh_movements;
DROP POLICY IF EXISTS wh_warehouses_all ON public.wh_warehouses;
DROP POLICY IF EXISTS products_all ON public.products;

ALTER TABLE public.wh_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wh_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wh_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY wh_stock_read_authorized
  ON public.wh_stock FOR SELECT TO authenticated
  USING (
    public.lowes_staff_has_permission('view_inventory')
    OR public.lowes_staff_has_permission('manage_central_stock')
    OR public.lowes_staff_has_permission('manage_sales_stock')
  );

CREATE POLICY wh_movements_read_authorized
  ON public.wh_movements FOR SELECT TO authenticated
  USING (
    public.lowes_staff_has_permission('view_inventory')
    OR public.lowes_staff_has_permission('manage_central_stock')
    OR public.lowes_staff_has_permission('manage_sales_stock')
  );

CREATE POLICY wh_warehouses_read_authorized
  ON public.wh_warehouses FOR SELECT TO authenticated
  USING (
    public.lowes_staff_has_permission('view_inventory')
    OR public.lowes_staff_has_permission('manage_central_stock')
    OR public.lowes_staff_has_permission('manage_sales_stock')
  );
CREATE POLICY wh_warehouses_insert_authorized
  ON public.wh_warehouses FOR INSERT TO authenticated
  WITH CHECK (public.lowes_staff_has_permission('manage_central_stock'));
CREATE POLICY wh_warehouses_update_authorized
  ON public.wh_warehouses FOR UPDATE TO authenticated
  USING (public.lowes_staff_has_permission('manage_central_stock'))
  WITH CHECK (public.lowes_staff_has_permission('manage_central_stock'));

-- Product SELECT stays compatible with the current staff login/read paths for now.
-- Anonymous product-data minimization is a separate follow-up; public product SELECT
-- should not be mistaken for permission to mutate the catalog.
CREATE POLICY products_read_compatible
  ON public.products FOR SELECT TO anon, authenticated
  USING (true);
CREATE POLICY products_insert_authorized
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.lowes_staff_has_permission('manage_products'));
CREATE POLICY products_update_authorized
  ON public.products FOR UPDATE TO authenticated
  USING (public.lowes_staff_has_permission('manage_products'))
  WITH CHECK (public.lowes_staff_has_permission('manage_products'));
CREATE POLICY products_delete_authorized
  ON public.products FOR DELETE TO authenticated
  USING (public.lowes_staff_has_permission('manage_products'));

COMMIT;

-- Acceptance checks to run read-only in a staging clone:
-- 1. anon cannot read/write wh_stock/wh_movements/wh_warehouses and cannot write products.
-- 2. authenticated users without the capability cannot mutate stock through tables or RPCs.
-- 3. authorized stock receive, transfer, adjust, write-off, reversal, and order reserve/release
--    each update quantity and create exactly one matching movement row atomically.
-- 4. role defaults, extra_permissions, denied_permissions, and inactive-profile behavior match
--    src/data/permissions.js. Note admin is always granted as in sessionCan().
-- 5. real staff sign-in must yield a Supabase Auth JWT. Manual-session fallback is not sufficient.
