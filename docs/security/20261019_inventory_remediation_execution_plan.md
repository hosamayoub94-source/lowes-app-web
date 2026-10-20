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


A separate CI concurrency script now runs 24 independent sessions against the same synthetic order and calls the transition RPC to `preparing`. It asserts the order status is `preparing`, only one reserve movement is written per matched item (two in the fixture), the quantity decreases exactly once for each item, `updated_by` is server-derived, and product quantity mirrors still reconcile. This tests the order-row lock/idempotency contract in disposable PostgreSQL. It still does not replace a real Supabase JWT/PostgREST test or change the live browser-driven order workflow.


### Order-owner and fulfillment authorization contract — 2026-10-20

The latest fixture pass adds `profiles.order_role` to its synthetic profile model and checks two paths separately:

- **Owner-only update:** a regular active employee without global order-management authority may transition an order when the persisted `orders.handler_name` equals the active profile's `employee_name`. A caller cannot send a replacement handler name to satisfy that check.
- **Fulfillment:** an active profile whose persisted `order_role = 'fulfillment'` may advance operational orders without gaining stock-manager permissions.
- **Explicit denial:** an active owner whose `denied_permissions` contains `manage_orders` is rejected; an explicit denial is not bypassed by matching `handler_name`.
- An employee attempting to advance a different seller's order remains denied. In all cases the order ID and target status are the only client-supplied values; item list, market, source, brand, owner and warehouse are read from persisted fixture records.

This is still fixture-only contract logic. Read of `src/screens/OrdersScreen.jsx` confirms its existing client-side `canAdvanceOrder` gate is `isFulfillment || isManager || order.handler_name === userName`, while archive/active list fetches use `supabaseAnon` and do not ask the server to enforce that ownership test. The active app's route argument `forcedMarket` is a presentation/filter lock, not a value the proposed RPC trusts. The permissions UI and the Orders screen also derive authority somewhat differently; the precise meaning of explicit `manage_orders` grants and market-specific manager scope must be reconciled before enabling the production RPC.

**Production remains unchanged:** no direct orders write was switched to an RPC in this pass, and no table grant or RLS policy was modified. Before rollout, the owner check must be paired with a reviewed manager/fulfillment scope model, all single/batch/save/cancel/delete entry points must call the same trusted operation, and real Auth session coverage must pass without relying on the localStorage fallback.


### Additional live P0: the delta RPC and table do not enforce non-negative stock (verified 2026-10-20)

A fresh read-only query of the live `lowes-attendance` catalog confirmed an important gap that must remain explicit in the rollout gate:

- `public.wh_apply_stock_delta(uuid, uuid, integer)` performs an upsert and, on conflict, sets `quantity = wh_stock.quantity + p_delta`. It does not require a non-null `auth.uid()`, check active profile/permissions, reject zero deltas, or guard `quantity + p_delta >= 0`.
- The live `public.wh_stock` table has its primary key, warehouse/product foreign keys and unique `(warehouse_id, product_id)` constraint, but **no CHECK constraint requiring `quantity >= 0`**.
- Consequently a direct call to the publicly executable SECURITY DEFINER delta function can bypass `wh_transfer_stock`'s source-quantity validation and can write a negative quantity. The client-side precheck in `writeOffStock()` is separate from the database mutation and cannot provide a concurrency-safe invariant; order reserve also calls the delta function without the UI's waste precheck.
- `sync_product_quantity()` mirrors the sum from `wh_stock`, so an invalid negative warehouse quantity can flow into `products.quantity` as well.

**Safe target contract:** the future stock delta primitive must require verified identity and relevant stock permission, validate the warehouse/product and the intended operation, and perform a conditional locked update that refuses to make stock negative. If the stock row does not exist, a negative delta must fail rather than insert a negative row. Keep stock mutation and the corresponding `wh_movements` row atomic. For order reservation, additionally validate persisted order items and status inside the trusted order-transition transaction; do not use a free-form delta as an order API.

**Test-fixture boundary:** the disposable `inventory_rehearsal.wh_apply_stock_delta` contract deliberately rejects a delta that would result in negative stock. That passing fixture is a test of the *target* invariant, not evidence the live function currently provides it. The test/rollout report must not describe production stock as non-negative until a real migration has added the guard, checked existing data, and verified all call sites against the actual Supabase schema.

This finding came from metadata/function-definition reads only. No production SQL, rows, grants, policies, Auth identities, or credentials were changed.


### Current live stock integrity snapshot (read-only, 2026-10-20)

