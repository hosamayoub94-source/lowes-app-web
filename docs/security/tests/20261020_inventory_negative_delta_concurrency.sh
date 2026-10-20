#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST must point to the disposable PostgreSQL service}"
: "${PGPORT:?PGPORT must be set}"
: "${PGUSER:?PGUSER must be set}"
: "${PGPASSWORD:?PGPASSWORD must be set}"
: "${PGDATABASE:?PGDATABASE must be set}"

# Synthetic fixture identity and stock only.
ACTOR_ID="00000000-0000-0000-0000-000000000002" # active warehouse_manager
CENTRAL_WAREHOUSE_ID="10000000-0000-0000-0000-000000000001"
SALES_WAREHOUSE_ID="10000000-0000-0000-0000-000000000002"
PRODUCT_ID="20000000-0000-0000-0000-000000000001"
CONCURRENT_CALLS=24
PARALLEL_WORKERS=12

# Only 20 units will be available to 24 parallel one-unit decrements.
psql -X -v ON_ERROR_STOP=1 -c "TRUNCATE inventory_rehearsal.wh_movements"
psql -X -v ON_ERROR_STOP=1 -c "DELETE FROM inventory_rehearsal.wh_stock WHERE NOT ((warehouse_id = '$CENTRAL_WAREHOUSE_ID' AND product_id = '$PRODUCT_ID') OR (warehouse_id = '$SALES_WAREHOUSE_ID' AND product_id = '$PRODUCT_ID'))"
psql -X -v ON_ERROR_STOP=1 -c "UPDATE inventory_rehearsal.wh_stock SET quantity = 20 WHERE warehouse_id = '$CENTRAL_WAREHOUSE_ID' AND product_id = '$PRODUCT_ID'"
psql -X -v ON_ERROR_STOP=1 -c "UPDATE inventory_rehearsal.wh_stock SET quantity = 5 WHERE warehouse_id = '$SALES_WAREHOUSE_ID' AND product_id = '$PRODUCT_ID'"

export ACTOR_ID CENTRAL_WAREHOUSE_ID PRODUCT_ID
result_file="$(mktemp)"
trap 'rm -f "$result_file"' EXIT

# The conditional UPDATE inside the RPC must serialize the race. Exactly 20
# calls can spend the available stock; four must fail without audit or row change.
seq 1 "$CONCURRENT_CALLS" | xargs -P "$PARALLEL_WORKERS" -I '{}' bash -c '
  set -euo pipefail
  if psql -X -qAt -v ON_ERROR_STOP=1 \
    -v actor_id="$ACTOR_ID" \
    -v warehouse_id="$CENTRAL_WAREHOUSE_ID" \
    -v product_id="$PRODUCT_ID" \
    -f docs/security/tests/20261020_inventory_negative_delta_concurrency_client.sql > /dev/null 2>&1; then
    printf "allowed\n"
  else
    printf "denied\n"
  fi
' > "$result_file"

allowed="$(grep -xc 'allowed' "$result_file" || true)"
denied="$(grep -xc 'denied' "$result_file" || true)"
[[ "$allowed" == "20" ]] || { echo "FAIL: expected 20 successful decrements, got $allowed"; cat "$result_file"; exit 1; }
[[ "$denied" == "4" ]] || { echo "FAIL: expected 4 rejected decrements, got $denied"; cat "$result_file"; exit 1; }

central_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT quantity FROM inventory_rehearsal.wh_stock WHERE warehouse_id = '$CENTRAL_WAREHOUSE_ID' AND product_id = '$PRODUCT_ID'")"
sales_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT quantity FROM inventory_rehearsal.wh_stock WHERE warehouse_id = '$SALES_WAREHOUSE_ID' AND product_id = '$PRODUCT_ID'")"
product_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT quantity FROM inventory_rehearsal.products WHERE id = '$PRODUCT_ID'")"
movement_count="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.wh_movements")"
matching_audits="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.wh_movements WHERE type = 'adjust' AND reason = 'delta=-1' AND performed_by = '$ACTOR_ID' AND product_id = '$PRODUCT_ID' AND from_warehouse_id = '$CENTRAL_WAREHOUSE_ID' AND to_warehouse_id IS NULL")"
sum_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT COALESCE(sum(quantity), 0) FROM inventory_rehearsal.wh_stock WHERE product_id = '$PRODUCT_ID'")"

[[ "$central_qty" == "0" ]] || { echo "FAIL: central source stock ended at $central_qty, expected 0"; exit 1; }
[[ "$sales_qty" == "5" ]] || { echo "FAIL: sales stock changed to $sales_qty, expected 5"; exit 1; }
[[ "$product_qty" == "5" ]] || { echo "FAIL: derived products.quantity=$product_qty, expected 5"; exit 1; }
[[ "$movement_count" == "20" ]] || { echo "FAIL: expected 20 successful decrement movements, got $movement_count"; exit 1; }
[[ "$matching_audits" == "20" ]] || { echo "FAIL: expected 20 matching negative-delta audit rows, got $matching_audits"; exit 1; }
[[ "$product_qty" == "$sum_qty" ]] || { echo "FAIL: products.quantity=$product_qty does not equal summed stock=$sum_qty"; exit 1; }

echo "PASS: concurrent decrements used exactly available stock; four excess requests were rejected without overdraft or extra audit rows."
