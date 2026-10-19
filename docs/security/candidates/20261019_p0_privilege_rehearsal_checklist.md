# P0 privilege rehearsal — acceptance checklist

**State:** candidate only; not run against production.  
**Candidate SQL:** `20261019_p0_revoke_dangerous_table_privileges.sql`

## Why this is the first tranche
Read-only catalog inspection of production project `fghdumrgimoeqsafdhhh` found effective `TRUNCATE` privileges on 166/187 public tables for `anon` and 174/187 for `authenticated`. These privileges are separate from RLS and can bypass row-level protections for truncate operations. The same two roles also have `TRIGGER` and `REFERENCES` privileges across broad sets of tables.

This candidate removes only `TRUNCATE`, `TRIGGER`, and `REFERENCES` from the two API roles on existing public tables and from future tables created by the currently observed creators (`postgres`, `supabase_admin`). It deliberately does **not** remove normal DML privileges or policies; broad read/write exposure remains a separate tranche.

## Required before execution
- [ ] Use an isolated, non-production database that contains the current schema/migrations.
- [ ] Confirm backup/restore capability for that database.
- [ ] Capture the exact table ACLs, owners, and default ACLs before changing anything.
- [ ] Confirm which role actually owns each table and creates future public tables.
- [ ] Run the candidate in a transaction in staging first; inspect errors before commit.
- [ ] Verify the post-apply query returns zero rows.
- [ ] Create a fresh test table as each relevant creator role and verify the new table does not grant these privileges to `anon` or `authenticated`.
- [ ] Test the employee app, order flows, product/inventory operations, payroll/finance workflows, scheduled jobs, and integrations.
- [ ] Verify the ordinary browser roles cannot TRUNCATE any protected table through SQL/API paths.
- [ ] Capture a rollback plan based on the exact pre-change ACL snapshot. Do not use `GRANT ALL` as a generic rollback.
- [ ] Re-run the read-only effective-privilege audit and Supabase security advisor after the rehearsal.

## Known limitations
- This does not fix broad SELECT/INSERT/UPDATE/DELETE privileges.
- This does not replace permissive RLS policies with row-scoped authorization.
- This does not review or revoke `EXECUTE` on SECURITY DEFINER RPCs.
- This does not secure unauthenticated Edge Functions, rotate leaked tokens, or fix PIN brute-force protection.
- The SQL is not under `supabase/migrations/`, is not deployed, and must not be applied to production as-is.
