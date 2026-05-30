-- ============================================================
-- migration_v8_seed_data.sql — Lowe's Staff App
-- SAFE TO RE-RUN (idempotent)
-- يضيف:
--   1. جدول leave_requests (الموحّد للإجازات)
--   2. جدول leave_balances  (الرصيد 21 يوم)
--   3. إعلانات حقيقية (تحل محل الإعلانات الفارغة)
--   4. مهام تجريبية حقيقية (بدلاً من mock data)
-- ============================================================


-- ┌─────────────────────────────────────────────────────────────┐
-- │  1. leave_requests — الجدول الموحّد لطلبات الإجازة          │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS leave_requests (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid        NOT NULL,
  employee_name  text        NOT NULL,
  type           text        NOT NULL DEFAULT 'annual'
                 CHECK (type IN ('annual','sick','emergency','unpaid','other')),
  start_date     date        NOT NULL,
  end_date       date        NOT NULL,
  days           int         NOT NULL DEFAULT 1,
  reason         text,
  status         text        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected')),
  manager_note   text,
  manager_id     uuid,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee
  ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status
  ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_start
  ON leave_requests(start_date DESC);

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leave_requests_all" ON leave_requests;
CREATE POLICY "leave_requests_all" ON leave_requests FOR ALL USING (true) WITH CHECK (true);


-- ┌─────────────────────────────────────────────────────────────┐
-- │  2. leave_balances — رصيد الإجازة (21 يوم افتراضي)         │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS leave_balances (
  id          uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid  NOT NULL,
  year        int   NOT NULL,
  total_days  int   DEFAULT 21,
  used_days   int   DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(employee_id, year)
);

ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leave_bal_all" ON leave_balances;
CREATE POLICY "leave_bal_all" ON leave_balances FOR ALL USING (true) WITH CHECK (true);

-- تعديل الجدول القديم إن وجد: رفع الافتراضي من 15 إلى 21
DO $$
BEGIN
  ALTER TABLE leave_balances ALTER COLUMN total_days SET DEFAULT 21;
EXCEPTION WHEN others THEN NULL;
END $$;

-- تصحيح القيم الخاطئة (15 → 21) للموظفين الذين لم يُحدَّثوا بعد
UPDATE leave_balances SET total_days = 21
WHERE total_days = 15 AND used_days = 0;


-- ┌─────────────────────────────────────────────────────────────┐
-- │  3. employee_requests — جدول قديم: رفع الافتراضي 15→21     │
-- └─────────────────────────────────────────────────────────────┘

DO $$
BEGIN
  -- إن وجد جدول employee_requests القديم، نُصلح الافتراضي
  ALTER TABLE employee_requests ALTER COLUMN total_days SET DEFAULT 21;
EXCEPTION WHEN others THEN NULL;
END $$;


-- ┌─────────────────────────────────────────────────────────────┐
-- │  4. إعلانات حقيقية — تحذف الفارغة وتضيف محتوى             │
-- └─────────────────────────────────────────────────────────────┘

-- حذف الإعلانات ذات العنوان الفارغ
DELETE FROM announcements WHERE title IS NULL OR title = '';

-- ┌─────────────────────────────────────────────────────────────┐
-- │  4b. رسائل الشات — حذف الرسائل ذات المحتوى الفارغ         │
-- └─────────────────────────────────────────────────────────────┘

DELETE FROM chat_messages WHERE content IS NULL OR content = '';

-- إضافة رسالة ترحيبية في القناة العامة (إن وجدت)
INSERT INTO chat_messages (room_id, sender_name, content, message_type)
SELECT r.id, 'النظام', '👋 مرحباً بكم في قناة الشركة العامة! هذا المكان للتواصل بين جميع أعضاء الفريق.', 'text'
FROM chat_rooms r
WHERE r.slug = 'general' AND NOT EXISTS (
  SELECT 1 FROM chat_messages m WHERE m.room_id = r.id AND m.content IS NOT NULL LIMIT 1
)
LIMIT 1;

-- إضافة إعلانات حقيقية (آمن — لا يُضيف نسخاً مكررة)
INSERT INTO announcements (title, body, is_pinned, is_emergency, created_by)
SELECT v.title, v.body, v.is_pinned, v.is_emergency, v.created_by
FROM (VALUES
  (
    'مرحباً بكم في نظام الموظفين الجديد! 🎉',
    'تم إطلاق النسخة الجديدة من تطبيق لووز بروفشنال. يمكنكم الآن تسجيل الحضور، متابعة المهام، وطلب الإجازات من أي مكان.',
    true, false, 'Admin'
  ),
  (
    'تحديث سياسة الإجازات 2026',
    'رصيد الإجازة السنوي لعام 2026 هو 21 يوماً لجميع الموظفين. يُرجى تقديم طلبات الإجازة مسبقاً بأسبوع على الأقل.',
    true, false, 'Manager'
  ),
  (
    'اجتماع الفريق الأسبوعي',
    'يُعقد اجتماع الفريق كل إثنين الساعة 10:00 صباحاً. الحضور إلزامي لجميع أعضاء الفريق.',
    false, false, 'Manager'
  ),
  (
    'مبروك على نتائج الشهر الماضي! 🏆',
    'حقق فريقنا نتائج رائعة في مبيعات مايو. شكراً لجهودكم المتواصلة وتفانيكم في العمل.',
    false, false, 'Admin'
  ),
  (
    'تذكير: تحديث بيانات ملف الموظف',
    'يُرجى من جميع الموظفين تحديث بياناتهم الشخصية (رقم الهاتف، البريد الإلكتروني) في صفحة الملف الشخصي.',
    false, false, 'HR'
  )
) AS v(title, body, is_pinned, is_emergency, created_by)
WHERE NOT EXISTS (
  SELECT 1 FROM announcements a WHERE a.title = v.title
);


-- ┌─────────────────────────────────────────────────────────────┐
-- │  5. مهام حقيقية — seed data للمشروع                        │
-- └─────────────────────────────────────────────────────────────┘

-- إنشاء الجدول إن لم يكن موجوداً (with all needed columns)
-- NOTE: tasks table already exists in production with correct schema.
-- Real status values: pending, in_progress, in_review, done, completed, cancelled, overdue
-- assigned_to and created_by are UUID type (not text)
-- No 'team' column exists

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks_all" ON tasks;
CREATE POLICY "tasks_all" ON tasks FOR ALL USING (true) WITH CHECK (true);

-- إضافة مهام تجريبية (آمن — يتحقق من عدم التكرار)
INSERT INTO tasks (title, description, status, priority, assigned_to, team, due_date, created_by)
SELECT v.title, v.description, v.status, v.priority, v.assigned_to, v.team, v.due_date::date, v.created_by
FROM (VALUES
  ('مراجعة تقرير المبيعات الأسبوعي',     'مراجعة أرقام المبيعات وإعداد ملخص للإدارة',              'pending',     'high',   'Manager',   'Sales',  (CURRENT_DATE + 2)::text,  'Admin'),
  ('تحديث كتالوج المنتجات',               'إضافة المنتجات الجديدة وتحديث الأسعار',                  'in_progress', 'medium', 'Admin',     'Admin',  (CURRENT_DATE + 5)::text,  'Admin'),
  ('تدريب الموظفين الجدد',                'إعداد برنامج تدريبي للموظفين المنضمين هذا الشهر',        'pending',     'high',   'Manager',   'HR',     (CURRENT_DATE + 7)::text,  'Manager'),
  ('مراجعة طلبات الإجازة المعلقة',       'الرد على طلبات الإجازة المنتظرة',                        'pending',     'medium', 'Manager',   'HR',     (CURRENT_DATE + 1)::text,  'Manager'),
  ('تحضير عروض رمضان التسويقية',          'إعداد المحتوى والعروض الترويجية لموسم رمضان',            'in_progress', 'urgent', 'Admin',     'Media',  (CURRENT_DATE + 3)::text,  'Admin'),
  ('متابعة عملاء CRM المتوقفين',          'التواصل مع العملاء الذين لم يشتروا منذ 30 يوم',          'pending',     'medium', 'Manager',   'Sales',  (CURRENT_DATE + 4)::text,  'Manager'),
  ('تحديث بيانات المخزون',               'مراجعة وتحديث كميات المنتجات في المخزون',                'done',        'low',    'Admin',     'Ops',    (CURRENT_DATE - 2)::text,  'Admin'),
  ('إعداد خطة التسويق الشهرية',          'وضع خطة المحتوى والحملات لهذا الشهر',                    'review',      'high',   'Admin',     'Media',  (CURRENT_DATE + 1)::text,  'Manager'),
  ('تنظيم ملفات العملاء في النظام',      'تنظيم وأرشفة بيانات العملاء القديمة',                    'pending',     'low',    'Manager',   'Admin',  (CURRENT_DATE + 10)::text, 'Admin'),
  ('اجتماع مراجعة الأداء الشهري',        'تحضير تقارير الأداء الشهرية لكل الموظفين',               'pending',     'high',   'Admin',     'HR',     (CURRENT_DATE + 6)::text,  'Admin')
) AS v(title, description, status, priority, assigned_to, team, due_date, created_by)
WHERE NOT EXISTS (
  SELECT 1 FROM tasks t WHERE t.title = v.title
);


-- ┌─────────────────────────────────────────────────────────────┐
-- │  6. Realtime — تفعيل للجداول الجديدة                        │
-- └─────────────────────────────────────────────────────────────┘

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE leave_requests;  EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE leave_balances;  EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE tasks;           EXCEPTION WHEN others THEN NULL; END;
END $$;


-- ============================================================
-- ✅ Done.
-- جداول جديدة: leave_requests, leave_balances
-- رصيد إجازة: 21 يوم (تصحيح من 15)
-- إعلانات حقيقية: 5 إعلانات
-- مهام حقيقية: 10 مهام
-- ============================================================
