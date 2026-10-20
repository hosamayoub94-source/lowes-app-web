-- Acceptance tests for the disposable stock-RPC fixture only.
-- Every expected-denial assertion fails the CI job if the operation unexpectedly succeeds.
\echo 'Checking inventory mutation ACL contract...'

DO $acl$
BEGIN
  IF has_table_privilege('anon', 'inventory_rehearsal.wh_stock', 'INSERT')
     OR has_table_privilege('anon', 'inventory_rehearsal.wh_stock', 'UPDATE')
     OR has_table_privilege('anon', 'inventory_rehearsal.wh_stock', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL: anon still has direct stock mutation privileges';
  END IF;
  IF has_table_privilege('authenticated', 'inventory_rehearsal.wh_stock', 'INSERT')
     OR has_table_privilege('authenticated', 'inventory_rehearsal.wh_stock', 'UPDATE')
     OR has_table_privilege('authenticated', 'inventory_rehearsal.wh_stock', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL: authenticated still has direct stock mutation privileges';
  END IF;
  IF has_table_privilege('anon', 'inventory_rehearsal.wh_movements', 'INSERT')
     OR has_table_privilege('anon', 'inventory_rehearsal.wh_movements', 'UPDATE')
     OR has_table_privilege('anon', 'inventory_rehearsal.wh_movements', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL: anon still has direct movement-log mutation privileges';
  END IF;
  IF has_function_privilege('anon', 'inventory_rehearsal.wh_apply_stock_delta(uuid,uuid,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'inventory_rehearsal.wh_transfer_stock(uuid,uuid,uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon can execute a stock-mutation RPC';
  END IF;
  IF NOT has_function_privilege('authenticated', 'inventory_rehearsal.wh_apply_stock_delta(uuid,uuid,integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'inventory_rehearsal.wh_transfer_stock(uuid,uuid,uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: authenticated lacks the intended narrow RPC EXECUTE grants';
  END IF;
END
$acl$;

DO $derived_quantity_baseline$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.products
      WHERE id = '20000000-0000-0000-0000-000000000001') <> 25
     OR (SELECT COALESCE(SUM(quantity), 0) FROM inventory_rehearsal.wh_stock
         WHERE product_id = '20000000-0000-0000-0000-000000000001') <> 25 THEN
    RAISE EXCEPTION 'FAIL: products.quantity does not match the initial wh_stock total';
  END IF;
END
$derived_quantity_baseline$;

\echo 'Checking anon cannot mutate stock, audit, warehouse, or product...'
BEGIN;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $anon$
BEGIN
  BEGIN
    INSERT INTO inventory_rehearsal.wh_stock (warehouse_id, product_id, quantity)
    VALUES ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 99);
    RAISE EXCEPTION 'FAIL: anon inserted stock directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon direct stock insert denied';
  END;

  BEGIN
    UPDATE inventory_rehearsal.wh_stock SET quantity = 999;
    RAISE EXCEPTION 'FAIL: anon updated stock directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon direct stock update denied';
  END;

  BEGIN
    INSERT INTO inventory_rehearsal.wh_movements
      (type, product_id, quantity, performed_by)
    VALUES ('adjust', '20000000-0000-0000-0000-000000000001', 1, '00000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'FAIL: anon forged a movement log';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon movement-log insert denied';
  END;

  BEGIN
    DELETE FROM inventory_rehearsal.wh_movements;
    RAISE EXCEPTION 'FAIL: anon deleted movement history';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon movement-log delete denied';
  END;

  BEGIN
    UPDATE inventory_rehearsal.wh_warehouses SET market = 'attacker';
    RAISE EXCEPTION 'FAIL: anon changed warehouse configuration';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon warehouse update denied';
  END;

  BEGIN
    UPDATE inventory_rehearsal.products SET is_active = false;
    RAISE EXCEPTION 'FAIL: anon changed product catalog';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon product update denied';
  END;

  BEGIN
    PERFORM inventory_rehearsal.wh_apply_stock_delta(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001', 1
    );
    RAISE EXCEPTION 'FAIL: anon invoked apply_stock_delta';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon stock-delta RPC denied';
  END;

  BEGIN
    PERFORM inventory_rehearsal.wh_transfer_stock(
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001', 1
    );
    RAISE EXCEPTION 'FAIL: anon invoked transfer_stock';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon transfer RPC denied';
  END;
END
$anon$;
RESET ROLE;
DO $anon_unchanged$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000001'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 20
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000002'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 5
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements) <> 0
     OR (SELECT quantity FROM inventory_rehearsal.products
         WHERE id = '20000000-0000-0000-0000-000000000001') <> 25 THEN
    RAISE EXCEPTION 'FAIL: denied anon requests changed stock or movements';
  END IF;
END
$anon_unchanged$;
COMMIT;

\echo 'Checking JSONB permissions, inactive profiles, and explicit denials...'
BEGIN;
SET LOCAL ROLE authenticated;
DO $denials$
DECLARE
  denied_subject uuid;
BEGIN
  FOREACH denied_subject IN ARRAY ARRAY[
    '00000000-0000-0000-0000-000000000003'::uuid, -- employee without capability
    '00000000-0000-0000-0000-000000000004'::uuid, -- manager explicitly denied central stock
    '00000000-0000-0000-0000-000000000006'::uuid, -- inactive profile with extra capabilities
    '00000000-0000-0000-0000-000000000007'::uuid  -- sales_manager has no stock default
  ]
  LOOP
    PERFORM set_config('request.jwt.claim.sub', denied_subject::text, true);
    BEGIN
      PERFORM inventory_rehearsal.wh_apply_stock_delta(
        '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', 1
      );
      RAISE EXCEPTION 'FAIL: unauthorized profile % changed stock', denied_subject;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS: unauthorized/inactive profile % denied', denied_subject;
    END;
  END LOOP;

  -- The extra capability is central-only: it must not imply sales-stock permission.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
  BEGIN
    PERFORM inventory_rehearsal.wh_apply_stock_delta(
      '10000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001', 1
    );
    RAISE EXCEPTION 'FAIL: central-only employee changed sales stock';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: central-only capability does not grant sales-stock access';
  END;

  -- Explicit denials override warehouse_manager defaults for non-admin users.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000008', true);
  BEGIN
    PERFORM inventory_rehearsal.wh_apply_stock_delta(
      '10000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001', 1
    );
    RAISE EXCEPTION 'FAIL: warehouse_manager with an explicit sales denial changed stock';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: explicit sales-stock denial overrides warehouse_manager default';
  END;

  -- The same sales-stock denial covers a distributor warehouse, not only type=sales.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000008', true);
  BEGIN
    PERFORM inventory_rehearsal.wh_apply_stock_delta(
      '10000000-0000-0000-0000-000000000003',
      '20000000-0000-0000-0000-000000000001', 1
    );
    RAISE EXCEPTION 'FAIL: warehouse_manager with sales denial changed distributor stock';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: explicit sales-stock denial covers distributor warehouse';
  END;
END
$denials$;
RESET ROLE;
DO $denials_unchanged$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000001'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 20
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000002'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 5
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements) <> 0
     OR (SELECT quantity FROM inventory_rehearsal.products
         WHERE id = '20000000-0000-0000-0000-000000000001') <> 25 THEN
    RAISE EXCEPTION 'FAIL: denied profile requests changed stock or movements';
  END IF;
END
$denials_unchanged$;
COMMIT;

\echo 'Checking valid delta updates stock and movement atomically with Auth actor...'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
SELECT inventory_rehearsal.wh_apply_stock_delta(
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', 3
);
RESET ROLE;
DO $delta_success$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000001'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 23
     OR (SELECT quantity FROM inventory_rehearsal.products
         WHERE id = '20000000-0000-0000-0000-000000000001') <> 28 THEN
    RAISE EXCEPTION 'FAIL: authorized delta produced wrong quantity';
  END IF;
  IF (SELECT count(*) FROM inventory_rehearsal.wh_movements) <> 1 THEN
    RAISE EXCEPTION 'FAIL: successful delta did not create exactly one movement';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM inventory_rehearsal.wh_movements
    WHERE performed_by = '00000000-0000-0000-0000-000000000005'
      AND type = 'adjust' AND reason = 'delta=3' AND quantity = 3
  ) THEN
    RAISE EXCEPTION 'FAIL: movement actor was not bound to auth.uid()';
  END IF;
END
$delta_success$;
COMMIT;

\echo 'Checking rejected negative stock change rolls back without a movement...'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
DO $negative$
BEGIN
  BEGIN
    PERFORM inventory_rehearsal.wh_apply_stock_delta(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001', -999
    );
    RAISE EXCEPTION 'FAIL: operation produced negative stock';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: operation that would make stock negative denied';
  END;
END
$negative$;
RESET ROLE;
DO $negative_unchanged$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000001'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 23
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements) <> 1
     OR (SELECT quantity FROM inventory_rehearsal.products
         WHERE id = '20000000-0000-0000-0000-000000000001') <> 28 THEN
    RAISE EXCEPTION 'FAIL: rejected delta changed stock or audit history';
  END IF;
END
$negative_unchanged$;
COMMIT;

\echo 'Checking valid transfer is atomic and uses Auth actor...'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT inventory_rehearsal.wh_transfer_stock(
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000001', 4
);
RESET ROLE;
DO $transfer_success$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000001'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 19
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000002'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 9
     OR (SELECT quantity FROM inventory_rehearsal.products
         WHERE id = '20000000-0000-0000-0000-000000000001') <> 28 THEN
    RAISE EXCEPTION 'FAIL: transfer quantities do not reconcile';
  END IF;
  IF (SELECT count(*) FROM inventory_rehearsal.wh_movements) <> 2
     OR NOT EXISTS (
       SELECT 1 FROM inventory_rehearsal.wh_movements
       WHERE type = 'allocate'
         AND performed_by = '00000000-0000-0000-0000-000000000002'
         AND from_warehouse_id = '10000000-0000-0000-0000-000000000001'
         AND to_warehouse_id = '10000000-0000-0000-0000-000000000002'
         AND quantity = 4
     ) THEN
    RAISE EXCEPTION 'FAIL: transfer audit entry is missing or incorrect';
  END IF;
END
$transfer_success$;
COMMIT;

\echo 'Checking insufficient transfer leaves both warehouses and audit unchanged...'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
DO $transfer_rejected$
BEGIN
  BEGIN
    PERFORM inventory_rehearsal.wh_transfer_stock(
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001', 999
    );
    RAISE EXCEPTION 'FAIL: transfer accepted more stock than available';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: insufficient-stock transfer denied';
  END;
END
$transfer_rejected$;
RESET ROLE;
DO $transfer_unchanged$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000001'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 19
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000002'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 9
     OR (SELECT quantity FROM inventory_rehearsal.products
         WHERE id = '20000000-0000-0000-0000-000000000001') <> 28
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements) <> 2 THEN
    RAISE EXCEPTION 'FAIL: rejected transfer changed stock or audit history';
  END IF;
END
$transfer_unchanged$;
COMMIT;


\echo 'Checking audit-write failure rolls back the stock mutation...'
CREATE OR REPLACE FUNCTION inventory_rehearsal.fail_movement_insert_when_requested()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, inventory_rehearsal
AS $fail$
BEGIN
  IF current_setting('inventory_rehearsal.fail_audit', true) = 'on' THEN
    RAISE EXCEPTION 'forced audit failure for rollback test' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fail$;

CREATE TRIGGER rehearsal_force_audit_failure
BEFORE INSERT ON inventory_rehearsal.wh_movements
FOR EACH ROW EXECUTE FUNCTION inventory_rehearsal.fail_movement_insert_when_requested();

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT set_config('inventory_rehearsal.fail_audit', 'on', true);
DO $audit_rollback$
BEGIN
  BEGIN
    PERFORM inventory_rehearsal.wh_apply_stock_delta(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001', 2
    );
    RAISE EXCEPTION 'FAIL: stock mutation succeeded when audit insert failed';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: audit insert failure rejected the stock mutation';
  END;
END
$audit_rollback$;
RESET ROLE;
DO $audit_rollback_unchanged$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000001'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 19
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000002'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 9
     OR (SELECT quantity FROM inventory_rehearsal.products
         WHERE id = '20000000-0000-0000-0000-000000000001') <> 28
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements) <> 2 THEN
    RAISE EXCEPTION 'FAIL: stock or movement history changed after audit insertion failed';
  END IF;
