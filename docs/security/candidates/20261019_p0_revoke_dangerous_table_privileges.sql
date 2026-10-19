-- LOWE'S P0 privilege hardening candidate — NOT A PRODUCTION MIGRATION
-- Status: draft for isolated staging rehearsal only.
-- Do NOT run against production until reviewed and validated in a restorable
-- non-production database with application/cron integration tests.
--
-- Scope is intentionally limited to TRUNCATE, TRIGGER, REFERENCES.
-- This does NOT fix broad SELECT/INSERT/UPDATE/DELETE grants or permissive RLS.
-- Do not treat it as a complete authorization repair.
--
-- Preconditions:
-- 1. Confirm current database/target is the isolated staging project.
-- 2. Confirm a restorable backup exists.
-- 3. Capture the baseline using the verification queries in the companion doc.
-- 4. Run with a role allowed to revoke these grants on every public table.
--
-- Apply candidate: current base tables and partitioned tables in public.
DO $candidate$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
    ORDER BY c.relname
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE %I.%I FROM anon, authenticated',
      t.schema_name, t.table_name
    );
  END LOOP;
END
$candidate$;

-- Prevent the same dangerous privileges being reintroduced by future tables
-- created by the currently verified public-schema table creators.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;

-- Post-apply acceptance query: expected to return zero rows.
-- If any rows remain, stop and investigate grantors/ownership rather than
-- widening the script or running it against production.
SELECT n.nspname AS schema_name, c.relname AS table_name, r.rolname AS grantee,
       p.privilege_type
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN (VALUES ('anon'::name), ('authenticated'::name)) AS r(rolname)
CROSS JOIN (VALUES ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) AS p(privilege_type)
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND has_table_privilege(r.rolname, c.oid, p.privilege_type)
ORDER BY c.relname, r.rolname, p.privilege_type;

-- Manual rollback (only if staging tests show an unexpected dependency):
-- Restores direct table grants, but exact original grants must first be
-- inventoried; do not run a generic GRANT ALL as rollback.
-- Restore only privileges shown in the captured pre-change ACL snapshot.
