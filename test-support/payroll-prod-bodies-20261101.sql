-- Production bodies as of 1 Nov 2026 (read with pg_get_functiondef, read-only). Test fixture only.
CREATE OR REPLACE FUNCTION public.payroll_runs_s2_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  old_new boolean := false;
  new_new boolean := false;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_new := public.payroll_is_new_period(OLD.period_year, OLD.period_month); END IF;
  IF TG_OP <> 'DELETE' THEN new_new := public.payroll_is_new_period(NEW.period_year, NEW.period_month); END IF;

  IF NOT old_new AND NOT new_new THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF public.payroll_s2_authorized_path() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'دورة أيلول 2026+ تبدأ مسودة فقط — الاعتماد عبر payroll_approve_run (D-090).'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'دورة أيلول 2026+ معتمدة/مدفوعة — لا تُحذف (D-090).'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  IF old_new AND NOT new_new THEN
    RAISE EXCEPTION 'لا يمكن نقل دورة أيلول 2026+ إلى شهر قديم (D-090).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'تغيير حالة دورة أيلول 2026+ عبر payroll_approve_run / payroll_reopen_run / payroll_mark_paid فقط (D-090).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status <> 'draft' THEN
    IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL
       AND (to_jsonb(NEW) - 'archived_at') = (to_jsonb(OLD) - 'archived_at') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'دورة أيلول 2026+ معتمدة/مدفوعة — لا تُعدَّل. أعد فتحها أولاً (D-090).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.payroll_approve_run(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r        public.payroll_runs%ROWTYPE;
  n        int;
  total    numeric;
  stale    int;
  last_ev  public.payroll_run_events%ROWTYPE;
  cur      jsonb;
  chg      jsonb := NULL;
BEGIN
  IF NOT public.payroll_can_finalize() THEN
    RAISE EXCEPTION 'الاعتماد لحسام وأماني فقط (D-090).' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO r FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الدورة غير موجودة.'; END IF;
  IF NOT public.payroll_is_new_period(r.period_year, r.period_month) THEN
    RAISE EXCEPTION 'هذا المسار لدورات أيلول 2026+ فقط — الدورات القديمة على مسارها الحالي.';
  END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'الدورة ليست مسودة (الحالة: %).', r.status; END IF;
  IF r.month_setup_confirmed_at IS NULL THEN RAISE EXCEPTION 'إعداد الشهر غير مؤكَّد.'; END IF;
  IF NOT (coalesce(r.rate_usd_try, 0) > 0 AND coalesce(r.rate_usd_syp, 0) > 0) THEN
    RAISE EXCEPTION 'سعر الصرف للدورة ناقص (D-090 البند 15).';
  END IF;
  SELECT count(*), coalesce(sum(net_salary_usd), 0),
         count(*) FILTER (WHERE computed_at IS NULL OR computed_at < r.month_setup_confirmed_at)
    INTO n, total, stale
    FROM public.payroll_entries WHERE run_id = p_run_id;
  IF n = 0 THEN RAISE EXCEPTION 'لا بنود بالدورة — شغّل الحسبة أولاً.'; END IF;
  IF stale > 0 THEN RAISE EXCEPTION 'تغيّر إعداد الشهر بعد آخر حسبة لـ% بند — أعد تشغيل الدورة.', stale; END IF;

  SELECT * INTO last_ev FROM public.payroll_run_events
   WHERE run_id = p_run_id ORDER BY id DESC LIMIT 1;
  IF FOUND AND last_ev.action = 'reopen' THEN
    cur := public.payroll_s2_entries_snapshot(p_run_id);
    SELECT jsonb_build_object(
             'total_net_before', last_ev.before_snapshot -> 'total_net_usd',
             'total_net_after',  cur -> 'total_net_usd',
             'employees', coalesce(jsonb_agg(jsonb_build_object(
                 'employee_id', k, 'before', b, 'after', a)), '[]'::jsonb))
      INTO chg
      FROM (
        SELECT coalesce(bo.key, ao.key) k, bo.value b, ao.value a
        FROM jsonb_each(last_ev.before_snapshot -> 'entries') bo
        FULL JOIN jsonb_each(cur -> 'entries') ao ON ao.key = bo.key
      ) d
     WHERE (d.b - 'computed_at') IS DISTINCT FROM (d.a - 'computed_at');
  END IF;

  PERFORM set_config('payroll.s2_path', 'rpc', true);
  UPDATE public.payroll_runs
     SET status = 'finalized', approved_by = auth.uid(), finalized_by = auth.uid(),
         finalized_at = now(), total_net_usd = total, employee_count = n
   WHERE id = p_run_id;
  INSERT INTO public.payroll_run_events (run_id, period, action, actor, changes)
  VALUES (p_run_id, r.period_year * 100 + r.period_month, 'approve', auth.uid(), chg);
  PERFORM set_config('payroll.s2_path', '', true);

  RETURN jsonb_build_object('run_id', p_run_id, 'status', 'finalized',
                            'employee_count', n, 'total_net_usd', total, 'changes', chg);
END $function$;

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

CREATE TRIGGER payroll_runs_s2_guard BEFORE INSERT OR DELETE OR UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION payroll_runs_s2_guard();
CREATE TRIGGER payroll_runs_zz_consistency_gate BEFORE UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION payroll_run_consistency_gate();
