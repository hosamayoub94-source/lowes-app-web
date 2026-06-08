-- ================================================================
-- LOGIN CODES — دخول بكود شخصي بدل قائمة الأسماء (أمان)
-- Apply in Supabase SQL Editor (idempotent).
--
-- يضيف profiles.login_code (فريد) ويولّد كوداً LW-#### لكل موظف لا يملك
-- واحداً. الدخول يصير بالكود + PIN بدل اختيار الاسم من قائمة مكشوفة.
-- ⚠️ GRANT SELECT (login_code) إجباري — يُقرأ وقت الدخول قبل المصادقة.
-- ================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS login_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_login_code
  ON public.profiles (login_code) WHERE login_code IS NOT NULL;

GRANT SELECT (login_code) ON public.profiles TO anon, authenticated;
GRANT UPDATE (login_code) ON public.profiles TO authenticated;

-- توليد أكواد LW-1001, LW-1002... لمن لا يملك كوداً (idempotent — يتخطّى الموجود)
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, employee_name)
         + COALESCE((SELECT max(substr(login_code,4)::int) FROM public.profiles
                     WHERE login_code ~ '^LW-[0-9]+$'), 1000) AS n
  FROM public.profiles
  WHERE login_code IS NULL
)
UPDATE public.profiles p
SET login_code = 'LW-' || numbered.n
FROM numbered
WHERE numbered.id = p.id;

-- التحقق:
--   SELECT employee_name, role_type, login_code FROM public.profiles ORDER BY login_code;
