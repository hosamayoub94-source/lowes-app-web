-- =====================================================================
-- PROPOSED — NOT APPLIED — UNTESTED DRAFT. Test on a staging copy first, then get
-- the owner's explicit approval. Findings come from a READ-ONLY production check
-- on 23 Oct 2026 (nothing was modified).
-- 20261023_payroll_server_hardening
--
-- Gaps this closes (all verified read-only):
--  A) Historical periods (< 2026-10) are NOT protected in the database: the s2 guard
--     returns immediately for old periods, so anyone with payroll_access can
--     UPDATE/DELETE closed historical runs/entries (incl. the paid July run).
--  B) payroll_approve_run checks only "month setup newer than calculation". Changed
--     salary settings / allowances / absence decisions, or a zero-salary entry, are
--     blocked only by the browser — a direct RPC call bypasses it.
--  C) Audit: approve/pay/reopen are logged in payroll_run_events and salary
--     settings have a log trigger, but edits to payroll_entries, absence decisions,
--     allowances and payroll_access leave no trace.
-- Rollback: 20261023_payroll_server_hardening_rollback.sql
-- =====================================================================
begin;

-- ── A) historical lock ------------------------------------------------
create or replace function public.payroll_period_is_historical(p_year int, p_month int)
returns boolean language sql immutable as
$$ select coalesce(p_year * 100 + p_month, 0) < 202610 $$;

