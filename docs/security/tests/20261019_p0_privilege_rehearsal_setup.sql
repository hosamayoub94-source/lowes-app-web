-- Disposable PostgreSQL fixture for testing the P0 privilege-revocation candidate.
-- Run ONLY in an ephemeral CI database. No production URL/credentials are used.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'CREATE ROLE anon NOLOGIN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'CREATE ROLE authenticated NOLOGIN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    EXECUTE 'CREATE ROLE supabase_admin NOLOGIN';
  END IF;
END
$roles$;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE, CREATE ON SCHEMA public TO supabase_admin;

-- Simulate the broad legacy default ACLs being guarded against.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON TABLES TO anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON TABLES TO anon, authenticated;

-- Representative pre-existing table with broad direct table grants.
CREATE TABLE public.p0_existing_sensitive_table (id integer PRIMARY KEY, note text);
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON TABLE public.p0_existing_sensitive_table TO anon, authenticated;
