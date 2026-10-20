-- Disposable PIN rate-limit fixture for GitHub Actions PostgreSQL only.
-- No Supabase credentials, production data, or network calls are used.
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

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO postgres;

CREATE TABLE private.pin_login_rate_limit_buckets (
  scope text NOT NULL CHECK (scope IN ('account', 'source')),
  key_hash text NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts >= 1),
  PRIMARY KEY (scope, key_hash)
);

ALTER TABLE private.pin_login_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.pin_login_rate_limit_buckets FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_pin_attempt_rate_limit(
  p_account_hash text,
  p_source_hash text,
  p_window_seconds integer,
  p_account_limit integer,
  p_source_limit integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $rate_limit$
DECLARE
  v_window_start timestamptz;
  v_account_attempts integer;
  v_source_attempts integer;
BEGIN
  IF p_account_hash IS NULL OR p_account_hash !~ '^[0-9a-f]{64}$'
     OR p_source_hash IS NULL OR p_source_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'hashed account and source keys are required' USING ERRCODE = '22023';
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400
     OR p_account_limit IS NULL OR p_account_limit < 1 OR p_account_limit > 10000
     OR p_source_limit IS NULL OR p_source_limit < 1 OR p_source_limit > 100000 THEN
    RAISE EXCEPTION 'invalid rate-limit configuration' USING ERRCODE = '22023';
  END IF;

  v_window_start := pg_catalog.to_timestamp(
    pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp()) / p_window_seconds)
      * p_window_seconds
  );

  -- Serialize requests sharing either key so parallel guesses cannot all pass
  -- by racing the counter. Hash collisions only serialize unrelated requests.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pin-rate:account:' || p_account_hash, 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pin-rate:source:' || p_source_hash, 0)
  );

  INSERT INTO private.pin_login_rate_limit_buckets AS bucket
    (scope, key_hash, window_start, attempts)
  VALUES ('account', p_account_hash, v_window_start, 1)
  ON CONFLICT (scope, key_hash) DO UPDATE
    SET window_start = CASE
          WHEN bucket.window_start = EXCLUDED.window_start THEN bucket.window_start
          ELSE EXCLUDED.window_start
        END,
        attempts = CASE
          WHEN bucket.window_start = EXCLUDED.window_start
            THEN LEAST(bucket.attempts + 1, p_account_limit + 1)
          ELSE 1
        END
  RETURNING attempts INTO v_account_attempts;

  INSERT INTO private.pin_login_rate_limit_buckets AS bucket
    (scope, key_hash, window_start, attempts)
  VALUES ('source', p_source_hash, v_window_start, 1)
  ON CONFLICT (scope, key_hash) DO UPDATE
    SET window_start = CASE
          WHEN bucket.window_start = EXCLUDED.window_start THEN bucket.window_start
          ELSE EXCLUDED.window_start
        END,
        attempts = CASE
          WHEN bucket.window_start = EXCLUDED.window_start
            THEN LEAST(bucket.attempts + 1, p_source_limit + 1)
          ELSE 1
        END
  RETURNING attempts INTO v_source_attempts;

  RETURN v_account_attempts <= p_account_limit
     AND v_source_attempts <= p_source_limit;
END
$rate_limit$;

REVOKE ALL ON FUNCTION public.consume_pin_attempt_rate_limit(text, text, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_pin_attempt_rate_limit(text, text, integer, integer, integer)
  TO service_role;

COMMIT;
