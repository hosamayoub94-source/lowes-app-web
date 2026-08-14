-- =============================================================
-- Migration 20260814 — تتبّع تحويل حملات واتساب لمبيعات فعلية
--
-- الحاجة: حسام طلب إمكانية للموظف/ة تصنّف "هاي العميلة اشترت" من نفس شاشة
-- محادثة واتساب، وتقرير سريع "شو بعنا من هالحملة" بدل تخمين.
--
-- SAFE: أعمدة جديدة فقط (nullable/بقيمة افتراضية) على جدول موجود أصلاً
-- (campaign_sends، RLS مسموح USING/WITH CHECK true — نفس نمط الجدول
-- الحالي، لا تعديل على أي عمود/سياسة موجودة).
-- =============================================================

ALTER TABLE campaign_sends
  ADD COLUMN IF NOT EXISTS converted        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted_amount numeric,
  ADD COLUMN IF NOT EXISTS converted_at     timestamptz,
  ADD COLUMN IF NOT EXISTS converted_by     text;

CREATE INDEX IF NOT EXISTS idx_campaign_sends_converted ON campaign_sends (campaign_key, converted);

-- =============================================================
-- DONE — 0 تعديل على جداول/سياسات موجودة، أعمدة إضافية فقط
-- =============================================================
