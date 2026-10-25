# Role & Permission Audit — LOWE'S Staff App

**Date:** 2026-10-25 · **Project:** Supabase `fghdumrgimoeqsafdhhh` (lowes-attendance) · **Repo state:** clean worktree from `origin/main` @ `f31fda0`
**Method:** code read + live **read-only** catalog queries + **rolled-back** synthetic probes (`begin; set local role …; … ; rollback`). No employee, payroll, order or balance row was changed by any probe (every probe ended in `ROLLBACK` or was rejected by the database). Credentials/PINs/keys are not reproduced in this report.
Companion files: `ROLE_PERMISSION_MATRIX.md` (what each role can really do) · `REMEDIATION_LOG.md` (what was changed, tests, rollback).

---

## 0. Bottom line (plain language)

1. **The role system is mostly a front-end convention.** The app hides screens by role, but the database does not enforce roles on almost every table. Any signed-in employee — and for ~75 tables even a person with *no* login who only has the public app key — can read, and in most cases change, orders, accounting entries, attendance, tasks, leave requests, products, campaigns, chat. (F-01, F-02)
2. **Salaries are readable by everyone** (profiles table, including the logged-out public key). New payroll tables are properly locked (only 2 admins); the *legacy* payroll table is open. (F-01, F-02)
3. **Logging in with a 4-digit PIN has no brute-force protection** and a second, unprotected door exists (the Auth endpoint). Admin accounts are reachable this way. (F-03)
4. **Three confirmed bugs were fixed and verified this session** (F-04 manager→admin takeover, F-05 resigned staff could still sign in to the database, F-06 anon could edit late-tolerance / sales counters / rename accounts). Everything else needs a decision or a staged rollout, listed in §6.

Why the big holes were *not* closed in this session: **5 of the 21 people who logged in during the last 14 days run on an unauthenticated "manual session"** (they act as `anon`). Closing `anon` on orders/attendance/tasks would lock those 5 people out of the app immediately. The root cause (Auth identity missing or password out of sync) must be fixed for them first (F-09).

---

## 1. Roles discovered

| Role (value) | Where defined | Profiles in prod (2026-10-25) | Notes |
|---|---|---|---|
| `employee` | `teams.js` ROLES | 35 | default; zero default permissions |
| `admin` | ″ | 4 (3 active: hosam, Amany, Reem; 1 inactive default) | all permissions; ignores `denied_permissions` |
| `manager` | ″ | 4 (2 active) | wide; not a system admin by permission list |
| `sales_manager` | ″ | 2 | |
| `social_manager` | ″ | 2 | |
| `media_buyer` | ″ | 2 | |
| `hr_manager` | ″ | 1 (Fadi) | holds 12 `extra_permissions` incl. `manage_users`, `manage_settings` |
| `warehouse_manager` | ″ | 1 | |
| `accountant`, `marketing_manager` | ″ | 0 | defined in code, unused in prod |
| Legacy/other strings | `manage-employee` CAN_CREATE & DB function `auth_is_full_access` | 0 profiles | `supervisor_manager`, `supervisor`, `marketer`, `field_rep`, `area_agent`, `store`, `headsup` — star-network / old roles; `headsup` is still listed in `auth_is_full_access()` |

Extra/denied permissions: 17 profiles carry `extra_permissions`, 5 carry `denied_permissions` (e.g. Fadi has 12 extras; `alic kanaan` (manager) has 12 denials). Joelle Azar: employee + `view_creator_intelligence`, `manage_creator_data`, `manage_creator_campaigns` (no `manage_campaigns` yet — pending, out of scope).

