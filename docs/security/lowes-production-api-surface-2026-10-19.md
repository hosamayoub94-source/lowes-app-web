# LOWE'S production API surface — read-only follow-up

**Checked:** 2026-10-19  
**Project:** `lowes-production` (`kesoqnwyydycuyifqfhl`)  
**Actions:** metadata/catalog reads only. No function was invoked, no source was deployed, and no production data was changed.

## Edge Functions with platform JWT verification disabled

The Supabase deployment metadata reports `verify_jwt=false` for these active functions:

- `track-order` (v18)
- `whatsapp-notify` (v17)
- `stripe-checkout` (v17)
- `api-orders` (v18)
- `api-inventory` (v18)
- `send-push` (v19)
- `weekly-report` (v18)
- `growth-nudges` (v18)
- `whatsapp-webhook` (v12)
- `whatsapp-send` (v22)
- `whatsapp-upload-media` (v8)
- `whatsapp-delete-conversation` (v11)
- `whatsapp-status-callback` (v7)

This is an inventory of endpoints whose gateway does not enforce a Supabase user JWT. It is **not**, by itself, proof of a vulnerability: webhooks and server-to-server callbacks may legitimately disable JWT verification, but must authenticate requests through provider signatures, shared secrets, or another appropriate mechanism. Each handler needs source review and caller mapping before any configuration change. Do not simply turn JWT verification on across this list; that can break legitimate webhooks and integrations.

## SECURITY DEFINER functions

Read-only catalog checks found:
- 12 SECURITY DEFINER functions in `public` executable by `anon`.
- 13 executable by `authenticated`.
- 5 SECURITY DEFINER functions without a fixed `search_path`.

The following functions were confirmed executable by `anon` in the catalog; this list is a review queue, not a claim that each one is exploitable:

- `auth_is_admin_tier()`
- `auth_is_fulfillment_tier()`
- `auth_is_group_supervisor_of(text)`
- `auth_my_app_id()`
- `auth_my_role()`
- `can_manage_wallet(text)`
- `guard_app_users_insert()`
- `login_email(text)`
- `rls_auto_enable()`
- `star_bridge_marketers(text[])`
- `star_bridge_orders(text[], timestamptz, integer)`
- `sync_profile_role_from_app_users()`

Prioritize source review for functions that return user/role data, handle login, manage wallets, bridge marketer/order data, or perform writes. Trigger functions that appear in this list may be intended for trigger-only use; if so, direct EXECUTE grants should be reviewed while preserving trigger operation.

## Immediate review order

1. Inspect each listed Edge Function source and identify intended caller, signature validation, authorization checks, sensitive table access, and whether any secret is embedded in source.
2. Confirm webhook provider signatures and idempotency before changing endpoint settings.
3. Inspect the listed SECURITY DEFINER function definitions, owners, grants, callers, and trigger dependencies. Revoke direct EXECUTE only where no legitimate caller requires it.
4. Fix missing `search_path` settings on SECURITY DEFINER functions after checking name resolution and dependencies.
5. Rehearse changes in an isolated staging database, then run end-to-end tests before production release.

**No endpoint configuration, RPC grants, or function source was changed by this review.**
