-- ============================================================
-- migration_v5.sql — Lowe's Staff App — Complete DB Setup
-- Run this in Supabase SQL Editor (safe to re-run, idempotent)
-- ============================================================

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 1: profiles — add missing columns                  │
-- └─────────────────────────────────────────────────────────────┘

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS shift_type   text    DEFAULT 'morning',
  ADD COLUMN IF NOT EXISTS work_start   time    DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS work_end     time    DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS rest_day     text,
  ADD COLUMN IF NOT EXISTS page_name    text,
  ADD COLUMN IF NOT EXISTS admin_notes  text,
  ADD COLUMN IF NOT EXISTS total_points int     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS job_title    text;

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 2: tasks — add missing columns + fix status CHECK  │
-- └─────────────────────────────────────────────────────────────┘

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS progress         int     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seen_by          uuid[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS attachments      jsonb   DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS tags             text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS platform         text,
  ADD COLUMN IF NOT EXISTS task_type        text,
  ADD COLUMN IF NOT EXISTS attachments_note text,
  ADD COLUMN IF NOT EXISTS completion_note  text,
  ADD COLUMN IF NOT EXISTS due_time         text,
  ADD COLUMN IF NOT EXISTS completed_at     timestamptz;

-- Add created_by as UUID FK if not already there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE tasks ADD COLUMN created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Migrate assigned_to from text → uuid so the tasks module FK join works.
-- Strategy:
--   1. Add a new uuid column `assignee_id` (if not exists).
--   2. Copy rows where assigned_to looks like a valid UUID.
--   3. Add the FK constraint (safe to run multiple times via DROP + ADD).
--   4. The old text `assigned_to` column stays for backward-compat reads
--      (HomeScreen, HRDashboard etc. still do ilike/or filters on it).
DO $$
BEGIN
  -- Step 1: add assignee_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'assignee_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN assignee_id uuid;
  END IF;

  -- Step 2: populate from UUID-formatted values already in assigned_to
  UPDATE tasks
  SET assignee_id = assigned_to::uuid
  WHERE assignee_id IS NULL
    AND assigned_to ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
END $$;

-- Step 3: add FK constraint (idempotent drop+add)
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_assignee_id_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_assignee_id_fkey
  FOREIGN KEY (assignee_id) REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id);

-- Fix status CHECK constraint to include all app-used values
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (
  status IN ('pending', 'in_progress', 'in_review', 'done', 'completed', 'cancelled', 'overdue')
);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 3: task_comments — add user_id UUID column         │
-- └─────────────────────────────────────────────────────────────┘

ALTER TABLE task_comments
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comment text;

-- If old schema used 'content' instead of 'comment', add alias
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_comments' AND column_name = 'content'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_comments' AND column_name = 'comment'
  ) THEN
    ALTER TABLE task_comments RENAME COLUMN content TO comment;
  END IF;
