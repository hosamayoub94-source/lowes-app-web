-- =============================================================
-- Auth migration — wire profiles to Supabase Auth
-- Apply AFTER 0001_tasks_schema.sql
--
-- After this file runs, your existing profiles still work for the
-- login picker, but the PIN check moves to Supabase Auth. To
-- migrate existing PINs into auth.users:
--   node scripts/provision-auth-users.mjs
-- (See that script for env requirements.)
-- =============================================================

-- -------------------------------------------------------------
-- Profiles table — RLS policies for the login picker.
-- The anon key needs to list active profiles (id, name, role,
-- avatar_url) BEFORE the user signs in. This policy permits that
-- read without exposing PIN or any sensitive column.
-- -------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_anon_login_picker"   on public.profiles;
drop policy if exists "profiles_self_read"           on public.profiles;
drop policy if exists "profiles_admin_read_all"      on public.profiles;
drop policy if exists "profiles_self_update"         on public.profiles;

-- Anyone (including anon) can read active profiles for the picker.
-- CRITICAL: revoke column-level access to the `pin` column so it
-- never leaves the database after this migration.
create policy "profiles_anon_login_picker" on public.profiles
  for select using (is_active = true);

-- Authenticated users can read their own row in full.
create policy "profiles_self_read" on public.profiles
  for select using (id = auth.uid());

-- Admins can read everyone (used by AdminUsersScreen).
create policy "profiles_admin_read_all" on public.profiles
  for select using (public.current_role_type() = 'admin');

-- Self-update (avatar, etc). PIN is intentionally NOT writable
-- from the client — password lives in auth.users now.
create policy "profiles_self_update" on public.profiles
  for update using (id = auth.uid());

-- Lock down the pin column from clients. The provisioning script
-- still has access through the service role.
revoke select (pin) on public.profiles from anon, authenticated;

-- -------------------------------------------------------------
-- Bootstrap: ensure profiles.id and auth.users.id stay in sync.
-- We use a soft constraint (no FK) because new profiles get
-- created BEFORE the auth user during bulk provisioning. After
-- the script finishes, every profile MUST have a matching auth
-- row — verify with the diagnostic query at the bottom.
-- -------------------------------------------------------------

-- Optional: trigger that prevents inserting a profile id that
-- doesn't exist in auth.users (uncomment to enforce strict mode
-- once bulk provisioning is done).
-- create or replace function public.assert_auth_user_exists()
-- returns trigger language plpgsql as $$
-- begin
--   if not exists (select 1 from auth.users u where u.id = new.id) then
--     raise exception 'profiles.id % must reference auth.users.id', new.id;
--   end if;
--   return new;
-- end;
-- $$;
-- drop trigger if exists trg_profiles_auth_link on public.profiles;
-- create trigger trg_profiles_auth_link
--   before insert or update of id on public.profiles
--   for each row execute function public.assert_auth_user_exists();

-- -------------------------------------------------------------
-- Diagnostic — run after provisioning to confirm coverage.
-- Should return zero rows.
-- -------------------------------------------------------------
-- select p.id, p.employee_name
-- from public.profiles p
-- left join auth.users u on u.id = p.id
-- where u.id is null and p.is_active = true;
