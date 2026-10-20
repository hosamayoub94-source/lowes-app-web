#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST must point to the disposable PostgreSQL service}"
: "${PGPORT:?PGPORT must be set}"
: "${PGUSER:?PGUSER must be set}"
: "${PGPASSWORD:?PGPASSWORD must be set}"
: "${PGDATABASE:?PGDATABASE must be set}"

# Twelve orders and twelve transfers compete for 20 units in the SAME source
# warehouse. This tests inter-operation locking, not just same-RPC contention.
ORDER_ACTOR_ID="00000000-0000-0000-0000-000000000004"    # manager, manage-orders default
TRANSFER_ACTOR_ID="00000000-0000-0000-0000-000000000002" # warehouse manager
SOURCE_WAREHOUSE_ID="10000000-0000-0000-0000-000000000003" # distributor/Syria
DEST_WAREHOUSE_ID="10000000-0000-0000-0000-000000000004"   # sales/Syria
PRODUCT_ID="20000000-0000-0000-0000-000000000001"
COMPETING_REQUESTS_PER_KIND=12
AVAILABLE_STOCK=20
PARALLEL_WORKERS=24

# The CI script sequence deliberately runs all other destructive fixture tests
# before this test. Recreate the complete relevant baseline in the ephemeral DB.
psql -X -v ON_ERROR_STOP=1 -c "TRUNCATE inventory_rehearsal.wh_movements"
psql -X -v ON_ERROR_STOP=1 -c "TRUNCATE inventory_rehearsal.orders"
psql -X -v ON_ERROR_STOP=1 -c "DELETE FROM inventory_rehearsal.wh_stock"
psql -X -v ON_ERROR_STOP=1 -c "INSERT INTO inventory_rehearsal.wh_stock (warehouse_id, product_id, quantity) VALUES ('$SOURCE_WAREHOUSE_ID', '$PRODUCT_ID', '$AVAILABLE_STOCK'), ('$DEST_WAREHOUSE_ID', '$PRODUCT_ID', 5)"

psql -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO inventory_rehearsal.orders
  (id, status, market, brand, source, handler_name, items)
