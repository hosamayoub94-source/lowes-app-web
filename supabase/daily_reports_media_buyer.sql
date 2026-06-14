-- ================================================================
-- منظومة التقارير اليومية + لوحة الميديا باير (يونيو 2026)
-- مطبّق حيّاً عبر Supabase SQL Editor. مرجع للحقيقة الحيّة — لا يُشغَّل آلياً.
-- ملاحظة: الجداول الحيّة (daily_reports / report_ad_results) لا تطابق
-- migration 0005 القديم (daily_sales_*). هذا الملف يوثّق الإضافات فقط.
-- ================================================================

-- رسائل لكل إعلان (تقييم أداء الإعلان: رسائل → تحويل).
ALTER TABLE public.report_ad_results ADD COLUMN IF NOT EXISTS messages integer NOT NULL DEFAULT 0;

-- قيمة المبيعات من المصادر غير الإعلانية (عميل سابق / مصدر آخر) — العدد موجود سلفاً
-- (old_customer_count / other_source_count). الآن نضيف القيمة بكل عملة.
ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS old_customer_amount_try numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS old_customer_amount_syp numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS old_customer_amount_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_source_amount_try numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_source_amount_syp numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_source_amount_usd numeric NOT NULL DEFAULT 0;

-- فهارس أداء.
CREATE INDEX IF NOT EXISTS idx_dr_emp_date  ON public.daily_reports (employee_name, report_date);
CREATE INDEX IF NOT EXISTS idx_rar_report   ON public.report_ad_results (report_id);
CREATE INDEX IF NOT EXISTS idx_rar_campaign ON public.report_ad_results (campaign_id);

-- ملاحظة: لم يُضَف UNIQUE(employee_name, report_date) لوجود 4 مفاتيح مكرّرة
-- تاريخياً (Leen Alasaad / Marah Bashir بمايو). التطبيق يعتمد upsert يدوي
-- (select-then-update/insert) في campaignAnalyticsService.upsertDailyReport.
