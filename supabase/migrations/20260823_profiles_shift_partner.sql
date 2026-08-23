-- =============================================================
-- حقل الشريك بملف الموظف — 23 آب 2026
--
-- عمود واحد فقط. حقل «رقم الواتساب أو اسم الصفحة» موجود مسبقاً
-- باسم profiles.page_name ويُستخدم كما هو — لا يُكرَّر ولا يُعدَّل.
--
-- ⚠️ إلزامي لا احتياطي: profiles مقفول على **مستوى الأعمدة**
-- (harden_pin_columns.sql يسحب SELECT من الجدول ويمنحه لأعمدة
-- مسمّاة). أي عمود جديد لا يقرأه anon/authenticated حتى يُمنح
-- صراحةً — بدون الـGRANT أدناه ترجع القراءة 401/42501 وتبقى
-- الميزة صامتة رغم نجاح ALTER TABLE.
--
-- إضافة فقط · nullable · آمن لإعادة التشغيل · لا يمسّ أي بيانات.
-- =============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS shift_partner text;

-- قراءة: التبويب وبطاقة الرئيسية تبنيان المجموعات من هذا العمود
GRANT SELECT (shift_partner) ON public.profiles TO anon, authenticated;

-- كتابة: شاشة الإدارة ← المستخدمون تحفظ الشريك
GRANT UPDATE (shift_partner) ON public.profiles TO authenticated;

-- job_title: ممنوح للقراءة سلفاً بـharden_pin_columns، لكن بلا
-- GRANT UPDATE صريح بأي مكان — يُمنح هنا صراحةً حتى لا يفشل حفظ
-- المسميات المعتمدة لقسم Media. آمن لو كان مسموحاً أصلاً.
GRANT UPDATE (job_title) ON public.profiles TO authenticated;
