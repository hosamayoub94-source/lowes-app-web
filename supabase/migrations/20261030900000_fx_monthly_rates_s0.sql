-- 20261030900000_fx_monthly_rates_s0.sql  (FX unification, stage S0 — additive only; nothing reads this table yet)
-- Creates public.fx_monthly_rates: append-only history of "units of currency per 1 USD" per purpose, with effective dates.
-- Backfills it (read-only copy) from the four existing sources. No existing table, policy, payroll run or commission is touched.
-- Resolution rule for date D (used from S1 on): latest effective_from <= D for (purpose, currency); ties -> latest created_at.
-- Legacy-unit rows (USD->SYP 13000, 20 May 2026, pre-redenomination units) are deliberately NOT copied.
-- Rollback: 20261030900000_fx_monthly_rates_s0_rollback.sql

create table if not exists public.fx_monthly_rates (
  id             uuid primary key default gen_random_uuid(),
  purpose        text not null check (purpose in ('delivery_accounting', 'payroll', 'profitability')),
  currency       text not null check (currency ~ '^[A-Z]{3}$' and currency <> 'USD'),
  units_per_usd  numeric not null check (units_per_usd > 0),
  effective_from date not null,
  source         text not null,
  note           text,
  entered_by     uuid,
  created_at     timestamptz not null default now(),
  unique (purpose, currency, effective_from, source)
);
comment on table public.fx_monthly_rates is 'Append-only FX history (units per 1 USD) by purpose and effective date. S0: backfilled copy, not read by the app yet.';

alter table public.fx_monthly_rates enable row level security;
drop policy if exists fxmr_select_staff on public.fx_monthly_rates;
drop policy if exists fxmr_insert_admin on public.fx_monthly_rates;
create policy fxmr_select_staff on public.fx_monthly_rates for select to authenticated using ((select public.auth_is_active_staff()));
create policy fxmr_insert_admin on public.fx_monthly_rates for insert to authenticated with check ((select public.current_role_type()) = 'admin');
revoke all on public.fx_monthly_rates from public, anon;
revoke update, delete, truncate, references, trigger, maintain on public.fx_monthly_rates from authenticated;

-- Backfill 1: sales/delivery accounting = what the screens use today (exchange_rates, USD -> X rows), post-redenomination units only.
insert into public.fx_monthly_rates (purpose, currency, units_per_usd, effective_from, source, note)
select 'delivery_accounting', to_cur, rate, created_at::date, 'exchange_rates:' || id::text, 'copied from exchange_rates (USD->' || to_cur || ')'
from public.exchange_rates
where from_cur = 'USD' and to_cur in ('TRY', 'SYP', 'AED') and rate > 0 and not (to_cur = 'SYP' and rate > 1000)
on conflict do nothing;

-- Backfill 2: payroll = the rates each run froze at month setup.
insert into public.fx_monthly_rates (purpose, currency, units_per_usd, effective_from, source, note)
select 'payroll', c.cur, c.rate, make_date(r.period_year, r.period_month, 1), 'payroll_runs:' || r.id::text, 'frozen at month setup (' || r.status || ')'
from public.payroll_runs r
cross join lateral (values ('TRY', r.rate_usd_try), ('SYP', r.rate_usd_syp)) as c(cur, rate)
where c.rate is not null and c.rate > 0
on conflict do nothing;

-- Backfill 3: profitability = latest entry per month/currency from profitability_fx_rates.
insert into public.fx_monthly_rates (purpose, currency, units_per_usd, effective_from, source, note)
select distinct on (month, currency) 'profitability', currency, units_per_usd, month, 'profitability_fx_rates:' || id::text, coalesce(note, 'copied from profitability_fx_rates')
from public.profitability_fx_rates
where units_per_usd > 0
order by month, currency, entered_at desc
on conflict do nothing;
