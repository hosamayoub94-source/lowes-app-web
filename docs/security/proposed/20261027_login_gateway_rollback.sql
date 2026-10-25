-- Rollback of 20261027_login_gateway.sql. Only after verify-pin no longer reads these rows (redeploy the previous verify-pin first).
drop function if exists public.consume_pin_attempt_rate_limit(text, text, integer, integer, integer);
drop table if exists private.pin_login_rate_limit_buckets;
drop table if exists public.internal_secrets;
drop function if exists public.auth_password_matches(uuid, text);
