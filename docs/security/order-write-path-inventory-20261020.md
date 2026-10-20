# Order write-path inventory and atomic cutover gates

Date: 2026-10-20  
Scope: repository inspection and rollout planning only. This document does not change runtime behavior.

## Verified current write paths

| Path | Current behavior observed in repository | Risk / required follow-up |
|---|---|---|
| `src/screens/OrdersScreen.jsx` — order form `handleSave` | Existing order is written with `supabaseAnon.from('orders').update({...form})`; create uses direct insert. After save, Google Sheets sync runs, then `syncOrderStock(...)` runs separately. | Edit and inventory reservation are not one database transaction. Replace the edit write with a server-side atomic contract only after real Auth/session readiness and parity tests are complete. |
| `src/screens/OrdersScreen.jsx` — `handleStatusChange` | Direct update to `orders.status`; then status history, sheet sync, notifications, `syncOrderStock`, and accounting run as separate operations. | A successful status write can outlive a failed inventory operation. Status transitions need a single authoritative server-side transaction for order + reservation ledger; external side effects should follow commit and be retryable/idempotent. |
| `src/services/warehouseService.js` — `syncOrderStock` | Reservation state is inferred by reading `wh_movements`; `_reserveOrder` and `_releaseOrder` call `wh_apply_stock_delta` and then insert a separate movement row. `syncOrderStock` catches all errors and suppresses them. | Stock quantity and audit ledger can diverge if the delta succeeds but movement insert fails. A retry may not know a delta already happened. Silent error suppression hides failed reservations from callers. Move stock delta + movement + reservation state into one database transaction, add idempotency keys, and surface an actionable failure state. |
| `src/services/warehouseService.js` — manual stock mutations | `receiveStock`, `writeOffStock`, `adjustStock`, `reverseMovement` and transfer paths perform RPC/table operations and movement logging as separate requests. Some paths read quantity before applying a delta. | Audit and stock can diverge on partial failure; read-then-check paths can race. Review each mutation and make balance changes plus movement audit atomic. This is a separate workstream from order reservation and must retain role restrictions. |
| `src/services/orderSyncService.js` — `syncToSheet` | Updates sync metadata directly through `supabaseAnon` before/after invoking the Edge Function. | Separate sync metadata writes from protected business fields; verify the function authorizes callers and does not permit forged order IDs or service-level actions. |
| `supabase/functions/sheet-to-app/index.ts` | Uses a service-role client to insert/update orders from sheet payloads; single and bulk paths can update status/tracking, and reconciliation can soft-delete orders. Token validation currently accepts hardcoded literal tokens as well as environment secrets. | This is a privileged integration boundary. Remove literal tokens only after rotating and coordinating the Apps Script secrets; authenticate webhook requests, validate market/fields/transitions, check all database errors, and route status changes through the stock-aware contract. Reconciliation requires tested fail-closed behavior. |
| `supabase/functions/import-yurtici-report/index.ts` | Intended to update tracking only; incoming `status` is documented as ignored. | Keep this path tracking-only and test that invariant. |
| `supabase/functions/track-yurtici/index.ts` | Polls the carrier and updates order statuses based on mapped carrier events, with status history/notifications in separate steps. | This is a status writer too; classify carrier transitions against the same authoritative transition/stock contract, preserving terminal-state guards and making retries idempotent. |
| Star Network integration | Existing architecture documents a one-way order mirror and an explicit external-source exemption (`source = 'star_network'`); warehouse service also exempts `uae_sheet_import`. | Preserve the one-way boundary. Do not write back into Star Network's source blob or reserve local stock for externally stocked orders. Verify source classification server-side, not from an untrusted client patch. |

This is a verified expanded inventory of the paths inspected so far, not a claim that every writer in the repository or connected Apps Script projects has been enumerated. Before cutover, search all repository writes to `orders`, `wh_stock`, `wh_movements`, and reservation functions, plus the live Apps Script deployments, other Edge Functions, and scheduled writers.

## Highest-priority correctness finding

The current reservation flow is not atomic end-to-end:
1. A status/order write can commit first.
2. Stock quantity changes through `wh_apply_stock_delta`.
3. The `wh_movements` reserve/release row is inserted separately.
4. `syncOrderStock` catches and suppresses errors.

Therefore the UI may report a saved order while inventory handling failed, and the ledger may not faithfully explain a quantity change after partial failure. Do not try to fix this with an automatic historical reconciliation. First implement and test a transaction that owns order transition + stock delta + movement record + idempotency in the same database transaction.

## Hard rollout blocker: employee Auth

The latest read-only readiness snapshot records:
- 36 active profiles;
- 35 profiles with matching Auth identities;
- 1 active profile without a matching Auth identity;
- 72 manual-session login events from 10 distinct users during the 30-day window.

The current `src/services/authService.js` explicitly falls back to a localStorage manual session when Supabase Auth sign-in fails, and comments that the anon JWT permits database operations under current permissive RLS. Therefore:
- Do not disable manual-session login.
- Do not revoke legacy anon write permissions or apply an `auth.uid()`-only gate yet.
- Do not reset credentials or create Auth identities automatically.
- First provide and test a supported real-Auth/recovery path for every legitimate user, then verify user-to-profile mapping and authorization.

## Atomic cutover sequence

1. Finish writer discovery, including all Edge Functions, scheduled tasks, Apps Script triggers and carrier integrations.
2. Build the transaction contract against the disposable fixture, using the PR #74 contract as a target—not as evidence of production readiness.
3. Add tests for authenticated actor identity, owner/manager authorization, market/source invariants, quantity increase/decrease, duplicate product lines, concurrent edits, insufficient stock rollback, partial failure rollback, idempotent retries, and external-source exemptions.
4. Implement an Auth migration plan and test sign-in/recovery without disabling the current fallback.
5. Update browser edit/status callers and trusted integrations to use the reviewed contract; preserve tracking-only paths and external source boundaries.
6. Run CI and security rehearsals; inspect all diffs and generated SQL. No live migration, permission revocation, data repair, or deployment is part of these steps.
7. Only after the owner-approved release plan and a verified restorable backup: deploy in a controlled window, verify known safe probes and application workflows, and keep a tested rollback path.

## Acceptance criteria

- An order field edit and its inventory reservation/release either both commit or both roll back.
- Stock quantity and its `wh_movements` audit entry cannot diverge after partial failure.
- Concurrent edits cannot oversell stock or double-reserve.
- Reservation failures are visible and retryable; they are not swallowed silently.
- Unauthorized employees cannot edit another employee's order or protected routing/source fields.
- Sheet/carrier updates cannot bypass the authoritative status/inventory contract.
- `star_network` and `uae_sheet_import` orders never create local reservations and are not written back into their source system.
- Every legitimate employee retains a tested sign-in/recovery path before legacy write permissions are reduced.
- No historical stock/order reconciliation is run from aggregate estimates alone; cohort and product matching must be validated separately.

## Safety record

PR #74 is fixture-only. This update is documentation-only. No production migration, production data/grants/RLS/Auth changes, paid Supabase project/branch, or deployment is authorized by this work. Vercel deployment attempts in the PR timeline hit the free daily deployment limit; do not upgrade or create paid resources to work around it.
