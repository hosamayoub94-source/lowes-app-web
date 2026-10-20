#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST must point to the disposable PostgreSQL service}"
: "${PGPORT:?PGPORT must be set}"
: "${PGUSER:?PGUSER must be set}"
: "${PGPASSWORD:?PGPASSWORD must be set}"
: "${PGDATABASE:?PGDATABASE must be set}"

# Test a race across DISTINCT orders competing for one shared stock row.
# Actor is the synthetic order manager; each order is individually locked,
# so this specifically verifies the stock-row guard across different order IDs.
ACTOR_ID="00000000-0000-0000-0000-000000000004"
SELLER_WAREHOUSE_ID="10000000-0000-0000-0000-000000000003"
PRODUCT_ID="20000000-0000-0000-0000-000000000001"
CONCURRENT_ORDERS=24
AVAILABLE_STOCK=20
PARALLEL_WORKERS=12

# Reset only the disposable fixture and put exactly 20 units in the order's
# resolved Syria distributor warehouse. The quantity-mirror trigger is active.
psql -X -v ON_ERROR_STOP=1 -c "TRUNCATE inventory_rehearsal.wh_movements"
psql -X -v ON_ERROR_STOP=1 -c "TRUNCATE inventory_rehearsal.orders"
psql -X -v ON_ERROR_STOP=1 -c "DELETE FROM inventory_rehearsal.wh_stock"
psql -X -v ON_ERROR_STOP=1 -c "INSERT INTO inventory_rehearsal.wh_stock (warehouse_id, product_id, quantity) VALUES ('$SELLER_WAREHOUSE_ID', '$PRODUCT_ID', '$AVAILABLE_STOCK')"

# Seed 24 distinct pending orders. Each persisted order requests one Rosemary Oil.
psql -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO inventory_rehearsal.orders
  (id, status, market, brand, source, handler_name, items)
SELECT
  ('40000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
  'pending',
  'syria',
  'lowes',
  NULL,
  'Seller Syria',
  '[{"name":"Rosemary Oil","qty":1}]'::jsonb
FROM generate_series(1, 24) AS g;
SQL

export ACTOR_ID
result_file="$(mktemp)"
trap 'rm -f "$result_file"' EXIT

seq 1 "$CONCURRENT_ORDERS" | xargs -P "$PARALLEL_WORKERS" -I '{}' bash -c '
  set -euo pipefail
  order_id="$(printf "40000000-0000-0000-0000-%012d" "$1")"
  if psql -X -qAt -v ON_ERROR_STOP=1 \
      -v actor_id="$ACTOR_ID" \
      -v order_id="$order_id" \
      -f docs/security/tests/20261020_order_cross_order_race_client.sql > /dev/null 2>&1; then
    printf "allowed\n"
  else
    printf "denied\n"
  fi
' _ '{}' > "$result_file"

allowed="$(grep -xc 'allowed' "$result_file" || true)"
denied="$(grep -xc 'denied' "$result_file" || true)"
[[ "$allowed" == "$AVAILABLE_STOCK" ]] || { echo "FAIL: expected $AVAILABLE_STOCK successful reservations, got $allowed"; cat "$result_file"; exit 1; }
[[ "$denied" == "$((CONCURRENT_ORDERS - AVAILABLE_STOCK))" ]] || { echo "FAIL: expected $((CONCURRENT_ORDERS - AVAILABLE_STOCK)) rejected orders, got $denied"; cat "$result_file"; exit 1; }

source_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT quantity FROM inventory_rehearsal.wh_stock WHERE warehouse_id = '$SELLER_WAREHOUSE_ID' AND product_id = '$PRODUCT_ID'")"
preparing_orders="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.orders WHERE status = 'preparing'")"
pending_orders="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.orders WHERE status = 'pending'")"
reserve_count="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.wh_movements WHERE type = 'reserve'")"
reserved_quantity="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT COALESCE(sum(quantity), 0) FROM inventory_rehearsal.wh_movements WHERE type = 'reserve'")"
bad_preparing="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.orders o WHERE o.status = 'preparing' AND NOT EXISTS (SELECT 1 FROM inventory_rehearsal.wh_movements m WHERE m.order_id = o.id AND m.type = 'reserve')")"
bad_pending="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.orders o WHERE o.status = 'pending' AND EXISTS (SELECT 1 FROM inventory_rehearsal.wh_movements m WHERE m.order_id = o.id AND m.type IN ('reserve','release'))")"
product_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT quantity FROM inventory_rehearsal.products WHERE id = '$PRODUCT_ID'")"
sum_qty="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT COALESCE(sum(quantity), 0) FROM inventory_rehearsal.wh_stock WHERE product_id = '$PRODUCT_ID'")"
wrong_actor="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM inventory_rehearsal.wh_movements WHERE type = 'reserve' AND performed_by <> 'Order Manager'")"

[[ "$source_qty" == "0" ]] || { echo "FAIL: source stock ended at $source_qty, expected 0"; exit 1; }
[[ "$preparing_orders" == "$AVAILABLE_STOCK" ]] || { echo "FAIL: preparing orders=$preparing_orders, expected $AVAILABLE_STOCK"; exit 1; }
[[ "$pending_orders" == "$((CONCURRENT_ORDERS - AVAILABLE_STOCK))" ]] || { echo "FAIL: pending orders=$pending_orders, expected $((CONCURRENT_ORDERS - AVAILABLE_STOCK))"; exit 1; }
[[ "$reserve_count" == "$AVAILABLE_STOCK" ]] || { echo "FAIL: reserve audit rows=$reserve_count, expected $AVAILABLE_STOCK"; exit 1; }
[[ "$reserved_quantity" == "$AVAILABLE_STOCK" ]] || { echo "FAIL: total reserved quantity=$reserved_quantity, expected $AVAILABLE_STOCK"; exit 1; }
[[ "$bad_preparing" == "0" ]] || { echo "FAIL: $bad_preparing preparing orders have no reserve movement"; exit 1; }
[[ "$bad_pending" == "0" ]] || { echo "FAIL: $bad_pending rejected pending orders have stock movements"; exit 1; }
[[ "$product_qty" == "$sum_qty" ]] || { echo "FAIL: products.quantity=$product_qty does not equal summed stock=$sum_qty"; exit 1; }
[[ "$wrong_actor" == "0" ]] || { echo "FAIL: $wrong_actor reserve movements have incorrect actor attribution"; exit 1; }

echo "PASS: 24 distinct orders competed for 20 units; exactly 20 succeeded, four stayed pending, and stock/audit/status/actor totals reconcile."
