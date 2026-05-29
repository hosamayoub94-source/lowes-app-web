-- ============================================================
-- migration_v6_patch.sql — Lowe's Staff App
-- SAFE TO RE-RUN (idempotent) — نفّذ في Supabase SQL Editor
-- ============================================================
-- يصلح: quiz_questions (created_by) + جداول اليوم الجديدة
-- ============================================================


-- ┌─────────────────────────────────────────────────────────────┐
-- │  FIX 1: quiz_questions — إضافة عمود created_by              │
-- │  هذا هو سبب الخطأ "could not find 'created_by' column"     │
-- └─────────────────────────────────────────────────────────────┘

ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS created_by text;


-- ┌─────────────────────────────────────────────────────────────┐
-- │  FIX 2: announcements — إضافة أعمدة الطوارئ                │
-- └─────────────────────────────────────────────────────────────┘

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS is_emergency boolean DEFAULT false;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS expires_at   timestamptz;

-- فهرس للإعلانات الطارئة
CREATE INDEX IF NOT EXISTS idx_announcements_emergency
  ON announcements(is_emergency) WHERE is_emergency = true;


-- ┌─────────────────────────────────────────────────────────────┐
-- │  NEW 1: shift_schedule — جدول الورديات الأسبوعي             │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS shift_schedule (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_name text        NOT NULL,
  work_date     date        NOT NULL,
  shift_type    text        NOT NULL DEFAULT 'morning'
                CHECK (shift_type IN ('morning','evening','night','off','flexible')),
  notes         text,
  created_by    text,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (employee_name, work_date)
);

CREATE INDEX IF NOT EXISTS idx_shift_schedule_date
  ON shift_schedule(work_date);
CREATE INDEX IF NOT EXISTS idx_shift_schedule_employee
  ON shift_schedule(employee_name);

ALTER TABLE shift_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shift_schedule_all" ON shift_schedule;
CREATE POLICY "shift_schedule_all" ON shift_schedule FOR ALL USING (true) WITH CHECK (true);


-- ┌─────────────────────────────────────────────────────────────┐
-- │  NEW 2: advance_requests — طلبات السلف والخصومات            │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS advance_requests (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_name  text        NOT NULL,
  type           text        NOT NULL DEFAULT 'advance'
                 CHECK (type IN ('advance','deduction','bonus')),
  amount         numeric     NOT NULL CHECK (amount > 0),
  currency       text        NOT NULL DEFAULT 'USD',
  reason         text,
  status         text        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected')),
  response_notes text,
  reviewed_by    text,
  reviewed_at    timestamptz,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_advance_requests_employee
  ON advance_requests(employee_name);
CREATE INDEX IF NOT EXISTS idx_advance_requests_status
  ON advance_requests(status);
CREATE INDEX IF NOT EXISTS idx_advance_requests_created
  ON advance_requests(created_at DESC);

ALTER TABLE advance_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "advance_requests_all" ON advance_requests;
CREATE POLICY "advance_requests_all" ON advance_requests FOR ALL USING (true) WITH CHECK (true);


-- ┌─────────────────────────────────────────────────────────────┐
-- │  NEW 3: performance_reviews — تقييم الأداء الشهري           │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS performance_reviews (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_name       text        NOT NULL,
  reviewer_name       text        NOT NULL,
  period_year         int         NOT NULL,
  period_month        int         NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  rating_overall      int         CHECK (rating_overall    BETWEEN 1 AND 5),
  rating_attendance   int         CHECK (rating_attendance BETWEEN 1 AND 5),
  rating_tasks        int         CHECK (rating_tasks      BETWEEN 1 AND 5),
  rating_attitude     int         CHECK (rating_attitude   BETWEEN 1 AND 5),
  rating_knowledge    int         CHECK (rating_knowledge  BETWEEN 1 AND 5),
  strengths           text,
  improvements        text,
  notes               text,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (employee_name, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_perf_reviews_employee
  ON performance_reviews(employee_name);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_period
  ON performance_reviews(period_year DESC, period_month DESC);

ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perf_reviews_all" ON performance_reviews;
CREATE POLICY "perf_reviews_all" ON performance_reviews FOR ALL USING (true) WITH CHECK (true);


-- ┌─────────────────────────────────────────────────────────────┐
-- │  Realtime — تفعيل للجداول الجديدة                           │
-- └─────────────────────────────────────────────────────────────┘

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE shift_schedule;    EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE advance_requests;  EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE performance_reviews; EXCEPTION WHEN others THEN NULL; END;
END $$;


-- ============================================================
-- ✅ Done.
-- ============================================================
