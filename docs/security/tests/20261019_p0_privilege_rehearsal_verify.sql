-- Acceptance tests for the P0 privilege candidate in an ephemeral CI database.
-- Create future tables AFTER the candidate has adjusted default privileges.
CREATE TABLE public.p0_future_postgres_table (id integer PRIMARY KEY);

SET ROLE supabase_admin;
CREATE TABLE public.p0_future_supabase_admin_table (id integer PRIMARY KEY);
RESET ROLE;

DO $acceptance$
DECLARE
  table_name text;
  grantee text;
  privilege text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'p0_existing_sensitive_table',
    'p0_future_postgres_table',
    'p0_future_supabase_admin_table'
  ]
  LOOP
    FOREACH grantee IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      -- The candidate must remove only TRUNCATE, TRIGGER and REFERENCES.
      FOREACH privilege IN ARRAY ARRAY['TRUNCATE', 'TRIGGER', 'REFERENCES']
      LOOP
        IF has_table_privilege(grantee, format('public.%I', table_name), privilege) THEN
          RAISE EXCEPTION 'FAIL: % still has % on public.%', grantee, privilege, table_name;
        END IF;
      END LOOP;

      -- Legitimate CRUD grants must not be silently removed by this narrow candidate.
      FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']
      LOOP
        IF NOT has_table_privilege(grantee, format('public.%I', table_name), privilege) THEN
          RAISE EXCEPTION 'FAIL: % lost % on public.%', grantee, privilege, table_name;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END
$acceptance$;

-- This query should return no rows. It independently inspects every existing
-- public base/partitioned table for any surviving dangerous privileges.
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
