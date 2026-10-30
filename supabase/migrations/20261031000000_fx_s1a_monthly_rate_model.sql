-- 20261031000000_fx_s1a_monthly_rate_model.sql  (FX unification S1a — NOT APPLIED; owner approved the design on 30 Oct 2026 (D1–D4), NOT the application)
-- Builds on S0 (public.fx_monthly_rates, applied). Additive: no existing screen/function/policy/payroll data is changed.
--
-- Source of truth: public.fx_monthly_rates is the authoritative FX table from this migration on.
-- public.exchange_rates stays only as a LEGACY MIRROR for readers not yet migrated (payroll engine, S2-S4 screens): fx_set_monthly_rate()
-- mirrors the CURRENT month's delivery_accounting rate into it inside the same transaction (never a past month, so "latest rate" readers cannot be moved backwards).
--
-- D1: a rate is keyed by purpose x currency x [market] x month x currency_unit. Purposes are separated: delivery_accounting, profitability, commission, payroll.
-- D2: delivery_accounting months Aug/Sep/Oct 2026 copy the FROZEN payroll rates (payroll_runs is read, never modified).
-- D3: AED 3.6725 is an explicit row per month (source 'owner_decision:D3'), not a hidden code default.
-- D4: carry-forward only from a CONFIRMED earlier month, flagged `exact=false`; no confirmed earlier month => no row (unconverted). Estimates are never stored,
--     so an estimate can never be carried again. Closing a period on carried rates needs an explicit fx_approve_period().
-- Currency units: public.fx_currency_units says which unit a currency was recorded in on a date (SYP legacy units before 2026); legacy-unit amounts are never converted with a current-unit rate.
-- Legacy S0 rows (period_month is null) are kept as history and ignored by fx_rate_for().
-- Rollback: 20261031000000_fx_s1a_monthly_rate_model_rollback.sql.txt

-- ───────────── 1) columns on fx_monthly_rates ─────────────
alter table public.fx_monthly_rates
  add column if not exists market         text,
  add column if not exists period_month   date,
  add column if not exists currency_unit  text not null default 'current',
  add column if not exists status         text not null default 'confirmed',
  add column if not exists approved_at    timestamptz,
  add column if not exists superseded_at  timestamptz,
  add column if not exists superseded_by  uuid;

do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.fx_monthly_rates'::regclass and contype = 'c'
            and (pg_get_constraintdef(oid) like '%delivery_accounting%' or conname in ('fx_monthly_rates_market_check', 'fx_monthly_rates_period_month_check', 'fx_monthly_rates_unit_check', 'fx_monthly_rates_status_check'))
  loop execute format('alter table public.fx_monthly_rates drop constraint %I', c); end loop;
end $$;
alter table public.fx_monthly_rates
  add constraint fx_monthly_rates_purpose_check check (purpose in ('delivery_accounting', 'payroll', 'profitability', 'commission')),
  add constraint fx_monthly_rates_market_check check (market is null or market in ('turkey', 'syria', 'uae')),
  add constraint fx_monthly_rates_period_month_check check (period_month is null or period_month = date_trunc('month', period_month)::date),
  add constraint fx_monthly_rates_unit_check check (currency_unit in ('current', 'legacy')),
  add constraint fx_monthly_rates_status_check check (status in ('confirmed', 'superseded'));

create unique index if not exists fx_monthly_rates_one_confirmed
  on public.fx_monthly_rates (purpose, currency, coalesce(market, ''), currency_unit, period_month)
  where period_month is not null and status = 'confirmed';

-- ───────────── 2) currency units (which unit a currency was recorded in, by date) ─────────────
create table if not exists public.fx_currency_units (
  id         uuid primary key default gen_random_uuid(),
  currency   text not null check (currency ~ '^[A-Z]{3}$'),
  unit       text not null check (unit in ('current', 'legacy')),
  valid_from date not null,
  valid_to   date,
  status     text not null default 'proposed' check (status in ('proposed', 'confirmed')),
  note       text,
  created_at timestamptz not null default now(),
  unique (currency, valid_from)
);
alter table public.fx_currency_units enable row level security;
drop policy if exists fxcu_select_staff on public.fx_currency_units;
create policy fxcu_select_staff on public.fx_currency_units for select to authenticated using ((select public.auth_is_active_staff()));
revoke all on public.fx_currency_units from public, anon;
revoke insert, update, delete, truncate, references, trigger, maintain on public.fx_currency_units from authenticated;

