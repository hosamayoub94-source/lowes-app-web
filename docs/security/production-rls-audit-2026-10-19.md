# Production RLS Audit — Read-Only Snapshot

**Date:** 2026-10-19  
**Project reviewed:** primary Supabase project `fghdumrgimoeqsafdhhh`  
**Mode:** metadata/SELECT only. No data writes, DDL, policy changes, deployments, function invocations, or secret changes.

## Executive summary

The current production policy catalog contains **critical authorization gaps**. Multiple sensitive tables have unconditional policies applying to the `public` database role (`USING (true)` and/or `WITH CHECK (true)`). Policies are permissive by default and combine with OR, so a restrictive policy beside an unconditional policy does not constrain access for the same command.

This report is evidence for a staged remediation plan, **not permission to apply production changes**.

## Confirmed examples from `pg_policies`

| Table | Policy | Command | Role | Predicate | Risk |
|---|---|---|---|---|---|
| `profiles` | `Allow all` | ALL | public | USING true / WITH CHECK true | Critical: unrestricted row operations may bypass intended profile/role guards at the RLS layer. |
| `profiles` | `Write profiles` | ALL | public | USING true / WITH CHECK true | Critical: duplicate open write policy. |
| `profiles` | `allow_all_anon_pr` | ALL | public | USING true / WITH CHECK true | Critical: open write policy. |
| `profiles` | `allow_all_profiles` | ALL | public | USING true / WITH CHECK true | Critical: open write policy. |
| `orders` | `orders_write_all` | ALL | public | USING true / WITH CHECK true | Critical: unrestricted row operations on orders. |
| `orders` | `orders_select_all` | SELECT | public | USING true | Critical: unrestricted reads of orders. |
| `customers` | `customers_write_all` | ALL | public | USING true / WITH CHECK true | Critical: unrestricted customer row operations. |
| `customers` | `customers_select_all` | SELECT | public | USING true | Critical: unrestricted customer reads. |
| `accounting_entries` | `acc_entries_all` | ALL | public | USING true / WITH CHECK true | Critical: unrestricted accounting row operations. |
| `employee_salary_settings` | `sal_settings_all` | ALL | public | USING true / WITH CHECK true | Critical: unrestricted salary-setting operations. |
| `salary_deductions` | `allow_all_anon_sd` | ALL | public | USING true / WITH CHECK true | Critical: unrestricted salary-deduction operations. |
| `monthly_payroll` | `Allow all` / `Write payroll` | ALL | public | USING true / WITH CHECK true | Critical: unrestricted payroll row operations. |
| `leave_requests` | `Allow all`, `Write leaves`, `allow_all_leave`, `leave_requests_all` | ALL | public | USING true / WITH CHECK true | Critical: several overlapping unconditional policies. |
| `invoices` | `invoices_select` | SELECT | public | `auth_is_full_access() OR auth.uid() IS NULL` | Critical review required: the predicate explicitly permits requests where `auth.uid()` is NULL. |
| `invoices` | `invoices_insert/update/delete` | INSERT/UPDATE/DELETE | authenticated | true | High: signed-in users are not row-scoped by these policies. |

The catalog also showed open `public` policies on other business tables (including `attendance`, `campaigns`, `customer_contacts`, and several operational tables). The broader initial read was limited to 250 rows, so it is not an exhaustive table-by-table inventory.

## Supabase security advisor snapshot

Read from the production project's security advisor on 2026-10-19:

- **24** tables with RLS enabled but no policies (includes `commerce.customers`, `commerce.order_items`, `commerce.orders`, and `commerce.payments`). This can mean API access is denied by default, but must be assessed alongside grants, service-role usage, and intended access paths.
- **41** functions with mutable `search_path`.
- **23** `SECURITY DEFINER` functions executable by `anon`.
- **28** `SECURITY DEFINER` functions executable by `authenticated`.
- **1** warning: leaked-password protection disabled.

These counts are advisor findings, not proof that every function is exploitable. Function-by-function source review and role/grant analysis are required before changing grants or function security.

## Safe remediation order (proposal only)

1. **Map access paths first.** For each sensitive table, identify app screens, RPCs, Edge Functions, integrations, triggers, and roles that currently depend on access. Do not remove broad policies until legitimate workflows have a replacement.
2. **Start with the highest-risk tables:** `profiles`, `orders`, `customers`, `accounting_entries`, payroll/salary tables, and `invoices`.
3. **Prepare a policy matrix** by operation (SELECT/INSERT/UPDATE/DELETE), caller class (anon/authenticated/service role), and business role. Define row ownership and manager/admin access explicitly.
4. **Draft policy changes outside production** and run positive and negative tests, including anonymous access, cross-user reads/writes, role escalation, and existing app workflows.
5. **Separate the release gate.** Production migration/deployment and any secret rotation require a distinct explicit approval after tests and rollback steps are reviewed.

## Scope and limitations

- This is a read-only snapshot of policy metadata and advisor output, not a penetration test.
- No live rows or customer records were queried by the audit SQL.
- No policy, grant, table, function, secret, or deployed function was changed.
- The existing profile trigger/guard must be inspected alongside RLS before making claims about effective profile protection.
- Do not treat this document as authorization to apply any migration.


## Additional finding: table grants

