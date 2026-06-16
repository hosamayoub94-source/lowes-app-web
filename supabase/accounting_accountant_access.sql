-- =============================================================
-- صلاحيات المحاسب على دفتر الحسابات (المصاريف والشحن)
-- الهدف: فادي ووسيم (role_type = 'accountant') يقدرون:
--   • قراءة كل القيود (لرؤية الوارد/الصادر لكل شركة شحن وجهة).
--   • تسجيل قيود جديدة (دخل/مصروف + مصدر جديد).
-- التعديل/الحذف يبقيان للأدمن فقط (لا سياسة هنا لهما).
--
-- إضافي وidempotent: لا يلمس السياسات القائمة (الأدمن/المدير)،
-- وRLS يجمع السياسات السماحية بـ OR. آمن للتطبيق على القاعدة الحيّة.
-- التطبيق: Supabase → SQL Editor → الصق → Run.
-- =============================================================

-- قراءة كل القيود للمحاسب
DROP POLICY IF EXISTS accounting_entries_select_accountant ON accounting_entries;
CREATE POLICY accounting_entries_select_accountant
  ON accounting_entries FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'accountant')
  );

-- إدراج قيود جديدة للمحاسب
DROP POLICY IF EXISTS accounting_entries_insert_accountant ON accounting_entries;
CREATE POLICY accounting_entries_insert_accountant
  ON accounting_entries FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'accountant')
  );

-- (اختياري) لو رغبت لاحقاً السماح للمحاسب بإضافة «مصادر/تصنيفات» في الجدول الرسمي
-- accounting_categories، فعّل التالي. حالياً غير ضروري: المصدر نصّ حر في حقل
-- category داخل accounting_entries، فإضافة مصدر = مجرّد كتابته عند التسجيل.
--
-- DROP POLICY IF EXISTS accounting_categories_write_accountant ON accounting_categories;
-- CREATE POLICY accounting_categories_write_accountant
--   ON accounting_categories FOR ALL
--   USING     (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'accountant'))
--   WITH CHECK(EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'accountant'));
