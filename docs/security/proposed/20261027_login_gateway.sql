-- 20261027_login_gateway.sql  (audit F-03 + F-09)
-- Database half of the hardened login: (1) server-only config/secret store, (2) the PIN-attempt limiter from
-- docs/security/candidates/20261020_pin_rate_limit_rpc.sql (same algorithm, already rehearsed in CI), (3) seeds.
-- The Edge Function `verify-pin` reads these rows with the service key; nobody else can (RLS on, no grants, no policies).
--   pin_rate_pepper   : HMAC key used to hash account names / addresses before they reach the limiter table
--   auth_pw_pepper    : HMAC key from which the per-user Supabase Auth password is derived once auth_mode = 'derived'
--   auth_mode         : 'compat' (Auth password = "lp:<pin>", today's behaviour)  |  'derived' (Auth password independent of the PIN)
--   pin_rl_*          : limiter thresholds (10-minute window; 25 tries per account, 200 per source address)
-- Rollback: 20261027_login_gateway_rollback.sql
create table if not exists public.internal_secrets (
  name       text primary key,
  secret     text not null,
  updated_at timestamptz not null default now()
);
alter table public.internal_secrets enable row level security;
revoke all on public.internal_secrets from public, anon, authenticated;

insert into public.internal_secrets (name, secret) values
  ('pin_rate_pepper', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')),
  ('auth_pw_pepper',  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')),
  ('auth_mode',       'compat'),
  ('pin_rl_window_s',    '600'),
  ('pin_rl_account_max', '25'),
  ('pin_rl_source_max',  '200')
on conflict (name) do nothing;

create schema if not exists private;
grant usage on schema private to postgres;

create table if not exists private.pin_login_rate_limit_buckets (
  scope        text not null check (scope in ('account', 'source')),
  key_hash     text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  attempts     integer not null check (attempts >= 1),
  primary key (scope, key_hash)
);
create index if not exists pin_login_rate_limit_buckets_window_idx on private.pin_login_rate_limit_buckets (window_start);
alter table private.pin_login_rate_limit_buckets enable row level security;
revoke all on table private.pin_login_rate_limit_buckets from public, anon, authenticated, service_role;

create or replace function public.consume_pin_attempt_rate_limit(
  p_account_hash text, p_source_hash text, p_window_seconds integer, p_account_limit integer, p_source_limit integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $rate_limit$
declare
  v_window_start timestamptz;
  v_account_attempts integer;
  v_source_attempts integer;
begin
  if p_account_hash is null or p_account_hash !~ '^[0-9a-f]{64}$' or p_source_hash is null or p_source_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'hashed account and source keys are required' using errcode = '22023';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400
     or p_account_limit is null or p_account_limit < 1 or p_account_limit > 10000
     or p_source_limit is null or p_source_limit < 1 or p_source_limit > 100000 then
    raise exception 'invalid rate-limit configuration' using errcode = '22023';
  end if;

  v_window_start := pg_catalog.to_timestamp(pg_catalog.floor(extract(epoch from pg_catalog.clock_timestamp()) / p_window_seconds) * p_window_seconds);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pin-rate:account:' || p_account_hash, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pin-rate:source:' || p_source_hash, 0));

  if pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('pin-rate:cleanup', 0)) then
    delete from private.pin_login_rate_limit_buckets
     where ctid in (select ctid from private.pin_login_rate_limit_buckets where window_start < v_window_start - interval '1 day' order by window_start limit 500);
  end if;

  insert into private.pin_login_rate_limit_buckets as bucket (scope, key_hash, window_start, attempts)
  values ('account', p_account_hash, v_window_start, 1)
  on conflict (scope, key_hash) do update
    set window_start = case when bucket.window_start = excluded.window_start then bucket.window_start else excluded.window_start end,
        attempts = case when bucket.window_start = excluded.window_start then least(bucket.attempts + 1, p_account_limit + 1) else 1 end
  returning attempts into v_account_attempts;

  insert into private.pin_login_rate_limit_buckets as bucket (scope, key_hash, window_start, attempts)
  values ('source', p_source_hash, v_window_start, 1)
  on conflict (scope, key_hash) do update
    set window_start = case when bucket.window_start = excluded.window_start then bucket.window_start else excluded.window_start end,
        attempts = case when bucket.window_start = excluded.window_start then least(bucket.attempts + 1, p_source_limit + 1) else 1 end
  returning attempts into v_source_attempts;

  return v_account_attempts <= p_account_limit and v_source_attempts <= p_source_limit;
end
$rate_limit$;

revoke all on function public.consume_pin_attempt_rate_limit(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_pin_attempt_rate_limit(text, text, integer, integer, integer) to service_role;

-- Does the Auth password of <user> equal <candidate>? (bcrypt compare inside the database; no password ever leaves it)
-- Used by verify-pin to repair an Auth identity whose password drifted from what login expects (audit F-09), without a sign-in round trip.
create or replace function public.auth_password_matches(p_user uuid, p_candidate text)
 returns boolean
 language sql
 stable
 security definer
 set search_path = auth, extensions, public, pg_temp
as $$
  select coalesce((select u.encrypted_password = crypt(p_candidate, u.encrypted_password) from auth.users u where u.id = p_user and u.encrypted_password <> ''), false)
$$;
revoke all on function public.auth_password_matches(uuid, text) from public, anon, authenticated;
grant execute on function public.auth_password_matches(uuid, text) to service_role;
