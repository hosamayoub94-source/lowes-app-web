-- =============================================================
-- 0006 — منظومة المحاسبة: محافظ + كتابان (تشغيلي/مركزي) + قنوات
-- =============================================================
-- يصلح عطل «السحب» + يبني نظام القنوات والربح/الخسارة لكل مصدر.
--
-- ⚠️ القاعدة الحيّة قد تكون أحدث من المستودع. تحقّق من أسماء القيود
--    والأعمدة الفعلية قبل التشغيل. كل الأوامر idempotent (آمنة للتكرار).
-- التطبيق: Supabase → SQL Editor → الصق → Run.
--
-- لاكتشاف أسماء قيود CHECK الفعلية على الجدول (إن اختلفت عن الافتراضية):
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'accounting_entries'::regclass AND contype = 'c';
-- ثم احذف الاسم المكتشَف بـ DROP CONSTRAINT IF EXISTS <name>; قبل الإضافة.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- الجزء 1 (المرحلة 0) — توسيع القيود: رموز المحافظ + نوع «تحويل»
--   يصلح «السحب مش عم يسحب»: payment_method='cash_usd' كان مرفوضاً.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE accounting_entries DROP CONSTRAINT IF EXISTS accounting_entries_payment_method_check;
ALTER TABLE accounting_entries
  ADD CONSTRAINT accounting_entries_payment_method_check
  CHECK (payment_method IN (
    'cash','bank','sham_cash','transfer','card',          -- عام/قديم
    'cash_usd','cash_syp','cash_try',                     -- محافظ كاش
    'sham_syp','sham_usd',                                -- محافظ شام كاش
    'bank_usd','bank_try'                                 -- محافظ بنكية
  ));

ALTER TABLE accounting_entries DROP CONSTRAINT IF EXISTS accounting_entries_entry_type_check;
ALTER TABLE accounting_entries
  ADD CONSTRAINT accounting_entries_entry_type_check
  CHECK (entry_type IN ('income','expense','salary','advance','bonus','transfer'));


-- ─────────────────────────────────────────────────────────────
-- الجزء 2 (المرحلة 1) — الكتابان (تشغيلي/مركزي) + ربط سيقان التحويل
-- ─────────────────────────────────────────────────────────────

ALTER TABLE accounting_entries ADD COLUMN IF NOT EXISTS book text NOT NULL DEFAULT 'central';
ALTER TABLE accounting_entries DROP CONSTRAINT IF EXISTS accounting_entries_book_check;
ALTER TABLE accounting_entries
  ADD CONSTRAINT accounting_entries_book_check CHECK (book IN ('operational','central'));

ALTER TABLE accounting_entries ADD COLUMN IF NOT EXISTS transfer_group uuid;

CREATE INDEX IF NOT EXISTS idx_acct_book           ON accounting_entries (book);
CREATE INDEX IF NOT EXISTS idx_acct_transfer_group ON accounting_entries (transfer_group);

-- Backfill: نحافظ على الرصيد التشغيلي المألوف (الدخل/المصروف = عمل فادي/وسيم).
-- الرواتب/السلف/المكافآت تبقى مركزية (كانت تُسجّل في /ledger).
-- عكوس بأمر واحد. تحقّق قبل/بعد:  SELECT book, count(*) FROM accounting_entries GROUP BY book;
UPDATE accounting_entries SET book = 'operational'
 WHERE book = 'central' AND entry_type IN ('income','expense');


-- ─────────────────────────────────────────────────────────────
-- الجزء 3 (المرحلة 2) — جدول القنوات (المصادر/الجهات) + ربطها بالقيد
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS accounting_channels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar         text NOT NULL,
  kind            text NOT NULL CHECK (kind IN
                    ('shipping','distributor','marketer','online','supplier','expense','recurring','other')),
  currency        text CHECK (currency IN ('USD','TRY','SYP')),   -- NULL = متعدد العملات
  is_active       boolean NOT NULL DEFAULT true,                  -- فتح/تسكير القناة
  allows_income   boolean NOT NULL DEFAULT true,                  -- فيها وارد
  allows_expense  boolean NOT NULL DEFAULT true,                  -- فيها صادر
  book            text NOT NULL DEFAULT 'operational' CHECK (book IN ('operational','central')),
  sort_order      int  NOT NULL DEFAULT 100,
  icon            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE accounting_channels ENABLE ROW LEVEL SECURITY;

-- قراءة: كل مستخدم مُصادَق. كتابة: أدمن/مدير.
DROP POLICY IF EXISTS accounting_channels_select_all ON accounting_channels;
CREATE POLICY accounting_channels_select_all
  ON accounting_channels FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS accounting_channels_write_admin_manager ON accounting_channels;
CREATE POLICY accounting_channels_write_admin_manager
  ON accounting_channels FOR ALL
  USING     (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type IN ('admin','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type IN ('admin','manager')));

-- ربط القيد بقناة (اختياري — يبقى category كاحتياط/تسمية).
ALTER TABLE accounting_entries
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES accounting_channels(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_acct_channel ON accounting_entries (channel_id);

-- Realtime (محميّ ضد التكرار).
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE accounting_channels;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- بذرة القنوات الأساسية (idempotent عبر WHERE NOT EXISTS على الاسم).
INSERT INTO accounting_channels (name_ar, kind, allows_income, allows_expense, book, sort_order, icon)
SELECT v.name_ar, v.kind, v.allows_income, v.allows_expense, 'operational', v.sort_order, v.icon
FROM (VALUES
  -- شركات الشحن (وارد COD + صادر رسوم)
  ('قدموس',        'shipping',    true,  true,  10, '🚚'),
  ('الكرم',        'shipping',    true,  true,  11, '🚚'),
  ('الموتور',      'shipping',    true,  true,  12, '🏍️'),
  ('ايزلا',        'shipping',    true,  true,  13, '🚚'),
  ('توصيل جرمانا', 'shipping',    true,  true,  14, '🛵'),
  -- مصادر الدخل (قنوات أب — الأفراد يُضافون من الشاشة)
  ('أونلاين',      'online',      true,  false, 20, '🛒'),
  ('مسوّقين',      'marketer',    true,  false, 21, '📣'),
  ('موزّعين',      'distributor', true,  true,  22, '🤝'),
  -- بنود المصاريف المتكررة
  ('شحن',          'recurring',   false, true,  30, '📦'),
  ('أجور',         'recurring',   false, true,  31, '💸'),
  ('مشتريات',      'recurring',   false, true,  32, '🛍️'),
  ('إيجار',        'recurring',   false, true,  33, '🏠'),
  ('إعلانات',      'recurring',   false, true,  34, '📢')
) AS v(name_ar, kind, allows_income, allows_expense, sort_order, icon)
WHERE NOT EXISTS (SELECT 1 FROM accounting_channels c WHERE c.name_ar = v.name_ar);

-- (اختياري) السماح للمحاسب بالكتابة لو صار دور فادي/وسيم 'accountant' لاحقاً:
-- DROP POLICY IF EXISTS accounting_channels_write_accountant ON accounting_channels;
-- CREATE POLICY accounting_channels_write_accountant ON accounting_channels FOR ALL
--   USING     (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'accountant'))
--   WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'accountant'));
