-- =============================================================
-- Repoint ad_daily_logs.campaign_id FK to the canonical `campaigns` table.
-- (The /campaigns screen now uses `campaigns`, not `ad_campaigns`.)
-- ad_daily_logs is empty → zero data risk. Run ONCE in Supabase SQL Editor.
-- =============================================================
ALTER TABLE ad_daily_logs DROP CONSTRAINT IF EXISTS ad_daily_logs_campaign_id_fkey;
ALTER TABLE ad_daily_logs
  ADD CONSTRAINT ad_daily_logs_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
