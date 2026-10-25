# Remediation Log — Role & Permission Audit (2026-10-25)

Scope: only fixes that (a) were confirmed, (b) pass tests, (c) have a clear blast radius. Nothing in production was changed except the three items marked **LIVE**. Production = Supabase `fghdumrgimoeqsafdhhh`.

## 1. Production state at a glance
| Item | Production | Evidence |
|---|---|---|
| F-06 profiles guard extension | **LIVE** (migration `profiles_guard_extend_20261025`) | rolled-back anon probes now rejected with errcode 42501 on `late_tolerance_minutes`, `employee_name`; a non-guarded update (`bio`,`total_points` no-op) still passes |
| F-05 auth ban follows `is_active` | **LIVE** (migration `auth_ban_on_deactivate_20261025`: function + trigger + one-time backfill) | after: inactive-banned = 14, inactive-not-banned = 0, **active-banned = 0**, trigger present, function not executable by anon/authenticated |
| F-04 manager→admin | **LIVE** (Edge Function `manage-employee` v60, `verify_jwt=true`) | deployed; boot-check with the public key returns `{"ok":false,"error":"unauthorized"}` HTTP 200 (module loads). An authenticated end-to-end call as manager was **not** performed (would need a real manager session/PIN). Logic proven by unit tests on the exact module. |
| F-01, F-02, F-03, F-07, F-08, F-09, F-10…F-16 | **UNCHANGED (open)** | see audit §3, §6 |
| Employee data, roles, salaries, orders, balances | **not modified** by any probe | all probes inside `BEGIN … ROLLBACK` or rejected by triggers |
| Role of any employee | **not changed** | |
The only production *data* effect: `auth.users.banned_until='infinity'` on the 14 already-inactive profiles (they already could not log in through the app). Reactivation (admin UI or `manage-employee`) lifts the ban automatically via the trigger.

Note on deployment: the first deploy attempt failed with a transport error (`ERR_CONNECTION_CLOSED`, version stayed 59); the second succeeded as v60 with condensed English comments (code identical to the repo file except comment text). No Supabase CLI/token was available in this session.

