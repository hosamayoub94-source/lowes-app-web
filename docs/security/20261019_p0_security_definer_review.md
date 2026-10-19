# P0 SECURITY DEFINER Function Review — Employee App

**Snapshot date:** 2026-10-19  
**Supabase project:** `fghdumrgimoeqsafdhhh`  
**Method:** catalog-only read queries: `pg_proc`, `pg_get_functiondef`, `has_function_privilege`, and trigger catalog. No RPC was invoked; no DDL/data/secret/function changes were made.  
**Status:** Findings to remediate and rehearse; **not production approval**.

## Executive decision

The Security Advisor snapshot observed at `2026-10-19T19:20:35Z` flags **23 SECURITY DEFINER functions executable by `anon`**. A read-only privilege/definition inventory reviewed 23 entries. This review found two particularly important exposed write paths and one high-risk customer-data lookup path:

1. **P0 — `public.wh_apply_stock_delta(uuid,uuid,integer)`:** `anon` and `authenticated` have EXECUTE. Its SECURITY DEFINER body mutates `wh_stock` by adding the caller-supplied delta; the body has no `auth.uid()` or business-role check and does not reject a negative delta.
2. **P0 — `public.wh_transfer_stock(uuid,uuid,uuid,integer)`:** `anon` and `authenticated` have EXECUTE. Its SECURITY DEFINER body moves stock between caller-supplied warehouses/products; it checks positive quantity, different source/destination, and sufficient source quantity, but has no caller identity or authorization check. It calls `wh_apply_stock_delta`.
3. **High — `public.get_customer_orders_by_key(text)`:** `anon` and `authenticated` have EXECUTE. It returns `SETOF public.orders` (the full row type), matching caller-supplied digits to normalized customer phone/WhatsApp numbers, with a minimum key length of six and limit of 200. No caller-authentication check appears in the function body. The staff app uses this RPC for customer order history, so simply revoking all access without a replacement would break a legitimate workflow; a narrower authenticated endpoint and/or high-entropy lookup token is needed.

The effective catalog privileges plus function bodies make these high-confidence exposed paths to address. **We did not send HTTP requests to test them**, and do not claim exploitation has occurred. The production schema has USAGE available to `anon`, and the advisor identifies these functions as PostgREST-callable in the `public` API schema.

## Why EXECUTE matters here

These are `SECURITY DEFINER` functions, so they execute with the owner's database privileges rather than the caller's ordinary rights. A public EXECUTE grant on a write-capable helper can therefore bypass table-level RLS/grants within that function. The intended safeguard must be inside the server-side function (authentication + business authorization), or its EXECUTE grant must be limited to a verified caller set. Client-side button visibility is not a control.

## Catalog evidence: all 23 advisor findings

`anon_exec=yes` and `authenticated_exec=yes` were verified with PostgreSQL `has_function_privilege` for all 23 items. “Trigger-only” means the routine returns PostgreSQL's `trigger` type and is attached to a trigger; it is not an ordinary RPC signature. Its direct role grant is still unnecessary in principle, but any cleanup must preserve trigger creation/migrations and be verified in staging.