SELECT
  ('50000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
  'pending',
  'syria',
  'lowes',
  NULL,
  'Seller Syria',
  '[{"name":"Rosemary Oil","qty":1}]'::jsonb
FROM generate_series(1, 12) AS g;
SQL

export ORDER_ACTOR_ID TRANSFER_ACTOR_ID SOURCE_WAREHOUSE_ID DEST_WAREHOUSE_ID PRODUCT_ID
result_file="$(mktemp)"
trap 'rm -f "$result_file"' EXIT

{
  for i in $(seq 1 "$COMPETING_REQUESTS_PER_KIND"); do printf "order %s\n" "$i"; done
  for i in $(seq 1 "$COMPETING_REQUESTS_PER_KIND"); do printf "transfer %s\n" "$i"; done
} | xargs -n 2 -P "$PARALLEL_WORKERS" bash docs/security/tests/20261020_order_transfer_race_worker.sh > "$result_file"

orders_allowed="$(grep -xc 'order allowed' "$result_file" || true)"
orders_denied="$(grep -xc 'order denied' "$result_file" || true)"
transfers_allowed="$(grep -xc 'transfer allowed' "$result_file" || true)"
transfers_denied="$(grep -xc 'transfer denied' "$result_file" || true)"
total_allowed="$((orders_allowed + transfers_allowed))"

[[ "$total_allowed" == "$AVAILABLE_STOCK" ]] || { echo "FAIL: expected $AVAILABLE_STOCK total stock-consuming successes; orders=$orders_allowed transfers=$transfers_allowed"; cat "$result_file"; exit 1; }
[[ "$orders_allowed" -le "$COMPETING_REQUESTS_PER_KIND" && "$orders_denied" -eq "$((COMPETING_REQUESTS_PER_KIND - orders_allowed))" ]] || { echo "FAIL: order outcomes do not sum to $COMPETING_REQUESTS_PER_KIND"; cat "$result_file"; exit 1; }
[[ "$transfers_allowed" -le "$COMPETING_REQUESTS_PER_KIND" && "$transfers_denied" -eq "$((COMPETING_REQUESTS_PER_KIND - transfers_allowed))" ]] || { echo "FAIL: transfer outcomes do not sum to $COMPETING_REQUESTS_PER_KIND"; cat "$result_file"; exit 1; }

source_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT quantity FROM inventory_rehearsal.wh_stock WHERE warehouse_id = '$SOURCE_WAREHOUSE_ID' AND product_id = '$PRODUCT_ID'")"
dest_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT quantity FROM inventory_rehearsal.wh_stock WHERE warehouse_id = '$DEST_WAREHOUSE_ID' AND product_id = '$PRODUCT_ID'")"
preparing_orders="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.orders WHERE status = 'preparing'")"
pending_orders="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.orders WHERE status = 'pending'")"
reserve_count="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.wh_movements WHERE type = 'reserve'")"
reserve_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT COALESCE(sum(quantity),0) FROM inventory_rehearsal.wh_movements WHERE type = 'reserve'")"
transfer_count="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.wh_movements WHERE type = 'allocate'")"
transfer_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT COALESCE(sum(quantity),0) FROM inventory_rehearsal.wh_movements WHERE type = 'allocate'")"
orphan_prepare="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.orders o WHERE o.status = 'preparing' AND NOT EXISTS (SELECT 1 FROM inventory_rehearsal.wh_movements m WHERE m.order_id = o.id AND m.type = 'reserve')")"
orphan_reserve="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.wh_movements m JOIN inventory_rehearsal.orders o ON o.id = m.order_id WHERE m.type = 'reserve' AND o.status <> 'preparing'")"
wrong_order_actor="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.wh_movements WHERE type = 'reserve' AND performed_by <> 'Order Manager'")"
wrong_transfer_actor="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.wh_movements WHERE type = 'allocate' AND performed_by <> '$TRANSFER_ACTOR_ID'")"
product_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT quantity FROM inventory_rehearsal.products WHERE id = '$PRODUCT_ID'")"
sum_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT COALESCE(sum(quantity),0) FROM inventory_rehearsal.wh_stock WHERE product_id = '$PRODUCT_ID'")"

[[ "$source_qty" == "0" ]] || { echo "FAIL: shared source stock ended at $source_qty, expected 0"; exit 1; }
[[ "$dest_qty" == "$((5 + transfers_allowed))" ]] || { echo "FAIL: destination quantity=$dest_qty, expected $((5 + transfers_allowed))"; exit 1; }
[[ "$preparing_orders" == "$orders_allowed" ]] || { echo "FAIL: preparing orders=$preparing_orders but successful order calls=$orders_allowed"; exit 1; }
[[ "$pending_orders" == "$orders_denied" ]] || { echo "FAIL: pending orders=$pending_orders but rejected order calls=$orders_denied"; exit 1; }
[[ "$reserve_count" == "$orders_allowed" && "$reserve_qty" == "$orders_allowed" ]] || { echo "FAIL: reserve count/quantity does not match successful orders"; exit 1; }
[[ "$transfer_count" == "$transfers_allowed" && "$transfer_qty" == "$transfers_allowed" ]] || { echo "FAIL: transfer count/quantity does not match successful transfers"; exit 1; }
[[ "$orphan_prepare" == "0" && "$orphan_reserve" == "0" ]] || { echo "FAIL: order statuses and reservation movements are inconsistent"; exit 1; }
[[ "$wrong_order_actor" == "0" && "$wrong_transfer_actor" == "0" ]] || { echo "FAIL: actor attribution is inconsistent"; exit 1; }
[[ "$product_qty" == "$sum_qty" ]] || { echo "FAIL: products.quantity=$product_qty does not equal summed stock=$sum_qty"; exit 1; }
[[ "$product_qty" == "$((25 - orders_allowed))" ]] || { echo "FAIL: product total does not reflect only the reserved stock"; exit 1; }

echo "PASS: order reservations and transfers contested one stock row; exactly 20 requests succeeded, the rest rolled back, and stock/audit/status/actor/product totals reconcile."
