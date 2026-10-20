# Order-status writer inventory and cutover matrix

**Date:** 2026-10-20  
**Scope:** `lowes-attendance` / employee app order workflow  
**Purpose:** identify every confirmed source-level route that can create an order, change `orders.status`, change order items/market/handler, or soft-delete/restore an order before stock RLS/ACLs are tightened.  
**Status:** static source review. No production writes or deployment were performed.

## Summary

The order reservation fixture has now been tested against atomic status transitions, exact reservation deltas, same-order races, cross-order oversell, transfer contention, audit rollback, source exemptions, item edits, and owner/fulfillment authorization. **The runtime application has not been switched to that contract.**

A database function that checks only `auth.uid()` is not sufficient for all writers: some order writes come from browser sessions using the anon key, while Google Apps Script and shipping/integration Edge Functions use a service-role client. Service-role callers must use a distinct, explicitly trusted integration contract; do not assume `auth.uid()` is present for these calls.

The cutover must also retain the rule that `star_network`, `uae_sheet_import`, and non-Lowe's brands are not deducted twice. They still need status synchronization and a way to release any historical reservation that exists from before the order became exempt.

## Confirmed status/order writer matrix

| Writer / call site | Current write | Identity / trust boundary | Stock consequence today | Required cutover |
|---|---|---|---|---|
| `src/screens/OrdersScreen.jsx::handleStatusChange` (around lines 3333–3349) | Direct `supabaseAnon.from('orders').update({status,...})` | Browser anon key + app/localStorage session model | Calls `syncOrderStock()` after the status write; the call is not awaited and the helper swallows errors. Status can commit while stock is not reconciled. | Route through an authenticated order-transition RPC; keep order status, reservation diff, and audit rows in one transaction. Publish notifications/accounting/sheet sync only after success. |
| `src/screens/OrdersScreen.jsx::advanceBatch` (around lines 3406–3410) | Direct anon-key status update in a loop | Browser anon key; client-supplied actor label | The returned Supabase `error` is not checked before the UI proceeds; stock sync is fire-and-forget. | Use a per-order RPC returning success/failure. Stop treating a resolved client promise as proof of a successful write. Preserve sequential Apps Script synchronization separately from the database transaction. |
| `src/screens/OrdersScreen.jsx::handleSave` (around lines 3680–3690 and 3740 onward) | Direct anon-key insert/update of order form fields, including `items`, `status`, `market`, `brand`, and handler fields as present in the form; then calls `syncOrderStock()` | Browser anon key; patch is assembled client-side | Editing an already-reserved order's items/quantity/handler/market can change the persisted order first. The current state-only `syncOrderStock()` check can see “already reserved” and skip exact item reconciliation. | Use an allowlisted order-edit RPC that reads the old row, applies the validated patch and reconciles the desired per-product/per-warehouse reservation diff in the *same transaction*. Do not accept caller-supplied before-images or stock deltas. |
| `src/screens/OrdersScreen.jsx::handleDelete` + `src/services/orderSyncService.js::softDeleteOrder` (around lines 3757–3759 / 126–130) | Caller asks stock sync for `cancelled`, then a separate anon-key update sets `deleted_at` and `status='cancelled'` | Browser anon key; separate requests | The release can commit while soft-delete fails, or soft-delete can succeed if a different caller bypasses the preceding sync. | Move soft-delete/cancel and reservation release into one trusted function; keep the operational audit and delete markers atomic. |
| `src/services/orderSyncService.js::restoreOrder` (around lines 137–142) | Clears `deleted_at/deleted_by`; leaves persisted status unchanged; syncs to the sheet | Browser anon key | It does not itself recompute stock. Current soft-deleted orders normally remain `cancelled`, which is not a deducted status, but this behavior should be explicit. | Restore through an authorized RPC with explicit semantics: restoration of visibility must not automatically reserve stock unless the resulting persisted status/items require it. |
| `supabase/functions/sheet-to-app/index.ts` (around lines 150–235, 270–370) | Service-role inserts; direct status updates from sheet; bulk-import updates; presence reconciliation sets missing sheet orders to `cancelled` and soft-deletes them | Shared Edge Function with service-role client. The handler validates a sheet token; the source also contains temporary hard-coded token literals documented as a separate security TODO. | Can change status to `returning`, `returned`, `not_received`, `cancelled`, or a deducted status without executing stock reconciliation in the same transaction. | After the existing sheet-token validation, invoke a narrowly defined integration transition/edit contract. The server-side contract must verify the integration origin, use an enumerated source, and atomically reconcile stock + status/delete markers. Keep the external token migration as a separately coordinated task. |
| `supabase/functions/pull-star-orders/index.ts` (around lines 425–485) | Service-role insert/update/cancel for orders mirrored from Star Network | Scheduled/integration Edge Function; persisted source is `star_network` | The source is deliberately exempt from employee-app stock deduction. The bridge may update `waiting` → `pending` or cancel an untouched mirror. | Preserve source exemption and no-double-deduction. If changing the mirrored record to an external source leaves an old positive reservation, the contract must release it; otherwise no stock movement should occur. |
| `supabase/functions/babel-webhook/index.ts` | Service-role status update triggered by a Babel webhook; maps a signed event to status, then writes history/notifications/sheet sync | `verify_jwt=false`; handler verifies a signature derived from AWB, event type, and `BABEL_WEBHOOK_KEY` before looking up the order | Direct status update; `DeliveryFailed`/`ReturnedToSender` can move a previously deducted order to `not_received`/`returned` without an atomic reservation release | Preserve signature validation, but route accepted status transitions through the trusted integration contract so stock + audit + status commit together. |
| `supabase/functions/track-babel/index.ts`, `track-karam/index.ts`, `track-ptt/index.ts` | Service-role status updates from carrier tracking; mappings include delivered, returning/not-received and other carrier states | Carrier polling Edge Functions | Delivered remains a deducted state; new `returning`/`not_received` states are not deducted by the app contract but currently update status directly without a transactional release. Existing `RETURN_GUARD` protects already-manual return/terminal states, not the incoming transition into them. | Each accepted carrier status change must call the same trusted integration transition contract. Preserve each carrier's status mapping, return guard, history, notification, WhatsApp and sheet-sync behavior around the committed result. |
| `supabase/functions/track-yurtici/index.ts` | Service-role status updates through SOAP and public tracking paths; can also update tracking metadata | Carrier polling Edge Function | Same reservation issue for transitions into `returning`/`not_received`; some branches also update tracking metadata when status is unchanged. | Route only an actual accepted status change through the transition RPC; tracking-only updates remain a separate allowlisted metadata operation. |
| `supabase/functions/create-babel-shipment/index.ts`, `create-yurtici-shipment/index.ts` | Service-role updates to tracking/shipment metadata | Shipment creation Edge Functions | Reviewed write snippets update tracking number, cargo key/account, shipping company and timestamps, not order status. | Keep these as metadata-only operations, with an explicit allowlist; do not accidentally grant them order-status or inventory authority. |
| `supabase/functions/sync-order-to-sheet/index.ts` and `src/services/orderSyncService.js::syncToSheet` | Updates sync flags/error timestamps and sends persisted order status to the sheet | Service-role Edge Function / browser helper | These are mostly synchronization metadata writes, not the authoritative order-status transition. A sheet-side echo may later return through `sheet-to-app`. | Keep status-transition authority in one transaction boundary; make sheet echo/idempotency explicit so it cannot trigger a second reservation or hide an external status change. |