END $$;

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 4: task_activity — create if not exists            │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS task_activity (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id      uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  action_type  text        NOT NULL,
  action_label text,
  metadata     jsonb       DEFAULT '{}',
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_activity_task_id
  ON task_activity(task_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_created_at
  ON task_activity(created_at DESC);

-- RLS
ALTER TABLE task_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_activity_select" ON task_activity;
CREATE POLICY "task_activity_select" ON task_activity
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "task_activity_insert" ON task_activity;
CREATE POLICY "task_activity_insert" ON task_activity
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 5: task_points — create if not exists              │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS task_points (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_name text        NOT NULL,
  task_id       uuid        REFERENCES tasks(id) ON DELETE SET NULL,
  points        int         NOT NULL DEFAULT 0,
  reason        text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_points_employee_name
  ON task_points(employee_name);
CREATE INDEX IF NOT EXISTS idx_task_points_created_at
  ON task_points(created_at DESC);

-- RLS
ALTER TABLE task_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_points_select" ON task_points;
CREATE POLICY "task_points_select" ON task_points
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "task_points_insert" ON task_points;
CREATE POLICY "task_points_insert" ON task_points
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 6: announcements — create if not exists            │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS announcements (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  body        text        NOT NULL,
  emoji       text        DEFAULT '📢',
  created_by  text,
  is_pinned   boolean     DEFAULT false,
  is_active   boolean     DEFAULT true,
  message     text,        -- used by older notificationService branch
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_created_at
  ON announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_is_pinned
  ON announcements(is_pinned) WHERE is_pinned = true;

-- RLS
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcements_select" ON announcements;
CREATE POLICY "announcements_select" ON announcements
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "announcements_insert" ON announcements;
CREATE POLICY "announcements_insert" ON announcements
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "announcements_update" ON announcements;
CREATE POLICY "announcements_update" ON announcements
  FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "announcements_delete" ON announcements;
CREATE POLICY "announcements_delete" ON announcements
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 7: quiz_questions — create if not exists           │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS quiz_questions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  question              text        NOT NULL,
  option_a              text        NOT NULL,
  option_b              text        NOT NULL,
  option_c              text,
  option_d              text,
  correct_answer        text        NOT NULL CHECK (correct_answer IN ('a','b','c','d')),
  explanation           text,
  category              text        DEFAULT 'general',
  question_date         date        NOT NULL DEFAULT CURRENT_DATE,
  is_checkout_question  boolean     DEFAULT false,
  is_active             boolean     DEFAULT true,
  created_by            text,
  created_at            timestamptz DEFAULT now()
);

-- Add created_by if table already existed without it
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS created_by text;

CREATE INDEX IF NOT EXISTS idx_quiz_questions_date
  ON quiz_questions(question_date);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_checkout
  ON quiz_questions(is_checkout_question) WHERE is_checkout_question = true;

-- RLS
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;

-- Open policies: app uses PIN/manual-session (anon key) — authService design requires USING(true)
DROP POLICY IF EXISTS "quiz_questions_select" ON quiz_questions;
CREATE POLICY "quiz_questions_select" ON quiz_questions FOR SELECT USING (true);

DROP POLICY IF EXISTS "quiz_questions_insert" ON quiz_questions;
CREATE POLICY "quiz_questions_insert" ON quiz_questions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "quiz_questions_update" ON quiz_questions;
CREATE POLICY "quiz_questions_update" ON quiz_questions FOR UPDATE USING (true);

DROP POLICY IF EXISTS "quiz_questions_delete" ON quiz_questions;
CREATE POLICY "quiz_questions_delete" ON quiz_questions FOR DELETE USING (true);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 8: quiz_responses — create if not exists           │
-- └─────────────────────────────────────────────────────────────┘
-- Anonymous by design: no user_id stored

CREATE TABLE IF NOT EXISTS quiz_responses (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id     uuid        NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  selected_answer text        NOT NULL CHECK (selected_answer IN ('a','b','c','d')),
  is_correct      boolean     NOT NULL,
  source          text        DEFAULT 'training',  -- 'training' | 'checkout'
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_responses_question_id
  ON quiz_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_quiz_responses_created_at
  ON quiz_responses(created_at DESC);

-- RLS (intentionally open — responses are anonymous)
ALTER TABLE quiz_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quiz_responses_select" ON quiz_responses;
CREATE POLICY "quiz_responses_select" ON quiz_responses FOR SELECT USING (true);

DROP POLICY IF EXISTS "quiz_responses_insert" ON quiz_responses;
CREATE POLICY "quiz_responses_insert" ON quiz_responses FOR INSERT WITH CHECK (true);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 9: shift_partners — create if not exists           │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS shift_partners (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  requester    text        NOT NULL,
  partner      text        NOT NULL,
  note         text,
  status       text        DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  responded_at timestamptz,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (requester, partner)
);

CREATE INDEX IF NOT EXISTS idx_shift_partners_requester
  ON shift_partners(requester);
CREATE INDEX IF NOT EXISTS idx_shift_partners_partner
  ON shift_partners(partner);

-- RLS
ALTER TABLE shift_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shift_partners_select" ON shift_partners;
CREATE POLICY "shift_partners_select" ON shift_partners
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "shift_partners_insert" ON shift_partners;
CREATE POLICY "shift_partners_insert" ON shift_partners
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "shift_partners_update" ON shift_partners;
CREATE POLICY "shift_partners_update" ON shift_partners
  FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "shift_partners_delete" ON shift_partners;
CREATE POLICY "shift_partners_delete" ON shift_partners
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 10: leave_requests — create if not exists          │
-- │  (Used by LeaveRequestsScreen + HRDashboard)                │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS leave_requests (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  employee_name text        NOT NULL,
  type          text        NOT NULL DEFAULT 'annual',
  start_date    date        NOT NULL,
  end_date      date        NOT NULL,
  days          int         NOT NULL DEFAULT 1,
  reason        text,
  status        text        DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  manager_id    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  manager_note  text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_id
  ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status
  ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_created_at
  ON leave_requests(created_at DESC);

-- RLS
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leave_requests_select" ON leave_requests;
CREATE POLICY "leave_requests_select" ON leave_requests
  FOR SELECT USING (
    auth.uid() = employee_id OR
    auth.uid() = manager_id OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role_type IN ('admin','manager')
    )
  );

DROP POLICY IF EXISTS "leave_requests_insert" ON leave_requests;
CREATE POLICY "leave_requests_insert" ON leave_requests
  FOR INSERT WITH CHECK (auth.uid() = employee_id);

DROP POLICY IF EXISTS "leave_requests_update" ON leave_requests;
CREATE POLICY "leave_requests_update" ON leave_requests
  FOR UPDATE USING (
    auth.uid() = employee_id OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role_type IN ('admin','manager')
    )
  );

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 11: employee_requests — unified request table      │
-- │  (Used by RequestsDashboard + HolidaysScreen + requestsService) │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS employee_requests (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  request_type      text        NOT NULL DEFAULT 'leave'
                    CHECK (request_type IN ('leave','advance','document','other')),
  leave_type        text,
  leave_from        date,
  leave_to          date,
  leave_days        int,
  advance_amount    numeric,
  advance_currency  text        DEFAULT 'USD',
  reason            text,
  status            text        DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','cancelled')),
  decided_by        uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  decision_note     text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_requests_employee_id
  ON employee_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_requests_status
  ON employee_requests(status);
CREATE INDEX IF NOT EXISTS idx_employee_requests_type
  ON employee_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_employee_requests_created_at
  ON employee_requests(created_at DESC);

-- RLS
ALTER TABLE employee_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_requests_select" ON employee_requests;
CREATE POLICY "employee_requests_select" ON employee_requests
  FOR SELECT USING (
    auth.uid() = employee_id OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role_type IN ('admin','manager')
    )
  );

DROP POLICY IF EXISTS "employee_requests_insert" ON employee_requests;
CREATE POLICY "employee_requests_insert" ON employee_requests
  FOR INSERT WITH CHECK (auth.uid() = employee_id);

DROP POLICY IF EXISTS "employee_requests_update" ON employee_requests;
CREATE POLICY "employee_requests_update" ON employee_requests
  FOR UPDATE USING (
    auth.uid() = employee_id OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role_type IN ('admin','manager')
    )
  );

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 12: leave_balances — create if not exists          │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS leave_balances (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  year        int     NOT NULL,
  total_days  int     NOT NULL DEFAULT 21,
  used_days   int     NOT NULL DEFAULT 0,
  annual_days int     GENERATED ALWAYS AS (total_days) STORED,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (employee_id, year)
);

CREATE INDEX IF NOT EXISTS idx_leave_balances_employee_year
  ON leave_balances(employee_id, year);

-- RLS
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leave_balances_select" ON leave_balances;
CREATE POLICY "leave_balances_select" ON leave_balances
  FOR SELECT USING (
    auth.uid() = employee_id OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role_type IN ('admin','manager')
    )
  );

DROP POLICY IF EXISTS "leave_balances_insert" ON leave_balances;
CREATE POLICY "leave_balances_insert" ON leave_balances
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role_type IN ('admin','manager')
    )
  );