| Function | Return / shape | Fixed function search_path | Triage |
|---|---|---|---|
| `_profile_name_exists(text)` | boolean; checks whether a profile name exists | Yes: `public, pg_temp` | **High:** public existence probe; also called by the profiles write-trigger guard. Do not revoke blindly until that trigger path has a tested replacement. |
| `assign_order_code()` | trigger-only; updates order-code counter during order insert | Yes: `public, pg_temp` | Grant cleanup candidate; preserve order creation and assigned order IDs. |
| `auth_blob_user_id()` | scalar self-profile lookup by `auth.uid()` | **No** | Helper likely returns null for anon; scope to authenticated callers if not deliberately public, set safe search path. |
| `auth_is_full_access()` | scalar role predicate by `auth.uid()` | **No** | Used as authorization helper; retain only required caller classes, add safe search path, test all referencing policies/functions. |
| `current_is_network()` | scalar wrapper around `current_role_type()` | **No** | Authorization helper; narrow anon execute and add safe search path after dependency review. |
| `current_role_type()` | role lookup by `auth.uid()` | **No** | Authorization helper; returns data tied to current auth UID, but has mutable search path and unnecessary anonymous exposure. |
| `current_seller_id()` | returns `auth.uid()` | **No** | Low direct impact; remove needless anon exposure and fix search path if retained as SECURITY DEFINER. |
| `current_team()` | team lookup by `auth.uid()` | **No** | Authorization helper; narrow callers and fix search path. |
| `employee_salary_settings_log_fn()` | trigger-only audit logger | Yes: `public, pg_temp` | Grant cleanup candidate; test salary settings history insertion remains intact. |
| `fn_create_advance_entry_on_approval()` | trigger-only accounting entry writer | **No** | High integrity impact if triggered by approval; trigger-only function grant and mutable search path need cleanup after attachment/body review. |
| `fn_deduct_leave_on_approval()` | trigger-only leave-balance writer | **No** | High integrity impact if triggered by approval; verify narrow search path and preserve leave approvals/balances. |
| `get_customer_orders_by_key(text)` | returns `SETOF orders` up to 200 rows | Yes: `public` | **High:** anonymously callable PII/order history lookup by normalized phone key; replace broad full-row result with intended minimal projection and an explicit public/authenticated contract. |
| `is_supervisor_of(uuid)` | relationship predicate for caller and target | **No** | Authorization helper; no anon identity/role gate beyond UID-dependent comparisons; narrow anonymous execution and test cross-team/downline results. |
| `notify_commission()` | trigger-only notification writer | **No** | Grant cleanup candidate; preserve notifications from ledger inserts and set fixed search path. |
| `notify_network_join()` | trigger-only join notification writer | **No** | Grant cleanup candidate; preserve network-join notifications and set fixed search path. |
| `payroll_can_finalize()` | checks active profile and payroll finalization grant for `auth.uid()` | Yes: `public, pg_temp` | Authorization helper: retain only necessary authenticated use; anonymous call should not be needed. Test payroll finalize permissions. |
| `payroll_guard_profile_delete()` | trigger-only profile-delete guard | Yes: `public, pg_temp` | Grant cleanup candidate; preserve protection against deleting profiles referenced by payroll entries. |
| `payroll_has_access()` | checks active caller in payroll_access | Yes: `public, pg_temp` | Authorization helper; narrow to necessary authenticated callers. Test unauthorized salary reads remain denied. |
| `payroll_run_is_legacy(uuid)` | reports whether a run predates Sep 2026 (or missing run) | Yes: `public, pg_temp` | Lower severity disclosure helper; arbitrary run-ID status probe. Restrict to required callers after checking RLS dependencies. |
| `payroll_run_is_locked_new(uuid)` | reports run locked/non-draft state for a supplied ID | Yes: `public, pg_temp` | Lower severity status probe; restrict to required callers after checking RLS dependencies. |
| `profitability_guard_closed_month()` | trigger-only closed-month guard + retro log | Yes: `public` | Grant cleanup candidate; preserve month-close control and retroactive audit log. |
| `wh_apply_stock_delta(uuid,uuid,integer)` | **writes stock quantity** | Yes: `public` | **P0:** public SECURITY DEFINER inventory mutation with no caller authorization. |
| `wh_transfer_stock(uuid,uuid,uuid,integer)` | **transfers stock** | Yes: `public` | **P0:** public SECURITY DEFINER stock transfer with no caller authorization. |

### Not included in the 23 anon-executable findings

Separate read-only ACL checks confirmed:
- `admin_reset_pin(text,text)` is SECURITY DEFINER, but `anon` and `authenticated` **cannot execute it**; its ACL only grants `postgres` and `service_role`.
- `update_my_profile(text,text)` is SECURITY DEFINER, but `anon` and `authenticated` **cannot execute it**; its ACL only grants `postgres` and `service_role`.

These two functions still deserve code/security review because their function-level `search_path` is unset; the current evidence does **not** indicate direct public EXECUTE access.

## Trigger attachments verified in the live catalog

The following trigger-only functions were found attached; preserve these behavior contracts while tightening grants/configuration:

| Function | Live trigger | Table / event |
|---|---|---|
| `assign_order_code()` | `trg_assign_order_code` | `orders BEFORE INSERT` |
| `employee_salary_settings_log_fn()` | `employee_salary_settings_log_trg` | `employee_salary_settings AFTER INSERT/UPDATE/DELETE` |
| `fn_create_advance_entry_on_approval()` | `trg_advance_accounting` | `employee_requests AFTER UPDATE` |
| `fn_deduct_leave_on_approval()` | `trg_leave_balance` | `employee_requests AFTER UPDATE` |
| `notify_commission()` | `trg_notify_commission` | `commission_ledger AFTER INSERT` |
| `notify_network_join()` | `trg_notify_network_join` | `profiles AFTER INSERT / UPDATE OF recruiter_id` |
| `payroll_guard_profile_delete()` | same name | `profiles BEFORE DELETE` |
| `profitability_guard_closed_month()` | `profitability_expenses_guard`, `profitability_fx_guard` | `profitability_expenses BEFORE INSERT/UPDATE/DELETE`; `profitability_fx_rates BEFORE INSERT` |

