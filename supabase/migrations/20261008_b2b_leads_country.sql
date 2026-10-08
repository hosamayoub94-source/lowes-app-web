-- =============================================================
-- Migration 20261008 — B2B Leads: عمود الدولة + قسم الإمارات (D-119)
-- ⚠️ NOT APPLIED — مسودة جاهزة، لا تُطبَّق إلا بموافقة حسام الصريحة.
--
-- الهدف: نفس جدول syria_b2b_leads ونفس الشاشة يخدمان أكثر من دولة (سوريا،
-- الإمارات، ودول لاحقة) بفلتر دولة — بدل جدول/شاشة مكرّرة (المادة 1).
--
-- حماية بيانات سوريا (لا UPDATE على أي صف):
--   1) country NOT NULL DEFAULT 'SY' — بـPostgres 11+ هذا تغيير بيانات وصفية فقط:
--      كل صف قائم يُقرأ 'SY' بلا إعادة كتابة، وبقية الأعمدة لا تُلمس.
--   2) أي إدخال قديم لا يرسل country (الشاشة الحالية، المهمة الأسبوعية) يأخذ 'SY' تلقائياً.
--   3) قيمة تواجد جديدة 'unverified' (غير متحقق) تُضاف للقائمة المسموحة فقط —
--      الافتراضي يبقى 'not_listed' ولا يتغيّر أي صف.
--
-- فصل الدول على مستوى القاعدة:
--   السياسة المفتوحة "syria_leads_all" (USING true) تُستبدل بسياسة تقصر الوصول
--   المباشر (anon/authenticated عبر المتصفح) على صفوف سوريا فقط — نفس ما يراه
--   الفريق اليوم بالضبط. صفوف أي دولة أخرى لا تُقرأ ولا تُكتب إلا عبر الدالة
--   b2b-leads (service_role + فحص صلاحية من الخادم). service_role يتجاوز RLS.
--
-- التحقق قبل/بعد: supabase/tests/b2b_leads_country_verify.sql (عدد + بصمة).
-- الرجوع: supabase/rollbacks/20261008_b2b_leads_country_rollback.sql
-- =============================================================

ALTER TABLE syria_b2b_leads
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'SY';

ALTER TABLE syria_b2b_leads DROP CONSTRAINT IF EXISTS syria_b2b_leads_country_check;
ALTER TABLE syria_b2b_leads ADD CONSTRAINT syria_b2b_leads_country_check
  CHECK (country ~ '^[A-Z]{2}$');

-- 'unverified' = لم نتحقق من وجود Lowe's عند هذه الجهة (عدم العثور على دليل ≠ غير موجودين)
ALTER TABLE syria_b2b_leads DROP CONSTRAINT IF EXISTS syria_b2b_leads_lowes_presence_check;
ALTER TABLE syria_b2b_leads ADD CONSTRAINT syria_b2b_leads_lowes_presence_check
  CHECK (lowes_presence IN ('not_listed','contacted','in_talks','listed','rejected','not_applicable','unverified'));

CREATE INDEX IF NOT EXISTS idx_syria_leads_country ON syria_b2b_leads (country);

DROP POLICY IF EXISTS "syria_leads_all" ON syria_b2b_leads;
DROP POLICY IF EXISTS "b2b_leads_direct_syria_only" ON syria_b2b_leads;
CREATE POLICY "b2b_leads_direct_syria_only"
  ON syria_b2b_leads FOR ALL
  USING (country = 'SY')
  WITH CHECK (country = 'SY');

-- =============================================================
-- DONE — عمود + قيد + فهرس + سياسة. صفر UPDATE/DELETE على البيانات.
-- =============================================================