END
$audit_rollback_unchanged$;
COMMIT;

DROP TRIGGER rehearsal_force_audit_failure ON inventory_rehearsal.wh_movements;
DROP FUNCTION inventory_rehearsal.fail_movement_insert_when_requested();

\echo 'Checking authenticated DB role with no Supabase Auth identity is denied...'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $no_auth_identity$
BEGIN
  BEGIN
    PERFORM inventory_rehearsal.wh_apply_stock_delta(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001', 1
    );
    RAISE EXCEPTION 'FAIL: profile-less authenticated session changed stock';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: authenticated role without auth.uid() cannot mutate stock';
  END;
END
$no_auth_identity$;
RESET ROLE;
DO $no_auth_identity_unchanged$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000001'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 19
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000002'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 9
     OR (SELECT quantity FROM inventory_rehearsal.products
         WHERE id = '20000000-0000-0000-0000-000000000001') <> 28
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements) <> 2 THEN
    RAISE EXCEPTION 'FAIL: missing-identity call changed stock or movement history';
  END IF;
END
$no_auth_identity_unchanged$;
COMMIT;

\echo 'Checking manager, warehouse-manager, and admin role defaults against JSONB overrides...'
BEGIN;
SET LOCAL ROLE authenticated;

-- A manager denied central stock is still allowed to manage sales stock.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT inventory_rehearsal.wh_apply_stock_delta(
  '10000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000001', 1
);

