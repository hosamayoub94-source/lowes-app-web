-- ============================================================
-- إصلاح RLS لجلسات الـPIN اليدوية (auth.uid() = NULL) — 2026-07-02
--
-- المشكلة (نفس جذر notifications_rls_fix و activity_logs_rls_fix):
-- معظم المستخدمين يدخلون بجلسة يدوية (anon)، وهذه الجداول سياساتها
-- تشترط auth.uid() فتظهر فارغة/مقفلة داخل التطبيق:
--   • accounting_channels  → منتقي القنوات فارغ + شاشة /admin/channels فارغة
--                            + تقرير ربح/خسارة القنوات بلا أسماء
--   • employee_requests    → شاشة الطلبات/السلف فارغة + محرك الرواتب
--                            لا يرى السلف المعتمدة فلا يخصمها
--   • activity_logs        → لوحة التدقيق فارغة (الكتابة أُصلحت سابقاً،
--                            القراءة بقيت مشروطة بـauth.uid())
--
-- النموذج الأمني للتطبيق كله USING(true) (التحقق بطبقة التطبيق عبر PIN
-- والصلاحيات) — هذا الملف يوحّد هذه الجداول الثلاثة مع بقية النظام.
-- آمن لإعادة التشغيل (idempotent). لا يغيّر أي بيانات.
-- ============================================================

-- ── accounting_channels ─────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_channels TO anon, authenticated;

DROP POLICY IF EXISTS accounting_channels_select_all ON public.accounting_channels;
CREATE POLICY accounting_channels_select_all
  ON public.accounting_channels FOR SELECT USING (true);

DROP POLICY IF EXISTS accounting_channels_write_admin_manager ON public.accounting_channels;
DROP POLICY IF EXISTS accounting_channels_write_all ON public.accounting_channels;
CREATE POLICY accounting_channels_write_all
  ON public.accounting_channels FOR ALL USING (true) WITH CHECK (true);

-- ── employee_requests ───────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON public.employee_requests TO anon, authenticated;

DROP POLICY IF EXISTS "requests_select" ON public.employee_requests;
CREATE POLICY "requests_select"
  ON public.employee_requests FOR SELECT USING (true);

DROP POLICY IF EXISTS "requests_insert_self" ON public.employee_requests;
CREATE POLICY "requests_insert_self"
  ON public.employee_requests FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "requests_update_admin_manager" ON public.employee_requests;
CREATE POLICY "requests_update_admin_manager"
  ON public.employee_requests FOR UPDATE USING (true) WITH CHECK (true);

-- ── activity_logs (قراءة لوحة التدقيق) ──────────────────────
GRANT SELECT ON public.activity_logs TO anon, authenticated;

DROP POLICY IF EXISTS activity_logs_select_anon ON public.activity_logs;
CREATE POLICY activity_logs_select_anon
  ON public.activity_logs FOR SELECT USING (true);

-- تحقق سريع (يرجع الأعداد المرئية بعد الإصلاح):
-- SELECT (SELECT count(*) FROM accounting_channels)  AS channels,
--        (SELECT count(*) FROM employee_requests)    AS requests,
--        (SELECT count(*) FROM activity_logs)        AS logs;
