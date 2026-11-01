-- Production bodies of the reopen path (pg_get_functiondef, read-only, 2 Nov 2026). Byte-exact; md5(prosrc) checked by the replay.
CREATE OR REPLACE FUNCTION public.payroll_s2_entries_snapshot(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT jsonb_build_object(
    'count', count(*),
    'total_net_usd', coalesce(sum(e.net_salary_usd), 0),
    'entries', coalesce(jsonb_object_agg(e.employee_id::text, jsonb_build_object(
        'net_salary_usd', e.net_salary_usd, 'base_salary_usd', e.base_salary_usd,
        'allowances_usd', e.allowances_usd, 'commission_usd', e.commission_usd,
        'shortfall_deduction_usd', e.shortfall_deduction_usd,
        'advance_deduction_usd', e.advance_deduction_usd, 'deductions_usd', e.deductions_usd,
        'bonus_usd', e.bonus_usd, 'source', e.source, 'computed_at', e.computed_at))
      FILTER (WHERE e.id IS NOT NULL), '{}'::jsonb))
  FROM public.payroll_entries e WHERE e.run_id = p_run_id;
$function$;

CREATE OR REPLACE FUNCTION public.payroll_reopen_run(p_run_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r    public.payroll_runs%ROWTYPE;
  snap jsonb;
BEGIN
  IF NOT public.payroll_can_finalize() THEN
    RAISE EXCEPTION 'إعادة الفتح لحسام وأماني فقط (D-090).' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'سبب إعادة الفتح إجباري (5 أحرف على الأقل).';
  END IF;
  SELECT * INTO r FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الدورة غير موجودة.'; END IF;
  IF NOT public.payroll_is_new_period(r.period_year, r.period_month) THEN
    RAISE EXCEPTION 'هذا المسار لدورات أيلول 2026+ فقط.';
  END IF;
  IF r.status = 'paid' THEN RAISE EXCEPTION 'الدورة مدفوعة — لا تُعاد فتحها (D-090).'; END IF;
  IF r.status <> 'finalized' THEN RAISE EXCEPTION 'إعادة الفتح من «معتمدة» فقط (الحالة: %).', r.status; END IF;

  snap := public.payroll_s2_entries_snapshot(p_run_id)
          || jsonb_build_object('approved_by', r.approved_by, 'finalized_at', r.finalized_at,
                                'rate_usd_try', r.rate_usd_try, 'rate_usd_syp', r.rate_usd_syp);

  PERFORM set_config('payroll.s2_path', 'rpc', true);
  UPDATE public.payroll_runs
     SET status = 'draft', approved_by = NULL, finalized_by = NULL, finalized_at = NULL, archived_at = NULL
   WHERE id = p_run_id;
  INSERT INTO public.payroll_run_events (run_id, period, action, actor, reason, before_snapshot)
  VALUES (p_run_id, r.period_year * 100 + r.period_month, 'reopen', auth.uid(), btrim(p_reason), snap);
  PERFORM set_config('payroll.s2_path', '', true);

  RETURN jsonb_build_object('run_id', p_run_id, 'status', 'draft');
END $function$;
