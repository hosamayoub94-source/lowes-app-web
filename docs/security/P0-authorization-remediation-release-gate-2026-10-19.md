# P0 Production Authorization Remediation — Release Gate

**Date:** 2026-10-19  
**Status:** Proposed; **NOT approved for production execution**.  
**Owner:** LOWE'S engineering/security.  
**Source of evidence:** Read-only catalog queries against project `fghdumrgimoeqsafdhhh`; see `production-rls-audit-2026-10-19.md`.

## Exact verified scope

- 187 base/partitioned tables in `public`.
- `anon`: 166 have effective TRUNCATE; `authenticated`: 174 have effective TRUNCATE.
- `anon`: 164 SELECT, 166 INSERT, 165 UPDATE, 165 DELETE effective table privileges. These are **privilege** counts, not successful API exploit counts.
- Default table ACLs in `public` for table creators `postgres` and `supabase_admin` grant `anon` and `authenticated` broad privileges, including TRUNCATE.
- For nine priority tables (`profiles`, `orders`, `customers`, `accounting_entries`, `employee_salary_settings`, `salary_deductions`, `monthly_payroll`, `leave_requests`, `invoices`), RLS is enabled and **not forced**, and both `anon` and `authenticated` have effective TRUNCATE.
- Four triggers exist on `profiles`, including `trg_guard_profiles_write` and `payroll_guard_profile_delete`. Their existence does not protect against TRUNCATE; ordinary DML trigger behavior is a separate matter.
- `guard_profiles_write` checks `current_user`, grants a bypass to non-`anon`/`authenticated` roles, and allows a business `admin` role determined by `current_role_type()`. For non-admin callers it prevents DELETE and sensitive-column UPDATE, but has a special INSERT branch invoking `_profile_name_exists`. The implementation of those two helper functions and the trigger event timing need a separate review before asserting full protection.
- `payroll_guard_profile_delete` is a SECURITY DEFINER trigger function and checks linked payroll entries from September 2026 onward. This is not a general authorization guard.

## Intended role matrix (design proposal, not verified app compatibility)

| Data class | anon | authenticated end-user | authorized admin/manager | service-role trusted backend |
|---|---|---|---|---|
| Profiles / credentials | No direct sensitive data access or destructive privileges | Only approved self-service fields through scoped paths | Scoped staff administration; sensitive changes audited | Explicit trusted workflows |
| Orders / customers | Only narrowly defined public intake, if actually required | Only assigned/owned market/team records | Market/team-scoped management | Shipping, sync and approved integrations |
| Accounting / invoices | No direct access | No broad table access; scoped reporting only if required | Role-scoped financial operations | Approved finance workflows |
| Payroll / salary / leave | No direct access | Only personal records through explicit controls | Payroll/HR-scoped operations | Approved payroll workflows |
| All `public` tables | No TRUNCATE/TRIGGER/REFERENCES by default | No TRUNCATE/TRIGGER/REFERENCES by default | Prefer application authorization, not unrestricted table grants | Only documented server-side uses |

Do not equate a browser UI's route protection with database authorization. The role model needs to be enforced by RLS, grants, and verified server-side functions.

## Proposed staged implementation

**Gate 0 — Inventory and backups (required):**
1. Confirm a recent, restorable production backup and practice restore into a **separate** non-production project. Do not assume an empty staging project is sufficient.
2. Inventory direct browser Supabase queries, RPCs, Edge Functions, cron jobs, and integrations by table and operation. Record legitimate unauthenticated use cases.
3. Capture existing grants, default ACLs, policies, triggers, function ownership, and PostgREST exposed schemas as versioned evidence **without secrets or customer rows**.
4. Map owner roles used to create future tables. Default ACL changes must target the relevant grantor roles.

**Gate 1 — Safe candidate in staging:**
1. Draft a narrowly scoped change to remove TRUNCATE, TRIGGER and REFERENCES from `anon` and `authenticated` on appropriate `public` tables, including a deliberate exception process for any proven use case. Do not use `REVOKE ALL` as a shortcut.
2. Draft corresponding `ALTER DEFAULT PRIVILEGES FOR ROLE ... IN SCHEMA public` changes for verified table creators. Verify that new test tables do not inherit the dangerous privileges.
3. Confirm trusted backend operations and migrations still work; PostgreSQL owner privileges and service-role behavior require specific tests.
4. Then replace unconditional permissive RLS policies on sensitive tables with operation-specific, row-scoped authorization. Do not drop open policies without tested replacement policies.
5. Review SECURITY DEFINER RPC EXECUTE grants and `search_path` in a separate tranche.

**Gate 2 — Acceptance tests (must pass before release):**
- Anonymous attempts at reading/writing protected records are denied.
- Signed-in users cannot read/change another user's sensitive records or escalate roles.
- `anon` and `authenticated` have no effective TRUNCATE on the targeted tables and on newly created tables.
- Valid staff login, PIN verification, customer intake, orders, shipping status updates, invoicing, accounting, leave, payroll and Star Network settlement flows pass.
- Every-30-minute `track-yurtici` scheduler continues to work with its verified authentication scheme.
- Service-role functions, trigger guards, and database maintenance workflows pass.
- Rollback SQL is prepared and tested in staging; backup restore has been exercised.
- Read-only security-advisor snapshot is compared before/after.

**Gate 3 — Production release:**
- Obtain separate explicit production approval with exact SQL diff, table list, maintenance window, tested rollback, and recovery owner.
- Apply only the reviewed tranche; verify privileges immediately with read-only checks.
- Observe application errors and core workflows; revert the tranche if acceptance gates fail.
- Never use destructive DML/TRUNCATE as a production security test.

## Candidate rehearsal status — 2026-10-19

- **Passed in disposable PostgreSQL 17 CI:** the narrow candidate removes effective TRUNCATE/TRIGGER/REFERENCES grants from existing public tables for `anon` and `authenticated`, preserves SELECT/INSERT/UPDATE/DELETE grants, and keeps the dangerous privileges from returning on new tables created by the tested `postgres` and `supabase_admin` roles. Rehearsal: PR #37, workflow “Security SQL Candidate Rehearsal”.
- **Not yet proven:** compatibility against the actual LOWE'S schema and its integrations, the real ownership/grantor inventory, full RLS isolation, Edge Functions, cron, login, order, inventory, accounting, leave, and payroll workflows.
- **Release decision unchanged:** no production SQL was applied. The tested candidate is still not a production release approval; the actual restorable staging-clone and end-to-end test gates below remain mandatory.

## Release decision

**BLOCKED pending** (a) complete caller dependency inventory, (b) faithful non-production rehearsal and positive/negative tests, (c) verified recovery, and (d) explicit approval for production SQL/secret/deploy operations.

This file is a release checklist and design proposal, not an executable migration.
