-- =============================================================
-- activity_logs read access (29 Oct 2026, decision D-172 follow-up)
--
-- Before: policy activity_logs_select_anon (USING true, role public) let EVERY logged-in employee read the whole
-- audit trail (2,435 rows). Now: own rows (existing al_select), admin (existing al_select), rows with no user
-- (593 — failed-login/system events; kept readable so INSERT ... RETURNING for user-less events keeps working),
-- and anyone holding view_analytics (manager, sales_manager, media_buyer, marketing_manager + per-user grants;
-- admin passes app_has_permission) — the roles that use the dashboard's «recent activity» (kpiEngine.fetchRecentActivity).
-- Not touched: activity_logs_insert_anon (INSERT check true) — a separate integrity question (forged user_id).
--
-- Measured with a rolled-back session simulation before applying:
--   admin/manager/sales/media_buyer/hr(view_analytics) see all; employee, warehouse and a manager with view_analytics
--   denied see only own + user-less rows (~600); own and user-less inserts with RETURNING still succeed for all.
-- Rollback: drop policy al_select_analytics on public.activity_logs;
--           create policy activity_logs_select_anon on public.activity_logs for select to public using (true);
-- =============================================================
drop policy if exists activity_logs_select_anon on public.activity_logs;
drop policy if exists al_select_analytics on public.activity_logs;
create policy al_select_analytics on public.activity_logs for select to authenticated
  using (user_id is null or public.app_has_permission('view_analytics'));
