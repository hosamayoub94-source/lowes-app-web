# Inventory access remediation — execution plan

**Snapshot:** 2026-10-19  
**Target Supabase project:** `lowes-attendance` (`fghdumrgimoeqsafdhhh`)  
**Status:** implementation gate + test plan. No production changes.  
**Related:** `20261019_p0_security_definer_review.md`, `20261019_p0_authorization_callsite_matrix.md`.

## Executive conclusion

Do not apply a blanket `REVOKE` to the inventory tables yet. The current application relies on direct browser writes, a manual PIN-session fallback that uses the anon key, and multiple stock mutation workflows. The fix must migrate authentication + stock mutation + audit logging as one coherent change.

The source code and live catalog show the following direct dependencies:

- `src/services/warehouseService.js`: reads the stock matrix; writes `wh_stock` directly for exact adjustments; inserts `wh_movements` separately; calls `wh_apply_stock_delta` for receipt, write-off, order reserve/release and reversals; calls `wh_transfer_stock` for allocation; inserts/updates `wh_warehouses`; updates `profiles.warehouse_id`.
- `src/screens/InventoryScreen.jsx`: updates/inserts `products` directly from the product editor; uses direct stock workflows elsewhere.
- `src/screens/WarehouseScreen.jsx`: gates controls with browser-side `MANAGE_CENTRAL_STOCK` and `MANAGE_SALES_STOCK`. Client-side gates are UX, not server-side authorization.
- `src/services/authService.js`: after server-side PIN verification, it tries `signInWithPassword`; if that fails, it stores a manual session in localStorage. That session does not create a Postgres Auth JWT.
- `public.sync_product_quantity()` is attached to `wh_stock` and updates the product quantity summary, so direct stock writes also have a data-integrity dependency.

## Live facts confirmed with read-only SQL

### Identity readiness

| Check | Result |
|---|---:|
| Profiles in target project | 50 |
| Active profiles | 36 |
| Active profiles with matching `auth.users` identity | 35 |
| Active profiles without matching `auth.users` identity | 1 |
| Active profiles with sign-in recorded in last 30 days | 24 |
| Active profiles with no sign-in recorded | 1 |
| Profiles with `auth_id IS NULL` | 50 |
| Profiles where `profiles.id` matches an `auth.users.id` | 49 |

The current app convention is `auth.users.id = profiles.id`; do not build a new policy around `profiles.auth_id` without a separate identity migration. 35 of the 36 active profiles have a matching Auth identity, but the catalog cannot prove that each user's Auth password is synchronized to the current PIN or that every active user can successfully sign in today. The app can still fall back to a localStorage manual session, so the remaining 12 active profiles without a sign-in recorded in the last 30 days need verification before tightening the Data API.

### Live inventory access

The current target database confirms all of the following for `anon` and `authenticated`:

- `wh_stock`: SELECT/INSERT/UPDATE/DELETE grants; public policy `wh_stock_all` with `USING true` and `WITH CHECK true`.
- `wh_movements`: SELECT/INSERT/UPDATE/DELETE grants; public policy `wh_movements_all` with `USING true` and `WITH CHECK true`.
- `wh_warehouses`: SELECT/INSERT/UPDATE/DELETE grants; public policy `wh_warehouses_all` with `USING true` and `WITH CHECK true`.
- `products`: SELECT/INSERT/UPDATE/DELETE grants; public policy `products_all` with `USING true` and `WITH CHECK true`.
- `wh_stock` has unique constraint `(warehouse_id, product_id)`, and trigger `trg_wh_stock_sync` invokes `sync_product_quantity()` after INSERT/UPDATE/DELETE.
- The public SECURITY DEFINER functions `wh_apply_stock_delta(uuid,uuid,integer)` and `wh_transfer_stock(uuid,uuid,uuid,integer)` are executable by `anon` and `authenticated` and do not show caller role/identity authorization in their current bodies.