-- A warehouse manager retains its default central capability.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT inventory_rehearsal.wh_apply_stock_delta(
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', 1
);

-- The same default sales-stock capability includes distributor sub-warehouses.
SELECT inventory_rehearsal.wh_apply_stock_delta(
  '10000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000001', 1
);

-- Admin is unrestricted in the app's resolver, even if deny JSON contains keys.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT inventory_rehearsal.wh_apply_stock_delta(
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', 1
);
RESET ROLE;
-- Roll back allowed-call probes so the baseline used by tests remains identical.
ROLLBACK;

DO $permission_matrix_unchanged$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000001'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 19
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000002'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 9
     OR (SELECT quantity FROM inventory_rehearsal.products
         WHERE id = '20000000-0000-0000-0000-000000000001') <> 28
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements) <> 2 THEN
    RAISE EXCEPTION 'FAIL: rolled-back permission probes changed stock or movement history';
  END IF;
END
$permission_matrix_unchanged$;

\echo 'Checking exact-count adjustment is atomic and keeps product quantity in sync...'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT inventory_rehearsal.wh_set_stock_quantity(
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', 12, 'stocktake count'
);
RESET ROLE;
DO $set_count_down$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000001'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 12
     OR (SELECT quantity FROM inventory_rehearsal.products
         WHERE id = '20000000-0000-0000-0000-000000000001') <> 21
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements) <> 3
     OR NOT EXISTS (
       SELECT 1 FROM inventory_rehearsal.wh_movements
       WHERE type = 'adjust' AND quantity = 12 AND reason = 'stocktake count'
         AND performed_by = '00000000-0000-0000-0000-000000000002'
     ) THEN
    RAISE EXCEPTION 'FAIL: exact-count adjustment down did not keep stock, audit, and product mirror together';
  END IF;
