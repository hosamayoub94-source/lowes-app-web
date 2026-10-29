-- Backfilled 29 Oct 2026 from production supabase_migrations.schema_migrations (version 20261028213700).
-- Already applied to fghdumrgimoeqsafdhhh on 28 Oct 2026 21:37 UTC; this file only records it in the repo. Text is verbatim.
DO $block$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'activity_logs','ad_daily_logs','ad_results','alerts','alert_rules','analytics_snapshots',
    'attachments','attendance','attendance_events','attendance_records','break_sessions',
    'campaign_ads','campaigns','chat_join_requests','chat_last_read','chat_messages','chat_pinned',
    'chat_reactions','chat_room_members','chat_rooms','clients','commission_ledger','commissions',
    'consignments','crm_clients','crm_visits','daily_reports','daily_sales_ad_results',
    'daily_sales_channel_results','dashboard_widgets','employee_badges','employee_partnerships',
    'file_activity','file_folders','file_shares','file_versions','files','inventory_adjustments',
    'inventory_daily_log','notifications','performance','report_ad_results','report_exports',
    'report_source_platforms','report_source_results','saved_reports','shift_groups','shift_partners',
    'shift_schedule','stock_levels','task_activity','task_comments','task_points','task_subtasks',
    'task_timeline','tasks','task_status_history','wh_movements','wh_warehouses','withdrawals',
    'order_status_history','partnership_requests','partnerships','customer_contacts'
  ] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', t);
    END IF;
  END LOOP;
END
$block$;
