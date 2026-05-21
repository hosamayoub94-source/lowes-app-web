-- =============================================================
-- MASTER MIGRATION — 0004_master_schema.sql
-- Generated: 2026-05-20
-- Purpose: Close every gap found in the audit of all modules.
--
-- APPLY ORDER:
--   Run AFTER 0001, 0002, 0003 are already applied.
--   This file is idempotent (IF NOT EXISTS / OR REPLACE everywhere).
--
-- WHAT THIS COVERS:
--   A. profiles table (CREATE IF NOT EXISTS — foundation for all FKs)
--   B. Shared helper function (update_updated_at — single definition)
--   C. All module schemas in dependency order:
--        shifts → attendance → notifications → audit →
--        files → analytics → CRM → inventory → collaboration
--   D. Fix: activity_logs fts column (bug in auditService.js textSearch)
--   E. Missing realtime publications (files, collaboration_comments, analytics)
--   F. Storage buckets (files, avatars)
--   G. Storage RLS (avatars bucket)
--   H. CRM realtime publications
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- A. profiles table
-- Referenced by EVERY module. No CREATE TABLE existed before.
-- Columns match authStore.mapProfileToSession() + authService selects.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id             UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_name  TEXT        NOT NULL,
  role_type      TEXT        NOT NULL DEFAULT 'employee',
    -- employee | manager | sales_manager | social_manager | admin
  team           TEXT,
  manager_scope  TEXT,       -- team or region this manager oversees
  avatar_url     TEXT,
  pin            TEXT,       -- hashed PIN — NEVER exposed to clients (column-level revoke below)
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Revoke pin column from all client roles (idempotent)
REVOKE SELECT (pin) ON public.profiles FROM anon, authenticated;

-- Index on employee_name for fast login-picker lookup
CREATE INDEX IF NOT EXISTS idx_profiles_name     ON public.profiles (employee_name);
CREATE INDEX IF NOT EXISTS idx_profiles_role     ON public.profiles (role_type, is_active);
CREATE INDEX IF NOT EXISTS idx_profiles_team     ON public.profiles (team, is_active);

-- updated_at trigger
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ──────────────────────────────────────────────────────────────
-- B. Shared helper — single canonical update_updated_at()
-- All module schemas call this. Define once, OR REPLACE safe.
-- (set_updated_at already exists from 0001; this alias ensures
--  module SQL files that call update_updated_at() also work.)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ──────────────────────────────────────────────────────────────
-- C1. Attendance module
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shifts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  name_ar               TEXT,
  type                  TEXT NOT NULL DEFAULT 'morning',
  start_time            TIME NOT NULL,
  end_time              TIME NOT NULL,
  grace_minutes         INTEGER NOT NULL DEFAULT 15,
  max_overtime_minutes  INTEGER NOT NULL DEFAULT 120,
  days_of_week          INTEGER[] DEFAULT ARRAY[1,2,3,4,5],
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_shifts_updated_at ON public.shifts;
CREATE TRIGGER trg_shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Seed default shifts (idempotent)
INSERT INTO public.shifts (name, name_ar, type, start_time, end_time, grace_minutes, days_of_week)
VALUES
  ('Morning Shift',  'الوردية الصباحية', 'morning',  '08:00', '16:00', 15, ARRAY[1,2,3,4,5]),
  ('Evening Shift',  'الوردية المسائية', 'evening',  '16:00', '00:00', 15, ARRAY[1,2,3,4,5]),
  ('Flexible Shift', 'الدوام المرن',     'flexible', '07:00', '18:00', 60, ARRAY[1,2,3,4,5])
ON CONFLICT DO NOTHING;

-- NOTE: attendance_records references auth.users(id) directly
-- (not profiles.id) so attendance works even before profile row exists.
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date                  DATE NOT NULL DEFAULT CURRENT_DATE,
  shift_id              UUID REFERENCES public.shifts(id),
  status                TEXT NOT NULL DEFAULT 'pending',
  check_in_time         TIMESTAMPTZ,
  check_out_time        TIMESTAMPTZ,
  expected_check_in     TIMESTAMPTZ,
  expected_check_out    TIMESTAMPTZ,
  worked_minutes        INTEGER NOT NULL DEFAULT 0,
  overtime_minutes      INTEGER NOT NULL DEFAULT 0,
  late_by_minutes       INTEGER NOT NULL DEFAULT 0,
  break_minutes         INTEGER NOT NULL DEFAULT 0,
  notes                 TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}',
  check_in_source       TEXT DEFAULT 'web',
  check_out_source      TEXT DEFAULT 'web',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);

