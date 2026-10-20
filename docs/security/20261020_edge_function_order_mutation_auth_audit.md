# Employee App — Edge Function order-mutation authentication audit

**Date:** 2026-10-20  
**Target project:** `lowes-attendance` (`fghdumrgimoeqsafdhhh`)  
**Scope:** source review of order/tracking/sheet Edge Functions plus read-only aggregate edge-log evidence.  
**Status:** documentation / remediation design only. No Edge Function deployed, no secrets read or changed, no production database write, and no paid Supabase project or branch created.

## Executive finding

Several Edge Functions use a service-role Supabase client to read or mutate `orders`, but their source does not authenticate the *caller* before entering those service-role operations. A service-role client inside an Edge Function is not proof that the inbound request is authorized: the handler must separately verify the caller's trusted credential/role, or be reachable only through an authenticated server-to-server route.

The highest priority is the three shipping polling handlers configured with `verify_jwt = false` and no visible custom request-authentication check before the service-role client is created: `track-babel`, `track-ptt`, and `track-karam`. They support a full polling path that updates order status and tracking, writes status history/notifications, and may call `sync-order-to-sheet`; Karam also includes debug search modes. `retry-failed-syncs` also has `verify_jwt = false` and starts its retry worker without a caller gate. The source for `sync-order-to-sheet` documents deployment with `--no-verify-jwt`; its handler accepts an `orderId` and uses a privileged client without an explicit caller gate, and the read-only logs show requests arriving with the `anon` role. Its effective deployed `verify_jwt` setting should still be confirmed from deployment metadata before making a claim about that specific setting.

This source/log review shows an authentication-control gap, not proof that an attacker exploited it. The logs include intentional calls from authenticated staff and service-role integrations; the aggregates below deliberately do not include raw IPs, authorization values, request bodies, phone numbers, or order/customer data.

## Source-level endpoint inventory

| Endpoint | Config/source evidence | Operations that can occur | Risk and next treatment |
|---|---|---|---|
| `track-babel` | `supabase/config.toml` sets `verify_jwt = false`; handler creates a service-role client before checking a caller secret. No caller gate is visible before the tracking lookup or bulk scan. | Public `awb` lookup path; otherwise scans active Syria/Babel shipments and updates status, history, notifications, and sheet sync. | **P0 — caller authorization missing in source.** Separate read-only public lookup from bulk mutation. Require a private scheduler credential for the bulk route. |
| `track-ptt` | `verify_jwt = false`; handler creates a service-role client before an explicit caller-auth check. | Public `trackingNumber` lookup; otherwise scans active Turkey/PTT shipments and updates order status/history/notifications/sheet sync. | **P0 — caller authorization missing in source.** Same split-route design as Babel. |
| `track-karam` | `verify_jwt = false`; handler creates a service-role client before an explicit caller-auth check. | Public tracking lookup; debug modes `debugPhone`, `debugPhones`, `debugCount`; otherwise links tracking numbers and polls shipments, updates order status/history/notifications/sheet sync. | **P0 — caller authorization missing in source.** Remove or tightly gate debug modes; separate public tracking lookup from server-only linking/bulk polling. |
| `retry-failed-syncs` | `verify_jwt = false`; creates a service-role client and scans failed order syncs, with no visible inbound caller-auth check in the handler. | Retries recent non-terminal order syncs into Apps Script. | **P1 — unauthenticated job trigger.** Require a private scheduler credential and limit method/body; keep the same trusted credential on the cron call. |
| `sync-order-to-sheet` | Source deployment comment calls for `--no-verify-jwt`; accepts an `orderId` and uses a privileged client without an explicit caller-auth check in the shown handler. It updates `last_synced_at` / sync status and sends order data to Apps Script. Effective deployed JWT setting not confirmed by this source review. | Single-order external sheet synchronization and related sync bookkeeping. | **P1 — caller must be authenticated independently of the service client.** Require a server-only internal credential for mutation calls; if client-triggered use must remain, split out a narrowly scoped authenticated request broker. |
| `sheet-to-app` | `verify_jwt = false`; does have a body-token check, but source contains hard-coded fallback tokens alongside environment-provided tokens. | Accepts a sheet webhook; can create/update orders from the sheet, status/tracking fields, and bulk imports. | **P0 — secret rotation required.** Remove source fallback tokens only after coordinated secret rotation on both Supabase and Google Apps Script for all markets; verify old tokens fail before closing the change. |
| `track-yurtici` | Not listed in the `verify_jwt = false` section reviewed here, so this review does not classify it as platform-JWT-disabled. Source uses service-role operations but does not visibly restrict an authenticated caller to a specific staff role in the handler. | Updates Turkey shipment statuses, history, notifications and sync, using the tracking provider. | **P1 — role/operation scope needs validation.** Confirm the deployed JWT setting; require an approved server/scheduler role for bulk poll and separate any intended user-facing lookup. |
| `pull-star-orders` | Source contains an explicit bearer check against its service secret before running the pull. | Reads a projection from the Star Network bridge and creates/updates mirror orders. | Existing explicit server-caller gate is stronger than the endpoints above. Preserve it; do not change its external-source stock exemption as part of this hardening. |

A CORS header such as `Access-Control-Allow-Origin: *` is not authorization. The service-role client used inside a handler bypasses ordinary caller RLS decisions, so caller authorization must happen before a mutating operation starts.

