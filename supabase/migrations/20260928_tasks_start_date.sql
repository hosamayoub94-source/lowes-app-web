-- المرحلة الأولى لمهام السوشال ميديا (28 أيلول 2026): تاريخ بدء المهمة.
-- عمود اختياري (nullable، بلا default) — المهام القديمة تبقى NULL ولا تتأثر،
-- وأي كود/دالة لا تعرف العمود تستمر بالعمل. التحقق «البدء ≤ التسليم» بالواجهة.
alter table public.tasks
  add column if not exists start_date date;

comment on column public.tasks.start_date is
  'تاريخ بدء المهمة (اختياري). التاريخ التقويمي المحلي كما أُدخل.';

-- Rollback: alter table public.tasks drop column if exists start_date;
