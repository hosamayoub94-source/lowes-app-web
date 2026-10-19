# Release blocker — deployed LOWE'S production functions are not in the inspected repository

**Date:** 2026-10-19

During the review, the deployed `lowes-production` project (`kesoqnwyydycuyifqfhl`) exposed active functions including `stripe-checkout`, `whatsapp-webhook`, `whatsapp-status-callback`, `api-orders`, and `api-inventory`.

The inspected repository `hosamayoub94-source/lowes-app-web` does not contain these deployed function paths under `supabase/functions/`. Its current function tree includes different names/proxies (for example, `whatsapp-send-proxy` and `whatsapp-upload-media-proxy`). The private `lowes-classic` repository also has only a small different function tree at its current root. A search of accessible repositories did not locate source-controlled copies of the deployed checkout/webhook functions.

## Why this matters

The source returned by Supabase can be reviewed, but editing an unrelated repository copy and deploying it would be unsafe. We need a canonical source location and deployment history before modifying these handlers. Otherwise, a fix could overwrite legitimate behavior or be lost during the next deploy.

## Safe path to unblock

1. Locate the authoritative repository/branch for the `lowes-production` project's deployed functions, or import the current deployed sources into a dedicated recovery branch after stripping secrets and verifying no embedded credentials.
2. Add regression tests for checkout price/order binding and Twilio webhook signatures.
3. Implement the fixes in source control and run CI.
4. Rehearse on an isolated Supabase project with test Stripe/Twilio credentials and test-only records.
5. Only then deploy each changed function, one at a time, with smoke tests and rollback versions ready.

No source import, deployment, secret rotation, or production write was performed during this review.
