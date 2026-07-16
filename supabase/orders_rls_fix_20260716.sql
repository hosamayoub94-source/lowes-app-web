-- ============================================================
-- إصلاح RLS جدول orders — 2026-07-16
--
-- المشكلة: جدول orders عنده policy على authenticated role تقيّد
-- المستخدم على طلباته فقط، بينما anon يرى الكل (708 طلب).
-- النتيجة: كل شاشات الطلبات (تركيا/سوريا) تُظهر طلباً واحداً فقط
-- لكل موظف لأنهم يدخلون بجلسة Supabase Auth.
--
-- الحل الأسرع (مُطبَّق في الكود): supabaseAnon client منفصل بلا session
-- يُستخدم لكل SELECT على orders — يتجاوز authenticated RLS ويرى الكل.
-- هذا الملف هو الحل الصحيح على مستوى DB إذا أردت تطبيقه لاحقاً.
--
-- النموذج الأمني للتطبيق كله USING(true) — الأمان بطبقة التطبيق (PIN).
-- آمن لإعادة التشغيل (idempotent). لا يغيّر أي بيانات.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO anon, authenticated;

DROP POLICY IF EXISTS orders_select_all ON public.orders;
CREATE POLICY orders_select_all ON public.orders FOR SELECT USING (true);

DROP POLICY IF EXISTS orders_write_all ON public.orders;
DROP POLICY IF EXISTS "orders_all" ON public.orders;
CREATE POLICY orders_write_all ON public.orders FOR ALL USING (true) WITH CHECK (true);

-- تحقق سريع بعد التطبيق:
SELECT
  (SELECT count(*) FROM orders WHERE deleted_at IS NULL AND (archived IS NULL OR archived = false)) AS active_orders,
  (SELECT count(*) FROM orders WHERE deleted_at IS NULL AND market = 'turkey' AND (archived IS NULL OR archived = false)) AS turkey_active,
  (SELECT count(*) FROM orders WHERE deleted_at IS NULL AND market = 'turkey' AND status = 'preparing' AND (archived IS NULL OR archived = false)) AS turkey_preparing;
