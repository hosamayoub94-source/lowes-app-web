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
  IF has_function_privilege('anon', 'inventory_rehearsal.wh_set_stock_quantity(uuid,uuid,integer,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon can execute exact-count stock adjustment';
  END IF;
  IF NOT has_function_privilege('authenticated', 'inventory_rehearsal.wh_apply_stock_delta(uuid,uuid,integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'inventory_rehearsal.wh_transfer_stock(uuid,uuid,uuid,integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'inventory_rehearsal.wh_set_stock_quantity(uuid,uuid,integer,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: authenticated lacks the intended narrow inventory RPC EXECUTE grants';
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

  BEGIN
    PERFORM inventory_rehearsal.wh_set_stock_quantity(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001', 99, 'anon attempt'
    );
    RAISE EXCEPTION 'FAIL: anon invoked exact-count stock adjustment';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon exact-count adjustment RPC denied';
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

\echo 'Checking negative delta against a missing stock row is rejected without a database CHECK constraint...'
DO $fixture_matches_live_stock_constraints$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'inventory_rehearsal.wh_stock'::regclass
      AND contype = 'c'
  ) THEN
    RAISE EXCEPTION 'FAIL: fixture must not depend on a wh_stock CHECK constraint to prevent negative stock';
  END IF;
END
$fixture_matches_live_stock_constraints$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
DO $negative_missing_row$
BEGIN
  BEGIN
    PERFORM inventory_rehearsal.wh_apply_stock_delta(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000002', -3
    );
    RAISE EXCEPTION 'FAIL: negative delta inserted a missing stock row';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: missing-row negative delta denied by RPC guard';
  END;
END
$negative_missing_row$;
RESET ROLE;
DO $negative_missing_row_unchanged$
BEGIN
  IF EXISTS (
    SELECT 1 FROM inventory_rehearsal.wh_stock
    WHERE warehouse_id = '10000000-0000-0000-0000-000000000001'
      AND product_id = '20000000-0000-0000-0000-000000000002'
  )
     OR (SELECT quantity FROM inventory_rehearsal.products
         WHERE id = '20000000-0000-0000-0000-000000000002') <> 0
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements) <> 0
     OR (SELECT quantity FROM inventory_rehearsal.products
         WHERE id = '20000000-0000-0000-0000-000000000001') <> 25 THEN
    RAISE EXCEPTION 'FAIL: rejected missing-row negative delta changed stock, audit, or product mirror';
  END IF;
END
$negative_missing_row_unchanged$;
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

\echo 'Preparing synthetic order fixtures for atomic stock lifecycle tests...'
TRUNCATE inventory_rehearsal.wh_movements;
TRUNCATE inventory_rehearsal.orders;

INSERT INTO inventory_rehearsal.wh_stock AS fixture_stock
  (warehouse_id, product_id, quantity, updated_at)
VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 20, pg_catalog.now()),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 5, pg_catalog.now()),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 8, pg_catalog.now()),
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 9, pg_catalog.now()),
  ('10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', 6, pg_catalog.now()),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 10, pg_catalog.now()),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 4, pg_catalog.now()),
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 3, pg_catalog.now())
ON CONFLICT (warehouse_id, product_id)
DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = pg_catalog.now();

INSERT INTO inventory_rehearsal.orders
  (id, status, market, brand, source, handler_name, items)
VALUES
  ('30000000-0000-0000-0000-000000000001', 'pending', 'syria', 'lowes', NULL, 'Seller Syria',
   '[{"name":"ROSEMARY SERUM","qty":2},{"name":"Vitamin C Serum","qty":1},{"name":"Untracked add-on","qty":50}]'::jsonb),
  ('30000000-0000-0000-0000-000000000002', 'pending', 'syria', 'lowes', NULL, 'Seller Syria',
   '[{"name":"Rosemary Oil","qty":2},{"name":"Vitamin C Serum","qty":500}]'::jsonb),
  ('30000000-0000-0000-0000-000000000003', 'pending', 'uae', 'lowes', NULL, 'Seller Syria',
   '[{"name":"Rosemary Oil","qty":1}]'::jsonb),
  ('30000000-0000-0000-0000-000000000004', 'pending', 'turkey', 'lowes', 'star_network', NULL,
   '[{"name":"Rosemary Oil","qty":1}]'::jsonb),
  ('30000000-0000-0000-0000-000000000005', 'pending', 'uae', 'lowes', 'uae_sheet_import', NULL,
   '[{"name":"Rosemary Oil","qty":1}]'::jsonb),
  ('30000000-0000-0000-0000-000000000006', 'pending', 'syria', 'strong', NULL, 'Seller Syria',
   '[{"name":"Rosemary Oil","qty":1}]'::jsonb),
  ('30000000-0000-0000-0000-000000000007', 'pending', 'turkey', 'lowes', NULL, 'Seller Syria',
   '[{"name":"Rosemary Oil","qty":1}]'::jsonb),
  ('30000000-0000-0000-0000-000000000008', 'pending', 'syria', 'lowes', NULL, 'Seller Syria',
   '[{"name":"Rosemary Oil","qty":"bad"}]'::jsonb),
  ('30000000-0000-0000-0000-000000000009', 'pending', 'syria', 'lowes', NULL, 'Seller Syria',
   '[{"name":"Rosemary Oil","qty":2},{"name":"Vitamin C Serum","qty":1}]'::jsonb),
  ('30000000-0000-0000-0000-000000000010', 'pending', 'turkey', 'lowes', NULL, 'Ordinary Employee',
   '[{"name":"Rosemary Oil","qty":1}]'::jsonb),
  ('30000000-0000-0000-0000-000000000011', 'pending', 'turkey', 'lowes', NULL, 'Denied Owner Tester',
   '[{"name":"Rosemary Oil","qty":1}]'::jsonb);

