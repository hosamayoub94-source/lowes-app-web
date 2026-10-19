# Auth session readiness — Phase 0 execution and acceptance matrix

**Snapshot:** 2026-10-19  
**Target:** LOWE'S Staff App / Supabase project `lowes-attendance` (`fghdumrgimoeqsafdhhh`)  
**Status:** documentation/test plan only. Not production approval.  
**Depends on:** `20261019_inventory_remediation_execution_plan.md`, `20261019_p0_authorization_callsite_matrix.md`.

## Decision

**Do not disable the manual-session fallback or tighten inventory table access yet.** First make the real Supabase Auth session path reliable, add tested abuse protection to PIN verification, and prove that every active user who needs the Staff App can obtain a valid Auth JWT. The current client can mark a localStorage-only synthetic session as authenticated; that is not a Postgres Auth identity and must not be treated as one by RLS or SECURITY DEFINER functions.

This document defines a safe implementation and staging-test gate. It does not reset credentials, change the Edge Function, invoke login/RPC operations against production, or alter database policy.

## Evidence and current behavior

The following behavior was confirmed by reading `src/services/authService.js`, `src/context/AuthBoot.jsx`, and `supabase/functions/verify-pin/index.ts` on `main`. The production counts below come from the read-only audit already recorded in the related inventory plan; source review alone does not prove that every flow behaves this way in the live runtime.

1. The client POSTs `employeeName` and `pin` to `verify-pin`, authenticated with the public anon key. The function looks up one profile by employee name, blocks inactive profiles, and compares trimmed PIN strings.
2. After a correct PIN, `verify-pin` creates an Auth identity only if one is missing. For an existing identity, it does not check that the Auth password matches the current PIN. Provisioning is best-effort: an identity-provisioning failure can still be returned alongside `ok: true`.
3. The client then attempts `signInWithPassword`. If that fails for any reason, the client stores a manual session in localStorage and returns a synthetic session. `AuthBoot.jsx` restores such a session on cold start and the store can treat it as authenticated, despite there being no Supabase Auth JWT.
4. Manual sessions expire after seven days in client code. Expiry is not a server-side authorization check.
5. The client logs the first 20 characters of an access token as an activity-log `sessionId` after successful Auth login. That token-derived value is not required as a stable audit identifier and should be removed in a reviewed code change; audit logs must never store access/refresh tokens or their fragments.
6. The `verify-pin` handler has no visible server-side attempt limiter in the checked source. Its outer error handler returns `String(err)` in the response; unexpected internal error text should not be exposed to the caller.
7. `package.json` currently defines build/lint and Auth provisioning scripts but no dedicated test-runner script. The matrix below is an acceptance specification until automated tests are added; it must not be reported as a suite that has already run.

### Previously measured live counts (read-only)

- 50 profiles; 36 active.
- 35 active profiles had a matching Auth identity; one active profile did not.
- 24 active profiles had a recorded Auth sign-in in the preceding 30 days.
- All 50 `profiles.auth_id` values were NULL; 49 `profiles.id` values matched `auth.users.id`. Existing policy design must therefore be checked against the proven `profiles.id = auth.uid()` convention, not an assumed `auth_id` value.
- 76 manual-session login events across 10 distinct active users during the preceding 30 days, across admin, employee, sales-manager, and social-manager roles.
- 57 failed-login events in the same period. This count is not proof of an attack; it demonstrates that a server-enforced PIN-attempt control should be tested.

These counts are a snapshot, not a claim that account readiness has since improved.

## Required implementation sequence

### A. Add PIN verification abuse controls before exposing recovery at scale

Implement a server-side, atomic rate-limit strategy for the unauthenticated `verify-pin` path. It must not rely only on a browser timer or caller-supplied role. Use a reliable source identifier provided by the hosting/runtime boundary where available, alongside a normalized account identifier; do not trust arbitrary forwarded-IP headers from the client. Define limits and windows explicitly before testing rather than silently choosing values in this document.

Required behavior:
- Bound repeated guesses per account and per source, including distributed/concurrent requests.
- Use generic outward authentication-failure responses so account existence, inactive status, or PIN state is not unnecessarily disclosed to unauthenticated callers.
- Return no stored PIN, derived password, secret, Auth token, or raw internal exception text.
- Keep audit telemetry useful but minimal: outcome category, timestamp, and a non-secret correlation identifier. Never write the supplied PIN or credentials to logs.
- Do not permanently lock an employee out from a single source of bad traffic. Document cooldown/reset and administrator recovery behavior.
- If the limiter's backing store is unavailable, follow an explicit fail-safe rule; it must not silently become unlimited attempts.
- Preserve CORS and expected client error handling while using stable, non-sensitive error codes.

### B. Resolve Auth identity/password mismatch without silent privilege fallback

Do not automatically reset existing Auth passwords in this phase. First produce a dry-run reconciliation report using profile/Auth IDs and status flags only—no PINs, passwords, auth tokens, or unnecessary personal data.

For each active profile, report only:
- whether an `auth.users` identity exists for `profiles.id`;
- whether the standard synthetic email convention matches;
- whether a controlled, staging-only sign-in test obtains an Auth session whose user ID equals the profile ID;
- whether the profile remains active;
- the final state: ready, recovery required, or inactive.

Credential reconciliation must use a separately reviewed, authorized recovery path. A correct PIN and an existing Auth identity are not proof that the stored Auth password matches the current PIN. Do not disclose whether a particular PIN was correct in logs. Any password synchronization operation must be explicit, auditable, authorized, and tested with recovery/rollback behavior. Do not use a browser-supplied role or localStorage profile as authorization.

### C. Retire manual sessions only after the real-session path passes

