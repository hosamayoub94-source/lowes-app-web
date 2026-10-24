-- =====================================================================
-- PROPOSED — NOT APPLIED. Needs the owner's explicit approval before it runs on production.
-- 20261024_payroll_oct_rules  (payroll rules of 24 Oct 2026; first operational period = Oct 2026)
--
-- What it does (and nothing else):
--  1) profiles.payroll_excluded_reason  — every exclusion carries a written reason (CHECK).
--       reasons for the 4 existing exclusions are set in the same transaction.
--  2) payroll_entries.allowances_detail — jsonb [{kind, source, amount, currency, rate_to_usd, usd}]:
--       the allowance amount, its currency and the rate USED are kept on the payslip.
--       Existing rows get '[]' (metadata only; no amounts are touched).
--  3) payroll_sync_run_summary()        — AFTER trigger on payroll_entries: payroll_runs.employee_count /
--       total_net_usd are refreshed in the SAME transaction as every entry write (atomic).
--       Only DRAFT runs of operational periods (>= 2026-10). Historical periods are never touched.
--  4) payroll_run_consistency_gate()    — BEFORE UPDATE trigger on payroll_runs: a draft can NOT become
--       finalized/approved/paid when (a) the header disagrees with its entries, (b) an entry belongs to an
--       excluded person, (c) an entry's net != base+allowances+commission+bonus−deductions−absence−shortfall−advance,
--       (d) an automatic entry's allowances_usd != the sum of its allowances_detail.
--       It is a separate trigger on purpose: payroll_approve_run() is NOT replaced here, so this composes with
--       20261023_payroll_server_hardening.sql instead of fighting it.
-- NOT touched: any historical run/entry, payroll_access, salary settings, payroll_allowances, RLS policies.
-- Order: apply THIS migration first, then deploy the app code that writes allowances_detail.
-- Rollback: 20261024_payroll_oct_rules_rollback.sql
-- =====================================================================

-- ── 0) the operational boundary (same constant as src/modules/payroll/utils/historicalPeriod.js) ──
create or replace function public.payroll_period_is_operational(p_year int, p_month int)
returns boolean language sql immutable as
$$ select coalesce(p_year * 100 + p_month, 0) >= 202610 $$;

-- ── 1) exclusion reason ────────────────────────────────────────────────
alter table public.profiles add column if not exists payroll_excluded_reason text;

update public.profiles set payroll_excluded_reason = 'owner/no salary'
 where id = 'a68d72e4-8c88-4554-a8c4-70f5ac813a20' and payroll_excluded and payroll_excluded_reason is null;      -- hosam ayoub
update public.profiles set payroll_excluded_reason = 'UAE sponsor — no salary from the Syria cycle'
 where id = 'c7f2b17b-9e41-421a-bb0b-eadbaee5afde' and payroll_excluded and payroll_excluded_reason is null;      -- Reem alkshki
update public.profiles set payroll_excluded_reason = 'paid by Reem (UAE) — outside the Syria cycle'
 where id = '2320f139-c909-4604-8778-f22f00eb689d' and payroll_excluded and payroll_excluded_reason is null;      -- Arwa Mohammed
update public.profiles set payroll_excluded_reason = 'duplicate/secondary account — excluded 22/10/2026 (owner to confirm)'
 where id = '4b022614-ffe5-4543-8867-2b73e5b1ba97' and payroll_excluded and payroll_excluded_reason is null;      -- yousef alkshke

alter table public.profiles add constraint profiles_excluded_needs_reason
  check (not payroll_excluded or nullif(btrim(payroll_excluded_reason), '') is not null);
-- profiles uses column-level privileges: same read access as payroll_excluded, nothing for anon.
grant select (payroll_excluded_reason) on public.profiles to authenticated;

-- ── 2) allowance detail on the payslip ─────────────────────────────────
alter table public.payroll_entries add column if not exists allowances_detail jsonb not null default '[]'::jsonb;