END
$set_count_down$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT inventory_rehearsal.wh_set_stock_quantity(
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', 18, 'recount after receipt'
);
RESET ROLE;
DO $set_count_up$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000001'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 18
     OR (SELECT quantity FROM inventory_rehearsal.products
         WHERE id = '20000000-0000-0000-0000-000000000001') <> 27
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements) <> 4 THEN
    RAISE EXCEPTION 'FAIL: exact-count adjustment up did not keep stock, audit, and product mirror together';
  END IF;
END
$set_count_up$;
COMMIT;

\echo 'Checking zero is a valid exact stock count, but negative counts are rejected...'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT inventory_rehearsal.wh_set_stock_quantity(
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', 0, 'counted empty'
);
DO $negative_exact_count$
BEGIN
  BEGIN
    PERFORM inventory_rehearsal.wh_set_stock_quantity(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001', -1, 'invalid negative count'
    );
    RAISE EXCEPTION 'FAIL: exact-count adjustment accepted a negative quantity';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS: negative exact count denied';
  END;
END
$negative_exact_count$;
RESET ROLE;
DO $zero_count_unchanged$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000001'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 0
     OR (SELECT quantity FROM inventory_rehearsal.products
         WHERE id = '20000000-0000-0000-0000-000000000001') <> 9
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements) <> 5 THEN
    RAISE EXCEPTION 'FAIL: zero/negative exact-count tests left unexpected stock or audit rows';
  END IF;