DROP POLICY IF EXISTS "leave_balances_update" ON leave_balances;
CREATE POLICY "leave_balances_update" ON leave_balances
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role_type IN ('admin','manager')
    )
  );

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 13: notifications — full production schema         │
-- │  (matches src/modules/notifications/sql/0001_notifications.sql) │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        text        NOT NULL,
  title       text        NOT NULL,
  message     text,
  entity_type text,
  entity_id   text,
  severity    text        NOT NULL DEFAULT 'info'
              CHECK (severity IN ('info','warning','critical')),
  is_read     boolean     NOT NULL DEFAULT false,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  dedup_key   text        UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Add missing columns if table already exists
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS severity  text DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS metadata  jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dedup_key text;

ALTER TABLE notifications REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_notif_user_unread_created
  ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_user_is_read
  ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_created_at
  ON notifications(created_at DESC);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_insert_auth" ON notifications;
CREATE POLICY "notifications_insert_auth" ON notifications
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_delete_own" ON notifications;
CREATE POLICY "notifications_delete_own" ON notifications
  FOR DELETE USING (user_id = auth.uid());

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 14: employee_badges — create if not exists         │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS employee_badges (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_name text        NOT NULL,
  badge_type    text        NOT NULL,
  month_year    text        NOT NULL,  -- e.g. '2026-05'
  earned_at     timestamptz DEFAULT now(),
  UNIQUE (employee_name, badge_type, month_year)
);