In staging, the eventual target behavior is **fail closed** if PIN verification succeeds but a real Auth session cannot be created: show a clear recoverable error and do not mark the user as authenticated. Do not ship this behavior change until the recovery path has been verified for all active users who require access.

Before removing the fallback, verify all existing manual-session users can sign in successfully, clear stale manual sessions in a controlled fashion, and provide an owner-approved recovery path for any exception. A localStorage record is not proof of identity and must not authorize database operations.

### D. Audit metadata hygiene

Replace token-derived `sessionId` values with a non-secret correlation value (or omit the field). The same rule applies to Edge Function logs and test artifacts: no access/refresh token, PIN, derived password, anon/service-role secret, or raw credential request body.

## Acceptance matrix — staging only

Run through the actual UI and PostgREST with disposable test profiles and real Auth JWTs. Keep each test's expected result and observed result; do not mark a test passed from static code inspection alone.

| Case | Setup / action | Expected result |
|---|---|---|
| Missing fields / malformed JSON | Omit employee name or PIN; submit malformed JSON | Stable 4xx-style validation outcome; no stack trace, secret, or raw request body in response/logs |
| Unknown account / inactive account | Try test fixtures in each state | Generic outward auth failure; inactive profile never receives a session |
| Missing PIN / wrong PIN | Use a fixture with no PIN and one with an invalid PIN | No session, no profile secret returned, no internal detail; attempts recorded without PIN value |
| Correct PIN, no Auth identity | Verify in a disposable environment | Identity is created via the reviewed provisioning flow, and the client obtains a real Auth session; identity-creation failure does not become a successful synthetic login |
| Correct PIN, existing Auth password matches | Sign in with fixture | Real session returned; JWT subject/user ID equals `profiles.id`; profile is active |
| Correct PIN, existing Auth password is stale | Use a controlled staging fixture | Recovery-required result; no silent manual session and no unreviewed password reset |
| Auth API unavailable / timeout / bad credentials response | Inject a controlled failure after PIN verification | Clear recoverable error; no synthetic authenticated state in the final design; no credentials or token fragment logged |
| Provisioning fails | Force controlled staging failure for identity creation | No privileged fallback; actionable failure code and safe audit entry |
| Rate-limit boundary | Send attempts below, at, and beyond the predeclared threshold, including concurrent calls | Exact configured threshold is enforced server-side; no race permits excess attempts; documented cooldown/recovery works |
| Multiple-source attempts | Exercise account and source limits from controlled test clients | Both controls behave as specified; client-supplied forwarding headers cannot trivially reset limits |
| Cold start with valid Auth session | Reload after sign-in; allow token refresh | Session restored, correct profile reloaded, user stays signed in |
| Cold start with expired/absent JWT and stale manual cache | Seed an expired test cache or remove the session | No privileged authenticated state from localStorage; controlled sign-in/recovery required |
| Deactivated or deleted profile | Deactivate/delete staging profile with a session present | Protected operation denied; profile/session handling is explicit; no stale synthetic session authorizes reads/writes |
| Sign-out on one device | Sign out the test session | Local session ends; another device's unrelated session is not unexpectedly revoked |
| Audit privacy | Inspect logs for successful/failed test cases | No PIN/password/token or token prefix; only non-secret correlation ID and minimal outcome metadata |
| RLS/PostgREST distinction | Compare no JWT, real JWT, and manually fabricated client-store state | Server sees anonymous role without valid JWT; fabricated client state yields no additional database authority |
| Role/permission regression | Repeat with admin, manager, warehouse manager, sales manager, employee, plus extra- and denied-permission fixtures | Identity is real, permissions are evaluated server-side, and an explicit denial is not overridden by a non-admin role default |

### Active-user migration gate

- Reconcile all **36 active profiles**. The default target is 36/36 obtaining a real Auth JWT in staging with the expected identity mapping.
- For any exception, record only a pseudonymized profile reference, role, failure category, owner-approved recovery action, and due date. Do not move the table-grant/RLS cutover forward while an active user still depends on the anonymous manual-session path unless an explicit, documented decision accepts the operational impact and provides recovery.
- Include each currently used role and special stock-permission combinations in the role-based sampling, in addition to the full active-profile reconciliation.
- Re-run the aggregate manual-session audit during the pilot. The post-change acceptance target is zero new manual-session logins and no unexpected increase in failed logins. Existing historical events remain history; do not delete or rewrite them to make the count look clean.

## Evidence to attach to the implementation PR

1. A redacted dry-run reconciliation report with counts for identity present/missing, session test passed/failed, and recovery needed.
2. Automated unit/integration tests for attempt limiting, stable response behavior, profile-to-Auth ID binding, token/log redaction, no-manual-fallback behavior, and role regressions.
3. Staging PostgREST evidence for no-JWT versus real-JWT outcomes.
4. A pilot record showing active users obtained real sessions and the manual-login event count stopped increasing.
5. Re-run build and lint, and any added tests; report the actual command outputs.
6. Rollback/recovery procedure that restores login usability without restoring anon database write access as an implicit workaround.

## Deployment gate

- No production login changes until a separate staging environment or faithful restorable clone has been confirmed.
- No production credential resets, Auth identity modifications, SQL/RLS/grant changes, RPC calls, or Edge Function deploys as part of this documentation/test-plan task.
- Phase 0 sign-off is required before inventory mutation RPC hardening or broad-grant removal. Changing only the table policies first risks breaking employees still using the manual session; retaining the fallback after tightening policies must not be mistaken for a successful authenticated session.

**Current outcome:** source review and test planning only. The acceptance cases above have not yet been executed, and production readiness is not established.