-- Derived from live data (orders SYP, 30 Oct 2026): Oct-Dec 2025 medians 85k-108k, Jan 2026 onward ~2k => legacy units until 31 Dec 2025. CONFIRMED by the owner on 30 Oct 2026 (cut-over 31/12/2025).
insert into public.fx_currency_units (currency, unit, valid_from, valid_to, status, note) values
  ('SYP', 'legacy',  date '2000-01-01', date '2025-12-31', 'confirmed', 'orders.currency=SYP amounts of Oct-Dec 2025 are ~100x current units; cut-over 31/12/2025 confirmed by the owner (30 Oct 2026)'),
  ('SYP', 'current', date '2026-01-01', null,              'confirmed', 'current units (median order ~2,000 SYP); confirmed by the owner (30 Oct 2026)')
on conflict do nothing;

create or replace function public.fx_unit_for(p_currency text, p_on date)
returns text language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce((select u.unit from public.fx_currency_units u
                    where u.currency = upper(p_currency) and u.valid_from <= p_on and (u.valid_to is null or p_on <= u.valid_to)
                    order by u.valid_from desc limit 1), 'current');
$$;

-- ───────────── 3) read: rate for a month (confirmed, exact or carried from an earlier CONFIRMED month; none => no row) ─────────────
create or replace function public.fx_rate_for(p_purpose text, p_currency text, p_month date, p_market text default null)
returns table (units_per_usd numeric, period_month date, exact boolean, market text, source text)
language sql stable security invoker set search_path = public, pg_temp as $$
  select r.units_per_usd, r.period_month, (r.period_month = date_trunc('month', p_month)::date), r.market, r.source
    from public.fx_monthly_rates r
   where r.purpose = p_purpose and r.currency = upper(p_currency) and r.status = 'confirmed' and r.currency_unit = 'current'
     and r.period_month is not null and r.period_month <= date_trunc('month', p_month)::date
     and (r.market is null or r.market = p_market)
   order by r.period_month desc, (r.market is not null) desc, r.created_at desc
   limit 1;
$$;

-- ───────────── 4) period approvals (closing a period on carried rates needs an explicit, recorded approval) ─────────────
create table if not exists public.fx_period_approvals (
  id           uuid primary key default gen_random_uuid(),
  purpose      text not null check (purpose in ('delivery_accounting', 'payroll', 'profitability', 'commission')),
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  approved_by  uuid not null,
  approved_at  timestamptz not null default now(),
  note         text,
  carried      jsonb not null default '[]'::jsonb
);
alter table public.fx_period_approvals enable row level security;
drop policy if exists fxpa_select_staff on public.fx_period_approvals;
create policy fxpa_select_staff on public.fx_period_approvals for select to authenticated using ((select public.auth_is_active_staff()));
revoke all on public.fx_period_approvals from public, anon;
revoke insert, update, delete, truncate, references, trigger, maintain on public.fx_period_approvals from authenticated;

-- ───────────── 5) write: the ONLY write path (admin; atomic supersede + insert + current-month legacy mirror) ─────────────
create or replace function public.fx_set_monthly_rate(
  p_purpose text, p_currency text, p_month date, p_rate numeric,
  p_market text default null, p_note text default null, p_source text default 'admin_entry')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_month date := date_trunc('month', p_month)::date;
  v_cur text := upper(p_currency);
  v_old uuid; v_new uuid;
begin
  if v_uid is null or public.current_role_type() is distinct from 'admin' then
    raise exception 'fx_set_monthly_rate: admin only' using errcode = '42501';
  end if;
  if p_rate is null or p_rate <= 0 then raise exception 'fx_set_monthly_rate: rate must be > 0'; end if;
  if v_cur !~ '^[A-Z]{3}$' or v_cur = 'USD' then raise exception 'fx_set_monthly_rate: bad currency'; end if;
  if p_purpose not in ('delivery_accounting', 'payroll', 'profitability', 'commission') then raise exception 'fx_set_monthly_rate: bad purpose'; end if;

  select id into v_old from public.fx_monthly_rates
   where purpose = p_purpose and currency = v_cur and coalesce(market, '') = coalesce(p_market, '') and currency_unit = 'current'
     and period_month = v_month and status = 'confirmed' for update;
  if v_old is not null then
    update public.fx_monthly_rates set status = 'superseded', superseded_at = now() where id = v_old;
  end if;

  insert into public.fx_monthly_rates (purpose, currency, units_per_usd, effective_from, source, note, entered_by, market, period_month, currency_unit, status, approved_at)
  values (p_purpose, v_cur, p_rate, v_month,
          coalesce(p_source, 'admin_entry') || ':' || v_uid::text || ':' || floor(extract(epoch from clock_timestamp()) * 1000000)::bigint::text,
          p_note, v_uid, p_market, v_month, 'current', 'confirmed', now())
  returning id into v_new;
  if v_old is not null then update public.fx_monthly_rates set superseded_by = v_new where id = v_old; end if;

  -- legacy mirror: only the CURRENT month of delivery_accounting, all-markets rows (same transaction => both succeed or both fail)
  if p_purpose = 'delivery_accounting' and p_market is null
     and v_month = date_trunc('month', (now() at time zone 'Europe/Istanbul'))::date then
    insert into public.exchange_rates (from_cur, to_cur, rate, set_by) values ('USD', v_cur, p_rate, v_uid);
  end if;
  return v_new;