-- ── 3) atomic run summary ──────────────────────────────────────────────
create or replace function public.payroll_sync_run_summary() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare rid uuid;
begin
  for rid in
    select distinct x from unnest(array[
      case when tg_op <> 'DELETE' then new.run_id end,
      case when tg_op <> 'INSERT' then old.run_id end]) x
    where x is not null
  loop
    update public.payroll_runs r
       set employee_count = s.n, total_net_usd = s.t
      from (select count(*)::int n, coalesce(sum(net_salary_usd), 0) t
              from public.payroll_entries where run_id = rid) s
     where r.id = rid
       and r.status = 'draft'
       and public.payroll_period_is_operational(r.period_year, r.period_month)
       and (r.employee_count is distinct from s.n or r.total_net_usd is distinct from s.t);
  end loop;
  return null;
end $$;

create trigger payroll_entries_sync_run_summary
  after insert or delete or update of net_salary_usd, run_id on public.payroll_entries
  for each row execute function public.payroll_sync_run_summary();

-- ── 4) consistency gate at the moment a draft is closed ────────────────
create or replace function public.payroll_run_consistency_gate() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int; t numeric; bad int; names text;
begin
  if not (old.status = 'draft' and new.status in ('finalized', 'approved', 'paid')) then return new; end if;
  if not public.payroll_period_is_operational(old.period_year, old.period_month) then return new; end if;

  -- (a) the header kept on the DRAFT (maintained by the trigger above) must equal its lines
  select count(*)::int, coalesce(sum(net_salary_usd), 0) into n, t from public.payroll_entries where run_id = old.id;
  if old.employee_count is distinct from n or round(coalesce(old.total_net_usd, 0), 2) <> round(t, 2) then
    raise exception 'ملخص الدورة لا يطابق القيود: الملخص % موظف / $% بينما القيود % موظف / $% — أعد تشغيل الدورة.',
      coalesce(old.employee_count, 0), round(coalesce(old.total_net_usd, 0), 2), n, round(t, 2);
  end if;

  -- (b) nobody excluded from payroll may hold an entry
  select count(*), string_agg(p.employee_name, '، ') into bad, names
    from public.payroll_entries e join public.profiles p on p.id = e.employee_id
   where e.run_id = old.id and p.payroll_excluded;
  if bad > 0 then
    raise exception 'بالدورة قيود لموظفين مستبعدين من الرواتب (%): احذفها قبل الاعتماد.', names;
  end if;

  -- (c) every net must re-add from its own components
  select count(*) into bad from public.payroll_entries e
   where e.run_id = old.id
     and abs(coalesce(e.net_salary_usd, 0) - (coalesce(e.base_salary_usd, 0) + coalesce(e.allowances_usd, 0)
         + coalesce(e.commission_usd, 0) + coalesce(e.bonus_usd, 0) - coalesce(e.deductions_usd, 0)
         - coalesce(e.absence_deduction_usd, 0) - coalesce(e.shortfall_deduction_usd, 0)
         - coalesce(e.advance_deduction_usd, 0))) > 0.011;
  if bad > 0 then raise exception '% قيد صافيه لا يساوي مجموع مكوناته — أعد تشغيل الدورة.', bad; end if;

  -- (d) automatic entries: allowances_usd must equal the stored breakdown
  select count(*) into bad from public.payroll_entries e
   where e.run_id = old.id and e.source is distinct from 'manual'
     and abs(coalesce(e.allowances_usd, 0) - coalesce((
           select sum((i ->> 'usd')::numeric) from jsonb_array_elements(e.allowances_detail) i), 0)) > 0.011;
  if bad > 0 then raise exception '% قيد آلي بدلاته لا تطابق تفصيل البدلات المحفوظ — أعد تشغيل الدورة.', bad; end if;

  return new;
end $$;

create trigger payroll_runs_zz_consistency_gate
  before update on public.payroll_runs
  for each row execute function public.payroll_run_consistency_gate();