A follow-up aggregate over `public.wh_stock`, `public.products`, and `public.wh_movements` found that this is not only a theoretical risk:

| Read-only check | Current result |
|---|---:|
| Rows in `wh_stock` | 155 |
| Stock rows with negative quantity | 32 |
| Sum of the negative quantities | -4,333 |
| Products whose net warehouse total is negative | 4 |
| Product rows whose `quantity` differs from summed warehouse stock | 0 |
| Stock rows at exactly zero | 9 |
| Historical `reserve` movements | 9,085 |
| Historical `release` movements | 712 |

The quantity mirror is currently internally consistent (zero mismatches), but that does **not** mean the stock ledger is healthy: both `wh_stock.quantity` and the corresponding `products.quantity` can match while remaining negative. The audit did not read product names, customer/order payloads, PINs, credentials, or individual movement records.

The negative balances are concentrated in two market/type groups:

| Warehouse market / type | Negative rows | Products affected | Sum of negative quantities |
|---|---:|---:|---:|
| Turkey / sales | 27 | 27 | -3,609 |
| Syria / sales | 5 | 5 | -724 |
| **Total** | **32** | **32** | **-4,333** |

A separate aggregate linked movements to those negative product/warehouse pairs: 4,227 reserve rows, 221 release rows, 25 adjustment rows and 2 allocation rows were associated with the affected pairs. This is a **related-history count**, not yet a causal attribution; movement records can predate the current negative balance and the present adjustment movement format does not reliably preserve signed deltas.

**Remediation warning:** do not automatically clamp negative balances to zero and do not mass-reverse historical movements. First create a per-warehouse/product reconciliation report from opening quantities, reserve/release movements, transfers, write-offs, and physical counts; identify which entries explain the negative totals; get the owner to approve adjustments; then apply a separate audited correction with a rollback plan. Until that reconciliation is complete, the report should describe these as live negative balances, not merely as a potential bypass.


### Additional live P0: outstanding order reservations do not consistently match persisted order state (read-only, 2026-10-20)

A second read-only reconciliation grouped `reserve` and `release` movements by order/product/warehouse and compared the positive net reservation with the persisted `orders.status`, current brand/source exceptions, and current stock row. It returned no customer names, phone numbers, addresses, order IDs, or payloads.

**Observed snapshot:**

| Reservation-ledger category | Orders / orphan order IDs | Product/warehouse reservation lines | Net reserved units | Lines at negative stock | Net reserved units on negative positions |
|---|---:|---:|---:|---:|---:|
| Status no longer requires a stock deduction | 114 | 316 | 379 | 211 | 268 |
| Brand/source normally excluded from this stock path, but reservation remains | 20 | 56 | 88 | 37 | 56 |
| Movement references an order ID with no matching current `orders` row | 1 | 1 | 1 | 0 | 0 |
| Regular brand/source with a deducted status | 3,017 | 7,978 | 9,657 | 3,752 | 4,570 |

In this app, physical stock is intended to be “out” only for `preparing`, `ready`, `motor_prep`, `at_center`, `shipped`, `on_way`, `special_delivery`, `motor`, `prepaid`, `delivered`, and `settled`. The first row includes persisted orders in states such as `cancelled`, `returning`, `returned`, `not_received`, and `waiting` that still have a positive reserve-minus-release ledger. The exemption row includes orders whose current brand is not Lowe's or whose source uses an externally managed stock path, despite the existing app contract intending to skip those.

These are **ledger/state discrepancies requiring reconciliation**, not a ready-made correction list. Possible explanations include failed or skipped best-effort client reconciliation, status edits made through a path that did not finish stock synchronization, historical order brand/source changes, or old/incomplete movement history. The aggregate does not prove which explanation applies to an individual row. Do not blindly release 379 units, reverse 88 units, or delete orphaned movements without verifying each affected order/item/warehouse history.

Read-only drilldown query:
- `docs/security/queries/20261020_order_reservation_reconciliation_readonly.sql`

**Implementation consequence:** the production order status change and stock reservation/release must be one server-side transaction over the persisted order row. It must lock the order and relevant stock rows, derive the target reserved state from persisted market/status/brand/source/items, write matching audit movements in that same transaction, and reject an invalid transition without changing either status or stock. All single, batch, edit/save, cancel, soft-delete, and restore paths need a reviewed migration plan. The client currently calls status updates and `syncOrderStock()` separately; the latter catches exceptions, so a status update can complete while inventory reconciliation fails.

**Safety boundary:** all figures above are read-only aggregates over production. No status, stock, movement, permission, RLS, grant, Auth identity, or credential was changed.


