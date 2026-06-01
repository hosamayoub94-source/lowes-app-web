-- ============================================================
-- Notifications RLS fix — align with PIN-auth (anon key) model
--
-- Problem: notifications policies used auth.uid() / auth.role()='authenticated'.
-- But most employees run on a MANUAL session (no Supabase Auth account),
-- so auth.uid() is NULL → they never saw any notification, and INSERTs
-- from anon sessions were rejected entirely.
--
-- Fix: open the policies to USING(true)/WITH CHECK(true) — exactly like the
-- rest of the app's tables — and rely on APP-LEVEL user_id filtering
-- (the service now always adds .eq('user_id', userId)).
--
-- Safe to re-run.
-- ============================================================

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own"  ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_auth" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own"  ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_own"  ON public.notifications;

-- Open policies (app filters by user_id explicitly)
CREATE POLICY "notifications_select_all" ON public.notifications
  FOR SELECT USING (true);

CREATE POLICY "notifications_insert_all" ON public.notifications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "notifications_update_all" ON public.notifications
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "notifications_delete_all" ON public.notifications
  FOR DELETE USING (true);
