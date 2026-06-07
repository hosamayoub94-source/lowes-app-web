-- =============================================================
-- Campaign tracking system (Task #4)
-- Run ONCE in Supabase SQL Editor (or via Management API).
-- Additive & idempotent — safe to re-run.
-- =============================================================

-- 1. Extend ad_campaigns: cost (restricted) + assignment + dates
ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS cost_usd    numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assigned_to text[]        DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS start_date  date,
  ADD COLUMN IF NOT EXISTS end_date    date;

-- 2. campaign_ads already exists (id, campaign_id, ad_name, ad_image_url,
--    sort_order, status, created_at). Nothing to add.

-- 3. Per-ad daily employee logs (messages received / purchases / note)
CREATE TABLE IF NOT EXISTS ad_daily_logs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id   uuid REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  ad_id         uuid REFERENCES campaign_ads(id) ON DELETE CASCADE,
  employee_name text NOT NULL,
  log_date      date NOT NULL DEFAULT current_date,
  shift         text,
  messages      integer DEFAULT 0,   -- كم رسالة وصلت
  purchases     integer DEFAULT 0,   -- كم شخص اشترى
  note          text,                -- ملاحظة عن الإعلان
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adl_campaign ON ad_daily_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_adl_ad       ON ad_daily_logs(ad_id);
CREATE INDEX IF NOT EXISTS idx_adl_date     ON ad_daily_logs(log_date DESC);
CREATE INDEX IF NOT EXISTS idx_adl_emp      ON ad_daily_logs(employee_name);

-- Employees authenticate via PIN session (auth.uid() = null) → permissive RLS + grants.
ALTER TABLE ad_daily_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ad_daily_logs_all" ON ad_daily_logs;
CREATE POLICY "ad_daily_logs_all" ON ad_daily_logs FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON ad_daily_logs TO anon, authenticated;
