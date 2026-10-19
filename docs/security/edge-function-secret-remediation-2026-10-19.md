# Edge Function Secret Remediation Plan — Round 1

**Date:** 2026-10-19  
**Scope:** source review only; no deployed function or secret was changed.

## Confirmed source-level findings

| Function | Finding | Why not removed in this audit |
|---|---|---|
| `sheet-to-app` | Accepts hardcoded legacy Turkey/Syria sheet tokens in addition to environment variables. | Removing these before both Sheets/Apps Script send the rotated environment-backed values could stop inbound order updates and bulk imports. |
| `sync-order-to-sheet` | Falls back to a hardcoded legacy Syria sheet token when the environment variable is absent. | Could break outbound sheet sync if the environment secret is not already configured. |
| `sync-meta-insights` | Falls back to a hardcoded admin gate when the environment secret is absent. | Removing the fallback before configuring the replacement secret could break the manual/cron trigger. |
| Historical repository content | Prior review reported a legacy service-role key was committed in Git history. | History exposure is not repaired by deleting a literal from the current file; the key must be rotated through the provider and all consumers verified. |

The source also contains a Supabase publishable key fallback in `sync-order-to-sheet`. A publishable key is not equivalent to a service-role secret; do not classify it as a privileged secret solely because it appears in source. Its fallback behavior still needs separate review because it affects error recovery and relies on current RLS/grants.

## Required coordinated sequence

1. **Inventory without revealing values:** identify the configured secret names and presence in the Supabase function configuration; never print or copy secret values into logs, issues, PRs, or source.
2. **Prepare replacements:** generate unique, high-entropy values for each integration and admin gate. Keep each integration's credentials separate.
3. **Update the receiving side first:** update the relevant Google Apps Script property/configuration for each market, and the scheduled/manual caller for Meta sync, so they can send the new value.
4. **Set Supabase secrets:** configure the matching environment secrets for the functions. Verify presence only; do not echo values.
5. **Deploy only the specific functions** through the gated manual workflow after an explicit release decision. Do not deploy all functions as part of secret rotation.
6. **Run non-destructive verification:** verify unauthorized requests are rejected and valid integration health checks succeed. For order sync, use a controlled test path that cannot create/update a real customer order; do not run a production write probe.
7. **Remove source fallbacks** in a separate reviewed code change after the new configuration and caller updates are confirmed. Add tests that fail if legacy fallback literals return.
8. **Rotate any historical privileged key** at the provider and update every consumer. Deleting or rewriting Git history alone is not a substitute for key rotation.

## Release gates

- No secret values in Git, test fixtures, logs, screenshots, or PR comments.
- No production function deployment until the replacement values and receiving-side changes are verified.
- No live order mutation for smoke testing.
- Rollback means restoring the previous *configuration/caller compatibility* where safe, not reintroducing a compromised key as a long-term fix.

## Status

**Blocked pending coordinated configuration verification.** This document is a checklist only. It does not change source behavior, Supabase secrets, Google Apps Script, or deployed Edge Functions.
