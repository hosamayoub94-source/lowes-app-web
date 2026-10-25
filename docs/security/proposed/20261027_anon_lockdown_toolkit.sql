-- 20261027_anon_lockdown_toolkit.sql  (audit F-01, phase 2)
-- Helpers that remove an API role's (`anon` = the public app key, or `authenticated` = any signed-in user) access to a list of tables in
-- small, REVERSIBLE batches. Every privilege removed (table-level AND column-level) is first copied to public.security_grant_backup, so
--   select public.security_restore_anon('<batch>');  /  select public.security_restore_role('<batch>', '<role>');
-- puts back exactly what was there. RLS policies are not touched.
create table if not exists public.security_grant_backup (
  batch      text not null,
  grantee    text not null default 'anon',
  table_name text not null,
  privilege  text not null,
  col_name   text not null default '',   -- '' = table-level grant
  taken_at   timestamptz not null default now(),
  primary key (batch, grantee, table_name, privilege, col_name)
);
alter table public.security_grant_backup enable row level security;
revoke all on public.security_grant_backup from anon, authenticated;

create or replace function public.security_revoke_role(p_batch text, p_role text, p_tables text[])
 returns integer
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  t text; r record; n integer := 0;
  role_oid oid;
begin
  if p_batch is null or p_batch !~ '^[a-z0-9_]+$' then raise exception 'invalid batch name'; end if;
  if p_role not in ('anon', 'authenticated') then raise exception 'only anon / authenticated can be revoked here'; end if;
  role_oid := (select oid from pg_roles where rolname = p_role);
  foreach t in array p_tables loop
    if to_regclass('public.' || quote_ident(t)) is null then continue; end if;   -- table may not exist in every environment
    insert into public.security_grant_backup (batch, grantee, table_name, privilege, col_name)
      select p_batch, p_role, t, x.privilege_type, ''
        from pg_class c, lateral aclexplode(c.relacl) x
       where c.oid = to_regclass('public.' || quote_ident(t)) and x.grantee = role_oid
      on conflict do nothing;
    insert into public.security_grant_backup (batch, grantee, table_name, privilege, col_name)
      select p_batch, p_role, t, x.privilege_type, a.attname
        from pg_attribute a, lateral aclexplode(a.attacl) x
       where a.attrelid = to_regclass('public.' || quote_ident(t)) and a.attnum > 0 and not a.attisdropped
         and a.attacl is not null and x.grantee = role_oid
      on conflict do nothing;
    execute format('revoke all privileges on table public.%I from %I', t, p_role);
    for r in select a.attname, x.privilege_type
               from pg_attribute a, lateral aclexplode(a.attacl) x
              where a.attrelid = to_regclass('public.' || quote_ident(t)) and a.attnum > 0 and not a.attisdropped
                and a.attacl is not null and x.grantee = role_oid loop
      execute format('revoke %s (%I) on table public.%I from %I', r.privilege_type, r.attname, t, p_role);
    end loop;
    n := n + 1;
  end loop;
  return n;
end;
$function$;

create or replace function public.security_restore_role(p_batch text, p_role text)
 returns integer
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare r record; n integer := 0;
begin
  for r in select * from public.security_grant_backup where batch = p_batch and grantee = p_role order by table_name, col_name loop
    if to_regclass('public.' || quote_ident(r.table_name)) is null then continue; end if;
    if r.col_name = '' then
      execute format('grant %s on table public.%I to %I', r.privilege, r.table_name, p_role);
    else
      execute format('grant %s (%I) on table public.%I to %I', r.privilege, r.col_name, r.table_name, p_role);
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$function$;

create or replace function public.security_revoke_anon(p_batch text, p_tables text[])
 returns integer language sql security definer set search_path = public, pg_temp
as $$ select public.security_revoke_role(p_batch, 'anon', p_tables) $$;

create or replace function public.security_restore_anon(p_batch text)
 returns integer language sql security definer set search_path = public, pg_temp
as $$ select public.security_restore_role(p_batch, 'anon') $$;

revoke all on function public.security_revoke_role(text, text, text[]), public.security_restore_role(text, text),
  public.security_revoke_anon(text, text[]), public.security_restore_anon(text) from public, anon, authenticated;