This is a combination of table privilege, RLS, and SECURITY DEFINER problems. Fixing only one layer leaves the others as alternate write paths.

## Required phases — keep this order

### Phase 0 — establish real-session readiness (blocker)

Before closing anon table access, make every active employee able to sign in with a real Supabase Auth JWT:

1. Inventory active profiles versus `auth.users` (already measured above), without exposing PINs or passwords.
2. Verify the login result for a representative sample of each role, including the warehouse manager, manager, sales manager, employees with explicit stock permissions, and an employee with an explicit denied permission.
3. Inspect `verify-pin` results (`authIdentity`) and existing PIN-change/admin reset flows. Correctly handle an Auth provisioning/password mismatch without silently promoting the browser's localStorage session.
4. Add a clear fail-closed UI error when PIN verification succeeds but Auth session creation fails; do not remove the fallback until an account recovery path has been tested with all active users. Any remaining manual-session user would still be evaluated as `anon`.
5. Run a dry login migration/reconciliation report; do not print PINs, passwords, secret keys, or full personal data.

**Exit criteria:** 36/36 active profiles can obtain a real Auth session, or there is a documented owner-approved recovery path for every exception. Active login checks and the role matrix must be retested after the credential fix.

### Phase 1 — server-side permission helper

Create a tested helper using the verified `profiles.id = auth.uid()` mapping. It must check:

- `auth.uid()` is non-null and points to exactly one profile.
- `is_active IS TRUE`.
- The explicit role-default permission matrix in `src/data/permissions.js`, plus `extra_permissions`, minus `denied_permissions`. Keep the frontend and SQL matrix tested for parity.
- Do not trust `user_metadata`, browser role fields, `performedBy`, a caller-supplied profile ID, or the localStorage session as authorization.
- Use a fixed/empty `search_path` for SECURITY DEFINER helpers and schema-qualify all objects; grant EXECUTE only to the role that actually needs the helper.

At minimum, the roles in the current frontend config are: admin (all), manager (central + sales stock by default), warehouse_manager (central + sales by default), sales_manager (view inventory, not stock mutation by default), employee (no stock mutation by default, except explicit extra permissions), media_buyer, social_manager, accountant, hr_manager, and marketing_manager. Explicit denied permissions must override role defaults for non-admin roles, matching the frontend behavior.

### Phase 2 — replace stock mutation paths atomically

Do not reuse one generic delta function for both inventory-manager actions and ordinary order-status changes. Introduce distinct, server-authorized operations:

- **Manual receipt / correction / waste / reversal / transfer:** require the relevant inventory permission and validate warehouse type, product, positive quantities, available stock, and any permitted source/destination relation. Never let an inventory permission for one warehouse type silently authorize a different type.
- **Order reserve/release:** require a verified order-management workflow and validate the target order, its persisted source/market/items/status, and expected reserve/release delta inside the trusted boundary. Do not permit a caller with `MANAGE_ORDERS` alone to send an arbitrary product/warehouse/delta.
- **Audit:** write the stock change and corresponding `wh_movements` row in the same database transaction. Actor identity must derive from `auth.uid()` (or a verified service-role caller contract); do not accept a free-form actor name as proof. Exactly one audit record must be committed for each successful mutation and none for a rejected/rolled-back mutation.
- **Adjustment:** migrate `adjustStock()` off direct `wh_stock.upsert`; the present generic RPC cannot enforce exact-stock adjustment.
- **Warehouse administration:** constrain insert/update of `wh_warehouses` and `profiles.warehouse_id` to the intended capability. Keep deletion unavailable unless an explicit business operation is needed.
- **Product administration:** constrain product insert/update/delete to the appropriate product-management role while separately deciding whether anonymous read is required by the public website. Do not revoke anonymous product SELECT until external website/cross-repository callers and allowed product columns are inventoried.

### Phase 3 — table privileges and RLS

Only after all direct-write callers have been migrated and phase 0 has passed:

