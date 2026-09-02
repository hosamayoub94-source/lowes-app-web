-- =============================================================
-- شركاء الدوام (مجموعات الورديات) — 22 آب 2026
--
-- إضافة فقط. لا يحذف ولا يعدّل أي بيانات موجودة.
-- آمن لإعادة التشغيل (idempotent).
--
-- 1) جدول shift_groups: مجموعة الشركاء + نافذة سريانها.
--    تغيير الشركاء = إغلاق السطر الحالي (effective_to = يوم قبل التغيير)
--    وفتح سطر جديد بنفس group_key يسري من تاريخ التغيير.
--    ← السجلات القديمة لا تتأثر، وكل يوم يُقرأ بالمجموعة السارية وقتها.
--
-- 2) أعمدة اختيارية على attendance لتثبيت الوردية لحظة التسجيل.
--    كلها NULLABLE — الصفوف القديمة تبقى كما هي.
-- =============================================================

-- ── 1. shift_groups ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shift_groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_key       text        NOT NULL,           -- هوية ثابتة للمجموعة عبر نسخها
  name            text        NOT NULL DEFAULT 'مجموعة دوام',
  members         text[]      NOT NULL DEFAULT '{}',  -- profiles.employee_name
  effective_from  date        NOT NULL DEFAULT CURRENT_DATE,
  effective_to    date,                            -- NULL = سارية الآن
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_groups_key
  ON public.shift_groups (group_key, effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_shift_groups_active
  ON public.shift_groups (effective_from, effective_to);

CREATE INDEX IF NOT EXISTS idx_shift_groups_members
  ON public.shift_groups USING GIN (members);

-- RLS — نفس نموذج بقية النظام: التحقق بطبقة التطبيق (PIN + الصلاحيات)
ALTER TABLE public.shift_groups ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_groups TO anon, authenticated;

DROP POLICY IF EXISTS shift_groups_select_all ON public.shift_groups;
CREATE POLICY shift_groups_select_all
  ON public.shift_groups FOR SELECT USING (true);

DROP POLICY IF EXISTS shift_groups_write_all ON public.shift_groups;
CREATE POLICY shift_groups_write_all
  ON public.shift_groups FOR ALL USING (true) WITH CHECK (true);

-- ── 2. أعمدة الوردية على attendance ───────────────────────────
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS shift_key      text,   -- morning | noon | evening
  ADD COLUMN IF NOT EXISTS shift_start    text,   -- "HH:MM" بداية الوردية الرسمية
  ADD COLUMN IF NOT EXISTS shift_group_id uuid;   -- نسخة المجموعة الفعّالة وقتها

CREATE INDEX IF NOT EXISTS idx_attendance_shift_group
  ON public.attendance (shift_group_id);