## Stock state the migration must preserve

`src/services/warehouseService.js` defines stock as deducted for:

`preparing`, `ready`, `motor_prep`, `at_center`, `shipped`, `on_way`, `special_delivery`, `motor`, `prepaid`, `delivered`, and `settled`.

States such as `pending`, `waiting`, `not_received`, `returning`, `returned`, and `cancelled` are not deducted. Therefore, any writer that moves an order from a deducted state to one of these non-deducted states must release the net reservation in the same transaction as the accepted status change.

The target behavior is not “subtract on every update”. It is:

1. Lock the persisted order row.
2. Re-check caller authorization and the market's allowed status.
3. Derive the desired reservation map from the persisted/validated order items, brand, source, market, and permitted seller warehouse.
4. Compare with the existing reserve-minus-release ledger grouped by product and warehouse.
5. Apply only the difference with conditional non-negative stock guards, write audit movements, and persist the status/order edit atomically.
6. Keep source-exempt orders out of the stock ledger and release any old reservation if a row transitions into an exempt path.
7. Roll back order fields, stock, and audit together on shortages, malformed tracked quantities, authorization failure, or audit failure.

The fixture PR #68 now exercises exact per-product reservation differences, same-status item edits, quantity increase/decrease/removal, final cancellation, and a status that remains `preparing` while the source becomes `star_network`. It remains fixture-only; it is not called by the live app.

