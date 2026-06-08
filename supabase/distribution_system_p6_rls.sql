-- =============================================================
-- distribution_system_p6_rls.sql
-- تأمين RLS: عزل بيانات الشركة عن أدوار الشبكة (مندوب/مسوّقة/مشرفة/وكيل).
--
-- المشكلة: جدول orders كان عليه سياسة مفتوحة بالكامل:
--     CREATE POLICY "orders_all" ON orders FOR ALL USING (true) WITH CHECK (true);
--   → أي مستخدم مصادَق (بما فيهم المندوب) يقرأ كل طلبات الشركة على مستوى البيانات.
--
-- التصميم (آمن ضد كسر الإنتاج):
--   «مفتوح افتراضياً — يُقيَّد فقط مَن تأكّدنا أنه دور شبكة».
--   • موظفو الأونلاين/الإدارة (وأي جلسة بلا auth.uid مثل الجلسة اليدوية)
--     → current_is_network()=false → مسموح لهم كل شيء كما هو الآن (لا كسر).
--   • أدوار الشبكة المُجهّزة بحساب Supabase Auth (auth.uid = profiles.id)
--     → يُقيَّدون إلى طلباتهم فقط (seller_id = auth.uid) + المشرفة ترى فريقها.
--
-- ⚠️ شرط الفعالية: أدوار الشبكة لازم يكون لها حساب Supabase Auth حقيقي
--    (auth.uid مطابق لـ profiles.id). لو دخلوا بجلسة يدوية (بلا JWT) تفشل
--    السياسة «مفتوحة» (لا تكسر شيئاً لكن لا تقيّد) — لذلك جهّز حساباتهم بـauth.
--
-- آمن للإعادة (idempotent): DROP POLICY IF EXISTS قبل كل CREATE.
-- شغّله بعد p0..p3. خذ Backup قبل التطبيق.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 0) دالة مساعدة: هل المستخدم الحالي «دور شبكة» مؤكَّد؟
--    SECURITY DEFINER → تقرأ profiles متجاوزةً RLS (لا تعتمد على ظهور
--    profiles للمستخدم). COALESCE(...,false) → عند auth.uid=NULL
--    (جلسة يدوية/anon) ترجع false → السياسة تفشل «مفتوحة» (لا تكسر الأونلاين).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_is_network()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    public.current_role_type() = ANY (ARRAY[
      'field_rep','marketer','supervisor','supervisor_manager','area_agent'
    ]), false);
$$;
GRANT EXECUTE ON FUNCTION public.current_is_network() TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 1) orders — استبدال السياسة المفتوحة بسياسات مُقيِّدة لأدوار الشبكة
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- أزل كل سياسات orders الموجودة ديناميكياً (مهما كان اسمها) — يشمل
-- السياسة المفتوحة orders_all. هكذا لا نحتاج معرفة الأسماء مسبقاً،
-- ونتأكّد أن سياساتنا المقيِّدة هي الوحيدة الفاعلة (لا تتغلّب سياسة OR مفتوحة).
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='orders'
  LOOP EXECUTE format('DROP POLICY %I ON public.orders', pol.policyname); END LOOP;
END $$;

-- قراءة
CREATE POLICY "orders_select" ON public.orders FOR SELECT
USING (
  NOT public.current_is_network()
  OR seller_id = auth.uid()
  OR public.is_supervisor_of(seller_id)
);

-- إدراج: دور الشبكة يُدرج طلباً باسمه فقط؛ البقية بلا قيد
CREATE POLICY "orders_insert" ON public.orders FOR INSERT
WITH CHECK (
  NOT public.current_is_network()
  OR seller_id = auth.uid()
);

-- تحديث: دور الشبكة يحدّث طلبه (أو المشرفة فريقها)؛ البقية بلا قيد
CREATE POLICY "orders_update" ON public.orders FOR UPDATE
USING (
  NOT public.current_is_network()
  OR seller_id = auth.uid()
  OR public.is_supervisor_of(seller_id)
);

-- حذف: أدوار الشبكة لا تحذف طلبات إطلاقاً؛ البقية كما هي
CREATE POLICY "orders_delete" ON public.orders FOR DELETE
USING (
  NOT public.current_is_network()
);

-- ─────────────────────────────────────────────────────────────
-- 2) crm_clients — المندوب يرى/يعدّل عملاءه فقط
-- ─────────────────────────────────────────────────────────────
-- مؤكَّد تجريبياً (probe بـanon key): توجد سياسة مفتوحة على crm_clients تتيح
-- قراءة كل الصفوف بلا مصادقة. نُسقط كل السياسات ديناميكياً ثم نعيد بناء المقيِّدة.
ALTER TABLE public.crm_clients ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='crm_clients'
  LOOP EXECUTE format('DROP POLICY %I ON public.crm_clients', pol.policyname); END LOOP;
END $$;

CREATE POLICY "crm_clients_select" ON public.crm_clients FOR SELECT
USING (
  NOT public.current_is_network()
  OR rep_id = auth.uid()
  OR public.is_supervisor_of(rep_id)
);

CREATE POLICY "crm_clients_insert" ON public.crm_clients FOR INSERT
WITH CHECK (
  NOT public.current_is_network()
  OR rep_id = auth.uid()
);

CREATE POLICY "crm_clients_update" ON public.crm_clients FOR UPDATE
USING (
  NOT public.current_is_network()
  OR rep_id = auth.uid()
  OR public.is_supervisor_of(rep_id)
);

-- حذف: أدوار الشبكة لا تحذف عملاء؛ البقية (إدارة/أونلاين) كما كان
CREATE POLICY "crm_clients_delete" ON public.crm_clients FOR DELETE
USING (
  NOT public.current_is_network()
);

-- =============================================================
-- بعد التطبيق — تحقّق:
--   1) سجّل دخول موظف أونلاين عادي → يجب أن يرى الطلبات كالمعتاد.
--   2) سجّل دخول مندوب مُجهّز بـauth → «طلباتي» تعرض طلباته فقط،
--      واستعلام مباشر عن طلبات غيره يرجع صفراً.
--   3) أنشئ طلباً من «طلب جديد» باسم المندوب → ينجح (seller_id = هو).
-- =============================================================