CREATE INDEX IF NOT EXISTS idx_eb_emp ON employee_badges(employee_name);

ALTER TABLE employee_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_badges_select" ON employee_badges;
CREATE POLICY "employee_badges_select" ON employee_badges
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "employee_badges_insert" ON employee_badges;
CREATE POLICY "employee_badges_insert" ON employee_badges
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 15: profiles — add birthday + hire_date columns    │
-- └─────────────────────────────────────────────────────────────┘

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS birthday  date,
  ADD COLUMN IF NOT EXISTS hire_date date;

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 16: DB trigger — award points on task completion   │
-- │  (fires on 'done' AND 'completed' statuses)                 │
-- └─────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION award_task_points()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE pts int := 8;
BEGIN
  IF (NEW.status IN ('done','completed')) AND (OLD.status IS DISTINCT FROM NEW.status)
     AND (OLD.status NOT IN ('done','completed')) THEN
    IF NEW.due_date IS NOT NULL AND NEW.completed_at IS NOT NULL
       AND NEW.completed_at::date <= NEW.due_date THEN
      pts := 15;
    END IF;
    INSERT INTO task_points (employee_name, task_id, points, reason)
    VALUES (
      COALESCE(
        (SELECT employee_name FROM profiles WHERE id = NEW.assigned_to::uuid LIMIT 1),
        NEW.assigned_to
      ),
      NEW.id, pts,
      CASE WHEN pts = 15 THEN 'مهمة منجزة في الوقت' ELSE 'مهمة منجزة' END
    )
    ON CONFLICT DO NOTHING;

    UPDATE profiles
      SET total_points = COALESCE(total_points, 0) + pts
    WHERE id = NEW.assigned_to::uuid
       OR employee_name = NEW.assigned_to;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_points ON tasks;
CREATE TRIGGER trg_task_points
  AFTER UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION award_task_points();

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 17: Realtime — enable for live features            │
-- └─────────────────────────────────────────────────────────────┘

