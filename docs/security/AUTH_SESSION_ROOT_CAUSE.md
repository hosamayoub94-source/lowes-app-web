# Why five employees ran on "manual sessions" — root cause, repair, migration path

**Date:** 2026-10-25 · evidence: production catalog + `activity_logs` + Supabase gateway logs (read-only) · no PIN/password value appears below.

## 1. What a "manual session" is (PROVEN, code)
`src/services/authService.js` `signInWithPin`:
1. `verify-pin` (Edge Function) proves the PIN against `profiles.pin`.
2. The browser then calls Supabase Auth `signInWithPassword(<profileId>@auth.lowes-pro.local, "lp:<pin>")`.
3. **If step 2 fails for any reason, the old code silently stored `{profileId, employeeName}` in `localStorage` and carried on** — a "manual session". It has no JWT, so every database call from that browser runs as the public `anon` role. Its role/permissions are whatever the browser says.
So manual session ⇔ (PIN correct) ∧ (Auth password ≠ `lp:<current PIN>` or no Auth identity).

## 2. Per-person evidence (names are the five flagged by the audit)
| Employee | Manual logins (last 16 d) | First authenticated login after | Auth identity today | Auth password = `lp:<current PIN>` today |
|---|---|---|---|---|
| Hamza Nsr | 8 (9–18 Oct) | 21 Oct | exists, active | **yes** (checked in SQL with `crypt()`, boolean only) |
| Diana Hasan | 2 (13 Oct 06:45, 06:48) | 13 Oct 06:55 (7 min later) | exists | yes |
| Fatima Ayoub | 3 (9, 16, 16 Oct) | 23 Oct | exists | yes |
| Hassna Deeb | 1 (11 Oct) | 18 Oct | exists | yes |
| Bushra Saidy | 2 (12, 19 Oct) | **none yet** (last login 19 Oct was manual) | exists, last Auth sign-in 23 May | yes (Auth row updated 20 Oct) |

* All 37 active profiles now have an Auth identity, the synthetic e-mail convention matches, and **every** Auth password matches `lp:<its PIN>` (37/37). So the condition that created manual sessions is currently false for everyone.
* Only Bushra's *latest* login is still a manual one. Her stored manual session expires 7 days after 19 Oct (`getManualSession`, 7-day TTL) i.e. on 26 Oct, and her Auth password already matches, so her next login is a real session.
* In the last 24 h the gateway shows 117 successful password grants and **1** failed one: the problem is not recurring at scale.

## 3. Why the passwords were wrong (what is PROVEN and what is only INFERRED)
* PROVEN: the mismatch mechanism (§1). PROVEN: Auth rows of these users were rewritten on 20–25 Oct (`auth.users.updated_at`), after their manual logins, and now match — something repaired them (an operator/script or the pin-change flow).
* PROVEN: before D-090 step 2 (27 Sep) PINs could be changed by paths that wrote only `profiles.pin` (`manage-employee.reset_pin`, `admin-reset-pin`, the SQL function `admin_reset_pin`, direct table edits). Only `pin-change` updates both.
* NOT PROVABLE from retained data: *which* of those events desynchronised each individual. The gateway log window is 24 h; the Auth audit table is empty. Diana's pattern (two failures, success 7 minutes later) is consistent with an admin repair in between; Hamza's eight consecutive failures with a long-standing mismatch.
* The design flaw underneath, independent of the individual event: **the Auth password is a function of the PIN, but nothing kept them equal**, and the client treated "cannot get a session" as "log in anyway as anon".

## 4. Repairs (all prepared in the repo, tested locally; production status in `REMEDIATION_LOG.md`)
| Layer | Change | File |
|---|---|---|
| Login gateway | after the PIN is proven, `verify-pin` compares the stored Auth password with the expected one **inside the database** (`auth_password_matches`, bcrypt compare, no secret leaves) and repairs it if different; creates the identity if missing; reports `authIdentity: exists/created/repaired/failed/banned` | `supabase/functions/verify-pin/handler.ts`, `docs/security/proposed/20261027_login_gateway.sql` |
| PIN changes | in `auth_mode='derived'` the Auth password is independent of the PIN, so `pin-change` only writes `profiles.pin` and **cannot** desynchronise anything. In `compat` mode (default) behaviour is unchanged. Recovered the missing `pin-change` source into the repo. | `supabase/functions/pin-change/*` |
| Client | `signInWithPin` retries once and, if there is still no real session, **fails with a clear message instead of creating a manual session** (`ALLOW_MANUAL_SESSION_FALLBACK = false`); any stored manual session is discarded at boot | `src/services/authService.js` |
| Direct-door brute force | `derived` mode hands out a per-user HMAC credential only after the rate-limited PIN check, so the public Auth endpoint can no longer be attacked with 4-digit PINs | same as above |

## 5. Safe transition (preserves identity, role and permissions; creates no duplicates)
Identity = `profiles.id` = `auth.users.id` (verified 51/51). Nothing in this plan changes an id, a role, `extra_permissions`, a PIN or an `is_active` flag.
1. Apply `20261027_login_gateway.sql` (additive: secrets table, limiter, `auth_password_matches`). `verify-pin` keeps working as before until redeployed.
2. Deploy `verify-pin` (self-repair + limiter, `compat` mode). From now on a drifted password is repaired at the next login — the five (and anyone else) cannot fall into a manual session any more.
3. Release the client (manual sessions off). Confirm in `activity_logs` that for 7 days there are **0** `manual_session` logins.
4. Only then anon lockdown batches (`20261027_anon_lockdown_*`), one at a time with the error-monitoring query in the runbook.
5. Later, when every device runs the new client: `update internal_secrets set secret='derived' where name='auth_mode'` — each user's Auth password migrates silently at their next login (the derived value is returned by `verify-pin` after the PIN check). Roll back by setting it back to `compat`.
No account is created twice: `createUser` is only called when `getUserById` says the id has no Auth row, and the id is the profile id (a duplicate id is rejected by Auth).

## 6. What was tested
`test-verify-pin-handler.mjs` 41 checks, `test-pin-change-handler.mjs` 24 checks (fakes; every branch: wrong/inactive/no-PIN, limiter limited/unavailable/disabled, identity exists/created/repaired/failed/banned, derived-mode migration and PIN change, no PIN in responses) · SQL for the limiter and `auth_password_matches` is covered by `test-login-gateway-sql.mjs`. **Not possible without a staging project:** a real GoTrue sign-in with the repaired/derived password (no staging project exists; creating one costs money and needs the owner's approval; creating a synthetic account on the production Auth was deliberately not done).
