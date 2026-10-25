# Phase 2–3 rollout runbook (anon lockdown, login gateway, guarded functions)

Everything below exists in the repo, is tested locally (see `REMEDIATION_LOG.md` §Tests) and is **NOT yet applied to production** unless the log says so. Apply strictly in this order; each step has a check, a rollback and a stop condition. Do not batch steps. Production = Supabase `fghdumrgimoeqsafdhhh`.

## Step 0 — already live
`20261025` profiles guard + auth-ban trigger, `manage-employee` v60, `20261026 rbac_primitives` (tables/functions only, nothing depends on them yet).

## Step 1 — additive, cannot affect users (apply any time)
| # | Action | File | Check after |
|---|---|---|---|
| 1a | `public_track_order` RPC | `proposed/20261027_public_track_rpc.sql` | `select * from public_track_order('<a real order code>')` returns 1 row of 7 columns |
| 1b | login gateway tables + limiter + `auth_password_matches` | `proposed/20261027_login_gateway.sql` | `select count(*) from internal_secrets` = 6; `has_function_privilege('anon','public.consume_pin_attempt_rate_limit(text,text,integer,integer,integer)','execute')` = false |
| 1c | cron jobs call functions with the Vault service key | `proposed/20261026_cron_service_key_calls.sql` | `select jobname, command from cron.job` shows `run_cron_function(...)` for lozy / analytics / shift-report; next tick of each succeeds (see monitoring query M3) |

## Step 2 — deploy code that is backwards compatible
| # | Action | Check | Rollback |
|---|---|---|---|
| 2a | deploy `verify-pin` (handler + index + `_shared/pinRateLimit.js`) with `--no-verify-jwt` | one real login (Hosam): response has `ok:true`, `authIdentity:"exists"`; `internal_secrets` limiter row counters appear in `private.pin_login_rate_limit_buckets` (hashes only) | redeploy previous version (v54 source is in `docs/security/…` history / Supabase "versions") |
| 2b | deploy `pin-change` (adds derived-mode branch; compat behaviour unchanged) | change a test employee's PIN twice via the admin screen; both `profiles.pin` and the Auth login keep working | redeploy v6 |
| 2c | deploy the guarded functions (`serveGuarded`): create-yurtici-shipment, create-babel-shipment, import-*, track-*, send-push, social-content, generate-quiz, sync-prices, lozy-kpi-coach, daily-analytics-snapshot, shift-report-reminder, retry-failed-syncs, sync-order-to-sheet | **Only after** the web release in step 3 is live (the old web bundle calls some of them with the public key and would get 401). Smoke: from the app, "track shipment", "create shipment" on a test order, AI caption, quiz | redeploy previous versions |

## Step 3 — web release
Merge the branch → Vercel build (`npm run build` is green). Contains: `functionHeaders.js` (session credential on fetch calls), manual sessions off (`ALLOW_MANUAL_SESSION_FALLBACK=false`), public tracking page via RPC, `signInWithPin` retry + clear error.
Gate before step 4: `select user_name, max(created_at) from activity_logs where action_type='login' and metadata->>'mode'='manual_session' and created_at > now() - interval '7 days' group by 1` returns **0 rows**.

## Step 4 — database lockdown, ONE batch at a time (15–30 min apart, watch M1/M2 between batches)
Order: `u1` (unused sensitive tables, both roles) → `b4` (backups) → `b1` (people & finance) → `b2` (orders-adjacent; includes the `customer_stats` view) → `b3` (work tools) → `b0` (profiles/orders/activity_logs/join requests allow-list + customer lookup RPC) → `wh_functions_authz`.
Rollback for any batch: `select public.security_restore_anon('<batch>');` (for `u1` also `security_restore_role('u1','authenticated')`) — restores exactly what was removed; `wh_functions_authz_rollback.sql` for the stock functions.
Stop condition: any `permission denied` row from a **signed-in** user in M1, or a user report → restore that batch, investigate, do not continue.

## Step 5 — only when all clients are new
`update internal_secrets set secret='derived', updated_at=now() where name='auth_mode';` Each user migrates at their next login. Rollback: set it back to `'compat'` (the next login re-aligns the password to `lp:<pin>`).

## Step 6 — Google Apps Script tracker
`google-apps-script/yurtici-public-tracker.gs` reads `orders` (order_id,status for Turkey) with the public key. `b0` leaves exactly those columns readable so it keeps working. To close that last door: replace the REST call with the `public_track_order`-style RPC (needs a list variant) — a follow-up that requires pasting the new script into Google.

## Monitoring queries
* **M1 permission errors by role** (Supabase logs): `select log_attributes['parsed.error_severity'] sev, count(*) from logs where source='postgres_logs' and event_message like '%permission denied%' group by sev`
* **M2 failing REST calls** : `select extract(log_attributes['request.path'],'^/rest/v1/(?:rpc/)?([a-z_0-9]+)') t, log_attributes['response.status_code'] s, count(*) from logs where source='edge_logs' and log_attributes['request.path'] like '/rest/v1/%' and log_attributes['response.status_code'] in ('401','403') group by t, s order by 3 desc`
* **M3 function gate**: `select log_attributes['response.status_code'] s, count(*) from logs where source='function_edge_logs' group by s` (expect no new 401/403 for the cron-driven functions after step 2c)
* **M4 login health**: `select coalesce(metadata->>'mode','auth') m, count(*) from activity_logs where action_type='login' and created_at > now()-interval '1 day' group by m` and the count of `login_failed` with `reason='auth_session_unavailable'` (must stay 0).