DROP TRIGGER IF EXISTS trg_attendance_updated_at ON public.attendance_records;
CREATE TRIGGER trg_attendance_updated_at
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.break_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_record_id  UUID NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  start_time            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time              TIMESTAMPTZ,
  duration_minutes      INTEGER,
  type                  TEXT NOT NULL DEFAULT 'regular',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.attendance_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_record_id  UUID REFERENCES public.attendance_records(id),
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  event_type            TEXT NOT NULL,
  occurred_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_by            UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_user_date  ON public.attendance_records (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_date        ON public.attendance_records (date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_status      ON public.attendance_records (status, date DESC);
CREATE INDEX IF NOT EXISTS idx_breaks_record          ON public.break_sessions (attendance_record_id);
CREATE INDEX IF NOT EXISTS idx_attendance_events_user ON public.attendance_events (user_id, occurred_at DESC);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.break_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts             ENABLE ROW LEVEL SECURITY;

-- Drop stale policies first
DROP POLICY IF EXISTS "attendance_select_own"     ON public.attendance_records;
DROP POLICY IF EXISTS "attendance_insert_own"     ON public.attendance_records;
DROP POLICY IF EXISTS "attendance_update_own"     ON public.attendance_records;
DROP POLICY IF EXISTS "attendance_select_manager" ON public.attendance_records;
DROP POLICY IF EXISTS "breaks_own"                ON public.break_sessions;
DROP POLICY IF EXISTS "events_own"                ON public.attendance_events;
DROP POLICY IF EXISTS "shifts_read_all"           ON public.shifts;

-- Own records + admin + manager of same team
CREATE POLICY "attendance_select_all"
  ON public.attendance_records FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.current_role_type() = 'admin'
    OR (
      public.current_role_type() IN ('manager', 'sales_manager', 'social_manager')
      AND EXISTS (
        SELECT 1 FROM public.profiles emp
        WHERE emp.id = user_id
          AND emp.team = public.current_team()
      )
    )
  );

CREATE POLICY "attendance_insert_own"
  ON public.attendance_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "attendance_update_own"
  ON public.attendance_records FOR UPDATE
  USING (
    auth.uid() = user_id
    OR public.current_role_type() IN ('admin', 'manager', 'sales_manager', 'social_manager')
  );

CREATE POLICY "breaks_own"
  ON public.break_sessions FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "events_select"
  ON public.attendance_events FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.current_role_type() = 'admin'
  );

CREATE POLICY "events_insert"
  ON public.attendance_events FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.uid() = created_by);

CREATE POLICY "shifts_read_all"
  ON public.shifts FOR SELECT
  USING (TRUE);

CREATE POLICY "shifts_admin_write"
  ON public.shifts FOR ALL
  USING (public.current_role_type() = 'admin');


-- ──────────────────────────────────────────────────────────────
-- C2. Notifications
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  message     TEXT,
  entity_type TEXT,
  entity_id   TEXT,
  severity    TEXT        NOT NULL DEFAULT 'info'
                          CHECK (severity IN ('info','warning','critical')),
  is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  dedup_key   TEXT        UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_notif_user_unread_created
  ON public.notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_user_is_read
  ON public.notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_created_at
  ON public.notifications (created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own"  ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_auth" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own"  ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_own"  ON public.notifications;

CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "notifications_insert_auth"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  USING    (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_delete_own"
  ON public.notifications FOR DELETE
  USING (user_id = auth.uid());


-- ──────────────────────────────────────────────────────────────
-- C3. Audit / Activity Logs
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_name     TEXT,
  action_type   TEXT        NOT NULL,
  action_label  TEXT        NOT NULL,
  entity_type   TEXT,
  entity_id     TEXT,
  entity_label  TEXT,
  severity      TEXT        NOT NULL DEFAULT 'info'
                            CHECK (severity IN ('info', 'warning', 'critical')),
  metadata      JSONB       NOT NULL DEFAULT '{}',
  ip_address    INET,
  device_info   TEXT,
  session_id    TEXT,
  prev_entry_id UUID        REFERENCES public.activity_logs(id) ON DELETE RESTRICT,
  checksum      TEXT,
  -- FTS generated column — fixes auditService.js textSearch('fts', ...)
  fts           TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple',
      COALESCE(action_label, '') || ' ' ||
      COALESCE(entity_label, '') || ' ' ||
      COALESCE(user_name, '')
    )
  ) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_al_user_id     ON public.activity_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_al_action_type ON public.activity_logs (action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_al_entity      ON public.activity_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_al_severity    ON public.activity_logs (severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_al_created_at  ON public.activity_logs (created_at DESC);
-- GIN index on the generated fts column (replaces the old expression index)
CREATE INDEX IF NOT EXISTS idx_al_fts         ON public.activity_logs USING gin(fts);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "al_insert" ON public.activity_logs;
DROP POLICY IF EXISTS "al_select" ON public.activity_logs;

CREATE POLICY "al_insert" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "al_select" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_role_type() = 'admin'
  );

-- Archive table for retention
CREATE TABLE IF NOT EXISTS public.activity_logs_archive
  (LIKE public.activity_logs INCLUDING ALL);


-- ──────────────────────────────────────────────────────────────
-- C4. Files module
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.file_folders (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  parent_id   UUID        REFERENCES public.file_folders(id) ON DELETE CASCADE,
  owner_id    UUID        NOT NULL REFERENCES auth.users(id),
  path        TEXT        NOT NULL DEFAULT '/',
  color       TEXT,
  is_deleted  BOOLEAN     NOT NULL DEFAULT FALSE,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_folders_updated_at ON public.file_folders;
CREATE TRIGGER trg_folders_updated_at
  BEFORE UPDATE ON public.file_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.files (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  original_name   TEXT        NOT NULL,
  folder_id       UUID        REFERENCES public.file_folders(id) ON DELETE SET NULL,
  owner_id        UUID        NOT NULL REFERENCES auth.users(id),
  storage_path    TEXT        NOT NULL,
  bucket          TEXT        NOT NULL DEFAULT 'files',
  size_bytes      BIGINT      NOT NULL DEFAULT 0,
  mime_type       TEXT,
  file_type       TEXT        NOT NULL DEFAULT 'other',
  status          TEXT        NOT NULL DEFAULT 'active',
  is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,
  version         INTEGER     NOT NULL DEFAULT 1,
  latest_version  INTEGER     NOT NULL DEFAULT 1,
  thumbnail_path  TEXT,
  description     TEXT,
  tags            TEXT[]      DEFAULT ARRAY[]::TEXT[],
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, storage_path)
);

DROP TRIGGER IF EXISTS trg_files_updated_at ON public.files;
CREATE TRIGGER trg_files_updated_at
  BEFORE UPDATE ON public.files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.file_versions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id      UUID        NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  version      INTEGER     NOT NULL,
  storage_path TEXT        NOT NULL,
  size_bytes   BIGINT      NOT NULL DEFAULT 0,
  uploaded_by  UUID        REFERENCES auth.users(id),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (file_id, version)
);