\echo 'Checking order-manager role can reserve trusted persisted order items without stock-write permission...'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT inventory_rehearsal.wh_transition_order_status(
  '30000000-0000-0000-0000-000000000001', 'preparing'
);
RESET ROLE;
DO $order_reserve_success$
BEGIN
  IF (SELECT status FROM inventory_rehearsal.orders
      WHERE id = '30000000-0000-0000-0000-000000000001') <> 'preparing'
     OR (SELECT updated_by FROM inventory_rehearsal.orders
         WHERE id = '30000000-0000-0000-0000-000000000001') <> 'Order Manager'
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
           AND product_id = '20000000-0000-0000-0000-000000000001') <> 6
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
           AND product_id = '20000000-0000-0000-0000-000000000002') <> 3
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements
         WHERE order_id = '30000000-0000-0000-0000-000000000001' AND type = 'reserve') <> 2
     OR EXISTS (SELECT 1 FROM inventory_rehearsal.wh_movements
                WHERE order_id = '30000000-0000-0000-0000-000000000001' AND type <> 'reserve') THEN
    RAISE EXCEPTION 'FAIL: order transition did not reserve matched items and attribute the trusted actor';
  END IF;
END
$order_reserve_success$;
COMMIT;

\echo 'Checking repeated status updates are idempotent and deducted-to-deducted transitions do not reserve twice...'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000007', true);
SELECT inventory_rehearsal.wh_transition_order_status(
  '30000000-0000-0000-0000-000000000001', 'preparing'
);
SELECT inventory_rehearsal.wh_transition_order_status(
  '30000000-0000-0000-0000-000000000001', 'shipped'
);
RESET ROLE;
DO $order_idempotent$
BEGIN
  IF (SELECT status FROM inventory_rehearsal.orders
      WHERE id = '30000000-0000-0000-0000-000000000001') <> 'shipped'
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
           AND product_id = '20000000-0000-0000-0000-000000000001') <> 6
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
           AND product_id = '20000000-0000-0000-0000-000000000002') <> 3
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements
         WHERE order_id = '30000000-0000-0000-0000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'FAIL: repeated or deducted-to-deducted status changed stock twice';
  END IF;
END
$order_idempotent$;
COMMIT;

\echo 'Checking waiting/cancelled transitions release the net reserved amounts and allow a later re-reserve...'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT inventory_rehearsal.wh_transition_order_status(
  '30000000-0000-0000-0000-000000000001', 'waiting'
);
RESET ROLE;
DO $order_release$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 8
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
           AND product_id = '20000000-0000-0000-0000-000000000002') <> 4
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements
         WHERE order_id = '30000000-0000-0000-0000-000000000001' AND type = 'release') <> 2 THEN
    RAISE EXCEPTION 'FAIL: order release did not return the reserved net quantities';
  END IF;
END
$order_release$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT inventory_rehearsal.wh_transition_order_status(
  '30000000-0000-0000-0000-000000000001', 'preparing'
);
SELECT inventory_rehearsal.wh_transition_order_status(
  '30000000-0000-0000-0000-000000000001', 'cancelled'
);
RESET ROLE;
DO $order_reentry$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 8
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
           AND product_id = '20000000-0000-0000-0000-000000000002') <> 4
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements
         WHERE order_id = '30000000-0000-0000-0000-000000000001' AND type = 'reserve') <> 4
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements
         WHERE order_id = '30000000-0000-0000-0000-000000000001' AND type = 'release') <> 4
     OR EXISTS (
       SELECT 1 FROM inventory_rehearsal.wh_movements
       WHERE order_id = '30000000-0000-0000-0000-000000000001'
       GROUP BY product_id, COALESCE(from_warehouse_id, to_warehouse_id)
       HAVING SUM(CASE WHEN type = 'reserve' THEN quantity ELSE -quantity END) <> 0
     ) THEN
    RAISE EXCEPTION 'FAIL: repeated reserve/release cycles did not reconcile to zero';
  END IF;
