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


### Manual-session usage confirmed in audit logs

A read-only aggregate over `public.activity_logs` confirms the localStorage fallback is active, not merely legacy code:

- **76 manual-session login events** in the last 30 days across **10 distinct active users**.
- Those users span **2 admins, 6 employees, 1 sales manager, and 1 social manager**.
- The latest recorded manual-session login was **2026-10-19 19:12:34 UTC**.
- The audit log also records **57 failed login events** in the same 30-day window. This is not proof of an attack; it does strengthen the case for implementing and testing rate limiting on the unauthenticated PIN-verification path.
- For comparison, the same window recorded 189 non-manual login events across 25 distinct users.

**Impact on rollout:** Phase 0 is a hard blocker. Removing fallback immediately would affect current users across multiple roles. Do not turn off the fallback until those identities can authenticate reliably and the migration is verified. At the same time, the manual fallback currently leaves those sessions operating under the anon database role, so it cannot be treated as an acceptable long-term exception.


## Expanded active call-site matrix — 2026-10-20

This pass read the currently routed screens and shared warehouse service, and rechecked the live grants/RLS/function metadata with read-only SQL. It remains a source-and-catalog audit, not an end-to-end authenticated PostgREST test.

| Operation / entry point | Confirmed call path | Current mutation / audit behavior | Required migration treatment |
|---|---|---|---|
| Manual receipt | `InventoryScreen.jsx` and `WarehouseScreen.jsx` → `receiveStock()` → `wh_apply_stock_delta` → separate `_logMovement()` | Quantity change and `receive` movement insert are separate requests. The client supplies the free-form `performedBy` field. | Replace with a permission-checked receipt RPC that changes quantity and writes exactly one audit row in the same transaction; bind actor to verified identity. |
| Transfer / allocate | `WarehouseScreen.jsx` → `allocateStock()` → `wh_transfer_stock` → separate `_logMovement()` | Transfer function updates source/destination stock atomically, but the `allocate` movement is written after that transaction. A failed log insert leaves an unaudited transfer. | Put the transfer and `allocate` movement in one server transaction; check permission for both source and destination warehouses. |
| Exact stock adjustment | `InventoryScreen.jsx` and `WarehouseScreen.jsx` → `adjustStock()` → `_setQty()` direct upsert into `wh_stock` → separate movement insert | Direct table write bypasses the delta RPC, and the new exact quantity is not transactionally tied to the `adjust` movement. | Move adjustment to a dedicated RPC; validate scope and non-negative quantity; atomically update stock, audit, and the derived product total. |
| Write-off / waste | `WarehouseScreen.jsx` → `writeOffStock()` → client-side `_currentQty()` precheck → `wh_apply_stock_delta` → separate `waste` movement insert | Availability is checked before the mutation in a separate request. Concurrent updates can invalidate the precheck, and the audit can fail after quantity changed. | Validate available quantity inside the same transaction as the decrement and movement insert; keep the reason from the allowed list and validate actor server-side. |
| Order reserve / release | `OrdersScreen.jsx` calls `syncOrderStock()` on status change, batch advance, order save, and cancellation/delete. The service walks matched order items and calls delta RPCs plus separate `reserve`/`release` inserts. | The order status is saved separately from stock mutation. Per-item stock/audit requests are not a single transaction, and `syncOrderStock()` catches errors and silently returns, so an order update can succeed while stock remains out of sync. | Implement a trusted reserve/release workflow based on the persisted order status, market, items, brand and source. Make the transition idempotent and atomic with stock/audit, preserve the `star_network` and `uae_sheet_import` exclusions, and do not allow an order-management permission to request arbitrary warehouse/product deltas. |
| Reverse movement | `WarehouseScreen.jsx` → `reverseMovement()` | The client checks `reverses_id`, then issues one or two stock mutations, then inserts a `reverse` movement separately. The check-then-act guard is not atomic, so concurrent attempts can race. | Implement server-side reversal with row/advisory locking or a unique reversal constraint, enforce eligible movement types, and commit stock, reversal link, and audit together. |
| Warehouse create / update | `WarehouseScreen.jsx` → `createWarehouse()` / `updateWarehouse()` → direct `wh_warehouses` INSERT/UPDATE | Route visibility and client controls are not database authorization; the write is directly exposed by current table grants/policy. | Separate warehouse-administration permission from stock movement permission; validate allowed warehouse types/markets and server-side scope. No delete operation is needed by this screen today. |
| Seller-to-warehouse assignment | `WarehouseScreen.jsx` → `assignSellerWarehouse()` → direct `profiles.warehouse_id` UPDATE | Assignment changes order-stock routing and is sent as a direct client update. | Require an authorized server-side assignment operation; validate active seller and warehouse/market compatibility. Do not infer authority from the supplied profile ID. |
| Product catalog / batch prices | `InventoryScreen.jsx` product form, batch price editor and catalog seeding → direct `products` INSERT/UPDATE | These are catalog operations, not stock RPCs. The same `products` table also stores derived `quantity` from the warehouse trigger. | Gate catalog writes with the intended product-management permission independently of stock-management permissions. Preserve needed reads and storefront use; avoid blanket product revokes. |

### Secondary inventory implementation to keep distinct

