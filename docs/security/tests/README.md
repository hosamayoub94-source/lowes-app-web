# Security SQL rehearsal tests

These SQL fixtures are for a **disposable CI PostgreSQL database only**.

The candidate file `20261019_p0_revoke_dangerous_table_privileges.sql` is tested for four narrowly defined properties:

1. It removes effective `TRUNCATE`, `TRIGGER`, and `REFERENCES` table privileges from `anon` and `authenticated` on pre-existing public tables.
2. It keeps `SELECT`, `INSERT`, `UPDATE`, and `DELETE` grants intact; this candidate must not be mistaken for an RLS redesign.
3. The intended default-privilege protection also applies to newly created tables created by the tested table-owner roles, `postgres` and `supabase_admin`.
4. The acceptance query returns no rows for the targeted dangerous privileges.

## Explicit limits

Passing this isolated fixture does **not** authorize applying the SQL to production. It does not represent the live 187-table schema, every role/grantor, every application query, RLS behavior, Edge Functions, cron tasks, or external integrations. The next required gate remains a restorable non-production clone/rehearsal of the actual app project plus read/write workflow tests and a tested rollback. This test must never be configured with production connection strings or credentials.


## Inventory mutation authorization fixture (2026-10-20)

The workflow also creates a second, isolated schema named `inventory_rehearsal` inside the same disposable CI PostgreSQL instance. It uses only synthetic profiles, warehouses, product, and stock quantities.

The fixture checks the intended contract for a future inventory RPC redesign:

- anonymous callers cannot write stock, movement history, warehouse settings, or product catalog rows directly;
- anonymous callers cannot execute stock-mutation RPCs;
- inactive profiles, employees without stock capability, explicit denied permissions, and a central-only extra permission cannot exceed their intended stock scope;
- an authorized stock delta writes exactly one movement row whose actor comes from the simulated `auth.uid()`;
- authorized transfers update both warehouse balances and create one corresponding movement row atomically;
- negative resulting stock and insufficient transfers are rejected without a movement record or partial quantity change;
- function EXECUTE grants remain narrow, and the SECDEF function uses a fixed search path.

**Interpretation limit:** this is a disposable contract fixture, not the live LOWE'S SQL function body, not a real Supabase JWT/PostgREST integration test, and not evidence that production is now protected. It models expected behavior so SQL logic can be rehearsed at zero added Supabase cost. The actual live inventory RPCs and broad policies remain unchanged until the implementation is reviewed against every legitimate UI/order workflow. The fixture intentionally does not set the production inventory read policy.