END
$zero_count_unchanged$;
COMMIT;

\echo 'Checking exact-count adjustment rejects a session without auth.uid()...'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $exact_no_identity$
BEGIN
  BEGIN
    PERFORM inventory_rehearsal.wh_set_stock_quantity(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001', 7, 'no identity'
    );
    RAISE EXCEPTION 'FAIL: exact-count adjustment accepted a caller without auth.uid()';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: exact-count adjustment without Auth identity denied';
  END;
END
$exact_no_identity$;
RESET ROLE;
COMMIT;

\echo 'Checking audit-write failure rolls back exact-count adjustment...'
CREATE OR REPLACE FUNCTION inventory_rehearsal.fail_stock_adjustment_audit_when_requested()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, inventory_rehearsal
AS $fail_adjust_audit$
BEGIN
  IF current_setting('inventory_rehearsal.fail_adjust_audit', true) = 'on' THEN
    RAISE EXCEPTION 'forced exact-adjustment audit failure' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fail_adjust_audit$;

CREATE TRIGGER rehearsal_fail_stock_adjustment_audit
BEFORE INSERT ON inventory_rehearsal.wh_movements
FOR EACH ROW EXECUTE FUNCTION inventory_rehearsal.fail_stock_adjustment_audit_when_requested();

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT set_config('inventory_rehearsal.fail_adjust_audit', 'on', true);
DO $exact_audit_rollback$
BEGIN
  BEGIN
    PERFORM inventory_rehearsal.wh_set_stock_quantity(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001', 7, 'must roll back'
    );
    RAISE EXCEPTION 'FAIL: exact-count adjustment succeeded when audit insert failed';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: audit failure rejected exact-count adjustment';
  END;
END
$exact_audit_rollback$;
RESET ROLE;
DO $exact_audit_unchanged$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000001'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 0
     OR (SELECT quantity FROM inventory_rehearsal.products
         WHERE id = '20000000-0000-0000-0000-000000000001') <> 9
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements) <> 5 THEN
    RAISE EXCEPTION 'FAIL: exact-count audit failure changed stock, product mirror, or audit history';
  END IF;
END
$exact_audit_unchanged$;
COMMIT;

DROP TRIGGER rehearsal_fail_stock_adjustment_audit ON inventory_rehearsal.wh_movements;
DROP FUNCTION inventory_rehearsal.fail_stock_adjustment_audit_when_requested();

\echo 'PASS: disposable inventory RPC authorization contract rehearsal complete.'
