-- ROLLBACK for 20261024_audit_log_lockdown — PROPOSED, NOT APPLIED.
-- !!! This RESTORES THE INSECURE STATE (anonymous read/write/delete of public.audit_log). !!!
-- Use only if a legitimate writer broke, and re-lock as soon as it is fixed.
-- Restores exactly what production had on 24 Oct 2026:
--   policy allow_all_anon_aul (FOR ALL TO public USING true WITH CHECK true)
--   ACL {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
-- Rows added after the lockdown (if any) are NOT touched or removed.
begin;
drop trigger if exists audit_log_no_update_delete on public.audit_log;
drop trigger if exists audit_log_no_truncate on public.audit_log;
drop policy if exists audit_log_read_authorised on public.audit_log;

drop function if exists public.log_audit_event(text, text, text, jsonb, jsonb);
drop function if exists public.audit_row_change();
drop function if exists public.audit_log_append_only();

grant all on public.audit_log to anon, authenticated;
drop policy if exists allow_all_anon_aul on public.audit_log;
create policy allow_all_anon_aul on public.audit_log for all to public using (true) with check (true);
commit;
