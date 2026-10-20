-- Disposable role setup for the PIN rate-limit candidate CI rehearsal only.
-- Does not create project data, connect to Supabase, or alter production.
BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'CREATE ROLE anon NOLOGIN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'CREATE ROLE authenticated NOLOGIN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'CREATE ROLE service_role NOLOGIN';
  END IF;
END
$roles$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

COMMIT;
