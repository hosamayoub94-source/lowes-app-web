-- =============================================================
-- Migration 20260925(16) — B2B Leads: متاجر أونلاين + تتبّع تواجد Lowe's
--
-- طلب حسام (25 أيلول 2026): تطوير نظام B2B ليصير أكثر فائدة، وإضافة قائمة
-- بكل المتاجر الأونلاين في سوريا ("لازم نكون في كل المتاجر") مع تحديث دوري
-- يجلب الجديد — بيانات حقيقية بمصادر، لا اختلاق (منهجية D-093).
--
-- SAFE / EXPAND ONLY: أعمدة جديدة كلها nullable أو بقيمة افتراضية، لا حذف،
-- لا تغيير بأي عمود أو صف قائم. الصفوف الـ66 الحالية تبقى lead_type='physical'.
-- لا تغيير بسياسات RLS (خارج نطاق هذه المهمة — راجع SAFE REPAIR ROADMAP §4).
-- =============================================================

ALTER TABLE syria_b2b_leads
  ADD COLUMN IF NOT EXISTS lead_type         text NOT NULL DEFAULT 'physical',  -- physical | online
  ADD COLUMN IF NOT EXISTS channel           text,          -- website | marketplace | app | instagram | facebook
  ADD COLUMN IF NOT EXISTS website           text,
  ADD COLUMN IF NOT EXISTS email             text,
  ADD COLUMN IF NOT EXISTS telegram          text,
  ADD COLUMN IF NOT EXISTS sells_beauty      boolean,       -- يبيع تجميل/عناية؟ (null = غير معروف)
  ADD COLUMN IF NOT EXISTS accepts_sellers   boolean,       -- منصة متعددة البائعين يمكن لـLowe's أن تبيع عليها؟
  ADD COLUMN IF NOT EXISTS delivery_coverage text,
  -- تواجد Lowe's على هذا المتجر/المنصة (هدف: نكون بكل المتاجر) — يحدّثه الفريق
  ADD COLUMN IF NOT EXISTS lowes_presence    text NOT NULL DEFAULT 'not_listed',
  ADD COLUMN IF NOT EXISTS lowes_listing_url text,
  ADD COLUMN IF NOT EXISTS presence_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS presence_updated_by text,
  -- حداثة البيانات البحثية
  ADD COLUMN IF NOT EXISTS discovered_at     timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_verified_at  timestamptz,
  ADD COLUMN IF NOT EXISTS discovery_source  text;          -- مثال: 'research:2026-09-25' / 'weekly-refresh' / 'dex.sy'

-- الصفوف القائمة: discovered_at = تاريخ إنشائها الفعلي (لا "الآن").
UPDATE syria_b2b_leads SET discovered_at = created_at WHERE discovered_at > created_at;

ALTER TABLE syria_b2b_leads DROP CONSTRAINT IF EXISTS syria_b2b_leads_lead_type_check;
ALTER TABLE syria_b2b_leads ADD CONSTRAINT syria_b2b_leads_lead_type_check
  CHECK (lead_type IN ('physical','online'));

ALTER TABLE syria_b2b_leads DROP CONSTRAINT IF EXISTS syria_b2b_leads_lowes_presence_check;
ALTER TABLE syria_b2b_leads ADD CONSTRAINT syria_b2b_leads_lowes_presence_check
  CHECK (lowes_presence IN ('not_listed','contacted','in_talks','listed','rejected','not_applicable'));

CREATE INDEX IF NOT EXISTS idx_syria_leads_lead_type     ON syria_b2b_leads (lead_type);
CREATE INDEX IF NOT EXISTS idx_syria_leads_presence      ON syria_b2b_leads (lowes_presence);
CREATE INDEX IF NOT EXISTS idx_syria_leads_discovered_at ON syria_b2b_leads (discovered_at DESC);
-- منع تكرار نفس المتجر الأونلاين عند التحديث الدوري (نفس الموقع = نفس المتجر)
CREATE UNIQUE INDEX IF NOT EXISTS uq_syria_leads_website
  ON syria_b2b_leads (lower(regexp_replace(website, '^https?://(www\.)?|/+$', '', 'g')))
  WHERE website IS NOT NULL;

-- =============================================================
-- DONE — expand-only
-- =============================================================
