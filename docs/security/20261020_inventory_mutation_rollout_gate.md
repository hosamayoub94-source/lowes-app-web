# Inventory mutation hardening — production rollout gate

**Status:** source/fixture preparation only. This is not a production migration, and no production database or frontend behavior was changed by this work.  
**Project scope:** `lowes-attendance` (employee app). Do not confuse this with Star Network or marketer commissions.  
**Cost constraint:** use the existing disposable PostgreSQL 17 CI service; do not create a paid Supabase project or branch.

## Read-only production findings

The read-only audit of `lowes-attendance` identified these mutation paths:

- `public.wh_stock`, `public.wh_movements`, `public.wh_warehouses`, and `public.products` have direct client mutation privileges and permissive RLS policies. The production grants/policies remain unchanged.
- `public.wh_apply_stock_delta(uuid, uuid, integer)` is a `SECURITY DEFINER` function that changes `wh_stock` but does not check `auth.uid()`, active-profile status, or a stock permission.
- `public.wh_transfer_stock(uuid, uuid, uuid, integer)` checks positive quantity, source/destination difference and source availability, but does not check caller identity or stock permissions. It invokes the delta function twice and writes no movement record itself.
- `public.sync_product_quantity()` recalculates `products.quantity` from `wh_stock`. Direct stock DML therefore changes the derived product quantity as well.
- In `src/services/warehouseService.js`, several operations change stock through RPC/upsert and write `wh_movements` in a separate request. A failed movement insert can leave a stock change without its corresponding audit row. The same service contains order reserve/release and reverse flows, plus warehouse CRUD/assignment paths.
- `src/screens/InventoryScreen.jsx` writes product inserts/updates directly to `products`. Stock hardening must not accidentally block legitimate catalog edits, and catalog-write permission must be considered separately from stock-write permission.
- The app has a manual-session fallback in which the browser can appear signed in without a Supabase Auth JWT. Such a request has no trustworthy `auth.uid()`; simply adding `auth.uid()` checks and revoking table writes can lock legitimate employees out. Do not disable the fallback or reset existing Auth passwords as part of this inventory change.

These findings describe the audited production configuration at the time of review. They are not evidence that the live inventory is fixed.

## Why the existing CI fixture is not yet production SQL

`docs/security/tests/20261020_inventory_rpc_contract_setup.sql` and `..._verify.sql` model an intended authorization/atomicity contract in a disposable `inventory_rehearsal` schema. The fixture uses synthetic UUIDs and now models the production-relevant permission fields (`role_type`, `is_active`, `extra_permissions`, `denied_permissions`) with JSONB arrays, matching the storage type used by `profiles` and the app resolver's role-default / extra-grant / explicit-denial semantics. It still includes only the fields needed by the fixture and uses separate rehearsal table definitions. It does **not** execute against production table definitions, prove that every app call site has been migrated, or remove any production grant or policy.

The fixture now also checks that a database session with role `authenticated` but no `auth.uid()` cannot mutate stock. This specifically captures the failure mode that must be understood before moving the current manual-session users to database-enforced authorization.

## Required implementation order

### Gate A — prove a real request identity for inventory writes

1. Map each stock-write caller, including order status changes/bulk actions, reservation, release, waste, reversal, warehouse actions, and the inventory screen.
2. Exercise the actual login path and capture only whether the mutation request has a valid Supabase Auth user/JWT. Do not log tokens, PINs, or IP addresses.
3. Reconcile session behavior before changing access controls. Existing Auth identities and fallback users must have an explicit migration/support path. Do not reset passwords or remove fallback behavior as a side effect of inventory hardening.

**Exit condition:** all legitimate inventory writers have a tested server-verifiable identity, or a reviewed trusted server-only mutation path is defined for the remaining cases.

### Gate B — build exact-schema, permission-checked, atomic RPCs

1. Use production-verified columns and constraints, but rehearse only in disposable PostgreSQL. Keep candidate SQL under `docs/security/candidates/`; do not put it in `supabase/migrations/` until separately reviewed and approved.
2. Check the caller's active `profiles` row and resolve the same authorization intent as `src/data/permissions.js`: role defaults, `extra_permissions`, and `denied_permissions` (denials override defaults; admin is unrestricted). Production stores the permission overrides as JSONB, so the fixture's simplified arrays are not drop-in SQL.
3. Require `manage_central_stock` for central-warehouse mutations and `manage_sales_stock` for sales/distributor-warehouse mutations; transfers need permission for both ends. Never trust a client-supplied `performed_by` as the actor identity.
4. Put each stock mutation and its `wh_movements` audit insert in the same database transaction/function. Cover receive, transfer, adjustment, waste, reserve/release, and reverse operations. Preserve non-negative-stock checks, idempotency, order linkage, and existing product-quantity synchronization.
5. Keep catalog actions (product name/SKU/prices/active state) and warehouse configuration/assignment actions separately authorized. Do not solve stock-write exposure by unintentionally granting or removing unrelated product-management capabilities.

### Gate C — migrate callers before removing legacy routes

1. Add and test the candidate RPC contract before switching any client call site.
2. Update every caller and test each action against the actual Auth/session behavior. Include concurrent changes, insufficient stock, invalid warehouse/product, missing identity, inactive profile, explicit permission denial, failed audit insert, and retry/idempotency cases.
3. In a coordinated release, verify the new clients are live and the legacy paths are no longer used; then revoke direct `INSERT/UPDATE/DELETE` from `anon` and `authenticated` on stock, movements, and warehouse configuration, and revoke broad `EXECUTE` access to old mutation functions. Apply only grants/policies confirmed by the access matrix.
4. Preserve required reads separately; don't blanket-revoke `SELECT` or change unrelated tables. Check the production function ACLs and table grants after rollout.
5. Verify denied writes leave both stock and movement counts unchanged, authorized writes create exactly one matching movement, and the product total remains consistent. Monitor failed inventory RPCs and unexpected legacy writes.

## Release blockers

- No disposable Supabase staging project is available, and the owner does not want a paid project or branch.
- Current app sessions can use a manual-session fallback; database-side `auth.uid()` gates cannot safely be enforced until the legitimate caller identity path is solved.
- Existing production stock RPCs are not yet permission-checked, and inventory/audit writes are not atomic across the current client requests.
- A production DDL change or frontend rollout was not authorized by this documentation/test task.

## Acceptance evidence already in the repository

- [PR #44 — free PostgreSQL rehearsal for inventory RPC authorization](https://github.com/hosamayoub94-source/lowes-app-web/pull/44)
- [PR #45 — rollback test when movement audit insert fails](https://github.com/hosamayoub94-source/lowes-app-web/pull/45)

Passing those fixture tests validates the modeled contract only. Production remains unchanged until the missing gates above are resolved and an explicitly approved rollout is executed.