## 2. Changes (files)
| File | Change |
|---|---|
| `supabase/functions/_shared/employeeAdminPolicy.js` (new) | `canGrantRole`, `canManageTargetAccount`: `admin` role reachable only by an admin |
| `supabase/functions/manage-employee/index.ts` | uses the policy on add/edit/deactivate/reactivate/move_group/**delete** (delete previously skipped the target guard); synced with the deployed retired `reset_pin` |
| `supabase/functions/admin-reset-pin/index.ts` | repo synced to the deployed retired stub (the repo still contained the old pre-retirement logic) |
| `supabase/migrations/20261025100000_profiles_guard_extend.sql`, `…100100_auth_ban_on_deactivate.sql` | applied migrations (copies of `docs/security/proposed/*`) |
| `docs/security/proposed/20261025_*_rollback.sql` | rollbacks (guard restores the exact pre-change body captured from prod; ban rollback removes trigger/function, the backfill is intentionally not auto-reverted) |
| `scripts/security/role-matrix.mjs` | regenerates the role×screen matrix from code |
| tests | below |

## 3. Tests
| Test | Result | What it proves |
|---|---|---|
| `node test-profiles-guard-and-auth-ban-sql.mjs` (PGlite, runs the real SQL) | **83/83** | baseline gap reproduced (anon changes late tolerance / sales counters / renames admin) → after migration blocked for anon, employee, manager; admin session & service_role unaffected; bio/total_points still editable; upsert escalation & new-admin insert blocked; ban follows deactivate/reactivate; backfill; rollback restores baseline |
| `node test-employee-admin-policy.mjs` | **33/33** | manager can't grant/manage admin; other hierarchy rules unchanged; call sites actually use the policy; `reset_pin`/`admin-reset-pin` stay retired. **Mutation-checked:** removing the admin rule makes 1 test fail (twice, two different mutations) |
| `node test-role-permission-invariants.mjs` | **95/95** | least-privilege defaults for every role; unknown/legacy roles get nothing; extra/denied resolution; media-team user sees none of orders/customers/payroll/accounting/admin |
| existing `test-media-sales-hidden.mjs` | 64/64 | no regression in f31fda0 behaviour |
| existing `test-routes-structure.mjs` | 80 routes, 0 problems | |
| existing `test-auth-security-contract.mjs` | 11/11 | |
| `eslint` on the new files | clean | |
Live read-only/rolled-back probes (not repeatable tests) are listed in §4.

Not covered: authenticated Edge Function calls per role (no test sessions/PINs were created or used); Deno runtime unit tests of `manage-employee` (the repo has none for it — covered by the pure-policy test + static wiring asserts + live boot check).

## 4. Live probe log (all inside `BEGIN … ROLLBACK`, synthetic claims, no PIN/secret printed)
1. anon `UPDATE profiles SET role_type='admin'` → rejected (guard). anon upsert escalation → rejected. anon `extra_permissions` → rejected. anon duplicate-name insert → unique violation.
2. anon `UPDATE … late_tolerance_minutes, sales_confirmed_usd, total_points` → **succeeded** (before F-06); `late_tolerance_minutes` and `employee_name` → rejected (after F-06); `bio`/`total_points` no-op → allowed (after).
3. anon `SELECT count(*)`: orders 36,507 · accounting_entries 928 · attendance 9,944 · products 39 · profiles 51 (before and unchanged).
4. synthetic media-team employee JWT: salaries visible 51, `monthly_payroll` 37, `payroll_entries` 5 (own legacy), accounting 928, orders 36,507, `system_settings` 36.
5. Catalog: 107 public tables with anon grants, 27 anon-executable definer functions, column-privilege lists for `profiles`, `pg_stat_user_tables`, `auth.users` ⨝ `profiles` aggregates, `activity_logs` login-mode aggregate.

## 5. Not applied, and why
| Item | Why not | What is needed |
|---|---|---|
| Close anon / replace `USING(true)` (F-01/F-02) | 5 active users run on anon manual sessions; unknown external anon readers (Apps Script, star-network); would lock people out | F-09 identity repair → staged per-table lockdown with rollback files, owner approval |
| PIN rate-limit (F-03) | candidate exists (`docs/security/candidates/20261020_pin_rate_limit_rpc.sql`) but needs secrets (pepper), thresholds, IP-header decision, and must also cover the Auth password endpoint | decision + staging rehearsal |
| Authenticate F-07 functions | callers include Apps Script, cron, other functions with the service key | caller map, then per-function shared-secret/session check |
| Revoke anon EXECUTE on `wh_*` | browser calls them; manual sessions would fail | after F-09 |
| `monthly_payroll` / `salary_deductions` revoke | `pg_stat` shows 113 index scans since 2026-03-30 (maybe other apps); no code in this repo reads it | owner confirms the legacy table is dead |
| Profile column-level revoke for salary columns | `OrdersScreen` reads own `commission_pct`, `AttendanceScreen` reads own `face_descriptor` as the logged-in (possibly anon) user | column-by-column move to RPC/own-row view |
| UI role/permission mismatches (F-10) | design decision (`roles OR perm` semantics) | owner decision |
| Orphan auth users (F-13) | deleting identities is irreversible | owner OK |

## 6. How to roll back what is live
```sql
-- F-06: run docs/security/proposed/20261025_profiles_guard_extend_rollback.sql
-- F-05: run docs/security/proposed/20261025_auth_ban_on_deactivate_rollback.sql
--       (and, only if truly needed, lift a ban:  update auth.users set banned_until = null where id = '<profile id>';)
-- F-04: redeploy supabase/functions/manage-employee/index.ts with the canGrantRole/canManageTargetAccount calls reverted to the old
--       `allowed !== '*' && !allowed.includes(...)` checks (old behaviour = manager can manage admins; not recommended).
```

## 7. Final re-check (after changes)
Re-ran the F-05 verification query (14/0/0, trigger present, no anon/authenticated EXECUTE) and the F-06 probes (rejected / allowed as designed) after the migrations; `manage-employee` boot-check after the deploy. The P0/P1 items listed in §5 were re-confirmed as still open — they are **not** fixed.

---

# Round 2 (2026-10-25, later session): authentication, table protection, function protection

Scope given by the owner: repair the login path first, then close tables, then functions, in small reversible batches, never at the cost of employees' access. Companion documents: `AUTH_SESSION_ROOT_CAUSE.md` (why five people were on manual sessions) and `PHASE2_ROLLOUT_RUNBOOK.md` (the exact order to apply everything below).

## R2.1 What changed in production in this round (verified)
| Change | Evidence |
|---|---|
| Migration `rbac_primitives_20261026`: table `app_role_permissions` (62 rows, RLS on, no grants) + functions `app_caller_kind/app_profile_ok/app_role/app_has_permission/app_require_authenticated/app_require_permission` (not executable by anon). **Nothing depends on them yet** — they are the building blocks for the next steps. | `select count(*)` = 62; `has_function_privilege('anon', …)` = false; `app_has_permission()` evaluated for all 37 active profiles under rolled-back synthetic sessions and read against the JS model (spot-checked alic kanaan, Olka, Fatima, Fadi) |
| Nothing else. | |

## R2.2 What could NOT be applied, and exactly why
The production-change tool (`apply_migration`) was refused by the session's safety classifier ("Production Deploy") when I tried to apply `wh_functions_authz`. I did not look for another route (no SQL-editor/`execute_sql` DDL workaround, no CLI) because the refusal is a policy decision, not a technical error. **Everything in "prepared" below is therefore local-only and untested against real Auth**.
To continue, the owner can allow the tool for this repository (permission rule for `mcp__…__apply_migration` / `deploy_edge_function`) or run the runbook steps himself.

## R2.3 Prepared and tested locally (not applied)
| Item | Files | Tests |
|---|---|---|
| Stock functions require a signed-in/permitted caller; anon EXECUTE revoked | `proposed/20261026_wh_functions_authz(.sql / _rollback.sql)` | `test-rbac-wh-authz-sql.mjs` **71/71**; mutation (remove the permission call) → 5 failures |
| Guarded Edge Functions (18) — service key or active signed-in user with role/permission; anon key rejected before any work | `_shared/serveGuarded.ts`, `callerAuth.js`, `rolePermissions.js`, edits to 18 `index.ts` | `test-function-guards.mjs` **441/441** (real `index.ts` files, fake Deno/supabase); mutation of the gate → 56 and 60 failures |
| Cron jobs present the Vault service key (4 jobs were using the public key or nothing) | `proposed/20261026_cron_service_key_calls(.sql / _rollback.sql)` | `test-cron-service-key-sql.mjs` **17/17** |
| Login gateway: attempt limiter (25 / account, 200 / source per 10 min), server-only secret store, self-repair of the Auth password, optional `derived` mode | `proposed/20261027_login_gateway(.sql/_rollback.sql)`, `verify-pin/{handler,index}.ts`, `pin-change/{handler,index}.ts` (recovered from prod) | `test-login-gateway-sql.mjs` **29/29**, `test-verify-pin-handler.mjs` **41/41**, `test-pin-change-handler.mjs` **24/24**, `test-auth-security-contract.mjs` **11/11** (guards updated to the new file layout, none weakened) |
| Anon lockdown toolkit (reversible, records every removed privilege) + batches b0–b4 + unused-sensitive-tables batch `u1` (17 tables, both roles) | `proposed/20261027_anon_lockdown_*`, `20261027_unused_sensitive_tables.sql` | `test-anon-lockdown-sql.mjs` **216/216** (allow-list works, authenticated untouched, exact restore, column-level grants) |
| Public tracking page through an RPC instead of reading `orders` | `20261027_public_track_rpc.sql`, `PublicTrackScreen.jsx` | build green; falls back to the old read while the RPC does not exist |
| Client: manual sessions off, session credential on function calls | `authService.js`, `functionHeaders.js`, 5 call sites | `npm run build` OK, eslint clean on touched files |

## R2.4 Findings added in this round
| ID | Sev | Finding |
|---|---|---|
| F-17 | P1 | **`accounting_entries` cannot be tightened with a policy alone.** `OrdersScreen` writes the automatic "sales income" entry from the browser of whoever marks an order delivered, after first reading the table to avoid duplicates (`reference_no = ORD-…`). Row-level restriction of SELECT (finance people only) would silently break that duplicate check and double-book income. Needs a SECURITY DEFINER RPC `record_order_income(order_id)` first, then policies. Not attempted. |
| F-18 | P1 | Many "restrictive" policies are not restrictive: `leave_requests`, `advance_requests`, `performance_reviews`, `shift_partners`, `warehouses` are `auth.uid() IS NOT NULL` (any signed-in user); `orders_select` explicitly includes `auth.uid() IS NULL` (anon) and `invoices_select` too. They sit next to `USING(true)` policies that make them irrelevant. Real row scoping (own rows / managers / HR) needs the business rules for each table. |
| F-19 | P2 | `profiles.pin` is stored in clear text (readable only by service role and the definer functions). Hash it once PIN verification is behind the gateway only. |
| F-20 | P2 | The Google Apps Script tracker reads `orders` with the public key every 10 minutes (144 successful calls in 24 h). Any closure of `orders` for anon must keep those two columns readable (done in b0) or move the script to an RPC. |
| F-21 | P3 | `sync-prices` still accepts a body token that is embedded in the web bundle; the guard now also requires a real session, the token adds nothing. `sync-meta-insights` holds a fixed admin header value in source. |

## R2.5 What I deliberately did not do
* No synthetic account was created in production Auth and no sign-in was attempted with any PIN or password: the safety rules forbid entering credentials outside a test environment, and no staging project exists (a paid one needs the owner's approval; the previous one was deleted on 2026-10-10).
* No PIN, password, role, `is_active` flag or session of the five employees was touched. Verification of their credentials was a boolean `crypt()` comparison inside SQL.
* No broad `REVOKE`, no policy deletion, no `DROP`.

---

# Round 3 (2026-10-25, ~13:00 UTC): runbook steps applied to production, with verification

Authorised by the owner in chat (apply_migration + deploy_edge_function allowed; step by step; stop on error). No error occurred.

| Step | Applied | Verification (production, read-only or rolled back) |
|---|---|---|
| 1a | migration `public_track_rpc_20261027` | `public_track_order(<real code>)` as role anon → 1 row; unknown / empty / null code → 0 rows |
| 1b | migration `login_gateway_20261027` | 6 secret rows; anon/authenticated have no table or function privilege, service_role has; `auth_password_matches` over the 37 active profiles → 37/37 true; limiter inside a rolled-back transaction with limit 2 → true, true, false |
| 1c | migration `cron_service_key_calls_20261026` | lozy / analytics / shift-report jobs now `run_cron_function(...)`; shift-report-reminder tick at 12:50 UTC `succeeded`, 0 gateway responses ≥ 400 in the previous 10 min (the first tick that uses the new command is the one at 12:55 or later → **re-check M3 after it**) |
| 2a | `verify-pin` **v55** (verify_jwt=false) | GET → 405, OPTIONS → 200, POST {} → 400, POST unknown name → `not_found` (so the function boots, reads the DB and calls the limiter RPC); the limiter table shows 1 account + 1 source bucket, hashes only. **Not yet verified: a real successful login** |
| 2b | `pin-change` **v7** (verify_jwt=true) | invalid pin → 400, unknown user → `wrong_pin`, admin mode without session → 401; no real account touched |

Rollbacks used if needed: verify-pin → redeploy `git show f31fda0:supabase/functions/verify-pin/index.ts` (limiter off by default there) ; pin-change → v6 source is in this repo history of `supabase/functions/pin-change` first version ; migrations → the `_rollback.sql` files in `docs/security/proposed/`.

Stopped before step 3 on purpose:
1. **A real login must be checked first** (runbook 2a). Nobody logged in between the deploy and this note (`activity_logs` empty for the last 30 min), and I must not enter a PIN myself.
2. Step 3 (web release) changes how every employee signs in; the branch `audit/roles-permissions` is pushed (https://github.com/hosamayoub94-source/lowes-app-web/pull/new/audit/roles-permissions) but **not merged** (merging triggers the production deploy; `gh` is not installed here).
3. Step 2c (guarded functions) must come after step 3; step 4 (anon lockdown) needs 7 days with zero manual-session logins — the last one was 19 Oct, so the gate opens on **26 Oct**.

---

# Round 4 (2026-10-25, ~13:30–14:10 UTC): web release live, guarded functions (step 2c phase A)

Authorised by the owner in chat ("بعد الدمج تابع الخطوة 3 ثم 2c مع التحقق"). The owner merged `audit/roles-permissions` (PR #79) and confirmed a real login worked after the deploy.

## R4.1 Step 3 — web release
PR #79 merged (main `368cbf9`), Vercel production deployment READY and promoted to the production alias. Owner-confirmed: a real login works after the deploy (this closes the "real login not yet verified" caveat of Round 3 / 2a). Manual-session fallback is now off in the served bundle.

## R4.2 Step 2c phase A — functions guarded with `serveGuarded` (production)
Each was fetched from production first (repo and production had drifted, see R4.4), re-emitted with the same logic plus the guard, deployed, then probed with the **public key** (expect HTTP 401). All probes returned 401.

| Function | Version | Who may call | Public key → | Notes |
|---|---|---|---|---|
| manage-employee | v60 | (Round 3) | 401 | |
| send-push | v57 | service key or any active signed-in user | 401 | |
| create-yurtici-shipment | v50 | order operators | 401 | |
| create-babel-shipment | v20 | order operators | 401 | |
| import-yurtici-report | v33 | order operators | 401 | fallback sheet token kept as in source |
| import-yurtici-labels | v28 | order operators | 401 | |
| track-babel | v44 | service key or any active signed-in user | 401 | sellers poll it from the app, so no role limit |
| track-ptt | v43 | same | 401 | |
| track-karam | v48 | same | 401 | |
| track-yurtici | v76 | same | 401 | cron job 1 sends a `service_role` JWT (decoded role only) → accepted via the key probe |
| shift-report-reminder | v10 | **service key only** | 401 | cron-only; before: no check at all, anyone could spam notifications |
| daily-analytics-snapshot | v27 | **service key only** | 401 | cron-only |
| lozy-kpi-coach | v29 | **service key only** | 401 | cron-only |
| retry-failed-syncs | v24 | service key, or admin/manager/sales_manager/fulfillment/manage_orders | 401 | no cron job points at it today |

**M3 (cron after guarding):** `shift-report-reminder` tick 13:55:00 (after the 13:51:50 deploy) → gateway responses all 200, zero 401/403 in the window. `track-yurtici-30min` tick 14:00:00 → see R4.3.

## R4.3 Result of the first cron ticks after guarding
(filled in below when verified)

## R4.4 Findings / drift discovered
| ID | Sev | Finding |
|---|---|---|
| F-22 | P2 | `sync-prices` (v40, verify_jwt=true) is **not** wrapped: it already authenticates callers with its own sheet token list and is called by token, not by session; wrapping it would break the sheet. It still contains **hard-coded token strings in its source** (two literals besides `SHEET_SYNC_TOKEN`). Rotate them and move them to env vars; then it can drop the literals. Public key → 401 (verified). |
| F-23 | P3 | `track-*`, `daily-analytics-snapshot`, `lozy-kpi-coach`, `shift-report-reminder`, `retry-failed-syncs` source in production differs from the repo copy (added `_shared/*` helpers, batch limits, history recorder). The repo copies for these functions were **not** updated in this round — pull them from production before editing. |
| F-24 | P3 | `notifyWhatsAppStatus.ts` and `yurticiAccounts.ts` in production had the type `undefined` mangled by the secret-redaction layer during fetch; I re-wrote them with the literal `undefined`. Behaviour is identical (types only). I also shortened long comments in the shared files I re-emitted. |
| F-25 | P3 | `retry-failed-syncs` has no cron job in this database (its header says "cron every 10 minutes"): either it is scheduled elsewhere or the failed-sync auto-retry is not running. Not changed. |

## R4.5 Still to do
* Phase B of 2c (`sync-order-to-sheet`, `social-content`, `generate-quiz`) after stale web bundles have aged out (≥ 26 Oct); `import-babel-shipments` needs a replacement credential for the external caller first.
* Step 4 (anon lockdown, one batch at a time) after the 7-day zero-manual-login gate (opens 26 Oct 2026): `u1 → b4 → b1 → b2 → b3 → b0 → wh_functions_authz`.
* Step 5 (`auth_mode='derived'`) only when every client is new; step 6 (Apps Script tracker RPC).