A second read-only query against `information_schema.role_table_grants` showed broad table-level privileges granted directly to `anon` and `authenticated` on the reviewed sensitive tables. For example, the catalog returned `SELECT`, `INSERT`, `UPDATE`, `DELETE`, and also `TRUNCATE` among the privileges for `anon` on `orders`, `customers`, `accounting_entries`, payroll/salary tables, and invoices. The `profiles` grant set differs slightly but still includes concerning privileges.

**Important distinction:** RLS policies do not constrain `TRUNCATE`. The grant catalog is a strong warning requiring verification of effective role membership, schema exposure, and actual API reachability; this query alone is not proof that an unauthenticated external client successfully executed a truncate or any other destructive operation.

This elevates the next verification priority: inspect effective grants/default privileges and exposed schemas, then revoke excess privileges only after a table-by-table compatibility plan and tested rollback. Do not attempt a production write/delete/truncate probe.


## Additional finding: effective privilege checks and schema usage

On 2026-10-19, a separate read-only query used PostgreSQL `has_table_privilege(role, table, privilege)` for the named roles on the sensitive tables. This verifies effective privilege checks for the database roles rather than relying only on the formatting of `information_schema.role_table_grants`.

For the following **`public` schema** tables, the query returned `true` for each of `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, and `TRIGGER` for both `anon` and `authenticated`:

- `orders`
- `customers`
- `accounting_entries`
- `employee_salary_settings`
- `salary_deductions`
- `monthly_payroll`
- `leave_requests`
- `invoices`

For `public.profiles`, the effective check returned `anon`: INSERT/REFERENCES/TRIGGER/TRUNCATE true, SELECT/UPDATE/DELETE false; and `authenticated`: INSERT/DELETE/REFERENCES/TRIGGER/TRUNCATE true, SELECT/UPDATE false. RLS policy predicates may still affect row-level SELECT/INSERT/UPDATE/DELETE behavior, but they do **not** constrain TRUNCATE or REFERENCES/TRIGGER privileges. This combination requires immediate, careful privilege remediation planning.

The same query returned no table privileges for `anon` or `authenticated` on the four reviewed `commerce` tables (`orders`, `customers`, `order_items`, `payments`), while `service_role` has broad table privileges. The schema check showed `commerce` has USAGE for `anon` and `authenticated`; schema USAGE alone does not grant table access. This is a useful contrast: do not treat the security-advisor “RLS enabled but no policies” finding for those commerce tables as equivalent to the current public-schema table exposure.

The role-membership query showed `authenticator` can SET ROLE to `anon`, `authenticated`, and `service_role`, as expected in a PostgREST-style role-switching arrangement; it did not show `anon` or `authenticated` as members of `service_role`. This does not make the service role safe to expose: service-role credentials must remain server-side.

### Interpretation and next action

- These are **effective database privilege checks**, not proof that an outside party has successfully performed any operation through the HTTP API.
- The exposed `public` schema plus effective `anon` TRUNCATE on sensitive tables is a higher-priority finding than ordinary over-broad RLS row policies because RLS does not protect against TRUNCATE.
- Do **not** probe by attempting INSERT/UPDATE/DELETE/TRUNCATE through the public API.
- Next, build an inventory of application/Edge Function dependencies and the intended role grants. Then prepare a minimal, reversible SQL proposal to revoke only unnecessary privileges, run it against a faithful non-production schema, and test legitimate workflows plus negative cases before any separately approved production action.


## Critical finding: database-wide privilege breadth and default ACLs

A catalog-only, read-only count across all base/partitioned tables in `public` returned:

| Effective privilege | `anon` tables | `authenticated` tables |
|---|---:|---:|
| SELECT | 164 / 187 | not counted in this aggregate |
| INSERT | 166 / 187 | not counted in this aggregate |
| UPDATE | 165 / 187 | not counted in this aggregate |
| DELETE | 165 / 187 | not counted in this aggregate |
| TRUNCATE | **166 / 187** | **174 / 187** |

The sensitive-table checks above independently confirmed that these effective privileges include customer, order, accounting, payroll, salary, invoice, leave, and profile-related tables. The list query was capped at 100 rows for inspection; the aggregate counts above cover all 187 `public` base/partitioned tables.

The `pg_default_acl` catalog also returned default table ACLs for both `postgres` and `supabase_admin` in the `public` schema that include `anon=arwdDxtm` and `authenticated=arwdDxtm` (the standard table privileges, including TRUNCATE and TRIGGER). This means newly created tables by those grantor roles may inherit broad privileges unless the creation process explicitly overrides the defaults. The default ACL finding must be validated against the intended project-wide role model, but it is a concrete configuration issue to include in remediation.

### Priority update

Treat this as a **P0 privilege-boundary issue**. It is broader than isolated over-permissive RLS policies and means a table-by-table policy cleanup alone would be incomplete. The remediation plan must address both:

1. Existing effective grants on all exposed `public` tables, especially destructive privileges that RLS cannot constrain.
2. Default privileges for future tables created by relevant owner/grantor roles.

Do not apply a blanket revoke to production. Many existing workflows may currently depend on grants; first build a dependency inventory, create a least-privilege role matrix, and rehearse the exact GRANT/REVOKE/default-privilege changes on a faithful non-production schema. Validate service-role access, authenticated workflows, Edge Functions, cron jobs, and migrations before requesting a separate production approval.
