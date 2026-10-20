#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST must point to the disposable PostgreSQL service}"
: "${PGPORT:?PGPORT must be set}"
: "${PGUSER:?PGUSER must be set}"
: "${PGPASSWORD:?PGPASSWORD must be set}"
: "${PGDATABASE:?PGDATABASE must be set}"

# Fixture-only identity/order/data; never production rows.
ACTOR_ID="00000000-0000-0000-0000-000000000004" # manager with MANAGE_ORDERS, central-stock denial
ORDER_ID="30000000-0000-0000-0000-000000000009"
CENTRAL_WAREHOUSE_ID="10000000-0000-0000-0000-000000000001"
SALES_WAREHOUSE_ID="10000000-0000-0000-0000-000000000002"
SELLER_WAREHOUSE_ID="10000000-0000-0000-0000-000000000003"
ROSEMARY_PRODUCT_ID="20000000-0000-0000-0000-000000000001"
VITAMIN_C_PRODUCT_ID="20000000-0000-0000-0000-000000000002"
CONCURRENT_CALLS=24
PARALLEL_WORKERS=12

# Rebuild an isolated, deterministic order and stock baseline after prior fixture tests.
psql -X -v ON_ERROR_STOP=1 -c "TRUNCATE inventory_rehearsal.wh_movements"
psql -X -v ON_ERROR_STOP=1 -c "TRUNCATE inventory_rehearsal.orders"
psql -X -v ON_ERROR_STOP=1 -c "DELETE FROM inventory_rehearsal.wh_stock"
psql -X -v ON_ERROR_STOP=1 -c "INSERT INTO inventory_rehearsal.wh_stock (warehouse_id, product_id, quantity) VALUES ('$CENTRAL_WAREHOUSE_ID', '$ROSEMARY_PRODUCT_ID', 20), ('$SALES_WAREHOUSE_ID', '$ROSEMARY_PRODUCT_ID', 5), ('$SELLER_WAREHOUSE_ID', '$ROSEMARY_PRODUCT_ID', 8), ('$SELLER_WAREHOUSE_ID', '$VITAMIN_C_PRODUCT_ID', 4)"

psql -X -v ON_ERROR_STOP=1 -v order_id="$ORDER_ID" <<'SQL'
INSERT INTO inventory_rehearsal.orders
  (id, status, market, brand, source, handler_name, items)
VALUES (
  :'order_id'::uuid,
  'pending',
  'syria',
  'lowes',
  NULL,
  'Seller Syria',
  '[{"name":"ROSEMARY SERUM","qty":2},{"name":"Vitamin C Serum","qty":1}]'::jsonb
);
SQL

export ACTOR_ID ORDER_ID
seq 1 "$CONCURRENT_CALLS" | xargs -P "$PARALLEL_WORKERS" -I '{}' bash -c '
  set -euo pipefail
  psql -X -qAt -v ON_ERROR_STOP=1 \
    -v actor_id="$ACTOR_ID" \
    -v order_id="$ORDER_ID" \
    -f docs/security/tests/20261020_order_stock_concurrency_client.sql > /dev/null
'

status="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT status FROM inventory_rehearsal.orders WHERE id = '$ORDER_ID'")"
actor="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT updated_by FROM inventory_rehearsal.orders WHERE id = '$ORDER_ID'")"
rosemary_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT quantity FROM inventory_rehearsal.wh_stock WHERE warehouse_id = '$SELLER_WAREHOUSE_ID' AND product_id = '$ROSEMARY_PRODUCT_ID'")"
vitamin_c_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT quantity FROM inventory_rehearsal.wh_stock WHERE warehouse_id = '$SELLER_WAREHOUSE_ID' AND product_id = '$VITAMIN_C_PRODUCT_ID'")"
order_reserves="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.wh_movements WHERE order_id = '$ORDER_ID' AND type = 'reserve'")"
order_releases="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.wh_movements WHERE order_id = '$ORDER_ID' AND type = 'release'")"
stock_mirror_errors="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.products p WHERE p.quantity <> (SELECT COALESCE(sum(s.quantity),0) FROM inventory_rehearsal.wh_stock s WHERE s.product_id = p.id)")"

[[ "$status" == "preparing" ]] || { echo "FAIL: final order status=$status"; exit 1; }
[[ "$actor" == "Order Manager" ]] || { echo "FAIL: order actor attribution=$actor"; exit 1; }
[[ "$rosemary_qty" == "6" ]] || { echo "FAIL: rosemary stock=$rosemary_qty; expected one reservation of 2"; exit 1; }
[[ "$vitamin_c_qty" == "3" ]] || { echo "FAIL: vitamin C stock=$vitamin_c_qty; expected one reservation of 1"; exit 1; }
[[ "$order_reserves" == "2" ]] || { echo "FAIL: expected one reserve movement per matched product, got $order_reserves"; exit 1; }
[[ "$order_releases" == "0" ]] || { echo "FAIL: repeated preparing calls unexpectedly released stock"; exit 1; }
[[ "$stock_mirror_errors" == "0" ]] || { echo "FAIL: $stock_mirror_errors product quantity mirrors disagree with warehouse totals"; exit 1; }

echo "PASS: $CONCURRENT_CALLS parallel status updates caused only one order reservation; stock, audit, actor and product totals reconcile."
