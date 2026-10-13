-- رجوع إغلاق syria_b2b_leads إلى الحالة السابقة (مفتوحة لـpublic/anon بصفوف SY) — فقط عند الطوارئ إن انقطع الفريق.
DROP POLICY IF EXISTS "b2b_leads_syria_select" ON public.syria_b2b_leads;
DROP POLICY IF EXISTS "b2b_leads_syria_insert" ON public.syria_b2b_leads;
DROP POLICY IF EXISTS "b2b_leads_syria_update" ON public.syria_b2b_leads;
DROP POLICY IF EXISTS "b2b_leads_syria_delete" ON public.syria_b2b_leads;
CREATE POLICY "b2b_leads_direct_syria_only" ON public.syria_b2b_leads FOR ALL USING (country = 'SY') WITH CHECK (country = 'SY');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.syria_b2b_leads TO anon, authenticated;
-- الدالتان المساعدتان تبقيان (غير مؤذيتين): DROP FUNCTION public.can_access_syria_leads(); DROP FUNCTION public.is_admin_user(); عند الرغبة.
