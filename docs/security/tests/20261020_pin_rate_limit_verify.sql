\echo 'Checking the PIN limiter cannot be called or read by untrusted roles...'
DO $acl$
BEGIN
  IF has_function_privilege('anon',
      'public.consume_pin_attempt_rate_limit(text,text,integer,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated',
      'public.consume_pin_attempt_rate_limit(text,text,integer,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon/authenticated can execute the PIN rate limiter';
  END IF;
  IF NOT has_function_privilege('service_role',
      'public.consume_pin_attempt_rate_limit(text,text,integer,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: service_role cannot execute the PIN rate limiter';
  END IF;
  IF has_table_privilege('anon', 'private.pin_login_rate_limit_buckets', 'SELECT')
     OR has_table_privilege('authenticated', 'private.pin_login_rate_limit_buckets', 'SELECT')
     OR has_table_privilege('service_role', 'private.pin_login_rate_limit_buckets', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL: API roles can read the private rate-limit buckets';
  END IF;
END
$acl$;

BEGIN;
SET LOCAL ROLE anon;
DO $anon$
BEGIN
  BEGIN
    PERFORM public.consume_pin_attempt_rate_limit(repeat('a',64), repeat('b',64), 300, 5, 30);
    RAISE EXCEPTION 'FAIL: anon called the PIN rate limiter';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon cannot call the PIN rate limiter';
  END;
  BEGIN
    PERFORM count(*) FROM private.pin_login_rate_limit_buckets;
    RAISE EXCEPTION 'FAIL: anon read private rate-limit state';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon cannot read private rate-limit state';
  END;
END
$anon$;
RESET ROLE;
COMMIT;

\echo 'Checking per-account attempt limit across changing source hashes...'
TRUNCATE private.pin_login_rate_limit_buckets;
BEGIN;
SET LOCAL ROLE service_role;
DO $account_limit$
DECLARE
  i integer;
  allowed boolean;
BEGIN
  FOR i IN 1..5 LOOP
    allowed := public.consume_pin_attempt_rate_limit(repeat('a',64), repeat('b',64), 300, 5, 100);
    IF allowed IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'FAIL: account attempt % should be allowed', i;
    END IF;
  END LOOP;

  allowed := public.consume_pin_attempt_rate_limit(repeat('a',64), repeat('b',64), 300, 5, 100);
  IF allowed IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL: account attempt beyond limit was allowed';
  END IF;

  -- Changing the source key must not reset the account-specific limit.
  allowed := public.consume_pin_attempt_rate_limit(repeat('a',64), repeat('c',64), 300, 5, 100);
  IF allowed IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL: account limit was bypassed by rotating source keys';
  END IF;
END
$account_limit$;
RESET ROLE;
COMMIT;

DO $account_assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM private.pin_login_rate_limit_buckets
    WHERE scope = 'account' AND key_hash = repeat('a',64) AND attempts = 6
  ) THEN
    RAISE EXCEPTION 'FAIL: account counter did not cap at limit + 1';
  END IF;
  IF EXISTS (
    SELECT 1 FROM private.pin_login_rate_limit_buckets
    WHERE key_hash !~ '^[0-9a-f]{64}$'
  ) THEN
    RAISE EXCEPTION 'FAIL: rate-limit state stored a non-hashed identifier';
  END IF;
END
$account_assert$;

\echo 'Checking per-source attempt limit across changing account hashes...'
TRUNCATE private.pin_login_rate_limit_buckets;
BEGIN;
SET LOCAL ROLE service_role;
DO $source_limit$
DECLARE
  i integer;
  allowed boolean;
BEGIN
  FOR i IN 1..3 LOOP
    allowed := public.consume_pin_attempt_rate_limit(repeat(i::text,64), repeat('d',64), 300, 100, 3);
    IF allowed IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'FAIL: source attempt % should be allowed', i;
    END IF;
  END LOOP;

  allowed := public.consume_pin_attempt_rate_limit(repeat('4',64), repeat('d',64), 300, 100, 3);
  IF allowed IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL: source attempt beyond limit was allowed';
  END IF;
END
$source_limit$;
RESET ROLE;
COMMIT;

DO $source_assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM private.pin_login_rate_limit_buckets
    WHERE scope = 'source' AND key_hash = repeat('d',64) AND attempts = 4
  ) THEN
    RAISE EXCEPTION 'FAIL: source counter did not cap at limit + 1';
  END IF;
END
$source_assert$;

\echo 'Checking expired fixed window resets both counters...'
UPDATE private.pin_login_rate_limit_buckets
SET window_start = window_start - interval '10 minutes';

BEGIN;
SET LOCAL ROLE service_role;
DO $window_reset$
DECLARE
  allowed boolean;
BEGIN
  allowed := public.consume_pin_attempt_rate_limit(repeat('4',64), repeat('d',64), 300, 100, 3);
  IF allowed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL: expired rate-limit window did not reset';
  END IF;
END
$window_reset$;
RESET ROLE;
COMMIT;

\echo 'Checking invalid configuration and unhashed identifiers are rejected...'
DO $invalid$
BEGIN
  BEGIN
    PERFORM public.consume_pin_attempt_rate_limit('employee-name', repeat('b',64), 300, 5, 30);
    RAISE EXCEPTION 'FAIL: raw account identifier accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS: raw account identifier rejected';
  END;

  BEGIN
    PERFORM public.consume_pin_attempt_rate_limit(repeat('a',64), repeat('b',64), 0, 5, 30);
    RAISE EXCEPTION 'FAIL: invalid window accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS: invalid window rejected';
  END;
END
$invalid$;

\echo 'PASS: disposable PIN rate-limit contract rehearsal complete.'
