-- =============================================================
-- شغّل في Supabase → SQL Editor. الأفضل تشغيل كل قسم وحده (القسم 1 أولاً)
-- لأن SQL Editor ينفّذ كل شيء كمعاملة واحدة — خطأ في أي سطر يلغي الباقي.
-- آمن (لا حذف نهائي لبيانات حقيقية).
-- =============================================================

-- 🔴 (1) عاجل — يسمح بحفظ الطلبات «مدفوع جزئياً» (يوقف الموظفين حالياً)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IS NULL OR payment_status IN ('unpaid', 'partial', 'paid'));

-- 🧹 (2) تنظيف جدول الحملات التائه (نسخة احتياطية ثم حذف)
-- CASCADE يلزم لأن جدول ad_results القديم الفارغ مرتبط به (يحذف الرابط فقط).
CREATE TABLE IF NOT EXISTS ad_campaigns_backup_20260607 AS TABLE ad_campaigns;
DROP TABLE IF EXISTS ad_campaigns CASCADE;

-- 💰 (3) ترحيل رواتب مايو الـ37 المخفية إلى شاشة المحاسبة (تُبقي القديم كنسخة)
INSERT INTO accounting_entries
  (entry_type, category, description, amount_usd, amount_try, amount_syp,
   payment_method, reference_no, entry_date, notes, created_by, created_at)
SELECT
  COALESCE(type, 'expense'), category, description,
  COALESCE(amount_usd, 0), COALESCE(amount_try, 0), COALESCE(amount_syp, 0),
  payment_method, reference_no, date,
  TRIM(CONCAT(COALESCE(notes, ''),
        CASE WHEN employee_name IS NOT NULL THEN ' | الموظف: ' || employee_name ELSE '' END,
        ' | (مُرحَّل من finance_ledger)')),
  created_by, created_at
FROM finance_ledger
WHERE COALESCE(is_archived, false) = false
  AND NOT EXISTS (
    SELECT 1 FROM accounting_entries ae
    WHERE ae.entry_date = finance_ledger.date
      AND ae.description = finance_ledger.description
      AND ae.notes LIKE '%مُرحَّل من finance_ledger%'
  );
ALTER TABLE finance_ledger RENAME TO finance_ledger_migrated_20260607;
