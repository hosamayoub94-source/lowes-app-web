\set ON_ERROR_STOP on

-- Minimal disposable schema for a real PostgreSQL integration test.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

drop table if exists public.b2b_lead_events cascade;
drop table if exists public.syria_b2b_leads cascade;

create table public.syria_b2b_leads (
  id text primary key,
  country text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

\i supabase/migrations/20261025140000_b2b_market_entry.sql
\i supabase/migrations/20261025160000_b2b_market_entry_atomic_audit.sql

insert into public.syria_b2b_leads (id, country, account_status)
values ('test-lead-1', 'UAE', 'discovered');

-- Success case: row change and audit event are both persisted.
set role service_role;
select public.b2b_update_market_entry_atomic(
  'test-lead-1', 'UAE',
  '{"account_status":"contacted","next_action":"Send seller pack"}'::jsonb,
  'ci-test'
);
reset role;

do $$
begin
  if (select account_status from public.syria_b2b_leads where id = 'test-lead-1') <> 'contacted' then
    raise exception 'ASSERTION FAILED: successful update not persisted';
  end if;
  if (select count(*) from public.b2b_lead_events where lead_id = 'test-lead-1' and kind = 'market_entry_update') <> 2 then
    raise exception 'ASSERTION FAILED: expected two field audit events';
  end if;
  if has_function_privilege('anon', 'public.b2b_update_market_entry_atomic(text,text,jsonb,text)', 'EXECUTE') then
    raise exception 'ASSERTION FAILED: anon can execute atomic RPC';
  end if;
  if has_function_privilege('authenticated', 'public.b2b_update_market_entry_atomic(text,text,jsonb,text)', 'EXECUTE') then
    raise exception 'ASSERTION FAILED: authenticated can execute atomic RPC';
  end if;
end $$;

-- First-order timestamp is set once when entering first_order.
set role service_role;
select public.b2b_update_market_entry_atomic(
  'test-lead-1', 'UAE', '{"account_status":"first_order"}'::jsonb, 'ci-test'
);
reset role;

do $$
declare v_first_order_at timestamptz;
begin
  select first_order_at into v_first_order_at from public.syria_b2b_leads where id = 'test-lead-1';
  if v_first_order_at is null then
    raise exception 'ASSERTION FAILED: first_order_at was not populated';
  end if;
end $$;

-- Failure case: if event insertion fails, the lead update must roll back.
create or replace function public.test_reject_b2b_event_insert()
returns trigger language plpgsql as $$
begin
  raise exception 'forced audit insert failure';
end $$;
create trigger test_reject_b2b_event_insert
before insert on public.b2b_lead_events
for each row execute function public.test_reject_b2b_event_insert();

do $$
begin
  begin
    perform public.b2b_update_market_entry_atomic(
      'test-lead-1', 'UAE', '{"account_status":"approved"}'::jsonb, 'ci-test'
    );
    raise exception 'ASSERTION FAILED: RPC unexpectedly succeeded while audit insert fails';
  exception
    when others then
      if sqlerrm = 'ASSERTION FAILED: RPC unexpectedly succeeded while audit insert fails' then
        raise;
      end if;
      if sqlerrm not like '%forced audit insert failure%' then
        raise;
      end if;
  end;
end $$;

do $$
begin
  if (select account_status from public.syria_b2b_leads where id = 'test-lead-1') <> 'first_order' then
    raise exception 'ASSERTION FAILED: row update was not rolled back after audit failure';
  end if;
end $$;

drop trigger test_reject_b2b_event_insert on public.b2b_lead_events;
drop function public.test_reject_b2b_event_insert();

-- Wrong country / unknown row must not be updated.
do $$
begin
  begin
    perform public.b2b_update_market_entry_atomic(
      'test-lead-1', 'Syria', '{"account_status":"approved"}'::jsonb, 'ci-test'
    );
    raise exception 'ASSERTION FAILED: wrong-country update unexpectedly succeeded';
  exception
    when sqlstate 'P0002' then null;
  end;
end $$;

select 'B2B atomic market-entry PostgreSQL integration tests passed' as result;