### Order reservation exact-difference contract — fixture update 2026-10-20

The disposable `inventory_rehearsal.wh_transition_order_status(uuid,text)` contract was strengthened after reviewing the live `src/services/warehouseService.js` implementation:

- The earlier boolean rule (“any positive reservation exists”) could skip work when a reserved order's persisted `items` changed. For example, if the order had a positive reservation on product A but the editor changed product B or increased a quantity, another status call could leave an incomplete reservation.
- The updated fixture builds the desired per-product reservation from the persisted `items` for a deducted target status, aggregates duplicate matching product lines, and compares it with the reserve-minus-release ledger grouped by product and warehouse. It writes only the difference, in deterministic key order.
- Repeated same-status calls with no item change are idempotent. An item quantity increase reserves the extra units; a decreased/removed item releases the difference. If the persisted brand/source moves to an excluded path (`brand <> lowes`, `star_network`, or `uae_sheet_import`), a pre-existing positive reservation is released instead of being left behind.
- These paths now have disposable PostgreSQL acceptance tests for changed quantities, removed items, final cancellation, a status remaining `preparing` while the source changes to `star_network`, audit count, and the derived `products.quantity` mirror. Security SQL Candidate Rehearsal passed on PR #68.

**The live app still is not migrated.** In `OrdersScreen.jsx`, order status and order form data are written directly to `orders`; `syncOrderStock()` is then called as a separate best-effort client action, and its implementation catches errors. The new fixture function is not deployed and no app code calls it. Therefore this does not remove the production inconsistency window.

### Required next implementation boundary — order edit + inventory must share one transaction

A status-only RPC is insufficient for safe production cutover. The future server-side contract must accept a reviewed field allowlist for an order edit (including `items`, `handler_name`, `market`, `brand`, and `source` only where the UI is allowed to edit them), and in **one transaction**:

1. Lock the persisted order row and re-check the caller's verified Auth identity, active profile, global/owner/fulfillment authorization, and explicit `manage_orders` denial.
2. Validate the permitted status for that market and all editable fields. Do not trust a caller-supplied actor name, stock delta, previous item list, brand/source exemption, or reservation state.
3. Preserve the before-image of the order by applying the field patch only inside the RPC. Compute both the current reservation ledger and the desired ledger from the resulting persisted row; reconcile their exact per-product/per-warehouse differences.
4. Perform all stock decrements/increments with conditional non-negative guards and deterministic locking; write every `reserve`/`release` audit movement in the same transaction.
5. Update the order row only after checks succeed. A shortage, malformed tracked-item quantity, authorization failure, or audit insert failure must roll back both the order edit/status and every stock/audit change.
6. Preserve untracked add-on behavior only for explicitly reviewed product aliases/non-stock items; don't silently turn a product-name mismatch into a successful “all items reserved” claim.
7. Migrate every caller before revoking legacy access: individual status change, batch advance, order create/edit save, soft delete/cancel, restore, order-sheet integrations, and shipping tracker Edge Functions that can update order status. For externally stocked sources, status changes must not create a second deduction, and edits from/from-exempt sources must release any stale prior reservation as defined by the contract.

Before this contract reaches production, Phase 0 still has to establish real Supabase Auth sessions for current manual-session users. No production SQL/RLS/grant/credential changes or runtime deploy are authorized by the fixture PRs.


### External and browser order writers inventoried — 2026-10-20

The source-level writer matrix is now recorded in `docs/security/20261020_order_status_writer_cutover_matrix.md`. It confirms that an order-status cutover cannot update only `OrdersScreen`: `sheet-to-app`, Star Network mirroring, and carrier-tracking Edge Functions can also write the persisted order row. In particular, carrier or sheet updates from a deducted state into `returning`, `not_received`, or `cancelled` do not currently run inventory reconciliation in the same transaction. Those server-role writers need a narrowly defined integration contract as well as the user-scoped Auth RPC; service-role calls should not be passed through an `auth.uid()`-only function without a separate trusted caller contract.

Shipment-creation functions were reviewed separately and their inspected write snippets update tracking/cargo metadata rather than status. The sheet and carrier writers need explicit allowlists so a metadata-only operation does not automatically gain stock mutation authority. The new matrix is a static map of source code; it does not prove every deployed Edge Function version matches the repository, and it changes no production behavior.


### Public carrier tracker request-auth gate — confirmed live 2026-10-20

