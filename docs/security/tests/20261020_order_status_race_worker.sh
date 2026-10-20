#!/usr/bin/env bash
set -euo pipefail
index="${1:?task index required}"
if (( index % 2 == 1 )); then
  new_status="preparing"
else
  new_status="cancelled"
fi
order_id="60000000-0000-0000-0000-000000000001"
if psql -X -qAt -v ON_ERROR_STOP=1 \
    -v actor_id="$ORDER_ACTOR_ID" \
    -v order_id="$order_id" \
    -v new_status="$new_status" \
    -f docs/security/tests/20261020_order_status_race_client.sql > /dev/null 2>&1; then
  printf "allowed %s\n" "$new_status"
else
  printf "denied %s\n" "$new_status"
fi
