-- =============================================================
-- Orders read access for logged-in staff (29 Oct 2026)
--
-- Context: 20261028211215 orders_anon_access_containment revoked every anon
-- privilege on public.orders. The app read and wrote orders through a
-- session-less client (supabaseAnon = anon role), so since 21:12 UTC on 28 Oct
-- every orders request from the app returned 401 (empty Syria/Turkey/UAE
-- order lists, failed new orders and status changes).
--
-- Fix (keeps the anon lockout as is): the app now sends orders requests with
-- the user's own session (authenticated role), and this policy lets any
-- ACTIVE staff profile read orders — the same visibility every employee had
-- before through the anon client. Writes are unchanged (orders_insert /
-- orders_update / orders_delete were already open to authenticated).
-- Inactive profiles, orphan Auth users (no profile) and anon get nothing.
-- =============================================================

CREATE OR REPLACE FUNCTION public.auth_is_active_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND COALESCE(p.is_active, true)
  );
$function$;

REVOKE ALL ON FUNCTION public.auth_is_active_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_is_active_staff() TO authenticated;

DROP POLICY IF EXISTS orders_select_active_staff ON public.orders;
CREATE POLICY orders_select_active_staff ON public.orders
  FOR SELECT TO authenticated
  USING ((SELECT public.auth_is_active_staff()));

-- Rollback (restores the state right after 20261028211215, anon stays revoked):
--   DROP POLICY IF EXISTS orders_select_active_staff ON public.orders;
--   DROP FUNCTION IF EXISTS public.auth_is_active_staff();