## Integration caller design constraint

A browser Auth RPC and a service-role integration RPC are different trust boundaries. The current service-role integrations do not automatically have a human `auth.uid()`. Do not “solve” that by accepting arbitrary client-provided `performed_by`/actor strings or arbitrary status deltas.

Before cutover, design and test:
- a user-scoped RPC for real Auth JWT callers, with active-profile, role/default permission, extra/denied permission, owner/fulfillment and market-status checks;
- a narrow service-only integration entry point for trusted Edge Functions, with a small enumerated writer/source contract and explicit per-source rules. Keep tracking metadata-only functions from gaining stock-mutation authority by default;
- idempotency/history behavior when Apps Script echoes a status that the app just wrote;
- tests that browser status calls, sheet updates, each tracker path, and Star Network import do not double-reserve or leave stale reservations.

**Blockers remain:** current manual-session fallback users still operate without a database-verifiable Auth JWT; several production writers bypass stock reconciliation; and live stock already has negative balances and stale reservation discrepancies. Do not apply a blanket table `REVOKE`, deploy a new RPC, reset passwords, or auto-correct historic quantities as part of this static audit.


## Live deployment parity and unauthenticated tracker audit — 2026-10-20

A read-only Supabase function inventory and deployed-source retrieval was compared with repository `main`. These active entrypoints matched their checked-in source exactly after normalizing CRLF line endings:

| Deployed function | Active version | Gateway `verify_jwt` | Source parity |
|---|---:|---|---|
| `sheet-to-app` | 54 | false | exact |
| `pull-star-orders` | 23 | true | exact |
| `track-yurtici` | 72 | false | exact |
| `track-babel` | 40 | false | exact |
| `track-karam` | 44 | false | exact |
| `track-ptt` | 39 | false | exact |
| `babel-webhook` | 21 | false | exact |

This confirmed the dangerous behaviors below are in the active deployed versions, not just an outdated local file:

- `track-yurtici`, `track-babel`, `track-karam`, and `track-ptt` have `verify_jwt=false`. The batch/poll paths do not validate a user JWT or a dedicated poll secret before using a service-role client to query/update orders. In particular, absent/non-JSON request bodies fall through to batch polling for Babel/Karam/PTT; `track-yurtici` runs its batch path without a request mode check.
- `track-karam` version 44 has publicly reachable `debugPhone` and `debugPhones` request-body branches before the normal batch path. The single-phone branch returns matching tracking number/date/status data for a caller-supplied phone number. No app call site for either debug branch was found in the route/screen source review. These debug routes have therefore been removed from the repository branch accompanying this document, with a CI source-contract test. **The active deployed v44 remains unchanged until a separate approved deployment.**
- `track-babel` and `track-karam`/PTT offer single-number lookup routes as well as batch modes. The lookup modes do not themselves write `orders`, but reveal shipment status/timeline data for a supplied tracking number; the batch modes write statuses using service-role privileges.
- `sheet-to-app` also has `verify_jwt=false`, but it validates a separate sheet token in handler code. It still contains documented temporary hard-coded token literals, so its external token rotation is a separate coordinated change.
- `babel-webhook` has `verify_jwt=false` but verifies an event signature with `BABEL_WEBHOOK_KEY` before accessing the order. This is a different trust pattern from the unguarded tracker batch modes.

### Containment and rollout boundary

1. The first low-risk source change removes the unused public Karam phone-debug routes only. It does not deploy to Supabase and therefore does not yet contain the active v44 endpoint.
2. Before disabling public batch polling or switching gateway JWT checks on, Phase 0 must establish real Auth sessions for manual-session users and all valid cron/integration callers must be moved to a reviewed non-public invocation path. The OrdersScreen currently calls these endpoints using the browser session, while a legacy manual PIN session has no database-verifiable JWT; a blanket gate can break current staff workflows.
3. The required fix is a split: verified user-triggered poll/lookups with user-scoped authorization, and a server-only batch/cron entrypoint with a dedicated secret/trust contract. Keep the service-role key and poll secret out of browser code.
4. Deploy changes only after authenticated caller tests and real cron invocations are verified. No secrets or Supabase functions were changed by this audit.

This finding is separate from the order reservation atomicity bug: even if stock reconciliation is moved into a function, a public unauthenticated caller must not be allowed to invoke it indirectly through a service-role tracker endpoint.
