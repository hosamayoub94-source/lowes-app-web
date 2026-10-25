-- Rollback of 20261025_auth_ban_on_deactivate.sql.
-- Removes the trigger/function. The backfill is NOT auto-reverted (re-opening a former employee's login is never the safe default);
-- to lift a specific ban manually:  update auth.users set banned_until = null where id = '<profile id>';
drop trigger if exists trg_sync_auth_ban_with_active on public.profiles;
drop function if exists public.sync_auth_ban_with_active();
