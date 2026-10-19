# Security SQL rehearsal tests

These SQL fixtures are for a **disposable CI PostgreSQL database only**.

The candidate file `20261019_p0_revoke_dangerous_table_privileges.sql` is tested for four narrowly defined properties:

1. It removes effective `TRUNCATE`, `TRIGGER`, and `REFERENCES` table privileges from `anon` and `authenticated` on pre-existing public tables.
2. It keeps `SELECT`, `INSERT`, `UPDATE`, and `DELETE` grants intact; this candidate must not be mistaken for an RLS redesign.
3. The intended default-privilege protection also applies to newly created tables created by the tested table-owner roles, `postgres` and `supabase_admin`.
4. The acceptance query returns no rows for the targeted dangerous privileges.

## Explicit limits

Passing this isolated fixture does **not** authorize applying the SQL to production. It does not represent the live 187-table schema, every role/grantor, every application query, RLS behavior, Edge Functions, cron tasks, or external integrations. The next required gate remains a restorable non-production clone/rehearsal of the actual app project plus read/write workflow tests and a tested rollback. This test must never be configured with production connection strings or credentials.