CREATE TABLE IF NOT EXISTS public.file_shares (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id      UUID        REFERENCES public.files(id) ON DELETE CASCADE,
  folder_id    UUID        REFERENCES public.file_folders(id) ON DELETE CASCADE,
  shared_with  UUID        REFERENCES auth.users(id),
  permission   TEXT        NOT NULL DEFAULT 'read',
  token        TEXT        UNIQUE,
  expires_at   TIMESTAMPTZ,
  created_by   UUID        NOT NULL REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (file_id IS NOT NULL OR folder_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.file_activity (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id      UUID        REFERENCES public.files(id) ON DELETE CASCADE,
  folder_id    UUID        REFERENCES public.file_folders(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id),
  action       TEXT        NOT NULL,
  metadata     JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_owner    ON public.files (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_folder   ON public.files (folder_id, status);
CREATE INDEX IF NOT EXISTS idx_files_status   ON public.files (status, owner_id);
CREATE INDEX IF NOT EXISTS idx_files_type     ON public.files (file_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_folders_owner  ON public.file_folders (owner_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON public.file_folders (parent_id);
CREATE INDEX IF NOT EXISTS idx_shares_file    ON public.file_shares (file_id);
CREATE INDEX IF NOT EXISTS idx_shares_with    ON public.file_shares (shared_with);
CREATE INDEX IF NOT EXISTS idx_activity_file  ON public.file_activity (file_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_user  ON public.file_activity (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_versions_file  ON public.file_versions (file_id, version DESC);

ALTER TABLE public.files         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_folders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_shares   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "files_owner_select"  ON public.files;
DROP POLICY IF EXISTS "files_shared_select" ON public.files;
DROP POLICY IF EXISTS "files_owner_insert"  ON public.files;
DROP POLICY IF EXISTS "files_owner_update"  ON public.files;
DROP POLICY IF EXISTS "files_owner_delete"  ON public.files;
DROP POLICY IF EXISTS "files_admin_select"  ON public.files;

CREATE POLICY "files_owner_select"  ON public.files FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "files_admin_select"  ON public.files FOR SELECT USING (public.current_role_type() = 'admin');
CREATE POLICY "files_shared_select" ON public.files FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.file_shares fs
    WHERE fs.file_id = id AND fs.shared_with = auth.uid()
      AND (fs.expires_at IS NULL OR fs.expires_at > NOW())
  )
);
CREATE POLICY "files_owner_insert"  ON public.files FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "files_owner_update"  ON public.files FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "files_owner_delete"  ON public.files FOR DELETE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "folders_owner_all" ON public.file_folders;
CREATE POLICY "folders_owner_all" ON public.file_folders FOR ALL USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "versions_select" ON public.file_versions;
DROP POLICY IF EXISTS "versions_insert" ON public.file_versions;
CREATE POLICY "versions_select" ON public.file_versions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.files f WHERE f.id = file_id AND f.owner_id = auth.uid())
);
CREATE POLICY "versions_insert" ON public.file_versions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.files f WHERE f.id = file_id AND f.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "shares_read"   ON public.file_shares;
DROP POLICY IF EXISTS "shares_insert" ON public.file_shares;
DROP POLICY IF EXISTS "shares_delete" ON public.file_shares;
CREATE POLICY "shares_read"   ON public.file_shares FOR SELECT USING (auth.uid() = created_by OR auth.uid() = shared_with);
CREATE POLICY "shares_insert" ON public.file_shares FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "shares_delete" ON public.file_shares FOR DELETE USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "activity_select" ON public.file_activity;
DROP POLICY IF EXISTS "activity_insert" ON public.file_activity;
CREATE POLICY "activity_select" ON public.file_activity FOR SELECT USING (auth.uid() = user_id OR public.current_role_type() = 'admin');
CREATE POLICY "activity_insert" ON public.file_activity FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ──────────────────────────────────────────────────────────────
-- C5. Analytics
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.analytics_snapshots (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_type TEXT        NOT NULL DEFAULT 'daily',
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  metrics       JSONB       NOT NULL DEFAULT '{}',
  department_id TEXT,
  role_id       TEXT,
  shift_id      TEXT,
  generated_by  UUID        REFERENCES auth.users(id),
  is_published  BOOLEAN     NOT NULL DEFAULT FALSE,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULLS NOT DISTINCT requires PG15. Use COALESCE workaround for PG14.
  UNIQUE (snapshot_type, period_start,
          COALESCE(department_id, ''), COALESCE(role_id, ''), COALESCE(shift_id, ''))
);

CREATE TABLE IF NOT EXISTS public.dashboard_widgets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES auth.users(id),
  role_id       TEXT,
  dashboard_id  TEXT        NOT NULL DEFAULT 'executive',
  widget_type   TEXT        NOT NULL,
  title         TEXT        NOT NULL,
  config        JSONB       NOT NULL DEFAULT '{}',
  position_x    INTEGER     NOT NULL DEFAULT 0,
  position_y    INTEGER     NOT NULL DEFAULT 0,
  width         INTEGER     NOT NULL DEFAULT 2,
  height        INTEGER     NOT NULL DEFAULT 1,
  is_visible    BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_dashboard_widgets_updated_at ON public.dashboard_widgets;
CREATE TRIGGER trg_dashboard_widgets_updated_at
  BEFORE UPDATE ON public.dashboard_widgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.saved_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID        NOT NULL REFERENCES auth.users(id),
  name          TEXT        NOT NULL,
  description   TEXT,
  report_type   TEXT        NOT NULL DEFAULT 'custom',
  metrics       TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  filters       JSONB       NOT NULL DEFAULT '{}',
  grouping      TEXT        NOT NULL DEFAULT 'day',
  schedule      TEXT,
  last_run_at   TIMESTAMPTZ,
  recipients    TEXT[],
  is_public     BOOLEAN     NOT NULL DEFAULT FALSE,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_saved_reports_updated_at ON public.saved_reports;
CREATE TRIGGER trg_saved_reports_updated_at
  BEFORE UPDATE ON public.saved_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.report_exports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     UUID        REFERENCES public.saved_reports(id) ON DELETE SET NULL,
  requested_by  UUID        NOT NULL REFERENCES auth.users(id),
  format        TEXT        NOT NULL DEFAULT 'csv',
  status        TEXT        NOT NULL DEFAULT 'pending',
  file_path     TEXT,
  file_size     BIGINT,
  row_count     INTEGER,
  filters_used  JSONB       NOT NULL DEFAULT '{}',
  error_message TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_type_period ON public.analytics_snapshots (snapshot_type, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_dept        ON public.analytics_snapshots (department_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_widgets_user          ON public.dashboard_widgets (user_id, dashboard_id);
CREATE INDEX IF NOT EXISTS idx_widgets_role          ON public.dashboard_widgets (role_id, dashboard_id);
CREATE INDEX IF NOT EXISTS idx_reports_owner         ON public.saved_reports (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exports_requester     ON public.report_exports (requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exports_status        ON public.report_exports (status, created_at DESC);

ALTER TABLE public.analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_widgets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_exports      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "snapshots_select" ON public.analytics_snapshots;
DROP POLICY IF EXISTS "snapshots_insert" ON public.analytics_snapshots;
DROP POLICY IF EXISTS "widgets_all"      ON public.dashboard_widgets;
DROP POLICY IF EXISTS "reports_select"   ON public.saved_reports;
DROP POLICY IF EXISTS "reports_write"    ON public.saved_reports;
DROP POLICY IF EXISTS "exports_owner"    ON public.report_exports;

CREATE POLICY "snapshots_select" ON public.analytics_snapshots FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "snapshots_insert" ON public.analytics_snapshots FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "widgets_all"      ON public.dashboard_widgets   FOR ALL   USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "reports_select"   ON public.saved_reports       FOR SELECT USING (auth.uid() = owner_id OR is_public = TRUE);
CREATE POLICY "reports_write"    ON public.saved_reports       FOR ALL   USING (auth.uid() = owner_id);
CREATE POLICY "exports_owner"    ON public.report_exports      FOR ALL   USING (auth.uid() = requested_by);


-- ──────────────────────────────────────────────────────────────
-- C6. CRM module
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name    TEXT        NOT NULL,
  industry        TEXT,
  website         TEXT,
  country         TEXT        DEFAULT 'SA',
  city            TEXT,
  address         TEXT,
  assigned_to     UUID        REFERENCES auth.users(id),
  owner_id        UUID        REFERENCES auth.users(id),
  status          TEXT        NOT NULL DEFAULT 'active',
  tags            TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  total_deals     INTEGER     NOT NULL DEFAULT 0,
  total_revenue   NUMERIC     NOT NULL DEFAULT 0,
  last_contact_at TIMESTAMPTZ,
  notes           TEXT,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers;
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.customer_contacts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  full_name    TEXT        NOT NULL,
  role         TEXT,
  email        TEXT,
  phone        TEXT,
  whatsapp     TEXT,
  is_primary   BOOLEAN     NOT NULL DEFAULT FALSE,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_customer_contacts_updated_at ON public.customer_contacts;
CREATE TRIGGER trg_customer_contacts_updated_at
  BEFORE UPDATE ON public.customer_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.leads (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT        NOT NULL,
  company_name     TEXT,
  contact_name     TEXT,
  contact_email    TEXT,
  contact_phone    TEXT,
  contact_whatsapp TEXT,
  source           TEXT        NOT NULL DEFAULT 'manual',
  status           TEXT        NOT NULL DEFAULT 'new',
  estimated_value  NUMERIC     NOT NULL DEFAULT 0,
  currency         TEXT        NOT NULL DEFAULT 'SAR',
  assigned_to      UUID        REFERENCES auth.users(id),
  owner_id         UUID        REFERENCES auth.users(id),
  tags             TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  notes            TEXT,
  score            INTEGER     NOT NULL DEFAULT 0,
  converted_at     TIMESTAMPTZ,
  customer_id      UUID        REFERENCES public.customers(id),
  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_leads_updated_at ON public.leads;
CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.pipelines (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  description  TEXT,
  is_default   BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  owner_id     UUID        REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_pipelines_updated_at ON public.pipelines;
CREATE TRIGGER trg_pipelines_updated_at
  BEFORE UPDATE ON public.pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID        NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  color       TEXT        NOT NULL DEFAULT '#64748b',
  position    INTEGER     NOT NULL DEFAULT 0,
  is_won      BOOLEAN     NOT NULL DEFAULT FALSE,
  is_lost     BOOLEAN     NOT NULL DEFAULT FALSE,
  probability INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pipeline_id, slug)
);

CREATE TABLE IF NOT EXISTS public.deals (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title                TEXT        NOT NULL,
  pipeline_id          UUID        NOT NULL REFERENCES public.pipelines(id),
  stage_id             UUID        NOT NULL REFERENCES public.pipeline_stages(id),
  customer_id          UUID        REFERENCES public.customers(id),
  lead_id              UUID        REFERENCES public.leads(id),
  assigned_to          UUID        REFERENCES auth.users(id),
  owner_id             UUID        REFERENCES auth.users(id),
  value                NUMERIC     NOT NULL DEFAULT 0,
  currency             TEXT        NOT NULL DEFAULT 'SAR',
  status               TEXT        NOT NULL DEFAULT 'open',
  expected_close_date  DATE,
  closed_at            TIMESTAMPTZ,
  probability          INTEGER     NOT NULL DEFAULT 0,
  notes                TEXT,
  tags                 TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  metadata             JSONB       NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_deals_updated_at ON public.deals;
CREATE TRIGGER trg_deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.deal_activities (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id           UUID        REFERENCES public.deals(id) ON DELETE CASCADE,
  customer_id       UUID        REFERENCES public.customers(id),
  lead_id           UUID        REFERENCES public.leads(id),
  user_id           UUID        NOT NULL REFERENCES auth.users(id),
  activity_type     TEXT        NOT NULL DEFAULT 'note',
  title             TEXT        NOT NULL,
  description       TEXT,
  outcome           TEXT,
  duration_minutes  INTEGER,
  scheduled_at      TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  metadata          JSONB       NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.followups (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id        UUID        REFERENCES public.deals(id) ON DELETE CASCADE,
  customer_id    UUID        REFERENCES public.customers(id),
  lead_id        UUID        REFERENCES public.leads(id),
  assigned_to    UUID        NOT NULL REFERENCES auth.users(id),
  owner_id       UUID        REFERENCES auth.users(id),
  title          TEXT        NOT NULL,
  description    TEXT,
  followup_type  TEXT        NOT NULL DEFAULT 'call',
  status         TEXT        NOT NULL DEFAULT 'pending',
  due_at         TIMESTAMPTZ NOT NULL,
  completed_at   TIMESTAMPTZ,
  reminder_sent  BOOLEAN     NOT NULL DEFAULT FALSE,
  metadata       JSONB       NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_followups_updated_at ON public.followups;
CREATE TRIGGER trg_followups_updated_at
  BEFORE UPDATE ON public.followups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.sales_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     UUID        REFERENCES public.deals(id) ON DELETE CASCADE,
  customer_id UUID        REFERENCES public.customers(id),
  lead_id     UUID        REFERENCES public.leads(id),
  user_id     UUID        NOT NULL REFERENCES auth.users(id),
  content     TEXT        NOT NULL,
  is_pinned   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_sales_notes_updated_at ON public.sales_notes;
CREATE TRIGGER trg_sales_notes_updated_at
  BEFORE UPDATE ON public.sales_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_customers_assigned   ON public.customers (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_customers_status     ON public.customers (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_name_fts   ON public.customers USING gin(to_tsvector('simple', company_name));
CREATE INDEX IF NOT EXISTS idx_contacts_customer    ON public.customer_contacts (customer_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned       ON public.leads (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_leads_status         ON public.leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_pipeline       ON public.deals (pipeline_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_assigned       ON public.deals (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_deals_customer       ON public.deals (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_deal      ON public.deal_activities (deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_customer  ON public.deal_activities (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followups_assigned   ON public.followups (assigned_to, due_at, status);
CREATE INDEX IF NOT EXISTS idx_followups_due        ON public.followups (due_at, status);
CREATE INDEX IF NOT EXISTS idx_notes_deal           ON public.sales_notes (deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stages_pipeline      ON public.pipeline_stages (pipeline_id, position);

ALTER TABLE public.customers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_activities   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followups         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_notes       ENABLE ROW LEVEL SECURITY;

-- Drop any stale permissive policies from crm_schema.sql
DROP POLICY IF EXISTS "customers_select"  ON public.customers;
DROP POLICY IF EXISTS "customers_write"   ON public.customers;
DROP POLICY IF EXISTS "customers_insert"  ON public.customers;
DROP POLICY IF EXISTS "customers_update"  ON public.customers;
DROP POLICY IF EXISTS "customers_delete"  ON public.customers;
DROP POLICY IF EXISTS "contacts_all"      ON public.customer_contacts;
DROP POLICY IF EXISTS "contacts_select"   ON public.customer_contacts;
DROP POLICY IF EXISTS "contacts_insert"   ON public.customer_contacts;
DROP POLICY IF EXISTS "contacts_update"   ON public.customer_contacts;
DROP POLICY IF EXISTS "contacts_delete"   ON public.customer_contacts;
DROP POLICY IF EXISTS "leads_select"      ON public.leads;
DROP POLICY IF EXISTS "leads_write"       ON public.leads;
DROP POLICY IF EXISTS "leads_insert"      ON public.leads;
DROP POLICY IF EXISTS "leads_update"      ON public.leads;
DROP POLICY IF EXISTS "leads_delete"      ON public.leads;
DROP POLICY IF EXISTS "pipelines_select"  ON public.pipelines;
DROP POLICY IF EXISTS "pipelines_write"   ON public.pipelines;
DROP POLICY IF EXISTS "stages_select"     ON public.pipeline_stages;
DROP POLICY IF EXISTS "stages_write"      ON public.pipeline_stages;
DROP POLICY IF EXISTS "deals_select"      ON public.deals;
DROP POLICY IF EXISTS "deals_write"       ON public.deals;
DROP POLICY IF EXISTS "deals_insert"      ON public.deals;
DROP POLICY IF EXISTS "deals_update"      ON public.deals;
DROP POLICY IF EXISTS "deals_delete"      ON public.deals;
DROP POLICY IF EXISTS "activities_all"    ON public.deal_activities;
DROP POLICY IF EXISTS "activities_select" ON public.deal_activities;
DROP POLICY IF EXISTS "activities_insert" ON public.deal_activities;
DROP POLICY IF EXISTS "activities_update" ON public.deal_activities;
DROP POLICY IF EXISTS "activities_delete" ON public.deal_activities;
DROP POLICY IF EXISTS "followups_select"  ON public.followups;
DROP POLICY IF EXISTS "followups_write"   ON public.followups;
DROP POLICY IF EXISTS "followups_insert"  ON public.followups;
DROP POLICY IF EXISTS "followups_update"  ON public.followups;
DROP POLICY IF EXISTS "followups_delete"  ON public.followups;
DROP POLICY IF EXISTS "notes_all"         ON public.sales_notes;
DROP POLICY IF EXISTS "notes_select"      ON public.sales_notes;
DROP POLICY IF EXISTS "notes_insert"      ON public.sales_notes;
DROP POLICY IF EXISTS "notes_update"      ON public.sales_notes;
DROP POLICY IF EXISTS "notes_delete"      ON public.sales_notes;

-- Tightened CRM policies (from 0003 pattern, consolidated here)
CREATE POLICY "customers_select"  ON public.customers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "customers_insert"  ON public.customers FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "customers_update"  ON public.customers FOR UPDATE USING (auth.uid() = owner_id OR auth.uid() = assigned_to OR public.current_role_type() IN ('admin','manager','sales_manager'));
CREATE POLICY "customers_delete"  ON public.customers FOR DELETE USING (auth.uid() = owner_id OR public.current_role_type() IN ('admin','manager','sales_manager'));

CREATE POLICY "contacts_select"   ON public.customer_contacts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "contacts_insert"   ON public.customer_contacts FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "contacts_update"   ON public.customer_contacts FOR UPDATE USING (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND (c.owner_id = auth.uid() OR c.assigned_to = auth.uid() OR public.current_role_type() IN ('admin','manager','sales_manager'))));
CREATE POLICY "contacts_delete"   ON public.customer_contacts FOR DELETE USING (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND (c.owner_id = auth.uid() OR public.current_role_type() IN ('admin','manager','sales_manager'))));

CREATE POLICY "leads_select"      ON public.leads FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "leads_insert"      ON public.leads FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "leads_update"      ON public.leads FOR UPDATE USING (auth.uid() = owner_id OR auth.uid() = assigned_to OR public.current_role_type() IN ('admin','manager','sales_manager'));
CREATE POLICY "leads_delete"      ON public.leads FOR DELETE USING (auth.uid() = owner_id OR public.current_role_type() IN ('admin','manager','sales_manager'));

CREATE POLICY "pipelines_select"  ON public.pipelines FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "pipelines_write"   ON public.pipelines FOR ALL   USING (auth.uid() = owner_id OR public.current_role_type() IN ('admin','manager','sales_manager'));

CREATE POLICY "stages_select"     ON public.pipeline_stages FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "stages_write"      ON public.pipeline_stages FOR ALL   USING (public.current_role_type() IN ('admin','manager','sales_manager'));

CREATE POLICY "deals_select"      ON public.deals FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "deals_insert"      ON public.deals FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "deals_update"      ON public.deals FOR UPDATE USING (auth.uid() = owner_id OR auth.uid() = assigned_to OR public.current_role_type() IN ('admin','manager','sales_manager'));
CREATE POLICY "deals_delete"      ON public.deals FOR DELETE USING (auth.uid() = owner_id OR public.current_role_type() IN ('admin','manager','sales_manager'));

CREATE POLICY "activities_select" ON public.deal_activities FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "activities_insert" ON public.deal_activities FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "activities_update" ON public.deal_activities FOR UPDATE USING (auth.uid() = user_id OR public.current_role_type() = 'admin');
CREATE POLICY "activities_delete" ON public.deal_activities FOR DELETE USING (auth.uid() = user_id OR public.current_role_type() = 'admin');

CREATE POLICY "followups_select"  ON public.followups FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "followups_insert"  ON public.followups FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "followups_update"  ON public.followups FOR UPDATE USING (auth.uid() = assigned_to OR auth.uid() = owner_id OR public.current_role_type() IN ('admin','manager','sales_manager'));
CREATE POLICY "followups_delete"  ON public.followups FOR DELETE USING (auth.uid() = owner_id OR public.current_role_type() IN ('admin','manager','sales_manager'));

CREATE POLICY "notes_select"      ON public.sales_notes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "notes_insert"      ON public.sales_notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notes_update"      ON public.sales_notes FOR UPDATE USING (auth.uid() = user_id OR public.current_role_type() = 'admin');
CREATE POLICY "notes_delete"      ON public.sales_notes FOR DELETE USING (auth.uid() = user_id OR public.current_role_type() = 'admin');

-- Seed: default CRM pipeline (idempotent)
DO $$
DECLARE _pid UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pipelines WHERE is_default = TRUE) THEN
    INSERT INTO public.pipelines (name, description, is_default, is_active)
    VALUES ('خط المبيعات الرئيسي', 'خط المبيعات الافتراضي للشركة', TRUE, TRUE)
    RETURNING id INTO _pid;

    INSERT INTO public.pipeline_stages (pipeline_id, name, slug, color, position, probability) VALUES
      (_pid, 'عميل محتمل جديد', 'new_lead',         '#64748b', 0,  10),
      (_pid, 'تم التواصل',      'contacted',          '#3b82f6', 1,  25),
      (_pid, 'قيد التفاوض',     'negotiation',        '#f59e0b', 2,  60),
      (_pid, 'بانتظار الدفع',   'awaiting_payment',   '#a855f7', 3,  85),
      (_pid, 'صفقة مكتملة',     'won',                '#22c55e', 4, 100),
      (_pid, 'خسارة',           'lost',               '#ef4444', 5,   0);

    UPDATE public.pipeline_stages SET is_won  = TRUE WHERE pipeline_id = _pid AND slug = 'won';
    UPDATE public.pipeline_stages SET is_lost = TRUE WHERE pipeline_id = _pid AND slug = 'lost';
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- C7. Collaboration module (FULLY MISSING — new tables)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.collaboration_channels (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT,
  channel_type TEXT        NOT NULL DEFAULT 'thread',
    -- thread | dm | group | announcement
  entity_type  TEXT,       -- 'task' | 'deal' | 'file' | null (standalone)
  entity_id    TEXT,
  created_by   UUID        NOT NULL REFERENCES auth.users(id),
  is_archived  BOOLEAN     NOT NULL DEFAULT FALSE,
  metadata     JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_collab_channels_updated_at ON public.collaboration_channels;
CREATE TRIGGER trg_collab_channels_updated_at
  BEFORE UPDATE ON public.collaboration_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.collaboration_comments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   UUID        REFERENCES public.collaboration_channels(id) ON DELETE CASCADE,
  entity_type  TEXT,       -- used when no channel_id (inline threads)
  entity_id    TEXT,
  parent_id    UUID        REFERENCES public.collaboration_comments(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id),
  content      TEXT        NOT NULL,
  is_deleted   BOOLEAN     NOT NULL DEFAULT FALSE,
  reactions    JSONB       NOT NULL DEFAULT '{}',
  metadata     JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_collab_comments_updated_at ON public.collaboration_comments;
CREATE TRIGGER trg_collab_comments_updated_at
  BEFORE UPDATE ON public.collaboration_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Read receipts (collaboration_reads — referenced in service comment)
CREATE TABLE IF NOT EXISTS public.collaboration_reads (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id),
  entity_type  TEXT        NOT NULL,
  entity_id    TEXT        NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_collab_comments_channel  ON public.collaboration_comments (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collab_comments_entity   ON public.collaboration_comments (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collab_comments_parent   ON public.collaboration_comments (parent_id);
CREATE INDEX IF NOT EXISTS idx_collab_channels_entity   ON public.collaboration_channels (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_collab_reads_user        ON public.collaboration_reads (user_id, entity_type, entity_id);

ALTER TABLE public.collaboration_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaboration_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaboration_reads    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collab_channels_select" ON public.collaboration_channels;
DROP POLICY IF EXISTS "collab_channels_insert" ON public.collaboration_channels;
DROP POLICY IF EXISTS "collab_channels_update" ON public.collaboration_channels;
DROP POLICY IF EXISTS "collab_comments_select" ON public.collaboration_comments;
DROP POLICY IF EXISTS "collab_comments_insert" ON public.collaboration_comments;
DROP POLICY IF EXISTS "collab_comments_update" ON public.collaboration_comments;
DROP POLICY IF EXISTS "collab_reads_all"       ON public.collaboration_reads;

CREATE POLICY "collab_channels_select" ON public.collaboration_channels FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "collab_channels_insert" ON public.collaboration_channels FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "collab_channels_update" ON public.collaboration_channels FOR UPDATE USING (auth.uid() = created_by OR public.current_role_type() = 'admin');

CREATE POLICY "collab_comments_select" ON public.collaboration_comments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "collab_comments_insert" ON public.collaboration_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "collab_comments_update" ON public.collaboration_comments FOR UPDATE USING (auth.uid() = user_id OR public.current_role_type() = 'admin');

CREATE POLICY "collab_reads_all"       ON public.collaboration_reads    FOR ALL   USING (auth.uid() = user_id);


-- ──────────────────────────────────────────────────────────────
-- D. Fix: activity_logs — add fts column if table already exists
-- without the generated column (ALTER adds it non-destructively).
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Only add if the column doesn't already exist (the CREATE TABLE
  -- above includes it for fresh installs; this handles upgrades).
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'activity_logs'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'activity_logs'
      AND column_name  = 'fts'
  ) THEN
    ALTER TABLE public.activity_logs
      ADD COLUMN fts TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('simple',
          COALESCE(action_label, '') || ' ' ||
          COALESCE(entity_label, '') || ' ' ||
          COALESCE(user_name, '')
        )
      ) STORED;

    CREATE INDEX IF NOT EXISTS idx_al_fts ON public.activity_logs USING gin(fts);
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- E. Realtime publications (idempotent DO blocks)
-- ──────────────────────────────────────────────────────────────

-- attendance_records
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='attendance_records') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
  END IF;
END $$;

-- break_sessions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='break_sessions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.break_sessions;
  END IF;
END $$;

-- notifications
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- activity_logs
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='activity_logs')
  AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='activity_logs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
  END IF;
END $$;

-- files (NEW — was missing)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='files')
  AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='files') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.files;
  END IF;
END $$;

-- collaboration_comments (NEW)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='collaboration_comments')
  AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='collaboration_comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.collaboration_comments;
  END IF;
END $$;

-- analytics_snapshots (NEW — needed for live dashboard)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='analytics_snapshots')
  AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='analytics_snapshots') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.analytics_snapshots;
  END IF;
END $$;

-- CRM realtime (deals, leads, customers — for live pipeline board)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='deals') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='leads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='followups') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.followups;
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- F. Storage buckets (create if not present)
-- ──────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('files',   'files',   false, 52428800,  NULL),  -- 50 MB limit
  ('avatars', 'avatars', true,  2097152,   ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- G. Storage RLS — avatars bucket (files bucket handled in 0003)
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_bucket_owner_write'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "avatars_bucket_owner_write"
        ON storage.objects FOR ALL
        USING (
          bucket_id = 'avatars'
          AND auth.uid()::text = (storage.foldername(name))[1]
        )
        WITH CHECK (
          bucket_id = 'avatars'
          AND auth.uid()::text = (storage.foldername(name))[1]
        );
    $policy$;
  END IF;
END $$;

-- Avatars are public-readable (bucket is public=true)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_bucket_public_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "avatars_bucket_public_read"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'avatars');
    $policy$;
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES (run manually to confirm)
-- ──────────────────────────────────────────────────────────────
-- 1. All tables with RLS enabled:
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname='public'
-- ORDER BY tablename;
--
-- 2. All realtime publications:
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname='supabase_realtime'
-- ORDER BY tablename;
--
-- 3. Storage buckets:
-- SELECT id, name, public FROM storage.buckets;
--
-- 4. Verify fts column on activity_logs:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='activity_logs' AND column_name='fts';
--
-- 5. All policies on key tables:
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname='public'
-- ORDER BY tablename, policyname;
-- =============================================================