END
$order_reentry$;
COMMIT;

\echo 'Checking insufficient order stock rolls back status, every item, audit rows, and product mirror...'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
DO $order_insufficient$
BEGIN
  BEGIN
    PERFORM inventory_rehearsal.wh_transition_order_status(
      '30000000-0000-0000-0000-000000000002', 'preparing'
    );
    RAISE EXCEPTION 'FAIL: order with insufficient stock advanced into preparing';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: insufficient order stock rejected';
  END;
END
$order_insufficient$;
RESET ROLE;
DO $order_insufficient_unchanged$
BEGIN
  IF (SELECT status FROM inventory_rehearsal.orders
      WHERE id = '30000000-0000-0000-0000-000000000002') <> 'pending'
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
           AND product_id = '20000000-0000-0000-0000-000000000001') <> 8
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
           AND product_id = '20000000-0000-0000-0000-000000000002') <> 4
     OR EXISTS (SELECT 1 FROM inventory_rehearsal.wh_movements
                WHERE order_id = '30000000-0000-0000-0000-000000000002')
     OR (SELECT quantity FROM inventory_rehearsal.products
         WHERE id = '20000000-0000-0000-0000-000000000001') <>
        (SELECT COALESCE(SUM(quantity), 0) FROM inventory_rehearsal.wh_stock
         WHERE product_id = '20000000-0000-0000-0000-000000000001')
     OR (SELECT quantity FROM inventory_rehearsal.products
         WHERE id = '20000000-0000-0000-0000-000000000002') <>
        (SELECT COALESCE(SUM(quantity), 0) FROM inventory_rehearsal.wh_stock
         WHERE product_id = '20000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FAIL: failed order transition left partial inventory effects';
  END IF;
END
$order_insufficient_unchanged$;
COMMIT;

\echo 'Checking unauthorised/inactive users and explicit manage_orders denial cannot change order status or stock...'
BEGIN;
SET LOCAL ROLE authenticated;
DO $order_denied$
DECLARE
  v_subject uuid;
BEGIN
  FOREACH v_subject IN ARRAY ARRAY[
    '00000000-0000-0000-0000-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000006'::uuid,
    '00000000-0000-0000-0000-000000000009'::uuid
  ]
  LOOP
    PERFORM set_config('request.jwt.claim.sub', v_subject::text, true);
    BEGIN
      PERFORM inventory_rehearsal.wh_transition_order_status(
        '30000000-0000-0000-0000-000000000002', 'preparing'
      );
      RAISE EXCEPTION 'FAIL: caller % without effective manage_orders changed an order', v_subject;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS: caller % without effective manage_orders was denied', v_subject;
    END;
  END LOOP;
END
$order_denied$;
RESET ROLE;
DO $order_denied_unchanged$
BEGIN
  IF (SELECT status FROM inventory_rehearsal.orders
      WHERE id = '30000000-0000-0000-0000-000000000002') <> 'pending'
     OR EXISTS (SELECT 1 FROM inventory_rehearsal.wh_movements
                WHERE order_id = '30000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FAIL: unauthorised order transition changed status or movements';
  END IF;
END
$order_denied_unchanged$;
COMMIT;

\echo 'Checking externally stocked sources and non-lowes brands are not double-deducted...'
BEGIN;
SET LOCAL ROLE authenticated;
-- A fulfillment profile can advance the operational order without stock manager rights.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000010', true);
SELECT inventory_rehearsal.wh_transition_order_status('30000000-0000-0000-0000-000000000004', 'preparing');
-- Order manager can advance other-source and non-Lowe's orders.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT inventory_rehearsal.wh_transition_order_status('30000000-0000-0000-0000-000000000005', 'preparing');
SELECT inventory_rehearsal.wh_transition_order_status('30000000-0000-0000-0000-000000000006', 'preparing');
RESET ROLE;
DO $external_source_unchanged$
BEGIN
  IF (SELECT status FROM inventory_rehearsal.orders
      WHERE id = '30000000-0000-0000-0000-000000000004') <> 'preparing'
     OR (SELECT status FROM inventory_rehearsal.orders
         WHERE id = '30000000-0000-0000-0000-000000000005') <> 'preparing'
     OR (SELECT status FROM inventory_rehearsal.orders
         WHERE id = '30000000-0000-0000-0000-000000000006') <> 'preparing'
     OR EXISTS (SELECT 1 FROM inventory_rehearsal.wh_movements
                WHERE order_id IN (
                  '30000000-0000-0000-0000-000000000004',
                  '30000000-0000-0000-0000-000000000005',
                  '30000000-0000-0000-0000-000000000006'
                )) THEN
    RAISE EXCEPTION 'FAIL: externally stocked or non-lowes order was deducted by employee app';
  END IF;
END
$external_source_unchanged$;
COMMIT;

\echo 'Checking seller warehouse market mismatch falls back to the order market...'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT inventory_rehearsal.wh_transition_order_status('30000000-0000-0000-0000-000000000007', 'preparing');
RESET ROLE;
DO $order_market_fallback$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000002'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 4
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
           AND product_id = '20000000-0000-0000-0000-000000000001') <> 8
     OR NOT EXISTS (
       SELECT 1 FROM inventory_rehearsal.wh_movements
       WHERE order_id = '30000000-0000-0000-0000-000000000007'
         AND type = 'reserve'
         AND from_warehouse_id = '10000000-0000-0000-0000-000000000002'
         AND product_id = '20000000-0000-0000-0000-000000000001'
         AND performed_by = 'Order Manager'
     ) THEN
    RAISE EXCEPTION 'FAIL: order with cross-market seller link used the wrong stock warehouse';
  END IF;
END
$order_market_fallback$;
COMMIT;

\echo 'Checking missing active market warehouse and malformed item quantity fail atomically...'
UPDATE inventory_rehearsal.wh_warehouses SET is_active = false
WHERE id = '10000000-0000-0000-0000-000000000005';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
DO $order_invalid$
BEGIN
  BEGIN
    PERFORM inventory_rehearsal.wh_transition_order_status('30000000-0000-0000-0000-000000000003', 'preparing');
    RAISE EXCEPTION 'FAIL: order advanced without an active warehouse for its market';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: missing market warehouse blocks stock transition';
  END;

  BEGIN
    PERFORM inventory_rehearsal.wh_transition_order_status('30000000-0000-0000-0000-000000000008', 'preparing');
    RAISE EXCEPTION 'FAIL: malformed item quantity was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS: malformed order item quantity rejected';
  END;
END
$order_invalid$;
RESET ROLE;
DO $order_invalid_unchanged$
BEGIN
  IF (SELECT status FROM inventory_rehearsal.orders
      WHERE id = '30000000-0000-0000-0000-000000000003') <> 'pending'
     OR (SELECT status FROM inventory_rehearsal.orders
         WHERE id = '30000000-0000-0000-0000-000000000008') <> 'pending'
     OR EXISTS (
       SELECT 1 FROM inventory_rehearsal.wh_movements
       WHERE order_id IN ('30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000008')
     ) THEN
    RAISE EXCEPTION 'FAIL: invalid order transition left status or audit changes';
  END IF;
END
$order_invalid_unchanged$;
COMMIT;

\echo 'Checking order audit failure on the second item rolls back first-item stock and the order status...'
CREATE OR REPLACE FUNCTION inventory_rehearsal.fail_order_audit_on_second_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, inventory_rehearsal
AS $fail_order_audit$
BEGIN
  IF current_setting('inventory_rehearsal.fail_order_audit', true) = 'on'
     AND NEW.order_id = '30000000-0000-0000-0000-000000000009'
     AND NEW.type = 'reserve'
     AND NEW.product_id = '20000000-0000-0000-0000-000000000002' THEN
    RAISE EXCEPTION 'forced second-item order audit failure' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fail_order_audit$;

CREATE TRIGGER rehearsal_fail_order_audit_on_second_item
BEFORE INSERT ON inventory_rehearsal.wh_movements
FOR EACH ROW EXECUTE FUNCTION inventory_rehearsal.fail_order_audit_on_second_item();

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT set_config('inventory_rehearsal.fail_order_audit', 'on', true);
DO $order_audit_rollback$
BEGIN
  BEGIN
    PERFORM inventory_rehearsal.wh_transition_order_status(
      '30000000-0000-0000-0000-000000000009', 'preparing'
    );
    RAISE EXCEPTION 'FAIL: order transition succeeded despite second-item audit failure';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: second-item audit failure aborted order transition';
  END;
END
$order_audit_rollback$;
RESET ROLE;
DO $order_audit_unchanged$
BEGIN
  IF (SELECT status FROM inventory_rehearsal.orders
      WHERE id = '30000000-0000-0000-0000-000000000009') <> 'pending'
     OR (SELECT updated_by FROM inventory_rehearsal.orders
         WHERE id = '30000000-0000-0000-0000-000000000009') IS NOT NULL
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
           AND product_id = '20000000-0000-0000-0000-000000000001') <> 8
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
           AND product_id = '20000000-0000-0000-0000-000000000002') <> 4
     OR EXISTS (SELECT 1 FROM inventory_rehearsal.wh_movements
                WHERE order_id = '30000000-0000-0000-0000-000000000009')
     OR (SELECT quantity FROM inventory_rehearsal.products p
         WHERE p.id = '20000000-0000-0000-0000-000000000001') <>
        (SELECT COALESCE(sum(s.quantity),0) FROM inventory_rehearsal.wh_stock s
         WHERE s.product_id = '20000000-0000-0000-0000-000000000001')
     OR (SELECT quantity FROM inventory_rehearsal.products p
         WHERE p.id = '20000000-0000-0000-0000-000000000002') <>
        (SELECT COALESCE(sum(s.quantity),0) FROM inventory_rehearsal.wh_stock s
         WHERE s.product_id = '20000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FAIL: order audit failure left partial stock, audit or order status changes';
  END IF;
END
$order_audit_unchanged$;
COMMIT;

DROP TRIGGER rehearsal_fail_order_audit_on_second_item ON inventory_rehearsal.wh_movements;
DROP FUNCTION inventory_rehearsal.fail_order_audit_on_second_item();

\echo 'Checking ordinary employees can advance their own order but not another employee’s order...'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
SELECT inventory_rehearsal.wh_transition_order_status(
  '30000000-0000-0000-0000-000000000010', 'preparing'
);
RESET ROLE;
DO $owner_order_success$
BEGIN
  IF (SELECT status FROM inventory_rehearsal.orders
      WHERE id = '30000000-0000-0000-0000-000000000010') <> 'preparing'
     OR (SELECT updated_by FROM inventory_rehearsal.orders
         WHERE id = '30000000-0000-0000-0000-000000000010') <> 'Ordinary Employee'
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000002'
           AND product_id = '20000000-0000-0000-0000-000000000001') <> 3
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements
         WHERE order_id = '30000000-0000-0000-0000-000000000010'
           AND type = 'reserve' AND performed_by = 'Ordinary Employee') <> 1 THEN
    RAISE EXCEPTION 'FAIL: employee could not safely advance own order and reserve stock';
  END IF;
