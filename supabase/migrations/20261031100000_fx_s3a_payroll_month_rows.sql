-- 20261031100000_fx_s3a_payroll_month_rows.sql  (FX S3a — NOT APPLIED; needs the owner's explicit go)
-- Fills the `payroll` purpose with resolvable monthly rows (period_month set) for Aug/Sep/Oct 2026 from the rates each payroll run FROZE at month setup.
-- payroll_runs is only READ. The S0 copies of the same values (period_month null) are kept untouched as history; these rows use a distinct source suffix ':month' (the S0 unique key would otherwise skip them).
-- Additive and idempotent. No screen reads purpose=payroll yet (S3d will read it for month-setup defaults only).
-- Rollback: delete from public.fx_monthly_rates where purpose = 'payroll' and source like 'payroll_runs:%:month';

insert into public.fx_monthly_rates (purpose, currency, units_per_usd, effective_from, source, note, period_month, currency_unit, status, approved_at, rate_quality)
select distinct on (r.period_year, r.period_month, c.cur)
       'payroll', c.cur, c.rate, make_date(r.period_year, r.period_month, 1), 'payroll_runs:' || r.id::text || ':month',
       'S3a: rate frozen by the payroll run at month setup (read-only copy)', make_date(r.period_year, r.period_month, 1), 'current', 'confirmed', now(), 'exact'
  from public.payroll_runs r
  cross join lateral (values ('TRY', r.rate_usd_try), ('SYP', r.rate_usd_syp)) as c(cur, rate)
 where c.rate is not null and c.rate > 0 and r.month_setup_confirmed_at is not null
   and make_date(r.period_year, r.period_month, 1) between date '2026-08-01' and date '2026-10-01'
 order by r.period_year, r.period_month, c.cur, r.created_at desc
on conflict do nothing;
