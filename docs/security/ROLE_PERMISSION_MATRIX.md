# Role × Module Permission Matrix — what the code and database ACTUALLY enforce

**Date:** 2026-10-25 · Generated/verified from: `src/data/permissions.js`, `src/data/navigation.js`, `src/routes/AppRoutes.jsx` (via `node scripts/security/role-matrix.mjs`), `supabase/functions/*`, live policy/grant catalog (read-only).

**Reading guide.** *Enforcement layer*: **UI** = hidden/blocked only in the browser (bypassable by anyone with a session or the public key) · **Fn** = Edge Function checks the verified session server-side · **DB** = row/column/trigger rule in Postgres. "Target" = the least-privilege rule requested in the audit brief; "Gap" = difference between target and reality.

## A. Default permissions per role (from `ROLE_PERMISSIONS`)
| Role | Default permissions (count) | Must NOT hold by default (tested) |
|---|---|---|
| employee | none (0) | everything |
| sales_manager | tasks×4, manage_orders, view_all_attendance, manage_kpi, manage_products, view_analytics, view_inventory, manage_campaigns, view_media_buyer_board (12) | payroll, view_finance, users, settings, approve_leaves, manage_attendance, stock mgmt, guides |
| social_manager | tasks×4, view_all_attendance, manage_campaigns, view_media_buyer_board (7) | payroll, finance, users, settings, orders, analytics, products, inventory, KPI |
| media_buyer | tasks×4, manage_orders, view_analytics, manage_campaigns, view_campaign_cost, view_media_buyer_board (9) | users, settings, payroll, HR/attendance, finance, KPI, products, inventory |
| manager | 21 (all except manage_users, manage_settings, leads, creators) | manage_users, manage_settings, B2B leads, creator data |
| admin | all 29 | — (ignores `denied_permissions`) |
| accountant | view_finance, manage_payroll | |
| hr_manager | view_all_attendance, approve_leaves, manage_payroll | |
| warehouse_manager | view_inventory, manage_central_stock, manage_sales_stock | |
| marketing_manager | view_all_tasks, manage_campaigns, view_campaign_cost, view_analytics, view_media_buyer_board | |
All "must NOT" rows are asserted by `test-role-permission-invariants.mjs` (95 checks, passing).

## B. Module matrix

Legend: ✅ allowed by design · ⛔ denied · ◐ conditional. **Layer** = where it is really enforced today.

### B1. Employee management (create / edit / deactivate / PIN / roles)
| Role | Allowed | Denied | Data scope | Condition | Layer | Evidence | Test |
|---|---|---|---|---|---|---|---|
| admin | everything | — | all | real Auth session | Fn `manage-employee` + DB `guard_profiles_write` | deployed v60 | policy test |
| manager | create/edit/deactivate/delete non-admin accounts, any non-admin role | **admin accounts, granting `admin`** (fixed F-04) | all non-admin | session | Fn | `employeeAdminPolicy.js` | `test-employee-admin-policy` 33/33 |
| sales_manager | create/edit distribution roles (field_rep, marketer, supervisor, supervisor_manager, area_agent) | managers, admin, employees | those roles | | Fn | CAN_CREATE | policy test |
| social_manager | create/edit/deactivate **media-team employees** | everything else | `team=ميديا ∧ role=employee` | | Fn | assertCanManageTarget | policy test |
| others | ⛔ | | | | Fn returns `forbidden` | MANAGE_ROLES | |
| any browser session | ⛔ change role / perms / active / pay / PIN / wallet / name / team / sales counters | | | admin session exempt | **DB trigger** | live probes (rolled back) | `test-profiles-guard…sql` 83/83 |
| PIN change | own PIN via `pin-change` (verified server-side); `manage-employee.reset_pin` and `admin-reset-pin` are retired (410) | | | | Fn | deployed sources | static asserts |
| Gap | `manage_users`/`manage_settings` extra-permissions enforce nothing (UI `/admin/*` is admin-only by role). Manager can still manage other managers. | | | | | F-10 | |

### B2. Payroll & HR
| Role | Target | Reality | Layer |
|---|---|---|---|
| admin | full | full; `payroll_access`: hosam + Amany (`can_finalize`) | DB `payroll_has_access()` ✅ |
| manager / accountant / hr_manager | per business decision | UI shows Payroll menu; **DB denies** (not in `payroll_access`) → empty screens | UI vs DB mismatch |
| sales_manager / social_manager / media_buyer / employee | ⛔ | UI ⛔; DB ⛔ for new payroll tables | DB ✅ for `payroll_*`, `employee_salary_settings` |
| **Legacy** `monthly_payroll` (37 rows, last write 2026-05) | ⛔ | readable & writable by **anon and every employee** | ⛔ gap (F-01/F-02) |
| `profiles.base_salary_usd`, allowances, `commission_pct`, `wallet_balance` | HR/admin only | readable by **anon and every employee** (81/85 columns) | ⛔ gap |
| Own payslip / own legacy entry | employee own only | `pay_entries_legacy_own` ✅ | DB ✅ |
| Leave approval | admin/manager/hr (`approve_leaves`) | UI-gated; `leave_requests` open to anon | UI only |

