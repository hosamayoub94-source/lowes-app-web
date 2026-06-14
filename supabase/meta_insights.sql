-- ================================================================
-- ربط ميتا الإعلاني — جدول رؤى الإعلانات + ربط حملاتنا (يونيو 2026)
-- مطبّق حيّاً عبر Supabase SQL Editor. RLS مفتوح + GRANT (PIN-auth).
-- التعبئة عبر Edge Function sync-meta-insights (تحتاج سرّي META).
-- ================================================================

-- ربط حملاتنا/إعلاناتنا بمعرّفات ميتا (للإسناد الدقيق؛ يكمّل المطابقة بالاسم).
ALTER TABLE campaigns    ADD COLUMN IF NOT EXISTS meta_campaign_id text;
ALTER TABLE campaign_ads ADD COLUMN IF NOT EXISTS meta_ad_id text;

CREATE TABLE IF NOT EXISTS meta_ad_insights (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date             date NOT NULL,
  meta_campaign_id text,
  meta_ad_id       text,
  campaign_id      uuid,            -- حملتنا (resolved بالاسم/الربط)؛ null=غير مرتبط
  ad_id            uuid,
  campaign_name    text,
  ad_name          text,
  spend            numeric DEFAULT 0,
  reach            integer DEFAULT 0,
  impressions      integer DEFAULT 0,
  results          integer DEFAULT 0,   -- رسائل/ليدز (actions)
  ctr              numeric DEFAULT 0,
  cpc              numeric DEFAULT 0,
  cpm              numeric DEFAULT 0,
  currency         text,
  updated_at       timestamptz DEFAULT now(),
  UNIQUE (date, meta_ad_id)
);

ALTER TABLE meta_ad_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meta_ad_insights_all ON meta_ad_insights;
CREATE POLICY meta_ad_insights_all ON meta_ad_insights FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON meta_ad_insights TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_mai_date     ON meta_ad_insights (date);
CREATE INDEX IF NOT EXISTS idx_mai_campaign ON meta_ad_insights (campaign_id);
