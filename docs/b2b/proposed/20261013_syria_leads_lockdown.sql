-- =============================================================
-- PROPOSED (NOT APPLIED) — إغلاق وصول anon لجدول syria_b2b_leads وربطه بجلسة حقيقية + صلاحية view_syria_leads
-- 13 تشرين الأول 2026 · لا يُطبَّق إلا بموافقة حسام الصريحة وبعد الشروط المسبقة (docs/b2b/SECURITY_SYRIA_LEADS_2026-10-13.md).
--
-- قبل:  السياسة b2b_leads_direct_syria_only = FOR ALL TO public USING (country='SY')  + anon يملك SELECT/INSERT/UPDATE/DELETE
--       => أي حامل للمفتاح العام يقرأ ويعدّل ويحذف أرقام وبريد الـ155 جهة بلا تسجيل دخول.
-- بعد:  - anon: لا شيء (REVOKE + لا سياسة).
--       - authenticated: SELECT/INSERT/UPDATE فقط لمن يملك الصلاحية (أدمن، أو view_syria_leads غير المحجوبة، وحسابه فعّال) وبصفوف SY فقط.
--       - DELETE: أدمن فقط.
--       - صفوف الإمارات: لا وصول مباشر لأحد (الدالة b2b-leads بـservice_role تتجاوز RLS، كما هو اليوم).
--       - service_role (دالة b2b-leads، المهام الخارجية بمفتاح الخدمة) يتجاوز RLS — لا تغيير.
-- لا UPDATE/DELETE على أي صف. الرجوع: 20261013_syria_leads_lockdown_rollback.sql
-- =============================================================

CREATE OR REPLACE FUNCTION public.can_access_syria_leads()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.is_active, true)
      AND (
        p.role_type = 'admin'
        OR (COALESCE(p.extra_permissions, '[]'::jsonb) ? 'view_syria_leads'
            AND NOT (COALESCE(p.denied_permissions, '[]'::jsonb) ? 'view_syria_leads'))
      )
  );
$$;
REVOKE ALL ON FUNCTION public.can_access_syria_leads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_syria_leads() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.is_active, true) AND p.role_type = 'admin');
$$;
REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

DROP POLICY IF EXISTS "b2b_leads_direct_syria_only" ON public.syria_b2b_leads;
DROP POLICY IF EXISTS "b2b_leads_syria_select" ON public.syria_b2b_leads;
DROP POLICY IF EXISTS "b2b_leads_syria_insert" ON public.syria_b2b_leads;
DROP POLICY IF EXISTS "b2b_leads_syria_update" ON public.syria_b2b_leads;
DROP POLICY IF EXISTS "b2b_leads_syria_delete" ON public.syria_b2b_leads;

CREATE POLICY "b2b_leads_syria_select" ON public.syria_b2b_leads FOR SELECT TO authenticated
  USING (country = 'SY' AND public.can_access_syria_leads());
CREATE POLICY "b2b_leads_syria_insert" ON public.syria_b2b_leads FOR INSERT TO authenticated
  WITH CHECK (country = 'SY' AND public.can_access_syria_leads());
CREATE POLICY "b2b_leads_syria_update" ON public.syria_b2b_leads FOR UPDATE TO authenticated
  USING (country = 'SY' AND public.can_access_syria_leads())
  WITH CHECK (country = 'SY' AND public.can_access_syria_leads());
CREATE POLICY "b2b_leads_syria_delete" ON public.syria_b2b_leads FOR DELETE TO authenticated
  USING (country = 'SY' AND public.is_admin_user());

REVOKE ALL ON public.syria_b2b_leads FROM anon;
REVOKE ALL ON public.syria_b2b_leads FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.syria_b2b_leads TO authenticated;
