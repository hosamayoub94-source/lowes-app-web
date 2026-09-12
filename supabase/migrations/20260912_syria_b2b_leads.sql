-- =============================================================
-- Migration 20260912 — Syria B2B Leads («ليدز سوريا B2B»)
--
-- قاعدة بيانات مرشحين B2B بسوريا (صيدليات، عيادات جلدية، مراكز تجميل،
-- متاجر/موزعو مستحضرات) لفريق مبيعات Lowe's Profesyonel. بُنيت أول مرة
-- كصفحة Artifact بقاعدة بيانات مستقلة (Pilot دمشق+طرطوس، 12 أيلول 2026)
-- ثم دُمجت هنا بطلب حسام ليصير الوصول محكوماً بصلاحيات التطبيق (من يشوف
-- الشاشة، من يقدر يحدّث حالة كل Lead) بدل رابط خارجي مفتوح لكل حامل رابط.
--
-- المرجع الكامل للمنهجية (بحث/تحقق/Scoring/Dedup، لا اختلاق): مجلد
-- "SYRIA_B2B_LEADS" بمركز القيادة (ABOS) + `09_Decision_Register.md` § D-093.
--
-- SAFE: جدول جديد بالكامل، لا يمس أي جدول موجود. RLS بسياسة مسموحة
-- (USING/WITH CHECK true) — نفس نمط attendance/referral_codes/leave_requests:
-- الأمان الفعلي بمستوى التطبيق (شاشة الليدز محمية بصلاحية VIEW_SYRIA_LEADS
-- بـ`src/data/permissions.js`، لا auth.uid() لأن الدخول بـPIN لا Supabase Auth).
-- =============================================================

CREATE TABLE IF NOT EXISTS syria_b2b_leads (
  id                  text PRIMARY KEY,              -- lead_id الأصلي مثل SYR-DAM-0009
  province            text NOT NULL,                  -- Damascus / Tartous / ...
  city                text,
  district            text,
  name                text NOT NULL,                  -- اسم النشاط (عربي أو إنجليزي، أياً وُجد)
  category            text,                           -- صيدلية / عيادة جلدية / مركز تجميل / متجر-مورد مستحضرات / موزّع
  address             text,
  contact_person      text,
  phone               text,
  phone_tel           text,                           -- جاهز لـ href="tel:"
  whatsapp            text,
  whatsapp_link        text,                          -- جاهز لـ href="https://wa.me/..."
  instagram           text,
  instagram_link       text,
  facebook            text,
  priority            text NOT NULL DEFAULT 'D'        -- A / B / C / D (تصنيف البحث، لا حالة التواصل)
                        CHECK (priority IN ('A+','A','B','C','D')),
  score               int NOT NULL DEFAULT 0,
  verified            text NOT NULL DEFAULT 'discovered_unconfirmed'
                        CHECK (verified IN ('verified_multi_source','verified_single_source','discovered_unconfirmed','closed_or_uncertain')),
  reason              text,                           -- شرح التحقق/التحفظ (من البحث، بالعربي)
  source_urls         text,                           -- مصادر التحقق، مفصولة بـ|

  -- ── حالة التواصل الفعلية (يحدّثها فريق المبيعات من الشاشة) ──────
  status              text NOT NULL DEFAULT 'not_contacted'
                        CHECK (status IN ('not_contacted','contacted','interested','not_interested','customer')),
  assigned_to         text,                           -- الموظف المسؤول عن هذا الـLead
  notes               text,                           -- ملاحظة حرة من الفريق (لا تُخلَط بـreason البحثي)
  status_updated_at   timestamptz,
  status_updated_by   text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_syria_leads_province ON syria_b2b_leads (province);
CREATE INDEX IF NOT EXISTS idx_syria_leads_priority ON syria_b2b_leads (priority);
CREATE INDEX IF NOT EXISTS idx_syria_leads_status   ON syria_b2b_leads (status);
CREATE INDEX IF NOT EXISTS idx_syria_leads_category ON syria_b2b_leads (category);

ALTER TABLE syria_b2b_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "syria_leads_all" ON syria_b2b_leads;
CREATE POLICY "syria_leads_all"
  ON syria_b2b_leads FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================================================
-- DONE — جدول جديد: syria_b2b_leads (0 تعديل على جداول موجودة)
-- =============================================================