-- Enable realtime for tables that use subscriptions in the app
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS shift_partners;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS leave_requests;

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 18: Seed — today's quiz question (optional test)   │
-- └─────────────────────────────────────────────────────────────┘

-- Uncomment to add a test question for today:
/*
INSERT INTO quiz_questions (question, option_a, option_b, option_c, option_d, correct_answer, explanation, category, question_date, is_checkout_question, is_active)
VALUES (
  'ما هو المكون الرئيسي في منتجات Lowe''s لترطيب البشرة؟',
  'حمض الهيالورونيك', 'ريتينول', 'فيتامين C', 'نياسيناميد',
  'a',
  'حمض الهيالورونيك هو المرطب الأساسي الذي يساعد على الاحتفاظ بالرطوبة في البشرة.',
  'ingredients',
  CURRENT_DATE,
  true,   -- checkout question
  true
)
ON CONFLICT DO NOTHING;
*/

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 19: products table — simple schema for             │
-- │  InventoryScreen (OR add compat columns to enterprise schema)│
-- └─────────────────────────────────────────────────────────────┘
-- InventoryScreen uses: name, sku, category(text), quantity, price_usd,
-- price_try, min_stock, description, is_active.
-- Enterprise inventory_schema.sql uses a different column set.
-- This section ensures InventoryScreen columns exist regardless.

