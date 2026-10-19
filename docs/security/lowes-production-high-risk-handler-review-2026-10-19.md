# Focused high-risk handler review — LOWE'S production

**Date:** 2026-10-19  
**Project:** `lowes-production` (`kesoqnwyydycuyifqfhl`)  
**Scope:** Read deployed function source only. No requests were sent to the functions and no production configuration or code was changed.

## P0/P1 candidates requiring a controlled fix

### 1. `stripe-checkout` — trusts caller-supplied order and price data

The deployed handler has `verify_jwt=false` and accepts `orderId`, `amount`, `currency`, `items`, and `trackToken` from the request body. It creates a Stripe Checkout Session using `STRIPE_SECRET_KEY` without loading the order from a trusted database record or verifying the canonical amount/items. A caller can submit arbitrary order IDs and prices, so payment amount and order identity are not bound to trusted order state.

**Recommended repair:** treat the request's order ID as a lookup key only; load the canonical order and line items server-side; derive amount/currency from the trusted order; verify order status and that it is payable; enforce idempotency; return no session for missing, cancelled, already-paid, or mismatched orders. Preserve anonymous customer checkout if required, but do not trust client-supplied amounts. Add tests for altered amount, altered items, arbitrary order ID, cancelled/already-paid order, replay, and successful checkout. Review webhook reconciliation separately before rollout.

### 2. `whatsapp-webhook` — no Twilio signature validation observed

The deployed handler accepts form data and uses the service-role key to insert messages and upload inbound media. The source inspected did not contain a check of `X-Twilio-Signature` or Twilio's request-signature validation helper. If no upstream signature validation exists, external callers may be able to spoof inbound messages and trigger notifications.

**Recommended repair:** validate the Twilio signature against the exact public callback URL and raw/form parameters using the official Twilio validation method and the account auth token. Reject invalid signatures before any database or storage action. Keep the endpoint publicly reachable for Twilio, but authenticate the provider. Test valid signatures, invalid/missing signatures, URL/proxy normalization, duplicate MessageSid idempotency, and media handling.

### 3. `whatsapp-status-callback` — updates message status by caller-supplied SID

The deployed handler updates `whatsapp_messages.status` by `twilio_sid` from the submitted form and returns HTTP 200, with no Twilio signature validation observed in the source. Without provider authentication, an external caller could spoof delivery statuses.

**Recommended repair:** validate Twilio signatures before processing; allow only documented Twilio status values; ensure status transitions are monotonic/idempotent; log invalid callbacks without exposing sensitive details.

## Endpoints reviewed with explicit in-handler authentication

- `api-orders` and `api-inventory` compare the `X-API-Key` header with `LOWES_API_KEY` before accessing the sync blob. Verify secret strength, rotation history, constant-time comparison if appropriate, and rate limiting, but do not disable their current gate.
- `weekly-report` and `growth-nudges` check `X-Internal-Key` against `LOWES_CRON_INTERNAL_KEY` before reading the sync blob.
- `whatsapp-send`, `whatsapp-upload-media`, and `whatsapp-delete-conversation` contain in-handler caller checks using a user JWT and a shared internal key. Preserve the dual caller model during any platform setting changes.
- `track-order` is intentionally public and uses a tracking token; confirm token entropy, response minimization, and rate limits.
- `stripe-checkout`, `whatsapp-webhook`, and `whatsapp-status-callback` need the fixes above before treating the public endpoint configuration as safe.

## Release safety

No deployed source was modified. Do not simply enable platform JWT verification for all `verify_jwt=false` functions: legitimate checkout, Twilio webhooks, status callbacks, and token-based public tracking may not have Supabase user JWTs. Implement the correct per-endpoint authentication, rehearse against staging, then release with tests and a rollback plan.
