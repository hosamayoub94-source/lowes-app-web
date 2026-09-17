-- =============================================================
-- 20260917_report_source_results.sql — تفصيل «مصدر التثبيت» بالتقرير اليومي (D-085)
-- إضافي فقط: جدولان جديدان — لا يمسّان daily_reports/report_ad_results ولا أي صف قائم.
--
-- report_source_results: سطر لكل مصدر تثبيت من خارج الإعلانات النشطة بتقرير موظف/يوم.
--   kind: old_ad (إعلان قديم متوقف) | page (صفحاتنا — platform_key) | story | referral
--         | old_customer (زبون قديم/إعادة شراء) | other (نص حر)
--   label: لقطة نصية للعرض (اسم الحملة · الإعلان / اسم المنصة / النص الحر) — تبقى
--          حتى لو زال الربط (FK SET NULL).
--
-- report_source_platforms: قائمة المنصات القابلة للتوسعة (Instagram/Facebook/TikTok…)
--   تُضاف منصات جديدة من لوحة الميديا باير بلا تعديل كود.
--
-- الخانتان القديمتان بالرأس (old_customer_* / other_source_*) تبقى تُكتب من الشاشة
-- كمجاميع مشتقّة من هذه الأسطر → كل الرسوم والأرقام الحالية لا تتغيّر.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.report_source_platforms (
  key         text PRIMARY KEY,
  label       text NOT NULL,
  icon        text,
  sort_order  integer NOT NULL DEFAULT 100,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text
);

INSERT INTO public.report_source_platforms (key, label, icon, sort_order) VALUES
  ('instagram', 'Instagram', '📸', 10),
  ('facebook',  'Facebook',  '📘', 20),
  ('tiktok',    'TikTok',    '🎵', 30)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.report_source_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     uuid NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('old_ad','page','story','referral','old_customer','other')),
  campaign_id   uuid REFERENCES public.campaigns(id)    ON DELETE SET NULL,
  ad_id         uuid REFERENCES public.campaign_ads(id) ON DELETE SET NULL,
  platform_key  text REFERENCES public.report_source_platforms(key) ON DELETE SET NULL,
  label         text,
  count         integer NOT NULL DEFAULT 0,
  amount_try    numeric NOT NULL DEFAULT 0,
  amount_syp    numeric NOT NULL DEFAULT 0,
  amount_usd    numeric NOT NULL DEFAULT 0,
  currency      text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rsr_report ON public.report_source_results (report_id);
CREATE INDEX IF NOT EXISTS idx_rsr_ad     ON public.report_source_results (ad_id) WHERE ad_id IS NOT NULL;

-- نفس نموذج الوصول لبقية جداول التقارير (PIN-auth → anon): RLS مفتوح + grants.
ALTER TABLE public.report_source_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_source_results   ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rsp_all" ON public.report_source_platforms;
DROP POLICY IF EXISTS "rsr_all" ON public.report_source_results;
CREATE POLICY "rsp_all" ON public.report_source_platforms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rsr_all" ON public.report_source_results   FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.report_source_platforms TO anon, authenticated;
GRANT ALL ON public.report_source_results   TO anon, authenticated;
