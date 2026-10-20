#!/usr/bin/env bash
set -euo pipefail

: "\${PGHOST:?PGHOST must point to the disposable PostgreSQL service}"
: "\${PGPORT:?PGPORT must be set}"
: "\${PGUSER:?PGUSER must be set}"
: "\${PGPASSWORD:?PGPASSWORD must be set}"
: "\${PGDATABASE:?PGDATABASE must be set}"

# Synthetic, non-sensitive SHA-256-shaped keys used only in the CI fixture.
export RATE_ACCOUNT_HASH="$(printf '%064d' 0)"
export RATE_SOURCE_HASH="$(printf '%064d' 1)"

psql -X -v ON_ERROR_STOP=1 -c "TRUNCATE private.pin_login_rate_limit_buckets"

result_file="$(mktemp)"
trap 'rm -f "$result_file"' EXIT

# Make many independent database sessions race the same account bucket.
# The expected contract is exactly five allowed attempts and all remaining
# attempts denied, despite concurrency. The counter is capped at limit + 1.
seq 1 24 | xargs -P 12 -I '{}' bash -c '
  psql -X -qAt -v ON_ERROR_STOP=1 -c "SET ROLE service_role; SELECT public.consume_pin_attempt_rate_limit('\''$RATE_ACCOUNT_HASH'\'', '\''$RATE_SOURCE_HASH'\'', 300, 5, 100)"
' > "$result_file"

allowed="$(grep -xc 't' "$result_file" || true)"
denied="$(grep -xc 'f' "$result_file" || true)"

if [[ "$allowed" != "5" || "$denied" != "19" ]]; then
  echo "FAIL: expected 5 allowed / 19 denied concurrent attempts; got \${allowed} allowed / \${denied} denied"
  cat "$result_file"
  exit 1
fi

attempts="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT attempts FROM private.pin_login_rate_limit_buckets WHERE scope = 'account' AND key_hash = '$RATE_ACCOUNT_HASH'")"
if [[ "$attempts" != "6" ]]; then
  echo "FAIL: expected capped account counter 6 (limit + 1), got $attempts"
  exit 1
fi

echo "PASS: concurrent PIN limiter enforced 5 allowed / 19 denied attempts"
