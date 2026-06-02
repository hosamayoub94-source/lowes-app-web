-- ============================================================
-- activity_logs RLS fix — allow PIN-based employees to write audit logs
--
-- Problem: employees authenticate via PIN (manual session), so
-- auth.uid() is NULL. The existing INSERT policy required auth.uid(),
-- so EVERY employee action failed to log ("violates row-level
-- security policy for table activity_logs"). Same root cause as the
-- notifications_rls_fix. Audit logs are append-only — safe to allow
-- inserts from anon/authenticated. Reads stay admin-only (AuditDashboard).
-- Safe to re-run.
-- ============================================================

-- Table-level INSERT grant (column grants don't cover INSERT)
GRANT INSERT ON public.activity_logs TO anon, authenticated;

-- Permissive INSERT policy
DROP POLICY IF EXISTS activity_logs_insert_anon ON public.activity_logs;
CREATE POLICY activity_logs_insert_anon
  ON public.activity_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
