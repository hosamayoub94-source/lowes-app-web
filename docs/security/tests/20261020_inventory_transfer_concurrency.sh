#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST must point to the disposable PostgreSQL service}"
: "${PGPORT:?PGPORT must be set}"
: "${PGUSER:?PGUSER must be set}"
: "${PGPASSWORD:?PGPASSWORD must be set}"
: "${PGDATABASE:?PGDATABASE must be set}"

# Synthetic fixture identities only.
ACTOR_ID="00000000-0000-0000-0000-000000000002" # active warehouse_manager
CENTRAL_WAREHOUSE_ID="10000000-0000-0000-0000-000000000001"
SALES_WAREHOUSE_ID="10000000-0000-0000-0000-000000000002"
PRODUCT_ID="20000000-0000-0000-0000-000000000001"
CONCURRENT_TRANSFERS=24
PARALLEL_WORKERS=12

# Reset the disposable fixture: exactly 20 units at source, 5 at destination.
psql -X -v ON_ERROR_STOP=1 -c "TRUNCATE inventory_rehearsal.wh_movements"
psql -X -v ON_ERROR_STOP=1 -c "UPDATE inventory_rehearsal.wh_stock SET quantity = 20 WHERE warehouse_id = '$CENTRAL_WAREHOUSE_ID' AND product_id = '$PRODUCT_ID'"
psql -X -v ON_ERROR_STOP=1 -c "UPDATE inventory_rehearsal.wh_stock SET quantity = 5 WHERE warehouse_id = '$SALES_WAREHOUSE_ID' AND product_id = '$PRODUCT_ID'"

export ACTOR_ID CENTRAL_WAREHOUSE_ID SALES_WAREHOUSE_ID PRODUCT_ID
result_file="$(mktemp)"
trap 'rm -f "$result_file"' EXIT

# Expected: exactly 20 transfers succeed; the remaining 4 fail for insufficient stock.
# Each process reports only its outcome. Post-run stock and audit checks validate the reason.
seq 1 "$CONCURRENT_TRANSFERS" | xargs -P "$PARALLEL_WORKERS" -I '{}' bash -c '
  set -euo pipefail
  if psql -X -qAt -v ON_ERROR_STOP=1 -c "
      BEGIN;
      SET LOCAL ROLE authenticated;
      SELECT set_config('\''request.jwt.claim.sub'\'', '\''$ACTOR_ID'\'', true);
      SELECT inventory_rehearsal.wh_transfer_stock(
        '\''$CENTRAL_WAREHOUSE_ID'\''::uuid,
        '\''$SALES_WAREHOUSE_ID'\''::uuid,
        '\''$PRODUCT_ID'\''::uuid,
        1
      );
      COMMIT;
    " > /dev/null 2>&1; then
    printf "allowed\n"
  else
    printf "denied\n"
  fi
' > "$result_file"

allowed="$(grep -xc 'allowed' "$result_file" || true)"
denied="$(grep -xc 'denied' "$result_file" || true)"
[[ "$allowed" == "20" ]] || { echo "FAIL: expected 20 allowed transfers, got $allowed"; cat "$result_file"; exit 1; }
[[ "$denied" == "4" ]] || { echo "FAIL: expected 4 insufficient-stock denials, got $denied"; cat "$result_file"; exit 1; }

central_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT quantity FROM inventory_rehearsal.wh_stock WHERE warehouse_id = '$CENTRAL_WAREHOUSE_ID' AND product_id = '$PRODUCT_ID'")"
sales_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT quantity FROM inventory_rehearsal.wh_stock WHERE warehouse_id = '$SALES_WAREHOUSE_ID' AND product_id = '$PRODUCT_ID'")"
product_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT quantity FROM inventory_rehearsal.products WHERE id = '$PRODUCT_ID'")"
movement_count="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.wh_movements")"
transfer_audits="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.wh_movements WHERE type = 'allocate' AND quantity = 1 AND performed_by = '$ACTOR_ID' AND from_warehouse_id = '$CENTRAL_WAREHOUSE_ID' AND to_warehouse_id = '$SALES_WAREHOUSE_ID' AND product_id = '$PRODUCT_ID'")"
sum_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT COALESCE(sum(quantity), 0) FROM inventory_rehearsal.wh_stock WHERE product_id = '$PRODUCT_ID'")"

[[ "$central_qty" == "0" ]] || { echo "FAIL: source stock ended at $central_qty, expected 0"; exit 1; }
[[ "$sales_qty" == "25" ]] || { echo "FAIL: destination stock ended at $sales_qty, expected 25"; exit 1; }
[[ "$product_qty" == "25" ]] || { echo "FAIL: products.quantity mirror ended at $product_qty, expected 25"; exit 1; }
[[ "$movement_count" == "20" ]] || { echo "FAIL: expected exactly 20 transfer movements, got $movement_count"; exit 1; }
[[ "$transfer_audits" == "20" ]] || { echo "FAIL: expected 20 matching transfer audits, got $transfer_audits"; exit 1; }
[[ "$product_qty" == "$sum_qty" ]] || { echo "FAIL: products.quantity=$product_qty does not equal summed stock=$sum_qty"; exit 1; }

echo "PASS: concurrent transfers moved exactly available stock; four excess requests were denied, with matching audits and quantity mirror."
