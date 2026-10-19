# Edge Function Authentication Review — track-yurtici

**Date:** 2026-10-19  
**Scope:** Source/configuration review only; no invocation or deployment.  
**Production project:** `fghdumrgimoeqsafdhhh`

## Confirmed source behavior

Reviewed `supabase/functions/track-yurtici/index.ts` on the default branch.

- The handler accepts `OPTIONS`, then proceeds for other methods without an explicit method allow-list.
- Before creating a Supabase client with the service credential, the handler does not validate a caller JWT, an admin role, or a function-specific shared secret.
- It queries active Turkey orders using the service credential and can update `orders.status`, `tracking_number`, `updated_by`, and timestamps.
- A status change also writes order-history records, may create notifications, sends push/WhatsApp notifications, and calls `sync-order-to-sheet`.
- The comments explicitly describe both a manual request (`{manual:true}`) and a scheduled request with no body. This means an authentication gate must preserve a legitimate scheduled caller and any intended UI flow.
- CORS uses `Access-Control-Allow-Origin: *`. CORS is not authentication and does not prevent non-browser callers.

## Configuration observation

The repository's `supabase/config.toml` contains explicit `verify_jwt = false` entries for several functions, but **does not contain an explicit `[functions.track-yurtici]` section** in the reviewed file.

Prior production metadata reported that the deployed `track-yurtici` function has `verify_jwt=false`. This is a configuration/source drift to reconcile. Do not assume changing the local configuration alone changes production, or that a redeploy is safe.

## Risk

If the deployed function is reachable without JWT validation and without an application-level caller check, an unauthenticated caller may be able to trigger privileged order-tracking work. The handler uses service-role access and changes business state, so this is a high-priority authorization concern.

This source review is **not** proof that an external party successfully invoked the function or changed any production order. No live request was sent and no order data was queried as part of this review.

## Required caller inventory before remediation

Do not turn on JWT verification or add a secret check blindly. First identify and test each intended caller:

1. Frontend UI: find the exact invocation site and determine whether it has a user session; verify required user roles and intended order scope.
2. Scheduled job: identify the actual scheduler (Supabase Cron, database cron, GitHub Actions, Apps Script, or another external scheduler), its configured URL/headers/body, and the current secret storage location. The source comment alone does not identify the live scheduler.
3. Any manual/admin operation: identify who may trigger it and what authorization is expected.
4. Downstream functions: verify that service-role-authenticated internal calls remain valid and that errors are observable rather than silently swallowed.

## Safe remediation design to test outside production

- Prefer authenticated user requests with server-side role authorization and a narrow operation scope for interactive UI calls.
- For scheduler-to-function calls, use a dedicated high-entropy secret stored only in managed secrets, compare it server-side, and never expose it in frontend code or logs. Rotate it with a coordinated scheduler update.
- If separate caller types share this endpoint, use explicit, auditable paths or a well-defined authentication scheme; do not trust a JSON flag such as `manual:true` as proof of authority.
- Restrict allowed HTTP methods and return generic errors without leaking credentials or internal details.
- Add negative tests for missing/invalid credentials, unauthorized users, unsupported methods, and cross-role invocation; add positive tests for the scheduled caller and permitted admin workflow.
- Deploy only after caller inventory, tests, rollback instructions, and an explicit production release approval.

## Current status

**Open — do not deploy an authentication change yet.** The repository source confirms a privileged handler without an in-handler caller check, but the exact production caller inventory has not been established. This document changes no application behavior and does not authorize production changes.