END
$owner_order_success$;
COMMIT;

\echo 'Checking explicit manage_orders denial blocks the owner fallback...'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
DO $denied_owner_order$
BEGIN
  BEGIN
    PERFORM inventory_rehearsal.wh_transition_order_status(
      '30000000-0000-0000-0000-000000000011', 'preparing'
    );
    RAISE EXCEPTION 'FAIL: owner with explicit manage_orders denial advanced own order';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: explicit manage_orders denial blocks owner fallback';
  END;
END
$denied_owner_order$;
RESET ROLE;
DO $denied_owner_unchanged$
BEGIN
  IF (SELECT status FROM inventory_rehearsal.orders
      WHERE id = '30000000-0000-0000-0000-000000000011') <> 'pending'
     OR EXISTS (SELECT 1 FROM inventory_rehearsal.wh_movements
                WHERE order_id = '30000000-0000-0000-0000-000000000011') THEN
    RAISE EXCEPTION 'FAIL: explicitly denied owner changed status or stock';
  END IF;
END
$denied_owner_unchanged$;
COMMIT;

\echo 'Checking same-status reconciliation adjusts edited order items by exact net differences...'
INSERT INTO inventory_rehearsal.orders
  (id, status, market, brand, source, handler_name, items)
VALUES
  ('30000000-0000-0000-0000-000000000012', 'pending', 'syria', 'lowes', NULL, 'Seller Syria',
   '[{"name":"Rosemary Oil","qty":2},{"name":"Vitamin C Serum","qty":1}]'::jsonb);

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT inventory_rehearsal.wh_transition_order_status(
  '30000000-0000-0000-0000-000000000012', 'preparing'
);
RESET ROLE;
DO $edit_initial_reservation$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 6
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
           AND product_id = '20000000-0000-0000-0000-000000000002') <> 3 THEN
    RAISE EXCEPTION 'FAIL: initial edit-reconciliation fixture did not reserve expected quantities';
  END IF;
