-- ============================================================
-- إصلاح قفل RLS لعنقود الـCRM (+ جداول مخزون قديمة) — 2026-07-03
--
-- نفس جذر C1 (جلسة الـPIN اليدوية = anon، auth.uid()=NULL): هذه الجداول
-- سياساتها تشترط auth.uid() فتظهر فارغة لكل مستخدمي التطبيق. تدقيق شامل
-- (anon مقابل service_role عبر REST) كشف أن شاشة /crm بالكامل محجوبة:
--   pipelines(0/1) · pipeline_stages(0/6) · leads(0/4) · customers(0/12)
--   + deals/followups/deal_activities/customer_contacts (فارغة، نفس السياسة)
--   + جداول legacy يشير إليها inventoryService: warehouses(0/1) · categories(0/1)
--
-- النموذج الأمني للتطبيق كله USING(true) + تحقّق بطبقة التطبيق (PIN+صلاحيات).
-- هذا الملف يوحّد هذه الجداول معه. آمن/idempotent، لا يمسّ أي بيانات.
-- ⚠️ يُطبَّق من Supabase → SQL Editor (DDL لا يمرّ عبر REST).
-- ============================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pipelines','pipeline_stages','deals','leads','customers',
    'followups','deal_activities','customer_contacts',
    'warehouses','categories'
  ] LOOP
    -- تأكد من وجود الجدول قبل أي عملية (يتخطّى غير الموجود بأمان)
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated;', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
      -- سياسة قراءة موحّدة
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t||'_select_all', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true);', t||'_select_all', t);
      -- سياسة كتابة موحّدة (تحلّ محل أي سياسة auth.uid() سابقة)
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t||'_write_all', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true);', t||'_write_all', t);
    END IF;
  END LOOP;
END $$;

-- تحقّق بعد التطبيق (يجب أن ترجع أعداداً > 0 كما يراها anon):
-- SELECT (SELECT count(*) FROM pipelines) AS pipelines,
--        (SELECT count(*) FROM pipeline_stages) AS stages,
--        (SELECT count(*) FROM leads) AS leads,
--        (SELECT count(*) FROM customers) AS customers;
--
-- ملاحظة: قد تبقى سياسات auth.uid() قديمة بأسماء مختلفة على بعض الجداول
-- (مثل "requests_select"). سياسات SELECT متعدّدة = OR، ووجود سياسة USING(true)
-- واحدة يكفي لإتاحة القراءة. إن رغبت بتنظيفها احذف القديمة يدوياً بعد التأكد.
