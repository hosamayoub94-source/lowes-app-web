# Additional read-only security findings — LOWE'S production project

**Checked:** 2026-10-19  
**Project:** `lowes-production` (`kesoqnwyydycuyifqfhl`)  
**Method:** read-only catalog privilege checks and Supabase security advisor. No table rows were read and no writes/DDL were performed.

## High-priority findings

- 67 base/partitioned tables in `public`; RLS is enabled on all 67.
- Effective privileges for `anon`: SELECT 63, INSERT 63, UPDATE 63, DELETE 63, TRUNCATE 63 tables.
- Effective TRUNCATE privilege for `authenticated`: 63 tables.
- Default privileges for both `postgres` and `supabase_admin` grant `anon` and `authenticated` broad table privileges (`arwdDxtm`) in `public`, including TRUNCATE, TRIGGER, and REFERENCES. Both creator roles also default-grant function EXECUTE to `anon` and `authenticated`.
- Sensitive tables such as `profiles`, `orders`, `customers`, `invoices`, `payments`, `commissions`, `inventory_items`, `stock_movements`, `refresh_tokens`, `role_permissions`, and `user_permissions` have RLS enabled but not forced, while `anon` has effective DML and TRUNCATE table privileges.
- In the sampled sensitive tables, `customers` has unconditional permissive policies (two), `invoices` has three permissive policies with unconditional predicates, and `orders` has four policies without unconditional predicates. Tables such as `profiles`, `payments`, `commissions`, `distributors`, `inventory_items`, `stock_movements`, `refresh_tokens`, `role_permissions`, and `user_permissions` have no policies despite having RLS enabled. These are separate issues: grants may still permit SQL/API operations, while RLS policy absence denies row access only when the caller does not bypass RLS.
- The security advisor reports 23 tables with RLS enabled but no policies. This is not by itself proof of public exposure; combine it with effective grants and application paths.

## Implications

This is a second production project, distinct from `lowes-attendance`. The earlier P0 report for the attendance project is not a substitute for fixing this project. Treat the same narrow privilege-removal candidate as a possible first tranche, but validate it against this project's own owners, grants, default privileges, and application flows before use.

## Required next steps

1. Capture full ACL and owner snapshots for all 67 tables and default ACLs.
2. Inventory frontend direct queries, RPCs, Edge Functions, cron jobs, and service integrations against this project.
3. Rehearse removal of `TRUNCATE`, `TRIGGER`, and `REFERENCES` for `anon` and `authenticated` in isolated staging.
4. Build a table-by-table RLS/grant repair plan; do not add blanket policies or blindly revoke all DML privileges.
5. Verify login, product/inventory, order lifecycle, shipping, customer lookup, payment, commission, and admin workflows before release.

**No production fix has been applied.** The counts above are effective database privileges, not proof that an unauthenticated exploit was performed.
