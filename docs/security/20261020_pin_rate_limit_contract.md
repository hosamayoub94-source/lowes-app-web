# PIN attempt limiter — disposable PostgreSQL contract

**Status:** CI rehearsal contract plus an opt-in source integration path; not a production migration or active live control.  
**Cost:** uses the existing ephemeral PostgreSQL 17 service in GitHub Actions. No Supabase branch/project or external rate-limit service is needed.

## What the fixture proves

The test setup defines a narrow privileged database function named consume_pin_attempt_rate_limit that is callable only by service_role in the fixture. It stores no account names or IP strings: the caller must provide 64-character lowercase hex key hashes. The backing bucket table is in the private schema, has RLS enabled, and has no direct table grants to anon, authenticated, or service_role.

For each request, the function obtains transaction-scoped advisory locks for the account key and source key, then atomically increments two fixed-window counters. It returns a boolean only. The fixture verifies:

- anon cannot execute the function or read the backing table;
- account limits are not bypassed by changing source hashes;
- source limits are not bypassed by changing account hashes;
- old fixed windows reset, and stale rows are removed opportunistically under a non-blocking cleanup lock (up to 500 per call);
- invalid configurations and un-hashed input identifiers are rejected;
- concurrent independent PostgreSQL sessions with the same account produce exactly five allowed requests and nineteen denials when the test limit is five.

The limits used in these tests are **test values only**, not a final recommendation for production login behavior.

## Read-only request-header evidence (2026-10-20)

A read-only aggregate of the connected `lowes-attendance` Supabase unified logs over the default last-24-hour window found **8** `function_edge_logs` entries for `/functions/v1/verify-pin`; all 8 had non-empty `request.headers.cf_connecting_ip` and `request.headers.x_real_ip` fields. The query returned counts and paths only; it did not retrieve or store any IP values.

This proves the header is present in the observed hosted request logs, but not by itself that clients cannot influence it all the way through the specific gateway path. Cloudflare documents `CF-Connecting-IP` as the client IP header added on traffic from Cloudflare's edge to an origin (see [Cloudflare HTTP headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/)). Keep the feature flag off until the specific Supabase request path and spoofing boundary have been reviewed. Do not make a production request just to manufacture this evidence; use existing aggregate telemetry or an approved test.

## Integration requirements before this becomes a real login control

1. **No production enablement yet.** The SQL candidate is exercised only against the disposable database; it is not a production migration. The Edge Function source now has a guarded integration path, but it is opt-in and is not deployed. With `PIN_RATE_LIMIT_ENABLED` missing or not equal to `true`, the legacy login flow continues without calling the limiter. Do not enable the flag until the candidate has been turned into a reviewed migration and applied, and the request source header is verified in the live Edge Function environment.
2. **Use a server-only key.** The Edge Function calls the rate-limit RPC using its server-held secret/service-role client when the feature flag is explicitly enabled. The browser must never be able to call the limiter RPC or read its counters. Fail closed with a stable server error if the limiter cannot be reached; do not continue PIN verification without a successful limiter decision.
3. **Hash with a server-side pepper.** The opt-in helper generates account and source hashes inside the Edge Function using HMAC-SHA-256 and a dedicated secret, not a plain hash of predictable employee names or IP addresses. Do not log the input or hashes.
4. **Verify the source-address contract.** The opt-in helper uses only `cf-connecting-ip` and does not fall back to `X-Forwarded-For`. Only enable it after confirming the gateway-managed client IP header is populated and trustworthy in this project's deployed Supabase path. If a trustworthy source identity cannot be derived, document that limitation and do not claim source-level limiting is in force.
5. **Agree on thresholds and response behavior.** The implementation must decide and document account/source windows, limits, cooldown, response status, and support recovery. Use a generic unauthenticated response for unknown/inactive account, wrong PIN, and throttling where practical so the endpoint does not become an account-state oracle.
6. **Choose the window model consciously.** This candidate uses fixed windows; requests around a window boundary can burst across two windows. A sliding-window or token-bucket implementation may be required if the risk assessment demands stricter burst control. The opportunistic cleanup is bounded, but production still needs monitoring of row growth and cleanup effectiveness.
7. **Keep behavior change separate from credential reconciliation.** Rate limiting must not reset existing Auth passwords or disable the local-session fallback by itself. Validate the exact client expectations and recovery path independently.

## Release gate

Passing this fixture demonstrates only the PostgreSQL algorithm modeled here. It does not prove the live verify-pin endpoint calls the limiter, that a real request source header is trusted, that production credentials/schema match the fixture, or that the actual rate limits are already enforced. No production function, schema, Auth identity, login credential, RLS/grant, or data has been changed by this test work.