**How a role is assigned/changed**
- Source of truth: `profiles.role_type` (+ `extra_permissions`, `denied_permissions` jsonb). `auth.users` metadata carries no role (0 of 75).
- Session identity: Supabase Auth user id = `profiles.id` for all 51 profiles; `current_role_type()` = `select role_type from profiles where id = auth.uid()`.
- Browser can *not* change role/permissions/pay/PIN/active-flag directly: trigger `guard_profiles_write()` rejects it for non-admin sessions (proved live, §4).
- Role changes happen through (a) the admin UI `/admin/users` (admin session), (b) Edge Function `manage-employee` (service role, hierarchy table `CAN_CREATE`), (c) direct SQL.
- 24 `auth.users` rows have **no profile** (23 are banned, 1 is not) — orphans (F-13).

## 2. Modules reviewed
Employee management · Payroll/HR · Sales/customers/orders · Accounting/finance · Marketing/ads/creators · Attendance/leave/tasks · System/security (settings, logs, edge functions, login).

## 3. Findings

Severity: **P0** critical, no proper authentication · **P1** wrong permission on sensitive data/operations · **P2** medium scope defect · **P3** improvement. Status: ✅ fixed & verified · 📝 prepared, not applied · ⛔ open (needs decision).
"Confirmed" = reproduced live (read-only/rolled-back) or read from deployed source this session. "Probable" = inferred.

