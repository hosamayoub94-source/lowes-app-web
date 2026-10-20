# Order write-path inventory and atomic cutover gates

Date: 2026-10-20  
Scope: repository inspection and rollout planning only. This document does not change runtime behavior.

## Verified current write paths

| Path | Current behavior observed in repository | Risk / required follow-up |
|---|---|---|
| `src/screens/OrdersScreen.jsx` — order form `handleSave` | Existing order is written with `supabaseAnon.from('orders').update({...form})`; create uses direct insert. After save, Google Sheets sync runs, then `syncOrderStock(...)` runs separately. | Edit and inventory reservation are not one database transaction. Replace the edit write with a server-side atomic contract only after real Auth/session readiness and parity tests are complete. |
| `src/screens/OrdersScreen.jsx` — `handleStatusChange` | Direct update to `orders.status`; then status history, sheet sync, notifications, `syncOrderStock`, and accounting run as separate operations. | A successful status write can outlive a failed inventory operation. Status transitions need a single authoritative server-side transaction for order + reservation ledger; external side effects should follow commit and be retryable/idempotent. |
| `src/services/orderSyncService.js` — `syncToSheet` | Updates sync metadata directly through `supabaseAnon` before/after invoking the Edge Function. | Separate sync metadata writes from protected business fields; verify the function authorizes callers and does not permit forged order IDs or service-level actions. |
| `supabase/functions/sheet-to-app/index.ts` | Uses server-side Supabase client to insert/update orders from sheet payloads; bulk update path changes status and tracking fields directly. | Treat as a trusted integration boundary: authenticate the webhook, validate allowed fields and transitions, and route status changes through the same stock-aware contract where applicable. Do not let an import silently bypass the inventory ledger. |
| Carrier imports / trackers | `supabase/functions/import-yurtici-report/index.ts` updates tracking data; repository notes also identify carrier tracking/status paths. | Tracking-only writes may remain separate. Any carrier status write must be classified and use the authoritative transition contract; never assume every carrier update is tracking-only. |
| Star Network integration | Existing architecture documents a one-way order mirror and an explicit external-source exemption (`source = 'star_network'`). | Preserve the one-way boundary. Do not write back into Star Network's source blob or reserve local stock for externally stocked orders. Verify source classification server-side, not from an untrusted client patch. |

This is a verified first-pass inventory, not a claim that every writer in the repository or connected Apps Script projects has been enumerated. Before cutover, search all repository writes to `orders`, `wh_stock`, `wh_movements`, and reservation functions, plus the live Apps Script deployments and scheduled Edge Functions.

## Hard rollout blocker: employee Auth

The latest read-only readiness snapshot records:
- 36 active profiles;
- 35 profiles with matching Auth identities;
- 1 active profile without a matching Auth identity;
- 72 manual-session login events from 10 distinct users during the 30-day window.

The manual-session fallback is still in use. Therefore:
- Do not disable manual-session login.
- Do not revoke legacy anon write permissions or apply an `auth.uid()`-only gate yet.
- Do not reset credentials or create Auth identities automatically.
- First provide and test a supported real-Auth/recovery path for every legitimate user, then verify user-to-profile mapping and authorization.

## Atomic cutover sequence

1. Complete the full writer inventory, including Apps Script and scheduled functions.
2. Build a server-side transaction contract against the disposable fixture, using the PR #74 contract as a target—not as evidence of production readiness.
3. Add tests for authenticated actor identity, owner/manager authorization, market/source invariants, quantity increase/decrease, duplicate product lines, concurrent edits, insufficient stock rollback, idempotent retries, and external-source exemption.
4. Implement an Auth migration plan and test sign-in/recovery without disabling the current fallback.
5. Update the browser edit and status-change callers to use the reviewed contract; keep Google Sheets/carrier/Star Network integration boundaries explicit.
6. Run CI and security rehearsals; inspect all diffs and generated SQL. No live migration, permission revocation, data repair, or deployment is part of these steps.
7. Only after the owner-approved release plan and a verified restorable backup: deploy in a controlled window, verify known safe probes and application workflows, and keep a tested rollback path.

## Acceptance criteria

- An order field edit and its inventory reservation/release either both commit or both roll back.
- Concurrent edits cannot oversell stock or double-reserve.
- Unauthorized employees cannot edit another employee's order or protected routing/source fields.
- Sheet/carrier updates cannot bypass the authoritative status/inventory contract.
- `star_network` orders never create local reservations and are not written back into the source system.
- Every legitimate employee retains a tested sign-in/recovery path before legacy write permissions are reduced.
- No historical stock/order reconciliation is run from aggregate estimates alone; cohort and product matching must be validated separately.

## Safety record

PR #74 is fixture-only. No production migration, production data/grants/RLS/Auth changes, paid Supabase project/branch, or deployment is authorized by this work. Vercel deployment attempts in the PR timeline hit the free daily deployment limit; do not upgrade or create paid resources to work around it.
