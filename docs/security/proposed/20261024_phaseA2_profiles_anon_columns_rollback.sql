-- ROLLBACK for 20261024_phaseA2_profiles_anon_columns — PROPOSED, NOT APPLIED.
-- !!! Restores anon's ability to insert profiles and update role/salary columns. !!!
-- Replays the profiles ACL snapshot (table + column level, every grantee). Refuses to run without it.
begin;
do $chk$ begin
  if to_regclass('_security_backup.acl_profiles_20261024') is null then
    raise exception 'snapshot _security_backup.acl_profiles_20261024 not found';
  end if;
end $chk$;
do $restore$
declare r record;
begin
  execute 'revoke all on table public.profiles from public, anon, authenticated, service_role';
  for r in select * from _security_backup.acl_profiles_20261024
           where kind = 'r' and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role') loop
    execute format('grant %s on table public.profiles to %s %s', r.privilege,
                   case when r.grantee = 'PUBLIC' then 'public' else quote_ident(r.grantee) end,
                   case when r.grantable then 'with grant option' else '' end);
  end loop;
  for r in select * from _security_backup.acl_profiles_20261024
           where kind = 'c' and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role') loop
    execute format('grant %s (%I) on table public.profiles to %s %s', r.privilege, r.col,
                   case when r.grantee = 'PUBLIC' then 'public' else quote_ident(r.grantee) end,
                   case when r.grantable then 'with grant option' else '' end);
  end loop;
end $restore$;
drop table if exists _security_backup.acl_profiles_20261024, _security_backup.meta_profiles_20261024;
do $drop$ begin
  if not exists (select 1 from pg_class c where c.relnamespace = '_security_backup'::regnamespace) then drop schema _security_backup; end if;
end $drop$;
commit;