END
$edit_initial_reservation$;
COMMIT;

-- Simulate an order-editor save that changes items while status remains preparing.
-- A future production cutover must combine this row update and reconciliation in
-- one RPC/transaction; this fixture tests the diff reconciler's idempotent contract.
UPDATE inventory_rehearsal.orders
SET items = '[{"name":"Rosemary Oil","qty":3},{"name":"Vitamin C Serum","qty":2}]'::jsonb
WHERE id = '30000000-0000-0000-0000-000000000012';

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT inventory_rehearsal.wh_transition_order_status(
  '30000000-0000-0000-0000-000000000012', 'preparing'
);
RESET ROLE;
DO $edit_items_increased$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 5
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
           AND product_id = '20000000-0000-0000-0000-000000000002') <> 2
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements
         WHERE order_id = '30000000-0000-0000-0000-000000000012' AND type = 'reserve') <> 4
     OR (SELECT quantity FROM inventory_rehearsal.products
         WHERE id = '20000000-0000-0000-0000-000000000001') <>
        (SELECT COALESCE(sum(quantity),0) FROM inventory_rehearsal.wh_stock
         WHERE product_id = '20000000-0000-0000-0000-000000000001')
     OR (SELECT quantity FROM inventory_rehearsal.products
         WHERE id = '20000000-0000-0000-0000-000000000002') <>
        (SELECT COALESCE(sum(quantity),0) FROM inventory_rehearsal.wh_stock
         WHERE product_id = '20000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FAIL: same-status reconciliation did not reserve the item quantity increase';
  END IF;
END
$edit_items_increased$;
COMMIT;

UPDATE inventory_rehearsal.orders
SET items = '[{"name":"Rosemary Oil","qty":1}]'::jsonb
WHERE id = '30000000-0000-0000-0000-000000000012';

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT inventory_rehearsal.wh_transition_order_status(
  '30000000-0000-0000-0000-000000000012', 'preparing'
);
RESET ROLE;
DO $edit_items_decreased$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 7
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
           AND product_id = '20000000-0000-0000-0000-000000000002') <> 4
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements
         WHERE order_id = '30000000-0000-0000-0000-000000000012' AND type = 'release') <> 2 THEN
    RAISE EXCEPTION 'FAIL: same-status reconciliation did not release reduced/removed item quantities';
  END IF;
