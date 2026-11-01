-- التراجع عن 20261102_payroll_sales_drift_gate.sql: يعيد مشغّل الاتساق كما كان بالإنتاج في 1/11/2026 ويحذف المشغّلين والدوال الجديدة.
-- لا يمسّ أي بيانات (دورات/قيود/طلبات).
BEGIN;

CREATE OR REPLACE FUNCTION public.payroll_run_consistency_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n int; t numeric; bad int; names text;
begin
  if not (old.status = 'draft' and new.status in ('finalized', 'approved', 'paid')) then return new; end if;
  if not public.payroll_period_is_operational(old.period_year, old.period_month) then return new; end if;

  select count(*)::int, coalesce(sum(net_salary_usd), 0) into n, t from public.payroll_entries where run_id = old.id;
  if old.employee_count is distinct from n or round(coalesce(old.total_net_usd, 0), 2) <> round(t, 2) then
    raise exception 'ملخص الدورة لا يطابق القيود: الملخص % موظف / $% بينما القيود % موظف / $% — أعد تشغيل الدورة.',
      coalesce(old.employee_count, 0), round(coalesce(old.total_net_usd, 0), 2), n, round(t, 2);
  end if;

  select count(*), string_agg(p.employee_name, '، ') into bad, names
    from public.payroll_entries e join public.profiles p on p.id = e.employee_id
   where e.run_id = old.id and p.payroll_excluded;
  if bad > 0 then
    raise exception 'بالدورة قيود لموظفين مستبعدين من الرواتب (%): احذفها قبل الاعتماد.', names;
  end if;

  select count(*) into bad from public.payroll_entries e
   where e.run_id = old.id
     and abs(coalesce(e.net_salary_usd, 0) - (coalesce(e.base_salary_usd, 0) + coalesce(e.allowances_usd, 0)
         + coalesce(e.commission_usd, 0) + coalesce(e.bonus_usd, 0) - coalesce(e.deductions_usd, 0)
         - coalesce(e.absence_deduction_usd, 0) - coalesce(e.shortfall_deduction_usd, 0)
         - coalesce(e.advance_deduction_usd, 0))) > 0.011;
  if bad > 0 then raise exception '% قيد صافيه لا يساوي مجموع مكوناته — أعد تشغيل الدورة.', bad; end if;

  select count(*) into bad from public.payroll_entries e
   where e.run_id = old.id and e.source is distinct from 'manual'
     and abs(coalesce(e.allowances_usd, 0) - coalesce((
           select sum((i ->> 'usd')::numeric) from jsonb_array_elements(e.allowances_detail) i), 0)) > 0.011;
  if bad > 0 then raise exception '% قيد آلي بدلاته لا تطابق تفصيل البدلات المحفوظ — أعد تشغيل الدورة.', bad; end if;

  return new;
end $function$;

DROP TRIGGER IF EXISTS payroll_runs_period_guard ON public.payroll_runs;
DROP FUNCTION IF EXISTS public.payroll_runs_period_guard();
DROP TRIGGER IF EXISTS payroll_entries_payment_guard ON public.payroll_entries;
DROP FUNCTION IF EXISTS public.payroll_entries_payment_guard();
DROP FUNCTION IF EXISTS public.payroll_assert_sales_fresh(uuid, text);
DROP FUNCTION IF EXISTS public.payroll_sales_drift(uuid);
DROP FUNCTION IF EXISTS public.payroll_live_team_sales(uuid);
DROP FUNCTION IF EXISTS public.payroll_norm_name(text);

COMMIT;