CREATE TABLE IF NOT EXISTS products (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  sku         text,
  category    text,
  quantity    int         DEFAULT 0,
  price_usd   numeric     DEFAULT 0,
  price_try   numeric     DEFAULT 0,
  min_stock   int         DEFAULT 0,
  description text,
  is_active   boolean     DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- If enterprise inventory_schema already ran (has cost_price column),
-- add the simpler columns that InventoryScreen needs:
ALTER TABLE products ADD COLUMN IF NOT EXISTS category   text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity   int      DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_usd  numeric  DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_try  numeric  DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock  int      DEFAULT 0;

-- RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_all" ON products;
CREATE POLICY "products_all" ON products FOR ALL USING (auth.uid() IS NOT NULL);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 21: ad_campaigns + campaign_ads + ad_results       │
-- │  (Used by CampaignsScreen — no dedicated module schema)     │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  team         text        DEFAULT 'عام',
  channel_type text        DEFAULT 'page',
  channel_name text,
  status       text        DEFAULT 'active'
               CHECK (status IN ('active','inactive','paused')),
  created_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_ads (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid        NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  image_url   text,
  status      text        DEFAULT 'active',
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_results (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid        NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  result_date  date        NOT NULL DEFAULT CURRENT_DATE,
  ad_spend_usd numeric     DEFAULT 0,
  revenue_usd  numeric     DEFAULT 0,
  orders       int         DEFAULT 0,
  roas         numeric     GENERATED ALWAYS AS (
    CASE WHEN ad_spend_usd > 0 THEN revenue_usd / ad_spend_usd ELSE 0 END
  ) STORED,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_results_campaign_id ON ad_results(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_results_date ON ad_results(result_date DESC);

ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_results   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ad_campaigns_all" ON ad_campaigns;
CREATE POLICY "ad_campaigns_all" ON ad_campaigns FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "campaign_ads_all" ON campaign_ads;
CREATE POLICY "campaign_ads_all" ON campaign_ads FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "ad_results_all" ON ad_results;
CREATE POLICY "ad_results_all" ON ad_results FOR ALL USING (auth.uid() IS NOT NULL);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 22: chat tables                                    │
-- │  (Used by ChatScreen — no dedicated module schema file)     │
-- └─────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS chat_rooms (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type             text        DEFAULT 'group' CHECK (type IN ('group','dm')),
  name             text        NOT NULL,
  display_name     text,
  description      text,
  team             text,
  is_private       boolean     DEFAULT false,
  requires_approval boolean    DEFAULT false,
  created_by       uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_name  text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_room_members (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      uuid        NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_name    text,
  display_name text,
  role         text        DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at    timestamptz DEFAULT now(),
  UNIQUE (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      uuid        NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id    text        NOT NULL,
  sender_name  text,
  message_type text        DEFAULT 'text' CHECK (message_type IN ('text','image','voice','file')),
  content      text,
  file_url     text,
  file_name    text,
  file_size    bigint,
  duration_s   int,
  reply_to_id  uuid        REFERENCES chat_messages(id) ON DELETE SET NULL,
  reply_preview text,
  is_deleted   boolean     DEFAULT false,
  is_pinned    boolean     DEFAULT false,
  edited_at    timestamptz,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_reactions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid        NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id    uuid        REFERENCES profiles(id) ON DELETE CASCADE,
  emoji      text        NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS chat_last_read (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    uuid        NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at    timestamptz DEFAULT now(),
  UNIQUE (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_join_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      uuid        NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id      uuid        REFERENCES profiles(id) ON DELETE CASCADE,
  user_name    text,
  room_name    text,
  status       text        DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_pinned (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    uuid        NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  message_id uuid        NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  pinned_by  uuid        REFERENCES profiles(id),
  pinned_at  timestamptz DEFAULT now(),
  UNIQUE (room_id)
);

CREATE TABLE IF NOT EXISTS music_room_state (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  track_url  text,
  track_name text,
  is_playing boolean     DEFAULT false,
  updated_by uuid        REFERENCES profiles(id),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id ON chat_messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_members_user_id  ON chat_room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_msg    ON chat_reactions(message_id);

-- Realtime for chat
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE chat_reactions; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE chat_last_read; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE music_room_state; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE chat_join_requests; EXCEPTION WHEN others THEN NULL; END;
END $$;

-- RLS for chat (open to all authenticated users — room membership enforced at app level)
ALTER TABLE chat_rooms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_reactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_last_read    ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_pinned       ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_room_state  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_rooms_all" ON chat_rooms;
CREATE POLICY "chat_rooms_all"        ON chat_rooms        FOR ALL USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "chat_members_all" ON chat_room_members;
CREATE POLICY "chat_members_all"      ON chat_room_members FOR ALL USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "chat_messages_all" ON chat_messages;
CREATE POLICY "chat_messages_all"     ON chat_messages     FOR ALL USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "chat_reactions_all" ON chat_reactions;
CREATE POLICY "chat_reactions_all"    ON chat_reactions    FOR ALL USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "chat_last_read_all" ON chat_last_read;
CREATE POLICY "chat_last_read_all"    ON chat_last_read    FOR ALL USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "chat_join_all" ON chat_join_requests;
CREATE POLICY "chat_join_all"         ON chat_join_requests FOR ALL USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "chat_pinned_all" ON chat_pinned;
CREATE POLICY "chat_pinned_all"       ON chat_pinned       FOR ALL USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "music_all" ON music_room_state;
CREATE POLICY "music_all"             ON music_room_state  FOR ALL USING (auth.uid() IS NOT NULL);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  NOTE: Module-specific schemas live in their own files.     │
-- │  Run these separately in Supabase SQL Editor:               │
-- │  • src/modules/inventory/supabase/inventory_schema.sql      │
-- │  • src/modules/crm/supabase/crm_schema.sql                  │
-- │  • src/modules/files/supabase/files_schema.sql              │
-- │  • src/modules/analytics/supabase/analytics_schema.sql      │
-- │  • src/modules/audit/schema/migration.sql                   │
-- │  • src/modules/attendance/supabase/attendance_schema.sql    │
-- │  • src/modules/notifications/sql/0001_notifications.sql     │
-- └─────────────────────────────────────────────────────────────┘

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 23: exchange_rates (AdminSettingsScreen)           │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS exchange_rates (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  from_cur   text        NOT NULL,
  to_cur     text        NOT NULL,
  rate       numeric     NOT NULL,
  set_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exrates_read" ON exchange_rates;
CREATE POLICY "exrates_read"   ON exchange_rates FOR SELECT USING (true);
DROP POLICY IF EXISTS "exrates_insert" ON exchange_rates;
CREATE POLICY "exrates_insert" ON exchange_rates FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 24: employee_salary_settings (AdminSettingsScreen) │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS employee_salary_settings (
  id                   uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id          uuid    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  base_salary          numeric DEFAULT 0,
  currency             text    DEFAULT 'TRY',
  internet_allowance   numeric DEFAULT 0,
  food_allowance       numeric DEFAULT 0,
  monthly_target       numeric DEFAULT 0,
  target_commission    numeric DEFAULT 0,
  sales_commission_pct numeric DEFAULT 0,
  notes                text,
  effective_from       date    DEFAULT CURRENT_DATE,
  created_at           timestamptz DEFAULT now(),
  UNIQUE (employee_id)
);
ALTER TABLE employee_salary_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sal_settings_all" ON employee_salary_settings;
CREATE POLICY "sal_settings_all" ON employee_salary_settings
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 25: accounting_entries (AccountingDashboard)       │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS accounting_entries (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_type     text        NOT NULL CHECK (entry_type IN ('income','expense','advance','salary')),
  category       text,
  description    text,
  employee_id    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  employee_name  text,
  amount_usd     numeric     DEFAULT 0,
  amount_try     numeric     DEFAULT 0,
  amount_syp     numeric     DEFAULT 0,
  payment_method text        DEFAULT 'cash',
  entry_date     date        NOT NULL DEFAULT CURRENT_DATE,
  advance_status text,
  created_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     timestamptz DEFAULT now()
);
ALTER TABLE accounting_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acc_entries_all" ON accounting_entries;
CREATE POLICY "acc_entries_all" ON accounting_entries
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_acc_entries_date ON accounting_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_acc_entries_type ON accounting_entries(entry_type);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 26: accounting_categories (AccountingDashboard)    │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS accounting_categories (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text        NOT NULL,
  entry_type text        NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE accounting_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acc_cats_read" ON accounting_categories;
CREATE POLICY "acc_cats_read"   ON accounting_categories FOR SELECT USING (true);
DROP POLICY IF EXISTS "acc_cats_write" ON accounting_categories;
CREATE POLICY "acc_cats_write"  ON accounting_categories
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Seed default categories
INSERT INTO accounting_categories (name, entry_type) VALUES
  ('مبيعات أونلاين',  'income'),
  ('مبيعات محلات',    'income'),
  ('إعلانات ميتا',   'expense'),
  ('إعلانات تيك توك','expense'),
  ('إيجار مكتب',     'expense'),
  ('رواتب',           'salary'),
  ('سلفة راتب',      'advance')
ON CONFLICT DO NOTHING;

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 27: payroll_runs (PayrollDashboard)                │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS payroll_runs (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  period_year    int         NOT NULL,
  period_month   int         NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status         text        NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft','pending','approved','paid')),
  currency       text        DEFAULT 'USD',
  total_net_usd  numeric     DEFAULT 0,
  employee_count int         DEFAULT 0,
  approved_by    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  paid_at        timestamptz,
  created_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (period_year, period_month)
);
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_runs_all" ON payroll_runs;
CREATE POLICY "payroll_runs_all" ON payroll_runs
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 28: payroll_entries (PayrollDashboard)             │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS payroll_entries (
  id                    uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id                uuid    NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id           uuid    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  base_salary_usd       numeric DEFAULT 0,
  bonus_usd             numeric DEFAULT 0,
  deductions_usd        numeric DEFAULT 0,
  advance_deduction_usd numeric DEFAULT 0,
  net_salary_usd        numeric DEFAULT 0,
  absent_days           int     DEFAULT 0,
  working_days          int     DEFAULT 22,
  salary_type           text    DEFAULT 'fixed',
  notes                 text,
  created_at            timestamptz DEFAULT now(),
  UNIQUE (run_id, employee_id)
);
ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_entries_all" ON payroll_entries;
CREATE POLICY "payroll_entries_all" ON payroll_entries
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 29: daily_sales_reports (SalesDashboard)           │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS daily_sales_reports (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date       date        NOT NULL DEFAULT CURRENT_DATE,
  total_orders      int         DEFAULT 0,
  total_sales_usd   numeric     DEFAULT 0,
  total_ad_spend_usd numeric    DEFAULT 0,
  roas              numeric     DEFAULT 0,
  status            text        DEFAULT 'draft'
                                CHECK (status IN ('draft','submitted','approved')),
  notes             text,
  created_by        uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now(),
  UNIQUE (report_date)
);
ALTER TABLE daily_sales_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dsr_all" ON daily_sales_reports;
CREATE POLICY "dsr_all" ON daily_sales_reports
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_dsr_date ON daily_sales_reports(report_date);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 30: sales_channels (SalesDashboard)                │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS sales_channels (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name         text        NOT NULL,
  channel_type text,
  is_active    boolean     DEFAULT true,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE sales_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sc_read" ON sales_channels;
CREATE POLICY "sc_read"  ON sales_channels FOR SELECT USING (true);
DROP POLICY IF EXISTS "sc_write" ON sales_channels;
CREATE POLICY "sc_write" ON sales_channels
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Seed default channels
INSERT INTO sales_channels (name, channel_type) VALUES
  ('موقع إلكتروني', 'website'),
  ('إنستاغرام',     'instagram'),
  ('تيك توك',       'tiktok'),
  ('واتساب',        'whatsapp'),
  ('متجر',          'store')
ON CONFLICT DO NOTHING;

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 31: campaigns (SalesDashboard — add platform col)  │
-- └─────────────────────────────────────────────────────────────┘
-- campaigns table exists from original schema; add missing columns
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS platform   text DEFAULT 'meta',
  ADD COLUMN IF NOT EXISTS budget_usd numeric DEFAULT 0;

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 32: daily_sales_channel_results (SalesDashboard)   │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS daily_sales_channel_results (
  id           uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id    uuid    NOT NULL REFERENCES daily_sales_reports(id) ON DELETE CASCADE,
  channel_id   uuid    REFERENCES sales_channels(id) ON DELETE SET NULL,
  channel_name text,
  orders       int     DEFAULT 0,
  sales_usd    numeric DEFAULT 0
);
ALTER TABLE daily_sales_channel_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dscr_all" ON daily_sales_channel_results;
CREATE POLICY "dscr_all" ON daily_sales_channel_results
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 33: daily_sales_ad_results (SalesDashboard)        │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS daily_sales_ad_results (
  id            uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id     uuid    NOT NULL REFERENCES daily_sales_reports(id) ON DELETE CASCADE,
  campaign_id   uuid    REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_name text,
  platform      text,
  ad_spend_usd  numeric DEFAULT 0,
  orders        int     DEFAULT 0,
  revenue_usd   numeric DEFAULT 0,
  roas          numeric DEFAULT 0
);
ALTER TABLE daily_sales_ad_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dsar_all" ON daily_sales_ad_results;
CREATE POLICY "dsar_all" ON daily_sales_ad_results
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  SECTION 34: employees view (useMentions @mention feature)  │
-- └─────────────────────────────────────────────────────────────┘
-- Maps profiles → employees so listEmployees() works without a
-- separate legacy table. name/team/is_active match employeeService.
CREATE OR REPLACE VIEW employees AS
  SELECT id, employee_name AS name, team, is_active
  FROM profiles;

-- ============================================================
-- Done. Run sections individually if some tables already exist.
-- ============================================================