The repository also contains `src/modules/inventory/services/inventoryService.js`, which references a different schema family (`stock_levels`, `warehouses`, and `stock_movements`) and performs client-side stock-level updates followed by a separate movement insert. The active `AppRoutes.jsx` routes to `src/screens/InventoryScreen.jsx` and `src/screens/WarehouseScreen.jsx`; the separate module service is not wired from those route declarations. This does not alone prove the module is unused by every indirect consumer. Keep it as a separate scope until all imports and runtime entry points are confirmed; do not mix its tables or function contracts into the `wh_*` rollout.

### Live production metadata rechecked on 2026-10-20 (read-only)

- `products`, `wh_stock`, `wh_movements`, and `wh_warehouses` all still have RLS enabled, but both `anon` and `authenticated` currently have table-level SELECT/INSERT/UPDATE/DELETE privileges on each table. Each table still has one policy containing a permissive `true` clause.
- Both `public.wh_apply_stock_delta(uuid, uuid, integer)` and `public.wh_transfer_stock(uuid, uuid, uuid, integer)` remain `SECURITY DEFINER`, callable by both `anon` and `authenticated`. The live function bodies still contain no `auth.uid()` or permission check.
- `public.sync_product_quantity()` runs as invoker and updates `products.quantity` after `wh_stock` changes. Before tightening product/table privileges, verify the trigger still has only the required ability to update the derived quantity; otherwise a correct stock write could fail in the trigger, or a broad grant may needlessly remain. A narrowly scoped, schema-qualified trigger design must be tested in the disposable fixture first.

### What the CI fixture covers after PR #52

The disposable PostgreSQL fixture now models the production-relevant subset more closely: JSONB permission arrays; the live RPC names and argument names (`wh_apply_stock_delta`, `wh_transfer_stock`); `wh_stock.id` plus its unique `(warehouse_id, product_id)` key; the live `wh_movements` column names (`type`, `performed_by`, `reason`, `order_id`, `reverses_id`); and an equivalent `trg_wh_stock_sync` mirror that keeps `products.quantity` equal to summed `wh_stock.quantity`. Tests cover explicit denials overriding non-admin role defaults; warehouse-manager defaults including distributor stock; sales managers having no stock-write default; central-only extra grants not implying sales-stock access; inactive/no-identity callers being denied; admin behavior matching the frontend resolver; atomic audit inserts; and quantity-mirror integrity after successful, denied, rejected, and rolled-back operations. This is still contract rehearsal only: it uses synthetic profiles/warehouses and an isolated `inventory_rehearsal` schema, and does not prove real Supabase JWT/PostgREST behavior or justify a production rollout.

**Next hard blocker remains Phase 0:** do not revoke the current `anon` path until the manual-session users have a verified, tested server-side identity/recovery path. After that, migrate every row in the table above before changing production grants/policies.


### Order-status + stock lifecycle contract added 2026-10-20

The disposable fixture now includes a proposed server-side `wh_transition_order_status(order_id, new_status)` contract. It takes only the order ID and target status, locks and reads the persisted fixture order row, and derives market, brand, source, handler and item names/quantities from that row. It does not accept a client-selected product, warehouse or arbitrary stock delta.

The fixture models the current business behavior that must survive a production migration:

- A role with effective `manage_orders` may run a validated order transition even without direct stock-write permission; this does not grant that caller the standalone stock mutation RPCs.
- `profiles.warehouse_id` is preferred only when the linked active warehouse is compatible with the order market; otherwise routing falls back to the active `sales` warehouse for that market.
- Persisted `items` JSONB uses the observed `name` and `qty` keys; direct product name/name_en matches and a fixture alias are resolved against the catalog. Unmatched non-catalog items are skipped, consistent with the current service.
- Entering a deducted status creates one `reserve` movement for each matched stocked item. Repeated calls and moves between already-deducted statuses do not reserve again. Leaving deducted statuses returns each warehouse/product's net reserved amount and writes `release` movements. The order row lock serializes concurrent calls for the same order.
- The transaction commits the order status, all stock changes and all reservation movements together. Insufficient stock, invalid item quantity or no active warehouse for the order market aborts the whole transition.
- `star_network`, `uae_sheet_import`, and non-`lowes` brands can advance status without a second stock deduction.
- The RPC applies the market-specific status lists from `src/data/orderStatus.js`, and derives `updated_by` from the active profile rather than accepting a caller-supplied display name.

These are synthetic contract tests in `inventory_rehearsal`, not production SQL or a deployed RPC. They do not yet reproduce all order/team/market authorization rules, the full production catalog matching behavior, or the real Supabase JWT/PostgREST path.

### Remaining order workflow blocker

Production `src/screens/OrdersScreen.jsx` still writes status through `supabaseAnon.from('orders').update(...)` and then calls `syncOrderStock()` asynchronously. The batch path also fires that stock reconciliation without awaiting it; `syncOrderStock()` catches and swallows errors. The fixture does **not** change any of those runtime call sites. A production migration must establish a real Auth session/recovery path, confirm who may change which order, migrate every individual/batch/save/cancel/delete entry point to a single reviewed server-side operation, preserve notifications/sheet sync/accounting behavior, and only then close direct table/RPC write paths. The current production grant/RLS exposure remains open.
