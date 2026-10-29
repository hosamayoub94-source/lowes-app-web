-- Backfilled 29 Oct 2026 from production supabase_migrations.schema_migrations (version 20261029065432).
-- Applied DIRECTLY to fghdumrgimoeqsafdhhh on 29 Oct 2026 06:54 UTC (not from the repo); this file records it. Text is verbatim.
-- Reviewed 29 Oct: intended access = any ACTIVE staff profile with a real session reads the ACTIVE staff directory
-- (names, roles, teams — what the in-app pickers, chat and task assignment need). anon stays locked out.
-- Note: it does NOT fix the login screen, which runs BEFORE a session exists; that is served by the login-directory Edge Function.
GRANT EXECUTE ON FUNCTION public.current_role_type() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_team() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_active_staff() TO authenticated;
CREATE POLICY profiles_select_active_staff_directory
ON public.profiles
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND public.auth_is_active_staff()
);