- Drop the existing public ALL policies on `wh_stock`, `wh_movements`, `wh_warehouses`, and `products`.
- Revoke `anon` mutation privileges on these tables and remove broad `PUBLIC` grants. Keep only deliberate operations/columns needed by real application paths.
- `wh_stock`: permit read only to authenticated users with an intended inventory/stock visibility capability; no direct client INSERT/UPDATE/DELETE.
- `wh_movements`: allow narrowly scoped reads, but all writes must use the atomic server-side mutation path; no direct client UPDATE/DELETE of historical audit rows.
- `wh_warehouses`: allow scoped reads to intended inventory/order workflows; mutations only through authorized warehouse administration.
- `products`: preserve current storefront/app read behavior only after the public product read contract has been confirmed; write permissions are separate from read permissions.
- Review default privileges so future objects do not silently regain broad grants. Re-run Supabase Security Advisor and inspect effective privileges, not just policy names. Multiple permissive policies combine with OR, so a new policy must not leave the old `true` policy in place.

## Minimum staging test matrix

Each case must be run via PostgREST using real role/JWT states, with SQL-level grant/RLS checks as supplementary tests.

| Caller | Read inventory | Change stock | Change product catalog | Create/edit warehouse | Expected |
|---|---|---|---|---|---|
| No Auth session / `anon` | Only an expressly approved public projection, if any | Deny | Deny | Deny | Never privileged |
| Active employee, no extra stock capability | Only approved application view if role grants it | Deny | Deny | Deny | Cannot bypass the UI |
| Warehouse manager | Yes | Only allowed receipt/adjustment/transfer operations | Only if separate product permission exists | Yes, within scope | Positive paths pass |
| Manager with denied stock capability | As separately allowed | Deny where explicitly denied | As separately allowed | Deny where explicitly denied | Denied overrides defaults |
| Sales manager | Inventory visibility by default | Deny unless explicitly granted | Product management if role has it | Deny unless explicitly granted | Match frontend matrix |
| Employee with extra stock permission | Yes as allowed | Only the extra capability's intended scope | Deny unless product permission exists | Deny unless central-management permission exists | No permission widening |
| Order manager with no warehouse permission | Minimal order stock effects through validated reserve/release flow | Arbitrary direct deltas denied | No | No | Order workflow preserved |
| Service-role/approved integration | Only operations defined for that service caller | Specific function contract only | Specific contract only | Specific contract only | No broad anon path |

### Required regression scenarios

- Receipt (positive), receipt rejected for wrong role.
- Transfer from source to destination (valid, same warehouse, insufficient source, invalid product/warehouse).
- Adjustment up and down, including concurrent updates.
- Write-off, reversal, double reversal rejection.
- Order status transitions into/out of every `DEDUCTED_STATUSES` state; repeated identical update; concurrent transitions.
- Externally stocked source exemptions (`star_network`, `uae_sheet_import`).
- Seller-linked warehouse in the order's market, and fallback sales warehouse in the correct market.
- If an operation fails after quantity change is attempted, verify stock and movement log both roll back.
- `sync_product_quantity()` still keeps the existing product quantity summary correct after the authorized operation.
- Test calls made directly against PostgREST/RPC, bypassing every UI permission gate.
- Log actor attribution from the Auth UID; no spoofed `performed_by` value accepted as a verified identity.

## Environment / deployment gate

At the time of this check, Supabase project listing returned `lowes-attendance` and `lowes-production`; no separate staging project was visible in the current connected project list. No new billable project has been created. The SQL candidate must not be applied to `lowes-attendance` or `lowes-production` as a substitute for staging.

Release is blocked until a faithful restorable staging clone is available, phases 0–3 pass, restore/rollback has been exercised, and the exact production tranche is approved. The SQL candidate rehearsal against disposable PostgreSQL is useful for syntax/ACL acceptance, but is not a substitute for the real Supabase schema, Auth session behavior, PostgREST, Edge Functions, or app end-to-end tests.
