#!/usr/bin/env bash
set -euo pipefail

kind="${1:?task kind required}"
index="${2:?task index required}"

case "$kind" in
  order)
    order_id="$(printf "50000000-0000-0000-0000-%012d" "$index")"
    if psql -X -qAt -v ON_ERROR_STOP=1 \
        -v actor_id="$ORDER_ACTOR_ID" \
        -v order_id="$order_id" \
        -f docs/security/tests/20261020_order_transfer_race_client.sql > /dev/null 2>&1; then
      printf "order allowed\n"
    else
      printf "order denied\n"
    fi
    ;;
  transfer)
    if psql -X -qAt -v ON_ERROR_STOP=1 -c "
      BEGIN;
      SET LOCAL ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '$TRANSFER_ACTOR_ID', true);
      SELECT inventory_rehearsal.wh_transfer_stock(
        '$SOURCE_WAREHOUSE_ID'::uuid,
        '$DEST_WAREHOUSE_ID'::uuid,
        '$PRODUCT_ID'::uuid,
        1
      );
      COMMIT;
    " > /dev/null 2>&1; then
      printf "transfer allowed\n"
    else
      printf "transfer denied\n"
    fi
    ;;
  *)
    echo "unknown task kind: $kind" >&2
    exit 2
    ;;
esac