## Required remediation tranches

### Tranche 1 — P0 exposed stock mutations
1. Review all legitimate app/UI, trigger, automation and integration call sites for `wh_apply_stock_delta` and `wh_transfer_stock`.
2. Draft a migration proposal that requires a genuine authenticated identity and the appropriate warehouse/inventory role (or moves the operation behind a trusted server-side endpoint). Do not use client-supplied role/metadata as the authority.
3. Restrict EXECUTE to only the required role after the authorization predicate is implemented and tested. Do not assume changing RLS on `wh_stock` alone protects a SECURITY DEFINER function.
4. Rehearse with a restorable clone. Negative cases: anon stock increase, anon stock decrease, anon transfer between warehouses, signed-in user without inventory permission, mismatched warehouse/team, invalid/negative quantity. Positive cases: authorized stock correction, transfer, and existing inventory workflows. Verify the before/after stock totals and the audit record.

### Tranche 2 — Customer order history RPC
1. Confirm whether this should be available to authenticated staff only or to a narrowly defined public customer flow.
2. Avoid exposing the full `orders` row type by phone-number matching. Prefer a high-entropy unguessable lookup token and return only the allowed customer-facing fields, with a strict limit and ownership logic.
3. Test anonymous enumeration resistance, token invalidation, minimal response fields, cross-customer denial and current customer history UX.

### Tranche 3 — Helpers and trigger-only functions
1. For each scalar authorization helper, map all policy/function references before revoking any grant; keep only roles that truly need it.
2. For trigger-only functions, verify every trigger attachment and migration owner dependency, then plan removal of unnecessary public EXECUTE grants as a separate tested change.
3. Set a safe fixed `search_path` for the 11 exposed routines with no function-level setting, using the appropriate explicit schema qualification and trusted schemas only. Do not bulk alter the functions without checking their table/function references and trigger behavior.
4. Check all 23 plus the remaining Security Advisor findings individually; do not infer a blanket identical fix from the advisor count.

## Release gate

- No direct RPC invocation was attempted against production.
- No production grants, function definitions, RLS policies, data, secrets, or deployed functions were changed.
- The inventory is read-only catalog/source evidence; it is not a penetration test and does not prove an exploit was executed.
- Keep production authorization remediation blocked until the exact caller map, restorable clone, positive/negative integration suite, rollback and explicit owner approval are complete.


## Confirmed application call sites for the two P0 stock RPCs

The generated source inventory and direct source review confirm both RPCs are used by the browser-side warehouse service:

- `src/services/warehouseService.js` calls `supabase.rpc('wh_apply_stock_delta', ...)` in `_applyDelta()`; this path is used by stock receive, waste/write-off, order reserve/release, and movement reversal.
- The same service calls `supabase.rpc('wh_transfer_stock', ...)` during `allocateStock()`.
- `src/screens/WarehouseScreen.jsx` gates buttons in the UI with `MANAGE_CENTRAL_STOCK` and `MANAGE_SALES_STOCK`. This is client-side gating only; it cannot authorize an unauthenticated or unauthorized direct PostgREST RPC call.
- The caller writes the `wh_movements` audit row separately after the RPC returns. A direct invocation of the RPC does not need to perform that separate client step, so the stock quantity can change without the corresponding application movement-log row.
- The `performedBy` value sent for that movement row comes from the browser session name; the SQL stock RPC itself does not validate that claimed actor.

This makes the risk more than a theoretical function grant: normal app workflows rely on these functions, so simply revoking all browser EXECUTE grants will break stock receive, transfer, waste and order reserve/release paths. Equally, retaining open execution lets callers bypass the UI's permissions and skip the separate movement audit. A replacement must preserve legitimate order-status automation while validating actor identity and inventory permission inside a trusted boundary, and preferably write the stock change plus movement/audit entry atomically.

## Extra verification required for stock RPC replacement

- Map every stock-delta call origin separately: manual receive, waste/write-off, order reserve/release, reversals, allocations, and any scheduled or external integrations.
- Bind `performed_by` to a server-verified actor rather than browser-supplied text.
- Test both role capabilities used by the existing UI and service-driven order-status transitions, including a staff member with order-management permission but no warehouse-manage permission.
- Ensure an unauthorized direct call cannot alter quantity even if the UI is bypassed; verify every permitted stock mutation has exactly one attributable movement entry in the same transaction.