create or replace function public.payroll_historical_runs_lock() returns trigger
language plpgsql as $$
begin
  if current_setting('payroll.historical_unlock', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if (tg_op <> 'INSERT' and public.payroll_period_is_historical(old.period_year, old.period_month))
     or (tg_op <> 'DELETE' and public.payroll_period_is_historical(new.period_year, new.period_month)) then
    raise exception 'دورة تاريخية (قبل تشرين الأول 2026) أُغلقت خارج التطبيق — للعرض فقط.'
      using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function public.payroll_historical_entries_lock() returns trigger
language plpgsql as $$
declare v_run uuid; v_y int; v_m int;
begin
  if current_setting('payroll.historical_unlock', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_run := case when tg_op = 'DELETE' then old.run_id else new.run_id end;
  select period_year, period_month into v_y, v_m from public.payroll_runs where id = v_run;
  if public.payroll_period_is_historical(v_y, v_m) then
    raise exception 'بنود دورة تاريخية (قبل تشرين الأول 2026) — للعرض فقط.'
      using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger payroll_runs_historical_lock before insert or update or delete on public.payroll_runs
  for each row execute function public.payroll_historical_runs_lock();
create trigger payroll_entries_historical_lock before insert or update or delete on public.payroll_entries
  for each row execute function public.payroll_historical_entries_lock();

-- ── C) audit trail ----------------------------------------------------
create or replace function public.payroll_audit_fn() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  insert into public.audit_log (actor, action, table_name, record_id, before_data, after_data)
  values (coalesce(auth.uid()::text, 'system'), tg_op, tg_table_name,
          coalesce(r ->> 'id', r ->> 'profile_id'),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger payroll_entries_audit after insert or update or delete on public.payroll_entries
  for each row execute function public.payroll_audit_fn();
create trigger payroll_absence_reviews_audit after insert or update or delete on public.payroll_absence_reviews
  for each row execute function public.payroll_audit_fn();
create trigger payroll_allowances_audit after insert or update or delete on public.payroll_allowances
  for each row execute function public.payroll_audit_fn();
create trigger payroll_access_audit after insert or update or delete on public.payroll_access
  for each row execute function public.payroll_audit_fn();

-- ── B) server-side approval gates (replaces payroll_approve_run; only the marked
--       block is new — everything else is the current production definition) ────
create or replace function public.payroll_approve_run(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  r        public.payroll_runs%rowtype;
  n        int;
  total    numeric;
  stale    int;
  oldest   timestamptz;
  last_ev  public.payroll_run_events%rowtype;
  cur      jsonb;
  chg      jsonb := null;
begin
  if not public.payroll_can_finalize() then
    raise exception 'الاعتماد لحسام وأماني فقط (D-090).' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.payroll_runs where id = p_run_id for update;
  if not found then raise exception 'الدورة غير موجودة.'; end if;
  if not public.payroll_is_new_period(r.period_year, r.period_month) then
    raise exception 'هذا المسار لدورات أيلول 2026+ فقط — الدورات القديمة على مسارها الحالي.';
  end if;
  if public.payroll_period_is_historical(r.period_year, r.period_month) then
    raise exception 'دورة تاريخية (قبل تشرين الأول 2026) — لا تُعتمد.';
  end if;
  if r.status <> 'draft' then raise exception 'الدورة ليست مسودة (الحالة: %).', r.status; end if;
  if r.month_setup_confirmed_at is null then raise exception 'إعداد الشهر غير مؤكَّد.'; end if;
  if not (coalesce(r.rate_usd_try, 0) > 0 and coalesce(r.rate_usd_syp, 0) > 0) then
    raise exception 'سعر الصرف للدورة ناقص (D-090 البند 15).';
  end if;
  select count(*), coalesce(sum(net_salary_usd), 0),
         count(*) filter (where computed_at is null or computed_at < r.month_setup_confirmed_at),
         min(computed_at) filter (where source is distinct from 'manual')
    into n, total, stale, oldest
    from public.payroll_entries where run_id = p_run_id;
  if n = 0 then raise exception 'لا بنود بالدورة — شغّل الحسبة أولاً.'; end if;
  if stale > 0 then raise exception 'تغيّر إعداد الشهر بعد آخر حسبة لـ% بند — أعد تشغيل الدورة.', stale; end if;

  -- >>> NEW (B): inputs changed after the oldest automatic calculation, or a zero-salary line
  if oldest is not null and (
       exists (select 1 from public.employee_salary_settings where updated_at > oldest)
    or exists (select 1 from public.payroll_allowances      where updated_at > oldest)
    or exists (select 1 from public.payroll_absence_reviews where updated_at > oldest)) then
    raise exception 'تغيّرت الرواتب أو البدلات أو قرارات الغياب بعد آخر حسبة — أعد تشغيل الدورة قبل الاعتماد.';
  end if;
  if exists (select 1 from public.payroll_entries where run_id = p_run_id and coalesce(base_salary_usd, 0) = 0) then
    raise exception 'يوجد قيد براتب أساسي صفر — حدّد راتبه أو استبعده من الرواتب قبل الاعتماد.';
  end if;
  -- <<< END NEW

  select * into last_ev from public.payroll_run_events where run_id = p_run_id order by id desc limit 1;
  if found and last_ev.action = 'reopen' then
    cur := public.payroll_s2_entries_snapshot(p_run_id);
    select jsonb_build_object(
             'total_net_before', last_ev.before_snapshot -> 'total_net_usd',
             'total_net_after',  cur -> 'total_net_usd',
             'employees', coalesce(jsonb_agg(jsonb_build_object('employee_id', k, 'before', b, 'after', a)), '[]'::jsonb))
      into chg
      from (
        select coalesce(bo.key, ao.key) k, bo.value b, ao.value a
        from jsonb_each(last_ev.before_snapshot -> 'entries') bo
        full join jsonb_each(cur -> 'entries') ao on ao.key = bo.key
      ) d
     where (d.b - 'computed_at') is distinct from (d.a - 'computed_at');
  end if;

  perform set_config('payroll.s2_path', 'rpc', true);
  update public.payroll_runs
     set status = 'finalized', approved_by = auth.uid(), finalized_by = auth.uid(),
         finalized_at = now(), total_net_usd = total, employee_count = n
   where id = p_run_id;
  insert into public.payroll_run_events (run_id, period, action, actor, changes)
  values (p_run_id, r.period_year * 100 + r.period_month, 'approve', auth.uid(), chg);
  perform set_config('payroll.s2_path', '', true);

  return jsonb_build_object('run_id', p_run_id, 'status', 'finalized', 'employee_count', n, 'total_net_usd', total, 'changes', chg);
end $function$;

commit;