END
$edit_items_decreased$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT inventory_rehearsal.wh_transition_order_status(
  '30000000-0000-0000-0000-000000000012', 'cancelled'
);
RESET ROLE;
DO $edit_items_final_release$
BEGIN
  IF (SELECT status FROM inventory_rehearsal.orders
      WHERE id = '30000000-0000-0000-0000-000000000012') <> 'cancelled'
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
           AND product_id = '20000000-0000-0000-0000-000000000001') <> 8
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
           AND product_id = '20000000-0000-0000-0000-000000000002') <> 4
     OR EXISTS (
       SELECT 1 FROM inventory_rehearsal.wh_movements
       WHERE order_id = '30000000-0000-0000-0000-000000000012'
       GROUP BY product_id, COALESCE(from_warehouse_id,to_warehouse_id)
       HAVING sum(CASE WHEN type='reserve' THEN quantity ELSE -quantity END) <> 0
     ) THEN
    RAISE EXCEPTION 'FAIL: final cancellation did not return exactly the remaining reservation';
  END IF;
END
$edit_items_final_release$;
COMMIT;

\echo 'Checking a reservation is released when an order becomes externally stocked...'
INSERT INTO inventory_rehearsal.orders
  (id, status, market, brand, source, handler_name, items)
VALUES
  ('30000000-0000-0000-0000-000000000013', 'pending', 'syria', 'lowes', NULL, 'Seller Syria',
   '[{"name":"Rosemary Oil","qty":1}]'::jsonb);

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT inventory_rehearsal.wh_transition_order_status(
  '30000000-0000-0000-0000-000000000013', 'preparing'
);
RESET ROLE;
COMMIT;

UPDATE inventory_rehearsal.orders
SET source = 'star_network'
WHERE id = '30000000-0000-0000-0000-000000000013';

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT inventory_rehearsal.wh_transition_order_status(
  '30000000-0000-0000-0000-000000000013', 'preparing'
);
RESET ROLE;
DO $new_exemption_releases_old_reservation$
BEGIN
  IF (SELECT status FROM inventory_rehearsal.orders
      WHERE id = '30000000-0000-0000-0000-000000000013') <> 'preparing'
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000003'
           AND product_id = '20000000-0000-0000-0000-000000000001') <> 8
     OR EXISTS (
       SELECT 1 FROM inventory_rehearsal.wh_movements
       WHERE order_id = '30000000-0000-0000-0000-000000000013'
       GROUP BY product_id, COALESCE(from_warehouse_id,to_warehouse_id)
       HAVING sum(CASE WHEN type='reserve' THEN quantity ELSE -quantity END) <> 0
     ) THEN
    RAISE EXCEPTION 'FAIL: switching to external source left a stale inventory reservation';
  END IF;
END
$new_exemption_releases_old_reservation$;
COMMIT;

\echo 'Checking order RPC privileges are narrow...'
DO $order_acl$
BEGIN
  IF has_function_privilege('anon', 'inventory_rehearsal.wh_transition_order_status(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon can execute order-stock transition';
  END IF;
  IF NOT has_function_privilege('authenticated', 'inventory_rehearsal.wh_transition_order_status(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: authenticated cannot execute order-stock transition';
  END IF;
END
$order_acl$;

\echo 'Checking order edit and stock reconciliation share one transaction...'
INSERT INTO inventory_rehearsal.profiles
  (id, role_type, is_active, extra_permissions, denied_permissions, employee_name, warehouse_id, order_role)
VALUES
  ('00000000-0000-0000-0000-000000000012', 'employee', true, '[]'::jsonb, '[]'::jsonb,
   'Order Edit Seller', '10000000-0000-0000-0000-000000000004', NULL);

INSERT INTO inventory_rehearsal.wh_stock (warehouse_id, product_id, quantity, updated_at)
VALUES
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 20, pg_catalog.now()),
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 20, pg_catalog.now())
ON CONFLICT (warehouse_id, product_id)
DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = pg_catalog.now();

