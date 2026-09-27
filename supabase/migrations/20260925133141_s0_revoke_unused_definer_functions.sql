-- =============================================================
-- S0-1 / S0-2 / S0-3 — SAFE REPAIR ROADMAP (2026-09-25)
-- Revoke EXECUTE from PUBLIC, anon, authenticated on SECURITY DEFINER
-- functions that have ZERO live application callers.
--
-- Scope (and ONLY this): function EXECUTE privileges.
-- NOT touched: RLS, table grants, admin_reset_pin, auth, manual session,
-- supabaseAnon, business logic, data, secrets, env, deployment.
--
-- Kept: postgres (owner — pg_cron jobs run as postgres) and service_role.
--
-- Caller verification performed before this migration:
--  * repo grep (src, supabase/functions, scripts, google-apps-script, public):
--    no caller of any function below outside migration/cron SQL.
--  * git history: MLM RPC callers were added 2026-06-08 (b137d7e) and removed
--    2026-06-09 (f49d00e); update_my_profile/recompute_wallet/place_in_matrix/
--    apply_seller_progress never had an app caller.
--  * edge_logs (last 24h): zero /rest/v1/rpc/ calls to any function below.
--  * pg_catalog: no trigger, policy, or view uses any of them. Internal calls
--    (post_order_commission -> apply_seller_progress; set_recruiter_by_invite
--    -> place_in_matrix) run as the definer (postgres) and are unaffected.
--  * cron: pull-star-orders-2min / retry-failed-syncs-10min /
--    generate-quiz-daily call run_* as user `postgres` — unaffected.
--
-- Pre-change ACL for every function below (identical):
--   {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- ROLLBACK (restores the exact pre-change ACL):
--   GRANT EXECUTE ON FUNCTION <each signature below> TO PUBLIC, anon, authenticated;
-- =============================================================

-- ── S0-1 ──────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.update_my_profile(text, text)            FROM PUBLIC, anon, authenticated;

-- ── S0-2 (cron-only wrappers) ─────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.run_pull_star_orders()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_quiz_generation()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_retry_failed_syncs()                 FROM PUBLIC, anon, authenticated;

-- ── S0-3 (legacy MLM / distribution system, removed from app 2026-06-09) ──
REVOKE EXECUTE ON FUNCTION public.post_order_commission(uuid)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_wallet(uuid)                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_seller_progress(uuid, text)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.place_in_matrix(uuid, uuid)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_recruiter_by_invite(text)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_invite_code(uuid)                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.my_downline(uuid, text)                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.manager_commission_report(text)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.overdue_orders(boolean)                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.commission_leaderboard(text, integer)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.commission_statement(uuid, text)         FROM PUBLIC, anon, authenticated;
