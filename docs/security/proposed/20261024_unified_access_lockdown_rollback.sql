-- ROLLBACK for 20261024_unified_access_lockdown — PROPOSED, NOT APPLIED.
-- !!! Restores the pre-lockdown ACLs, including the anonymous read/write exposure. !!!
-- Replays the snapshot taken by the migration (tables, views, column privileges, the one function),
-- re-creates the open policy on audit_log, removes the objects the migration added, and drops the
-- snapshot schema at the end. Refuses to run if the snapshot is missing.
-- Data rows (including audit_log rows added after the lockdown) are never touched.
begin;

do $chk$
begin
  if to_regclass('_security_backup.acl_20261024') is null then
    raise exception 'snapshot _security_backup.acl_20261024 not found — cannot roll back automatically';
  end if;
end $chk$;

-- audit_log: remove what the lockdown added
drop trigger if exists audit_log_no_update_delete on public.audit_log;
drop trigger if exists audit_log_no_truncate on public.audit_log;
drop policy if exists audit_log_read_authorised on public.audit_log;
drop function if exists public.log_audit_event(text, text, text, jsonb, jsonb);
drop function if exists public.audit_row_change();
drop function if exists public.audit_log_append_only();

-- ACLs: wipe the roles the migration touched, then replay the snapshot
do $restore$
declare r record;
begin
  for r in select distinct obj from _security_backup.acl_20261024 where kind in ('r', 'c') loop
    execute format('revoke all on table %s from public, anon, authenticated, service_role', r.obj);
  end loop;
  for r in select * from _security_backup.acl_20261024
           where kind = 'r' and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role') loop
    execute format('grant %s on table %s to %s %s', r.privilege, r.obj,
                   case when r.grantee = 'PUBLIC' then 'public' else quote_ident(r.grantee) end,
                   case when r.grantable then 'with grant option' else '' end);
  end loop;
  for r in select * from _security_backup.acl_20261024
           where kind = 'c' and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role') loop
    execute format('grant %s (%I) on table %s to %s %s', r.privilege, r.col, r.obj,
                   case when r.grantee = 'PUBLIC' then 'public' else quote_ident(r.grantee) end,
                   case when r.grantable then 'with grant option' else '' end);
  end loop;
  for r in select distinct obj from _security_backup.acl_20261024 where kind = 'f' loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', r.obj);
  end loop;
  for r in select * from _security_backup.acl_20261024
           where kind = 'f' and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role') loop
    execute format('grant %s on function %s to %s %s', r.privilege, r.obj,
                   case when r.grantee = 'PUBLIC' then 'public' else quote_ident(r.grantee) end,
                   case when r.grantable then 'with grant option' else '' end);
  end loop;
end $restore$;

-- audit_log: the open policy exactly as found
drop policy if exists allow_all_anon_aul on public.audit_log;
create policy allow_all_anon_aul on public.audit_log for all to public using (true) with check (true);

drop schema _security_backup cascade;
commit;