INSERT INTO inventory_rehearsal.orders
  (id, status, market, brand, source, handler_name, items)
VALUES
  ('30000000-0000-0000-0000-000000000014', 'pending', 'syria', 'lowes', NULL, 'Order Edit Seller',
   '[{"name":"Rosemary Oil","qty":2}]'::jsonb),
  ('30000000-0000-0000-0000-000000000015', 'pending', 'syria', 'lowes', NULL, 'Order Edit Seller',
   '[{"name":"Rosemary Oil","qty":1}]'::jsonb);

DO $order_edit_acl$
BEGIN
  IF has_function_privilege('anon', 'inventory_rehearsal.wh_edit_order(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon can execute atomic order edit';
  END IF;
  IF NOT has_function_privilege('authenticated', 'inventory_rehearsal.wh_edit_order(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: authenticated cannot execute atomic order edit';
  END IF;
END
$order_edit_acl$;

-- Manager updates the status and line quantity in one call. Reservation is derived
-- from the newly persisted item list, not a client-supplied stock delta.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT inventory_rehearsal.wh_edit_order(
  '30000000-0000-0000-0000-000000000014',
  '{"status":"preparing","items":[{"name":"Rosemary Oil","qty":3}]}'::jsonb
);
RESET ROLE;
DO $order_edit_reserves_new_quantity$
BEGIN
  IF (SELECT status FROM inventory_rehearsal.orders
      WHERE id = '30000000-0000-0000-0000-000000000014') <> 'preparing'
     OR (SELECT items->0->>'qty' FROM inventory_rehearsal.orders
         WHERE id = '30000000-0000-0000-0000-000000000014') <> '3'
     OR (SELECT updated_by FROM inventory_rehearsal.orders
         WHERE id = '30000000-0000-0000-0000-000000000014') <> 'Order Manager'
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000004'
           AND product_id = '20000000-0000-0000-0000-000000000001') <> 17
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements
         WHERE order_id = '30000000-0000-0000-0000-000000000014'
           AND type = 'reserve' AND quantity = 3) <> 1 THEN
    RAISE EXCEPTION 'FAIL: atomic order edit did not persist and reserve the edited item quantity';
  END IF;
END
$order_edit_reserves_new_quantity$;
COMMIT;

-- A same-status edit that increases the quantity reserves only the difference.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT inventory_rehearsal.wh_edit_order(
  '30000000-0000-0000-0000-000000000014',
  '{"items":[{"name":"Rosemary Oil","qty":4}]}'::jsonb
);
RESET ROLE;
DO $order_edit_increase_delta$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000004'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 16
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements
         WHERE order_id = '30000000-0000-0000-0000-000000000014' AND type = 'reserve') <> 2
     OR (SELECT COALESCE(sum(quantity),0) FROM inventory_rehearsal.wh_movements
         WHERE order_id = '30000000-0000-0000-0000-000000000014' AND type = 'reserve') <> 4 THEN
    RAISE EXCEPTION 'FAIL: order edit did not reserve only the one-unit increase';
  END IF;
END
$order_edit_increase_delta$;
COMMIT;

-- The owning employee can edit items/status for their own order, but not routing,
-- market, brand, or source fields that can redirect stock or bypass exemptions.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', true);
SELECT inventory_rehearsal.wh_edit_order(
  '30000000-0000-0000-0000-000000000014',
  '{"items":[{"name":"Rosemary Oil","qty":2}]}'::jsonb
);
DO $owner_cannot_change_market$
BEGIN
  BEGIN
    PERFORM inventory_rehearsal.wh_edit_order(
      '30000000-0000-0000-0000-000000000014',
      '{"market":"turkey"}'::jsonb
    );
    RAISE EXCEPTION 'FAIL: owner edited order market' USING ERRCODE = 'P0001';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: owner cannot change order market/routing';
  END;
END
$owner_cannot_change_market$;
RESET ROLE;
DO $owner_edit_delta$
BEGIN
  IF (SELECT quantity FROM inventory_rehearsal.wh_stock
      WHERE warehouse_id = '10000000-0000-0000-0000-000000000004'
        AND product_id = '20000000-0000-0000-0000-000000000001') <> 18
     OR (SELECT count(*) FROM inventory_rehearsal.wh_movements
         WHERE order_id = '30000000-0000-0000-0000-000000000014' AND type = 'release') <> 1
     OR (SELECT market FROM inventory_rehearsal.orders
         WHERE id = '30000000-0000-0000-0000-000000000014') <> 'syria' THEN
    RAISE EXCEPTION 'FAIL: owner item edit did not release the removed quantity or changed protected fields';
  END IF;
END
$owner_edit_delta$;
COMMIT;