| ID | Sev | Finding | Evidence | Status |
|---|---|---|---|---|
| **F-01** | **P0** | Public anon key can read **and write** ~75 business tables via `USING(true)` policies + table GRANTs: `orders` (36,507 rows readable), `accounting_entries` (928), `attendance` (9,944), `tasks`, `leave_requests`, `campaigns`, `products`, `notifications`, `chat_*`, `commission_rules`, `wh_movements`, `wh_warehouses`, … `profiles` is readable for 81/85 columns incl. `base_salary_usd`, allowances, `commission_pct`, `wallet_balance`, `face_descriptor`, phones (pin/password columns are not readable). | `set local role anon; select count(*) …` returned the counts above; `has_table_privilege('anon',…)` true for SELECT/INSERT/UPDATE/DELETE on 107 public tables (query in log). Write path confirmed by the ability to run an anon UPDATE on `profiles` unguarded columns (F-06, rolled back). | ⛔ blocked by F-09 |
| **F-02** | **P0/P1** | Same open policies apply to every signed-in user. A synthetic **media-team employee** session (no permissions) reads all 36,507 orders, 928 accounting rows, 51 salaries, 36 `system_settings`, 37 legacy payroll rows, and can write them. UI hiding (f31fda0 `salesAccess.js`) is cosmetic only. | `set_config('request.jwt.claims', …employee sub…); set local role authenticated;` → counts, rolled back. | ⛔ |
| **F-03** | **P0** | PIN login brute-force: PINs are numeric, 4 digits for 50/51 accounts; deployed `verify-pin` has **no attempt limit** (limiter RPC `consume_pin_attempt_rate_limit` does not exist in prod; only a disposable-DB candidate exists). Second door: login also calls Supabase Auth `signInWithPassword` with password `lp:<PIN>` and a synthetic email derived from the *publicly readable* `profiles.id`. Successful login → `authenticated` JWT with the access in F-02, and for admin accounts the admin UI + `manage-employee`. | `verify-pin` source (deployed v54); `authService.js:138-141`; `pin_rate_limit` objects absent (`to_regproc/to_regclass` null). **Not exercised** (no brute force performed). Supabase Auth's own rate limits are {unverified}. | ⛔ decision + candidate exists |
| **F-04** | **P1** | `manager` could create an `admin`, promote any account to `admin`, and deactivate/edit/delete admin accounts through `manage-employee` (`CAN_CREATE.manager = '*'`, target guard also `'*'`). Takeover of an admin identity. | deployed v59 source read. Probe by code path; no live call made. | ✅ fixed — deployed v60 |
| **F-05** | **P1** | Deactivating an employee (`is_active=false`) did not revoke the Auth identity; `verify-pin` refuses inactive users but the direct Auth endpoint (PIN = password) still issued tokens. 14 inactive profiles had a non-banned Auth user. | SQL on `auth.users` ⨝ `profiles`. | ✅ fixed — trigger + backfill live |
| **F-06** | **P1** | `guard_profiles_write()` did not cover `late_tolerance_minutes`, `pre_approved_leaves`, `sales_confirmed_*`, `sales_provisional_*`, `employee_name`, `team`. Anon could change them for any employee (rolled-back probe succeeded) — payroll/commission inputs and the login-by-name key. | rolled-back anon UPDATE succeeded before; rejected after (§ log). | ✅ fixed — live |
| **F-07** | **P1** | Edge Functions that run with the service key and **do no caller authentication** (the public anon key passes `verify_jwt=true`): `create-yurtici-shipment` (creates real carrier shipments; has `debug:true` that lists which secrets exist), `send-push` (push to any `userId`), `social-content`/`generate-quiz` (paid Anthropic calls), `import-yurtici-*`, `import-babel-shipments`, `sync-prices` (token), `daily-analytics-snapshot`, `lozy-kpi-coach`, `shift-report-reminder`, `retry-failed-syncs`, `track-*`, `sheet-to-app`/`babel-webhook` (own tokens). Already-hardened: `manage-employee`, `ai-assistant`, `whatsapp-*`, `b2b-leads`, `creator-*`, `pull-star-orders`. | deployed source of `create-yurtici-shipment` & `send-push` read in full; the rest: source grep for `getUser`/401/403/secret checks (`rg` output in log). Functions *not* invoked (they mutate). | ⛔ needs caller map (Apps Script, pg_cron, other functions) |
| **F-08** | **P1** | `SECURITY DEFINER` stock functions executable by `anon` with no internal check: `wh_apply_stock_delta`, `wh_transfer_stock`, `wh_sync_order_stock`, `wh_register_order_return`. 27 definer functions in `public` are anon-executable in total. | `has_function_privilege('anon', …)`; source read. **Not invoked.** The browser calls these (`warehouseService.js`), so a blanket revoke would break manual-session users (F-09). | ⛔ blocked by F-09 |
| **F-09** | **P2** | 5/21 recent logins (14 days) were **manual (anon) sessions**: Hamza Nsr, Diana Hasan, Fatima Ayoub, Bushra Saidy, Hassna Deeb. A manual session = PIN correct but the Auth password was not `lp:<PIN>` (or no Auth identity); the old client then silently carried on as the public key. **Round 2 update:** today all 37 active profiles have an Auth identity whose password matches the PIN (checked in SQL, boolean only); four of the five have since logged in with real sessions; Bushra's stored manual session expires on 26 Oct. Root cause, per-person evidence and the repair are in `AUTH_SESSION_ROOT_CAUSE.md`. | `activity_logs`, `auth.users` ⨝ `profiles` (crypt compare), gateway logs | 📝 repair prepared (verify-pin self-repair + client no longer falls back), not deployed |
| **F-10** | **P2** | UI/role mismatches: `denied_permissions` cannot hide a role-listed screen (role OR permission). `extra_permissions` `manage_users`/`manage_settings` enforce nothing anywhere (Fadi holds both). Employees see Campaigns and WhatsApp-admin in the menu with no permission; `/files`, `/workspace`, `/advances`, `/reviews` have no route guard though the menu lists them for admin/manager. `sales_manager` sees Accounting without `view_finance`. Manager/Accountant/HR see the Payroll menu but the database allows only the 2 admins in `payroll_access`. | `scripts/security/role-matrix.mjs` output; `ProtectedRoute.jsx`. | 📝 documented, no change (design decision) |
| **F-11** | **P2** | `get_customer_orders_by_key(p_key)` is anon-executable and returns **entire order rows** (`o.*`) for any phone number given (≥6 digits). Intended for customer lookup. | function source. | ⛔ narrow column list |
| **F-12** | **P2** | Profile contact fields (`phone`, `personal_email`, `bio`, `job_title`) of *any* employee can be edited by any session (UPDATE not owner-scoped). | `ProfileScreen.saveWorkInfo` + policies `USING(true)`. | ⛔ |
| **F-13** | **P2** | 24 orphan `auth.users` (no profile); 1 not banned. | SQL. | ⛔ clean-up needs owner OK |
| **F-14** | **P3** | Repo drift: `verify-pin` and `pin-change` are deployed but absent from the repo; `admin-reset-pin` in the repo was the old, hole-prone version while prod runs a retired 410 stub; `manage-employee` repo lacked the retired `reset_pin`. | file listing vs deployed list. | ✅ repo synced for the two functions in this branch |
| **F-15** | **P3** | 9 backup/archive tables have anon grants but RLS-on/no policy (deny-all today, one policy away from exposure): `accounting_entries_bak_0006`, `activity_logs_archive`, `ad_campaigns_backup_20260607`, `attribution_record`, `handler_name_backup_20260607`, `order_code_counters`, `zz_bak_*` (3). | catalog. | ⛔ revoke grants later |
| **F-16** | **P3** | Roles `accountant`/`marketing_manager` exist in code but not in data; legacy role names persist in two places. | counts. | ⛔ |

