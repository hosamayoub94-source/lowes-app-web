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
END $function$
;
