#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST must point to the disposable PostgreSQL service}"
: "${PGPORT:?PGPORT must be set}"
: "${PGUSER:?PGUSER must be set}"
: "${PGPASSWORD:?PGPASSWORD must be set}"
: "${PGDATABASE:?PGDATABASE must be set}"

ORDER_ACTOR_ID="00000000-0000-0000-0000-000000000004" # synthetic manager with order permission
ORDER_ID="60000000-0000-0000-0000-000000000001"
SELLER_WAREHOUSE_ID="10000000-0000-0000-0000-000000000003"
PRODUCT_ID="20000000-0000-0000-0000-000000000001"
CONCURRENT_CALLS=24
PARALLEL_WORKERS=24

# Reset the disposable fixture to one available item and one pending order.
psql -X -v ON_ERROR_STOP=1 -c "TRUNCATE inventory_rehearsal.wh_movements"
psql -X -v ON_ERROR_STOP=1 -c "TRUNCATE inventory_rehearsal.orders"
psql -X -v ON_ERROR_STOP=1 -c "DELETE FROM inventory_rehearsal.wh_stock"
psql -X -v ON_ERROR_STOP=1 -c "INSERT INTO inventory_rehearsal.wh_stock (warehouse_id, product_id, quantity) VALUES ('$SELLER_WAREHOUSE_ID', '$PRODUCT_ID', 8)"
psql -X -v ON_ERROR_STOP=1 -v order_id="$ORDER_ID" <<'SQL'
INSERT INTO inventory_rehearsal.orders
  (id, status, market, brand, source, handler_name, items)
VALUES (
  :'order_id'::uuid, 'pending', 'syria', 'lowes', NULL,
  'Seller Syria', '[{"name":"Rosemary Oil","qty":1}]'::jsonb
);
SQL

export ORDER_ACTOR_ID
result_file="$(mktemp)"
trap 'rm -f "$result_file"' EXIT
seq 1 "$CONCURRENT_CALLS" | xargs -P "$PARALLEL_WORKERS" -I '{}' bash docs/security/tests/20261020_order_status_race_worker.sh '{}' > "$result_file"

allowed="$(grep -c '^allowed ' "$result_file" || true)"
denied="$(grep -c '^denied ' "$result_file" || true)"
[[ "$allowed" == "$CONCURRENT_CALLS" ]] || { echo "FAIL: only $allowed of $CONCURRENT_CALLS concurrent opposing status updates succeeded"; cat "$result_file"; exit 1; }
[[ "$denied" == "0" ]] || { echo "FAIL: $denied concurrent status updates were unexpectedly rejected"; cat "$result_file"; exit 1; }

final_status="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT status FROM inventory_rehearsal.orders WHERE id = '$ORDER_ID'")"
updated_by="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT updated_by FROM inventory_rehearsal.orders WHERE id = '$ORDER_ID'")"
source_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT quantity FROM inventory_rehearsal.wh_stock WHERE warehouse_id = '$SELLER_WAREHOUSE_ID' AND product_id = '$PRODUCT_ID'")"
reserve_count="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.wh_movements WHERE order_id = '$ORDER_ID' AND type = 'reserve'")"
release_count="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.wh_movements WHERE order_id = '$ORDER_ID' AND type = 'release'")"
net_reserved="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT COALESCE(sum(CASE WHEN type = 'reserve' THEN quantity ELSE -quantity END), 0) FROM inventory_rehearsal.wh_movements WHERE order_id = '$ORDER_ID' AND type IN ('reserve','release')")"
product_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT quantity FROM inventory_rehearsal.products WHERE id = '$PRODUCT_ID'")"
sum_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT COALESCE(sum(quantity),0) FROM inventory_rehearsal.wh_stock WHERE product_id = '$PRODUCT_ID'")"
orphan_reserve="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.wh_movements WHERE order_id = '$ORDER_ID' AND type = 'reserve' AND performed_by <> 'Order Manager'")"

[[ "$final_status" == "preparing" || "$final_status" == "cancelled" ]] || { echo "FAIL: unexpected final status=$final_status"; exit 1; }
[[ "$updated_by" == "Order Manager" ]] || { echo "FAIL: updated_by=$updated_by"; exit 1; }
[[ "$orphan_reserve" == "0" ]] || { echo "FAIL: reservation actor attribution is inconsistent"; exit 1; }
if [[ "$final_status" == "preparing" ]]; then
  [[ "$net_reserved" == "1" && "$source_qty" == "7" && "$reserve_count" == "$((release_count + 1))" ]] || { echo "FAIL: final preparing state does not match net reservation ledger"; exit 1; }
else
  [[ "$net_reserved" == "0" && "$source_qty" == "8" && "$reserve_count" == "$release_count" ]] || { echo "FAIL: final cancelled state still has a net stock reservation"; exit 1; }
fi
[[ "$product_qty" == "$sum_qty" ]] || { echo "FAIL: products.quantity=$product_qty does not equal summed stock=$sum_qty"; exit 1; }

echo "PASS: 24 concurrent preparing/cancelled transitions serialized to one final status with a matching net stock reservation, audit ledger and product mirror."
