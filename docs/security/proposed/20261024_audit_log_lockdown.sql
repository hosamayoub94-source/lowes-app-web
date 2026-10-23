-- =====================================================================
-- PROPOSED — NOT APPLIED. Requires the owner's explicit approval.
-- 20261024_audit_log_lockdown  (CRITICAL — closes anonymous read/forge/erase of public.audit_log)
--
-- Verified read-only on production (24 Oct 2026):
--   • policy allow_all_anon_aul: FOR ALL TO public USING (true) WITH CHECK (true)
--   • anon AND authenticated hold INSERT/SELECT/UPDATE/DELETE/TRUNCATE/... on the table
--   • 22 rows, all from table 'requests', 2026-04-29 → 2026-05-21, content md5 f0c6becb6b0aaa178e79ae7a5a561dc5
--   • nothing in this repo (src/, supabase/functions) references audit_log; no FK, view,
--     function or trigger depends on it; it is not in a realtime publication.
--
-- What this does (NO existing row is read, changed or deleted):
--   1. removes the open policy; revokes ALL from public/anon/authenticated
--   2. read = SELECT for authenticated, gated by RLS to is_admin_user() OR payroll_has_access()
--   3. append-only: triggers refuse UPDATE / DELETE / TRUNCATE for everybody (incl. owner and
--      service_role); only a superuser who disables the trigger in a reviewed transaction can
--   4. writes only through two SECURITY DEFINER paths with search_path fixed to public,pg_temp:
--        • audit_row_change()  - row trigger helper: before/after come from OLD/NEW, actor = auth.uid()
--        • log_audit_event()   - app-level events: actor = auth.uid() (no actor parameter),
--          ip/user-agent are read from the PostgREST request headers, action is stored as 'app:<x>'
--          so a client-asserted event can never be mistaken for a trigger-captured one
--   service_role (server key) keeps its table rights and bypasses RLS: it can INSERT; it cannot
--   UPDATE/DELETE/TRUNCATE because of the triggers.
--
-- RE-RUNNABLE (idempotent). Rollback: 20261024_audit_log_lockdown_rollback.sql — it puts the
-- INSECURE state back; use only if something legitimate broke, and re-lock afterwards.
-- =====================================================================
begin;

-- 1) policy + privileges ------------------------------------------------
drop policy if exists allow_all_anon_aul on public.audit_log;
alter table public.audit_log enable row level security;
revoke all on public.audit_log from public, anon, authenticated;
grant select on public.audit_log to authenticated;

drop policy if exists audit_log_read_authorised on public.audit_log;
create policy audit_log_read_authorised on public.audit_log
  for select to authenticated
  using (public.is_admin_user() or public.payroll_has_access());

-- 2) append-only ----------------------------------------------------------
create or replace function public.audit_log_append_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'سجل التدقيق للإضافة فقط — لا تعديل ولا حذف.' using errcode = 'insufficient_privilege';
end $$;
revoke all on function public.audit_log_append_only() from public, anon, authenticated;

drop trigger if exists audit_log_no_update_delete on public.audit_log;
create trigger audit_log_no_update_delete before update or delete on public.audit_log
  for each row execute function public.audit_log_append_only();
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_append_only();

-- 3a) trigger helper: before/after captured from the row itself --------------
-- usage (later, per table):  create trigger x_audit after insert or update or delete on public.x
--                              for each row execute function public.audit_row_change();
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  insert into public.audit_log (actor, action, table_name, record_id, before_data, after_data)
  values (coalesce(auth.uid()::text, 'system'), lower(tg_op), tg_table_name, r ->> 'id',
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.audit_row_change() from public, anon, authenticated;

-- 3b) app-level events (client-asserted) -----------------------------------
create or replace function public.log_audit_event(
  p_action text, p_table_name text, p_record_id text default null,
  p_before jsonb default null, p_after jsonb default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_id uuid; h jsonb;
begin
  if v_uid is null then
    raise exception 'تسجيل التدقيق يتطلب مستخدماً مسجّلاً.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_action), '') = '' or coalesce(btrim(p_table_name), '') = '' then
    raise exception 'الإجراء واسم الجدول مطلوبان.';
  end if;
  begin h := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then h := null; end;
  insert into public.audit_log (actor, action, table_name, record_id, before_data, after_data, ip_address, user_agent)
  values (v_uid::text, 'app:' || left(btrim(p_action), 60), left(btrim(p_table_name), 128), left(p_record_id, 128),
          p_before, p_after,
          nullif(btrim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), ''), left(h ->> 'user-agent', 300))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.log_audit_event(text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.log_audit_event(text, text, text, jsonb, jsonb) to authenticated;

commit;
