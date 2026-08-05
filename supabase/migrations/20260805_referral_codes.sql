-- =============================================================
-- Migration 20260805 — Referral codes («دعوات انتشار» — نمو بالإحالة عبر واتساب)
--
-- سبرنت نمو: كل عميل راضٍ يصير قناة اكتساب. البائع يولّد كوداً قصيراً
-- للعميل من CustomersScreen، لوزي يصيغ رسالة دعوة تتضمّنه، والعميل
-- يشاركه مع صديق. عند طلب جديد من صديق يذكر الكود، البائع يسجّله
-- كإحالة ناجحة من نفس الشاشة (بلا لمس نموذج إنشاء الطلب الكبير —
-- تقليل مخاطرة على شاشة حسّاسة).
--
-- SAFE: جدول جديد بالكامل، لا يمس أي جدول موجود. RLS بسياسة مسموحة
-- (USING/WITH CHECK true) — تفادياً لعطل "قفل جلسات PIN" الموثّق
-- بالذاكرة (سياسات auth.uid() تفشل لمستخدمي تسجيل الدخول بـPIN لأن
-- الجلسة ليست جلسة Supabase Auth حقيقية). نفس نمط payroll_entries.
-- =============================================================

CREATE TABLE IF NOT EXISTS referral_codes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  text UNIQUE NOT NULL,
  referrer_phone_key    text NOT NULL,          -- digits-only (customerService.phoneKey)
  referrer_name         text,
  market                text CHECK (market IN ('syria','turkey')),
  created_by            text,                   -- اسم البائع اللي ولّد الكود
  created_at            timestamptz NOT NULL DEFAULT now(),
  -- التحويل الفعلي (redemption) — يُملأ لما صديق يطلب بالكود
  redeemed_order_id     uuid REFERENCES orders(id) ON DELETE SET NULL,
  redeemed_phone_key    text,
  redeemed_customer_name text,
  redeemed_by           text,                   -- البائع اللي سجّل التحويل
  redeemed_at           timestamptz,
  reward_status         text NOT NULL DEFAULT 'pending'
                        CHECK (reward_status IN ('pending','redeemed','rewarded'))
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_referrer ON referral_codes (referrer_phone_key);
CREATE INDEX IF NOT EXISTS idx_referral_codes_status   ON referral_codes (reward_status);
CREATE INDEX IF NOT EXISTS idx_referral_codes_market   ON referral_codes (market);

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_codes_all"
  ON referral_codes FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================================================
-- DONE — جدول جديد: referral_codes (0 تعديل على جداول موجودة)
-- =============================================================
