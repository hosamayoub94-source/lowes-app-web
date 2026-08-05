-- =============================================================
-- Migration 20260805b — Campaign send log (تتبّع الحملات الجماعية)
--
-- المشكلة: sendBulkCampaign كانت ترسل وتسجّل بجدول الرسائل العام فقط،
-- بلا أي ربط باسم الحملة — بلا طريقة تعرف "مين استلم حملة كذا ومين لأ"،
-- ولا فلترة "استبعد المُرسَل لهم" لمنع إزعاج نفس العميل مرتين.
--
-- SAFE: جدول جديد بالكامل. نفس نمط RLS المسموح (USING/WITH CHECK true)
-- المستخدم بـreferral_codes/payroll_entries — تفادياً لعطل قفل جلسات PIN.
-- =============================================================

CREATE TABLE IF NOT EXISTS campaign_sends (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_key   text NOT NULL,          -- مفتاح ثابت (مثال: 'hair_density_promo_v2')
  campaign_label text,                   -- اسم ودّي للعرض (مثال: "كثافة الشعر — خصم 30%")
  template_sid   text,
  phone_key      text NOT NULL,          -- customerService.phoneKey (digits-only)
  customer_name  text,
  market         text,
  sent_by        text,                   -- اسم الموظف اللي شغّل الحملة
  sent_at        timestamptz NOT NULL DEFAULT now(),
  status         text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed'))
);

CREATE INDEX IF NOT EXISTS idx_campaign_sends_campaign ON campaign_sends (campaign_key);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_phone    ON campaign_sends (phone_key);

ALTER TABLE campaign_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_sends_all"
  ON campaign_sends FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================================================
-- DONE — جدول جديد: campaign_sends (0 تعديل على جداول موجودة)
-- =============================================================