## Read-only runtime evidence (last 24 hours)

The query ran against `function_edge_logs` from **2026-10-19 09:55 UTC through 2026-10-20 09:55 UTC** and returned only endpoint path, HTTP method, recognized JWT role categories, response status, and counts.

| Endpoint | Aggregate observed | Interpretation |
|---|---:|---|
| `track-karam` | 208 POSTs with `authenticated`, 11 POSTs with no recognized authorization role; 224 OPTIONS | Real client-authenticated and role-empty invocations both occurred. No proof of abuse from counts alone. |
| `track-ptt` | 206 POSTs with `authenticated`, 11 POSTs with no recognized authorization role, 2 authenticated POSTs with 504; 221 OPTIONS | Same source-level gate gap; two timeouts also warrant reliability review but are not proof of malicious traffic. |
| `track-babel` | The aggregate path query returned no matching entries during this window. | No request count from this window; absence is not proof the function is unreachable or safe. |
| `track-yurtici` | 192 POSTs with `authenticated`, 38 with `service_role`, 9 with no recognized authorization role; 224 OPTIONS | Multiple caller classes invoke the route. Keep the public-lookup vs bulk-mutation distinction in the design. |
| `retry-failed-syncs` | 133 POSTs with `service_role`, status 200 | Observed cron/integration-style calls were service-role. That does not replace a source-level caller gate because the handler accepts its service key internally. |
| `sync-order-to-sheet` | 72 POSTs with `anon`, 67 with `service_role`, plus 72 OPTIONS | Strong evidence the function is called by both browser/anon-context code and a trusted internal route; the current single endpoint mixes those paths. |
| `sheet-to-app` | 26 POSTs with `anon`, 8 POSTs with no recognized authorization role; status 200 | Consistent with webhook calls through the token gate. The source fallback token problem remains irrespective of the observed status code. |

No raw IP addresses, request bodies, tokens, phone numbers, or order/customer records were queried or retained. `response_status=200` is not proof the requested business operation was authorized or completed correctly; some handlers encode errors in JSON with HTTP 200.

## Recommended rollout — preserve existing shipping and sheet workflows

### Gate A — inventory real callers before altering auth

1. For each endpoint, identify the cron job, browser call, Apps Script caller, shipping-provider lookup, and internal service-role caller. Preserve the intended caller contract explicitly.
2. Add separate routes or an operation discriminator that is validated server-side: a read-only public tracking lookup must not implicitly grant access to a bulk polling route.
3. For private bulk jobs, require a rotated high-entropy secret or an equivalent private server identity in the handler. Compare the bearer in constant time where practical; reject absent/invalid credentials before constructing/running the mutating work. Do not accept the public anon key as the scheduler credential.
4. Keep service credentials server-side. Do not add secrets to Vite/browser environment, URLs, logs, response bodies, or committed code.
5. For `sheet-to-app`, coordinate rotation of all existing market tokens across Supabase secrets and Apps Script before deleting source fallbacks. Add regression tests for accepted current token, rejected old token, rejected missing token, single update, bulk import, race-existing, and soft-deleted order protection.

### Gate B — test contracts before deploy

- Valid cron/server credential can run a bulk shipment update or retry; no credential and wrong credentials are rejected before external provider/database work.
- Ordinary authenticated staff cannot use a bulk polling endpoint merely because they have a valid Supabase JWT.
- Public tracking lookup returns only the approved tracking projection and cannot accept a mode that updates orders, links shipments, emits notifications, or triggers sheet sync.
- Karam debug-phone modes are disabled in production or have a separate explicit admin-only gate and data-minimized responses.
- Sheet webhook rotation keeps all active Syria/Turkey/UAE Apps Script integrations working, while old/empty tokens fail.
- Existing status mapping, return guards, source/brand exclusions, sheet retry bookkeeping, notification/history behavior and cron schedules remain intact.
- Test OPTIONS/CORS separately; do not mistake CORS behavior for authorization.
- Confirm deployed `verify_jwt` metadata for `sync-order-to-sheet` and `track-yurtici`; source configuration alone cannot prove which revision is serving now.

### Gate C — controlled rollout only

1. Deploy auth gates in a staged, coordinated release after cron and Apps Script credentials are rotated and proven.
2. Verify one approved invocation per endpoint and one rejected unauthenticated probe, with redacted logs only.
3. Confirm production cron remains configured and successful; the read-only catalogue currently shows an active `track-yurtici-30min` job. The other scheduler/caller arrangements need separate mapping.
4. Only after successful live validation, remove legacy fallback tokens and obsolete public mutation paths. Do not turn off valid public tracking lookup if shipping screens still depend on it.
5. Continue the separate orders/stock hardening only after real Auth session readiness and complete order-status call-site migration. This Edge Function work does not itself fix `orders` RLS or inventory grants.

## Scope and safeguards

This is a source + aggregate log audit, not a confirmed exploitation report and not proof that every deployed revision matches the repository. No code runtime behavior, database objects/data/privileges, Auth identities, credentials, Edge Function deployments, cron jobs, or Apps Script settings were changed by this audit. The immediate deliverable is a ranked, tested rollout plan; implementation should be split into small PRs with tests and coordinated secret rotation.
