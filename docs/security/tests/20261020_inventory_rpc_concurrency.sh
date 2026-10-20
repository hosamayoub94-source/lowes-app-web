#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST must point to the disposable PostgreSQL service}"
: "${PGPORT:?PGPORT must be set}"
: "${PGUSER:?PGUSER must be set}"
: "${PGPASSWORD:?PGPASSWORD must be set}"
: "${PGDATABASE:?PGDATABASE must be set}"

# Synthetic fixture identities, never production data.
ACTOR_ID="00000000-0000-0000-0000-000000000002" # active warehouse_manager
CENTRAL_WAREHOUSE_ID="10000000-0000-0000-0000-000000000001"
SALES_WAREHOUSE_ID="10000000-0000-0000-0000-000000000002"
PRODUCT_ID="20000000-0000-0000-0000-000000000001"
CONCURRENT_CALLS=24
PARALLEL_WORKERS=12

# Reset to a known fixture baseline. The existing trigger also resets products.quantity.
psql -X -v ON_ERROR_STOP=1 -c "TRUNCATE inventory_rehearsal.wh_movements"
psql -X -v ON_ERROR_STOP=1 -c "UPDATE inventory_rehearsal.wh_stock SET quantity = 20 WHERE warehouse_id = '$CENTRAL_WAREHOUSE_ID' AND product_id = '$PRODUCT_ID'"
psql -X -v ON_ERROR_STOP=1 -c "UPDATE inventory_rehearsal.wh_stock SET quantity = 5 WHERE warehouse_id = '$SALES_WAREHOUSE_ID' AND product_id = '$PRODUCT_ID'"

result_file="$(mktemp)"
trap 'rm -f "$result_file"' EXIT

export ACTOR_ID CENTRAL_WAREHOUSE_ID PRODUCT_ID
seq 1 "$CONCURRENT_CALLS" | xargs -P "$PARALLEL_WORKERS" -I '{}' bash -c '
  set -euo pipefail
  psql -X -qAt -v ON_ERROR_STOP=1 \
    -v actor_id="$ACTOR_ID" \
    -v warehouse_id="$CENTRAL_WAREHOUSE_ID" \
    -v product_id="$PRODUCT_ID" \
    -f docs/security/tests/20261020_inventory_rpc_concurrency_client.sql
' > "$result_file"

completed="$(wc -l < "$result_file" | tr -d ' ')"
if [[ "$completed" != "$CONCURRENT_CALLS" ]]; then
  echo "FAIL: expected $CONCURRENT_CALLS successful RPC outputs, got $completed"
  cat "$result_file"
  exit 1
fi

central_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT quantity FROM inventory_rehearsal.wh_stock WHERE warehouse_id = '$CENTRAL_WAREHOUSE_ID' AND product_id = '$PRODUCT_ID'")"
sales_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT quantity FROM inventory_rehearsal.wh_stock WHERE warehouse_id = '$SALES_WAREHOUSE_ID' AND product_id = '$PRODUCT_ID'")"
product_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT quantity FROM inventory_rehearsal.products WHERE id = '$PRODUCT_ID'")"
movement_count="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.wh_movements")"
matching_audits="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.wh_movements WHERE type = 'adjust' AND reason = 'delta=1' AND performed_by = '$ACTOR_ID' AND product_id = '$PRODUCT_ID' AND to_warehouse_id = '$CENTRAL_WAREHOUSE_ID'")"
sum_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT COALESCE(sum(quantity), 0) FROM inventory_rehearsal.wh_stock WHERE product_id = '$PRODUCT_ID'")"

[[ "$central_qty" == "$((20 + CONCURRENT_CALLS))" ]] || { echo "FAIL: central quantity=$central_qty"; exit 1; }
[[ "$sales_qty" == "5" ]] || { echo "FAIL: sales quantity=$sales_qty"; exit 1; }
[[ "$product_qty" == "$((25 + CONCURRENT_CALLS))" ]] || { echo "FAIL: product quantity mirror=$product_qty"; exit 1; }
[[ "$movement_count" == "$CONCURRENT_CALLS" ]] || { echo "FAIL: movement count=$movement_count"; exit 1; }
[[ "$matching_audits" == "$CONCURRENT_CALLS" ]] || { echo "FAIL: matching audit count=$matching_audits"; exit 1; }
[[ "$product_qty" == "$sum_qty" ]] || { echo "FAIL: products.quantity=$product_qty does not equal summed stock=$sum_qty"; exit 1; }

echo "PASS: $CONCURRENT_CALLS concurrent stock increments were serialized; audit rows and product quantity mirror matched."