A read-only comparison of active Supabase Edge Functions with repository `main` confirmed that deployed versions of `track-yurtici` v72, `track-babel` v40, `track-karam` v44, and `track-ptt` v39 exactly match the inspected source and are configured with `verify_jwt=false`. Their batch paths currently have no user-JWT or dedicated poll-secret check before creating a service-role client and reading/updating orders. `track-karam` v44 additionally has public `debugPhone`/`debugPhones` branches which return tracking metadata for arbitrary supplied phone numbers. There were no application call sites for these debug branches in the inspected source files.

The repository branch for the related PR removes those unused Karam debug branches and adds a CI regression check; it does **not** deploy the function, so production v44 remains as-is until an approved deployment. The same PR enables Deno type-checking for this function. The broader batch-poll endpoints still need a reviewed split between real-Auth user lookups and trusted server-only/cron polling. Do not enable a blanket JWT gate until the manual-session fallback and all cron/integration callers have a tested migration path.


### Follow-up live refresh — negative stock and reservation aggregates (read-only, 2026-10-20)

A later read-only catalog/data refresh during this review produced a different negative-stock snapshot from the earlier table above. The earlier figures (32 negative rows / −4,333 units) are retained as their historical observation; they must not be interpreted as the current count or as evidence that a correction occurred.

| Latest read-only check | Result |
|---|---:|
| `wh_stock` rows | 155 |
| Negative stock rows | 23 |
| Sum of negative quantities | −3,115 |
| Products whose `products.quantity` differs from summed warehouse quantities | 0 of 39 |
| Negative rows in Turkey / sales | 18 (−2,391 units) |
| Negative rows in Syria / sales | 5 (−724 units) |

This discrepancy between same-day snapshots itself requires a repeat using the checked-in read-only query and target project confirmation before any correction decision. No individual product names, SKU, orders or movement payloads were extracted in this refresh.

The current constraint catalog again shows only the `wh_stock` primary key, unique `(warehouse_id, product_id)), and the two foreign keys. There is **no quantity CHECK constraint**. The current `public.wh_apply_stock_delta(uuid,uuid,integer)` definition still runs as `SECURITY DEFINER`, is executable by `anon` and `authenticated`, and performs:
- `INSERT ... VALUES (p_warehouse, p_product, p_delta)` when the stock row is missing;
- on conflict, `quantity = wh_stock.quantity + p_delta`;
- no non-negative guard, no `auth.uid()` requirement and no stock permission check.

The confirmed live defect is more specific than “a negative delta can overdraw an existing row”: **a negative delta against a missing (warehouse, product) row can insert a negative row directly**, because the table has no CHECK and the function's conflict branch does not run for a new row. `wh_transfer_stock` performs a source check first, but direct EXECUTE of the delta function bypasses that safeguard.

A refreshed order-ledger aggregation also found positive reserve-minus-release balances on 3,152 order IDs / orphan IDs (8,351 product/warehouse lines; 10,125 net units). These totals include valid deducted orders and are **not** a correction target. Separate, overlapping flags were:

| Flag (overlaps other flags) | Orders / orphan IDs | Product/warehouse lines | Positive net units |
|---|---:|---:|---:|
| Persisted status is not in the deducted-status set | 114 | 316 | 379 |
| Non-Lowe's brand currently has a reservation | 26 | 75 | 110 |
| Source is `star_network` or `uae_sheet_import` | 0 | 0 | 0 |
| No matching current `orders` row | 1 | 1 | 1 |
| Archived or soft-deleted order | 2,234 | 5,919 | 7,182 |

Those flags overlap and must not be added together. The archived/deleted bucket is especially not automatically invalid: some such orders can be delivered/settled history, and archival alone is not authorization to restore stock. The checked-in `docs/security/queries/20261020_order_reservation_reconciliation_readonly.sql` remains the reproducible, read-only drilldown; it intentionally avoids returning order IDs or customer payloads.

**New regression coverage in the current test branch:** the disposable fixture now removes its artificial `CHECK(quantity >= 0)` from `inventory_rehearsal.wh_stock`, matching the live table's relevant constraint shape. The target `wh_apply_stock_delta` contract is then tested to ensure a negative delta against a missing row fails before a stock row, movement record or derived product quantity can change. This test matters because retaining an artificial table CHECK would hide the exact production bypass. It tests a future safe contract only; the live function and production data remain unchanged.

**Rollout remains blocked.** Do not deploy a function change or revoke anon execution in isolation while the manual-session fallback still exists. Do not clamp negative balances, auto-release historical reservations, or mass-reverse movements. First establish authenticated caller readiness, switch each trusted stock/order writer through its reviewed transaction boundary, reconcile historic stock against physical counts and source records, and obtain approval for each separately audited correction.
