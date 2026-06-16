-- =============================================================
-- 0006 — منظومة المحاسبة: محافظ + كتابان (تشغيلي/مركزي) + قنوات
-- =============================================================
-- يصلح عطل «السحب» + يبني نظام القنوات والربح/الخسارة لكل مصدر.
-- مُمتّن بعد تدقيق القاعدة الحيّة (92 صف · payment_method=cash/sham_cash ·
-- entry_type=income/expense/salary · category NOT NULL · 0 تحويلات · 0 تسليمات قديمة).
--
-- آمن: حذف القيود ديناميكي (محصّن ضد اختلاف الاسم)، القوائم الجديدة superset،
-- backfill بلا قفزة/ازدواج (لا تحويلات قديمة)، نسخة احتياطية للرجوع، معاملة واحدة.
-- التطبيق: Supabase → SQL Editor → الصق → Run.
-- =============================================================

BEGIN;

-- ── الجزء 1: توسيع قيود CHECK (حذف ديناميكي لأي قيد على العمود ثم إضافة الجديد) ──
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
    WHERE con.conrelid = 'accounting_entries'::regclass AND con.contype = 'c' AND a.attname = 'payment_method'
  LOOP EXECUTE format('ALTER TABLE accounting_entries DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
ALTER TABLE accounting_entries
  ADD CONSTRAINT accounting_entries_payment_method_check
  CHECK (payment_method IN (
    'cash','bank','sham_cash','transfer','card',
    'cash_usd','cash_syp','cash_try','sham_syp','sham_usd','bank_usd','bank_try'
  ));

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
    WHERE con.conrelid = 'accounting_entries'::regclass AND con.contype = 'c' AND a.attname = 'entry_type'
  LOOP EXECUTE format('ALTER TABLE accounting_entries DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
ALTER TABLE accounting_entries
  ADD CONSTRAINT accounting_entries_entry_type_check
  CHECK (entry_type IN ('income','expense','salary','advance','bonus','transfer'));

-- category كانت NOT NULL على القاعدة الحيّة؛ الكود يرسل null عند غياب المصدر → نسمح بالفراغ.
ALTER TABLE accounting_entries ALTER COLUMN category DROP NOT NULL;


-- ── الجزء 2: الكتابان (تشغيلي/مركزي) + ربط سيقان التحويل ──
ALTER TABLE accounting_entries ADD COLUMN IF NOT EXISTS book text NOT NULL DEFAULT 'central';
ALTER TABLE accounting_entries DROP CONSTRAINT IF EXISTS accounting_entries_book_check;
ALTER TABLE accounting_entries ADD CONSTRAINT accounting_entries_book_check CHECK (book IN ('operational','central'));
ALTER TABLE accounting_entries ADD COLUMN IF NOT EXISTS transfer_group uuid;
CREATE INDEX IF NOT EXISTS idx_acct_book           ON accounting_entries (book);
CREATE INDEX IF NOT EXISTS idx_acct_transfer_group ON accounting_entries (transfer_group);

-- نسخة احتياطية لقيم book قبل الـbackfill (للرجوع الدقيق). تُحذف بعد التحقق:
--   UPDATE accounting_entries e SET book=b.book FROM accounting_entries_bak_0006 b WHERE e.id=b.id;
--   DROP TABLE accounting_entries_bak_0006;
CREATE TABLE IF NOT EXISTS accounting_entries_bak_0006 AS SELECT id, book FROM accounting_entries;

-- Backfill: الدخل/المصروف = الحساب التشغيلي (يحفظ الرصيد الحالي تماماً)؛ الرواتب وغيرها مركزية.
-- (القاعدة الحيّة: 0 تحويلات و0 تسليمات قديمة → بلا قفزة بالرصيد ولا ازدواج.)
UPDATE accounting_entries SET book = 'operational'
 WHERE book = 'central' AND entry_type IN ('income','expense');


-- ── الجزء 3: جدول القنوات (المصادر/الجهات) + ربطها بالقيد ──
CREATE TABLE IF NOT EXISTS accounting_channels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar         text NOT NULL,
  kind            text NOT NULL CHECK (kind IN
                    ('shipping','distributor','marketer','online','supplier','expense','recurring','other')),
  currency        text CHECK (currency IN ('USD','TRY','SYP')),
  is_active       boolean NOT NULL DEFAULT true,
  allows_income   boolean NOT NULL DEFAULT true,
  allows_expense  boolean NOT NULL DEFAULT true,
  book            text NOT NULL DEFAULT 'operational' CHECK (book IN ('operational','central')),
  sort_order      int  NOT NULL DEFAULT 100,
  icon            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE accounting_channels ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting_channels TO anon, authenticated;

DROP POLICY IF EXISTS accounting_channels_select_all ON accounting_channels;
CREATE POLICY accounting_channels_select_all
  ON accounting_channels FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS accounting_channels_write_admin_manager ON accounting_channels;
CREATE POLICY accounting_channels_write_admin_manager
  ON accounting_channels FOR ALL
  USING     (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type IN ('admin','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type IN ('admin','manager')));

ALTER TABLE accounting_entries
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES accounting_channels(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_acct_channel ON accounting_entries (channel_id);

INSERT INTO accounting_channels (name_ar, kind, allows_income, allows_expense, book, sort_order, icon)
SELECT v.name_ar, v.kind, v.allows_income, v.allows_expense, 'operational', v.sort_order, v.icon
FROM (VALUES
  ('قدموس',        'shipping',    true,  true,  10, '🚚'),
  ('الكرم',        'shipping',    true,  true,  11, '🚚'),
  ('الموتور',      'shipping',    true,  true,  12, '🏍️'),
  ('ايزلا',        'shipping',    true,  true,  13, '🚚'),
  ('توصيل جرمانا', 'shipping',    true,  true,  14, '🛵'),
  ('أونلاين',      'online',      true,  false, 20, '🛒'),
  ('مسوّقين',      'marketer',    true,  false, 21, '📣'),
  ('موزّعين',      'distributor', true,  true,  22, '🤝'),
  ('شحن',          'recurring',   false, true,  30, '📦'),
  ('أجور',         'recurring',   false, true,  31, '💸'),
  ('مشتريات',      'recurring',   false, true,  32, '🛍️'),
  ('إيجار',        'recurring',   false, true,  33, '🏠'),
  ('إعلانات',      'recurring',   false, true,  34, '📢')
) AS v(name_ar, kind, allows_income, allows_expense, sort_order, icon)
WHERE NOT EXISTS (SELECT 1 FROM accounting_channels c WHERE c.name_ar = v.name_ar);

COMMIT;

-- Realtime (خارج المعاملة — محميّ ضد التكرار/غياب النشر).
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE accounting_channels;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;
