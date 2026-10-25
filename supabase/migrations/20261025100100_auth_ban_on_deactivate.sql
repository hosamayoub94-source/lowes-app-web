-- 20261025_auth_ban_on_deactivate.sql
-- ROLE/PERMISSION AUDIT fix F-05: deactivating a profile (is_active=false) did not revoke its Supabase Auth identity.
-- verify-pin refuses inactive accounts, but anyone who still knows the PIN (the Auth password is "lp:<pin>") can call the
-- Auth endpoint directly with the public anon key and get an `authenticated` JWT -- and most tables are open to `authenticated`.
-- Live check 2026-10-25: 14 inactive profiles had a non-banned auth.users row.
-- This trigger keeps auth.users.banned_until in step with profiles.is_active for EVERY write path (admin UI, manage-employee, SQL).
-- Reactivation lifts the ban. Existing JWTs expire normally; only new sign-ins / refreshes are blocked.
create or replace function public.sync_auth_ban_with_active()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, auth, pg_temp
as $$
begin
  if new.is_active is distinct from old.is_active then
    if new.is_active is false then
      update auth.users set banned_until = 'infinity'::timestamptz where id = new.id;
    elsif new.is_active is true then
      update auth.users set banned_until = null where id = new.id and banned_until is not null;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.sync_auth_ban_with_active() from public, anon, authenticated;

drop trigger if exists trg_sync_auth_ban_with_active on public.profiles;
create trigger trg_sync_auth_ban_with_active
  after update of is_active on public.profiles
  for each row execute function public.sync_auth_ban_with_active();

-- One-time backfill: ban the auth identities of profiles that are ALREADY inactive and not banned.
update auth.users a set banned_until = 'infinity'::timestamptz
  from public.profiles p
 where p.id = a.id and p.is_active is false
   and (a.banned_until is null or a.banned_until < now());