-- Switching the source to an externally stocked system releases any old reservation
-- in the same transaction as the source edit, even when status remains deducted.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT inventory_rehearsal.wh_edit_order(
  '30000000-0000-0000-0000-000000000014',
  '{"source":"star_network"}'::jsonb
);
RESET ROLE;
DO $order_edit_external_source$
BEGIN
  IF (SELECT source FROM inventory_rehearsal.orders
      WHERE id = '30000000-0000-0000-0000-000000000014') <> 'star_network'
     OR (SELECT status FROM inventory_rehearsal.orders
         WHERE id = '30000000-0000-0000-0000-000000000014') <> 'preparing'
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000004'
           AND product_id = '20000000-0000-0000-0000-000000000001') <> 20
     OR EXISTS (
       SELECT 1 FROM inventory_rehearsal.wh_movements
       WHERE order_id = '30000000-0000-0000-0000-000000000014'
       GROUP BY product_id, COALESCE(from_warehouse_id,to_warehouse_id)
       HAVING sum(CASE WHEN type='reserve' THEN quantity ELSE -quantity END) <> 0
     ) THEN
    RAISE EXCEPTION 'FAIL: source edit did not atomically release the prior reservation';
  END IF;
END
$order_edit_external_source$;
COMMIT;

\echo 'Checking stock shortage rolls back both order fields and reservation ledger...'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
DO $order_edit_shortage_rollback$
BEGIN
  BEGIN
    PERFORM inventory_rehearsal.wh_edit_order(
      '30000000-0000-0000-0000-000000000015',
      '{"status":"preparing","items":[{"name":"Rosemary Oil","qty":21}]}'::jsonb
    );
    RAISE EXCEPTION 'FAIL: oversized order edit was accepted' USING ERRCODE = 'P0001';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: shortage rejected the order edit';
  END;
END
$order_edit_shortage_rollback$;
RESET ROLE;
DO $order_edit_shortage_unchanged$
BEGIN
  IF (SELECT status FROM inventory_rehearsal.orders
      WHERE id = '30000000-0000-0000-0000-000000000015') <> 'pending'
     OR (SELECT items->0->>'qty' FROM inventory_rehearsal.orders
         WHERE id = '30000000-0000-0000-0000-000000000015') <> '1'
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000004'
           AND product_id = '20000000-0000-0000-0000-000000000001') <> 20
     OR EXISTS (SELECT 1 FROM inventory_rehearsal.wh_movements
                WHERE order_id = '30000000-0000-0000-0000-000000000015') THEN
    RAISE EXCEPTION 'FAIL: failed order edit left changed fields, stock, or audit rows';
  END IF;
END
$order_edit_shortage_unchanged$;
COMMIT;

\echo 'Checking unauthorized caller and unknown fields cannot mutate an order...'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
DO $order_edit_unauthorized$
BEGIN
  BEGIN
    PERFORM inventory_rehearsal.wh_edit_order(
      '30000000-0000-0000-0000-000000000014',
      '{"items":[{"name":"Rosemary Oil","qty":1}]}'::jsonb
    );
    RAISE EXCEPTION 'FAIL: unrelated employee edited another employee order' USING ERRCODE = 'P0001';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: unrelated employee cannot edit order';
  END;
  -- Use an authorized manager so the test reaches the unknown-field validator
  -- rather than correctly stopping earlier at the ownership boundary.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
  BEGIN
    PERFORM inventory_rehearsal.wh_edit_order(
      '30000000-0000-0000-0000-000000000014',
      '{"arbitrary_stock_delta":-999}'::jsonb
    );
    RAISE EXCEPTION 'FAIL: arbitrary fields accepted by order edit' USING ERRCODE = 'P0001';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS: unknown fields rejected';
  END;
END
$order_edit_unauthorized$;
RESET ROLE;
DO $order_edit_unauthorized_unchanged$
BEGIN
  IF (SELECT source FROM inventory_rehearsal.orders
      WHERE id = '30000000-0000-0000-0000-000000000014') <> 'star_network'
     OR (SELECT status FROM inventory_rehearsal.orders
         WHERE id = '30000000-0000-0000-0000-000000000014') <> 'preparing'
     OR (SELECT quantity FROM inventory_rehearsal.wh_stock
         WHERE warehouse_id = '10000000-0000-0000-0000-000000000004'
           AND product_id = '20000000-0000-0000-0000-000000000001') <> 20
     OR EXISTS (SELECT 1 FROM inventory_rehearsal.wh_movements
                WHERE order_id = '30000000-0000-0000-0000-000000000015'
                  AND type IN ('reserve','release') AND quantity <= 0) THEN
    RAISE EXCEPTION 'FAIL: unauthorized order edit changed protected state';
  END IF;
END
$order_edit_unauthorized_unchanged$;
COMMIT;

\echo 'PASS: disposable inventory and order-stock lifecycle contract rehearsal complete.'