### B3. Sales, customers, orders
| Role | Orders screens | Customers | Scope | Layer |
|---|---|---|---|---|
| admin / manager / sales_manager / media_buyer | ✅ | ✅ | all | UI |
| employee (non-media) | ✅ own market | ✅ | all rows (not own-only) | UI |
| employee, team `ميديا` (e.g. Joelle) | ⛔ menu, bottom bar, search, routes (f31fda0) unless `manage_orders` | ⛔ | — | **UI only** — the `orders` table is open (F-02) |
| social_manager | ⛔ orders, customers hidden | ⛔ | | UI |
| accountant / hr / warehouse / marketing | orders ⛔; customers ✅ (menu `ALL` minus social_manager) | | | UI |
| DB reality | `orders` (36,507 rows) readable/writable by anon and any authenticated user; order status write path is browser-direct | | | ⛔ F-01/F-02 |

### B4. Accounting & finance
| Role | Target | Reality | Layer |
|---|---|---|---|
| admin | ledger + accounting | ✅ | UI |
| manager, accountant | accounting, channels | ✅ UI; route = role OR `view_finance` | UI |
| sales_manager | ⛔ without `view_finance` | **sees Accounting menu & route** (role list) | UI gap F-10 |
| social_manager, media_buyer, employee | ⛔ | ⛔ UI | UI |
| DB | admin/finance only | `accounting_entries` (928 rows), `accounting_channels/categories` open to anon + authenticated; profitability tables are role-checked ✅ | ⛔ gap |

### B5. Marketing, ads, creators
| Role | Campaigns | Ads cost | Creators / B2B leads |
|---|---|---|---|
| admin, manager, sales_manager, social_manager, media_buyer, marketing_manager | ✅ `manage_campaigns` | cost: manager, media_buyer, marketing_manager, admin | — |
| employee | menu & route reachable by role (no permission needed) — screen-level checks apply; Norma/Sham hold `manage_campaigns`+`view_campaign_cost` | | creators: `view_creator_intelligence` etc. (Diana, Joelle, claudine, alic) |
| Creators & Syria/UAE leads | | | **Fn + DB**: closed tables, edge functions `creator-prospects`, `creator-workbench-read`, `b2b-leads` re-check permission server-side ✅ |
| DB | campaigns, campaign_ads, daily_reports, social_posts open to anon (F-01) | | |

### B6. Attendance, leaves, tasks
| Role | Own | Team/all | Layer |
|---|---|---|---|
| employee | ✅ own attendance, requests, tasks | ⛔ | UI |
| managers (`view_all_attendance`, `view_all_tasks`, `assign_tasks`, `delete_task`) | ✅ | ✅ | UI |
| social_manager / media_buyer | tasks×4 incl. **delete_task on all tasks** | | UI |
| DB | `attendance`, `leave_requests`, `tasks`, `task_*` open to anon & authenticated; tasks "delete admin-only at RLS" comment in `taskService.js` is **not true** (policy `true`) | | ⛔ |

### B7. System & security
| Item | Target | Reality | Layer |
|---|---|---|---|
| `/admin/*` screens | admin | route guard `ProtectedRoute roles=[admin]` | UI |
| `system_settings` | admin write | anon closed (Phase A) ✅; **any authenticated user can write** (policy `true`) | ⛔ P1 |
| `activity_logs`, audit | admin read | open to anon (INSERT needed by login logging) | ⛔ |
| Edge functions | session + role | hardened: manage-employee, ai-assistant, b2b-leads, creator-*, whatsapp-*, pull-star-orders; **not authenticated**: see F-07 | Fn |
| Login | rate-limited, PIN | no limiter (F-03) | ⛔ |
| Deactivated user | cannot sign in | Auth identity now banned automatically (F-05) | **DB trigger ✅** |

## C. Screens reachable per role (computed from code)
Output of `node scripts/security/role-matrix.mjs` (default permissions, no extras). Counts of nav items: employee 19 · manager 46 · admin 51 · media_buyer 27 · sales_manager 37 · social_manager 21 · accountant 17 · hr_manager 17 · warehouse_manager 16 · marketing_manager 24. Re-run the script for the full lists (they change with `navigation.js`).
Routes with **no** `ProtectedRoute` role/permission (any signed-in user can open by URL): `/files`, `/workspace`, `/team`, `/holidays`, `/notifications`, `/chat`, `/achievements`, `/announcements`, `/profile`, `/guide`, `/brand`, `/requests`, `/training`, `/schedule`, `/partner-groups`, `/advances`, `/reviews`, `/b2b-leads` (the entry component redirects by permission). `/admin/*` children inherit the admin guard of their parent route.

## D. Per-user overrides in production (names only, no PIN/secret)
`extra_permissions` / `denied_permissions` are applied as: role defaults + extras − denied. Denied only removes a *capability*; it does not hide a screen the role lists (F-10). Examples that behave differently from their intent: `alic kanaan` (manager) with 12 denials still reaches Accounting/Payroll/Analytics routes by role; `Fadi Jarrouge` (hr_manager) `manage_users` has no effect.
