-- ============================================================
-- migration_v9_social_calendar.sql — Lowe's Staff App
-- SAFE TO RE-RUN (idempotent) — نفّذ في Supabase SQL Editor
-- ============================================================
-- 1. social_posts — تقويم محتوى السوشال ميديا
-- 2. orders.delivery_cost — رسوم توصيل سوريا
-- ============================================================

-- ┌─────────────────────────────────────────────────────────────┐
-- │  1. social_posts — جدول تقويم المحتوى                       │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS social_posts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_date     date        NOT NULL,
  platform      text        NOT NULL
                CHECK (platform IN ('instagram','tiktok','facebook','youtube','snapchat','other')),
  content_type  text,       -- reel, post, story, carousel, video, live
  caption       text,       -- نص المنشور أو فكرته
  status        text        NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','approved','scheduled','published')),
  assigned_to   text,       -- اسم المصمم/المنفذ
  created_by    text,       -- اسم من أضاف البوست
  notes         text,       -- رابط تصميم، ملاحظة
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_date     ON social_posts(post_date);
CREATE INDEX IF NOT EXISTS idx_social_posts_platform ON social_posts(platform);
CREATE INDEX IF NOT EXISTS idx_social_posts_status   ON social_posts(status);

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_posts_open" ON social_posts;
CREATE POLICY "social_posts_open" ON social_posts
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON social_posts TO anon, authenticated;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE social_posts;


-- ┌─────────────────────────────────────────────────────────────┐
-- │  2. orders.delivery_cost — رسوم التوصيل للطلبات السورية     │
-- └─────────────────────────────────────────────────────────────┘

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_cost numeric DEFAULT 0;