## 4. What is already good (verified)
- `profiles` guard: anon and employee/manager REST sessions are rejected for `role_type`, `extra/denied_permissions`, `is_active`, `pin`, `base_salary_usd`, `wallet_balance`… (live, rolled back, errcode 42501). Upsert (`ON CONFLICT DO UPDATE`) escalation rejected; duplicate-name INSERT rejected by unique constraint.
- `pin`/`password` columns are not SELECT-able by anon/authenticated; `update_my_profile` (definer, sets role) is not executable by anon/authenticated.
- New payroll (`payroll_runs`, `payroll_entries`, `payroll_allowances`, `employee_salary_settings`) is gated by `payroll_has_access()` → only 2 admins (hosam, Amany; both `can_finalize`). Anon has no grant on them.
- Creator, B2B-lead and profitability tables: RLS closed or role-checked.
- `manage-employee` derives the caller from a verified Auth session (R-21) — not from the body.

## 5. Dependency map for the P0 closures
| Closing step | Breaks today |
|---|---|
| `REVOKE … FROM anon` on `orders`/`attendance`/`tasks`/… | the 5 manual-session users; also Apps Script / star-network readers that use the anon key {unverified list} |
| Replace `USING(true)` with role predicates | every screen's queries need a per-table review; roles must be real in `auth.uid()` for all users |
| Rate-limit `verify-pin` | needs the candidate RPC + secrets + threshold decision |

## 6. Recommended order (not executed)
1. **Fix identity first (F-09):** one-time script to set each profile's Auth password to `lp:<its current PIN>` for the 5 manual-session users (server-side, no PIN ever printed), then confirm 14 days of 0 manual logins.
2. PIN rate-limit on `verify-pin` **and** move the Auth login behind it (or lengthen PIN / disable direct password grant) — F-03.
3. Add caller authentication to F-07 functions after mapping callers (`docs/security/20261019_p0_authorization_callsite_matrix.md` is the starting point).
4. Per-table RLS by business role (start: `accounting_entries`, `attendance`, `leave_requests`, `orders`), `anon` revoked table by table with the rollback files pattern.
5. Revoke anon EXECUTE on the four `wh_*` functions + narrow `get_customer_orders_by_key`.

## 7. Residual risk after this session
F-01/F-02/F-03/F-07/F-08 remain **open in production**. They are P0/P1 and were deliberately not changed without the staged plan above.

## 8. Tests
See `REMEDIATION_LOG.md` §Tests. Role-default invariants: `test-role-permission-invariants.mjs` (95). Hierarchy policy: `test-employee-admin-policy.mjs` (33). SQL (PGlite): `test-profiles-guard-and-auth-ban-sql.mjs` (83). Matrix generator: `scripts/security/role-matrix.mjs`.