end $$;

create or replace function public.fx_approve_period(p_purpose text, p_month date, p_note text default null, p_carried jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null or public.current_role_type() is distinct from 'admin' then
    raise exception 'fx_approve_period: admin only' using errcode = '42501';
  end if;
  insert into public.fx_period_approvals (purpose, period_month, approved_by, note, carried)
  values (p_purpose, date_trunc('month', p_month)::date, v_uid, p_note, coalesce(p_carried, '[]'::jsonb)) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.fx_set_monthly_rate(text, text, date, numeric, text, text, text) from public, anon;
revoke all on function public.fx_approve_period(text, date, text, jsonb) from public, anon;
grant execute on function public.fx_set_monthly_rate(text, text, date, numeric, text, text, text) to authenticated;
grant execute on function public.fx_approve_period(text, date, text, jsonb) to authenticated;
revoke all on function public.fx_rate_for(text, text, date, text) from public, anon;
revoke all on function public.fx_unit_for(text, date) from public, anon;
grant execute on function public.fx_rate_for(text, text, date, text) to authenticated;
grant execute on function public.fx_unit_for(text, date) to authenticated;

-- Single write path: direct inserts (S0 admin policy) are closed; every write goes through fx_set_monthly_rate (audit + supersede + mirror).
drop policy if exists fxmr_insert_admin on public.fx_monthly_rates;
revoke insert on public.fx_monthly_rates from authenticated;

-- Explicit read grant (do not rely on project default privileges): staff read through RLS policies fxmr/fxcu/fxpa_select_staff.
grant select on public.fx_monthly_rates, public.fx_currency_units, public.fx_period_approvals to authenticated;

-- ───────────── 6) monthly rows (D2 + D3). payroll_runs is only READ. ─────────────
-- D2: delivery_accounting = the rates frozen by each month's payroll run (Aug/Sep/Oct 2026 as verified in payroll_runs on 30 Oct 2026: 48/131, 46.8/131, 50/140).
insert into public.fx_monthly_rates (purpose, currency, units_per_usd, effective_from, source, note, period_month, currency_unit, status, approved_at)
select distinct on (r.period_year, r.period_month, c.cur)
       'delivery_accounting', c.cur, c.rate, make_date(r.period_year, r.period_month, 1), 'payroll_runs:' || r.id::text,
       'D2 (owner, 30 Oct 2026): copied from the rate frozen by the payroll run', make_date(r.period_year, r.period_month, 1), 'current', 'confirmed', now()
  from public.payroll_runs r
  cross join lateral (values ('TRY', r.rate_usd_try), ('SYP', r.rate_usd_syp)) as c(cur, rate)
 where c.rate is not null and c.rate > 0 and make_date(r.period_year, r.period_month, 1) between date '2026-08-01' and date '2026-10-01'
 order by r.period_year, r.period_month, c.cur, r.created_at desc
on conflict do nothing;

-- D3: AED 3.6725 per month, explicit rows.
insert into public.fx_monthly_rates (purpose, currency, units_per_usd, effective_from, source, note, period_month, currency_unit, status, approved_at)
select 'delivery_accounting', 'AED', 3.6725, m, 'owner_decision:D3:2026-10-30', 'D3 (owner, 30 Oct 2026): 1 USD = 3.6725 AED', m, 'current', 'confirmed', now()
  from (values (date '2026-08-01'), (date '2026-09-01'), (date '2026-10-01')) v(m)
on conflict do nothing;
