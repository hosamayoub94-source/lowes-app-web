-- =============================================================
-- Enterprise Attendance & Shift Management — Supabase Schema
-- Run in Supabase SQL Editor (or via migration tool).
-- =============================================================

-- ── 1. Shifts ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shifts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  name_ar               TEXT,
  type                  TEXT NOT NULL DEFAULT 'morning',
    -- morning | evening | night | custom | flexible
  start_time            TIME NOT NULL,
  end_time              TIME NOT NULL,
  grace_minutes         INTEGER NOT NULL DEFAULT 15,
    -- minutes after start_time before marking as "late"
  max_overtime_minutes  INTEGER NOT NULL DEFAULT 120,
  days_of_week          INTEGER[] DEFAULT ARRAY[1,2,3,4,5],
    -- 0=Sun, 1=Mon … 6=Sat  (Saudi: 1-5 typical work week)
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default shifts
INSERT INTO shifts (name, name_ar, type, start_time, end_time, grace_minutes, days_of_week)
VALUES
  ('Morning Shift',   'الوردية الصباحية',  'morning',  '08:00', '16:00', 15, ARRAY[1,2,3,4,5]),
  ('Evening Shift',   'الوردية المسائية',  'evening',  '16:00', '00:00', 15, ARRAY[1,2,3,4,5]),
  ('Flexible Shift',  'الدوام المرن',      'flexible', '07:00', '18:00', 60, ARRAY[1,2,3,4,5])
ON CONFLICT DO NOTHING;

-- ── 2. Attendance Records ─────────────────────────────────────
-- One record per employee per day.
CREATE TABLE IF NOT EXISTS attendance_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date                  DATE NOT NULL DEFAULT CURRENT_DATE,
  shift_id              UUID REFERENCES shifts(id),
  status                TEXT NOT NULL DEFAULT 'pending',
    -- pending | present | late | absent | on_break | checked_out
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
  -- Offline-safe: source of check-in (web | mobile | qr | gps)
  check_in_source       TEXT DEFAULT 'web',
  check_out_source      TEXT DEFAULT 'web',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, date)
);

-- ── 3. Break Sessions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS break_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_record_id  UUID NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  start_time            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time              TIMESTAMPTZ,
  duration_minutes      INTEGER,
  type                  TEXT NOT NULL DEFAULT 'regular',
    -- regular | lunch | prayer | personal
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Attendance Events (audit trail) ────────────────────────
CREATE TABLE IF NOT EXISTS attendance_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_record_id  UUID REFERENCES attendance_records(id),
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  event_type            TEXT NOT NULL,
    -- check_in | check_out | break_start | break_end |
    -- late_flagged | absent_flagged | manual_update | overtime_started
  occurred_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_by            UUID REFERENCES auth.users(id)
);

-- ── Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_user_date
  ON attendance_records (user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_date
  ON attendance_records (date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_status
  ON attendance_records (status, date DESC);

CREATE INDEX IF NOT EXISTS idx_breaks_record
  ON break_sessions (attendance_record_id);

CREATE INDEX IF NOT EXISTS idx_attendance_events_user
  ON attendance_events (user_id, occurred_at DESC);

-- ── Triggers — auto-update updated_at ─────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_attendance_updated_at
  BEFORE UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_shifts_updated_at
  BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS Policies ───────────────────────────────────────────────
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE break_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts             ENABLE ROW LEVEL SECURITY;

-- Employees: read own records; managers: read all
CREATE POLICY "attendance_select_own"
  ON attendance_records FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "attendance_insert_own"
  ON attendance_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "attendance_update_own"
  ON attendance_records FOR UPDATE
  USING (auth.uid() = user_id);

-- Breaks: own records only
CREATE POLICY "breaks_own"
  ON break_sessions FOR ALL
  USING (auth.uid() = user_id);

-- Events: insert own, select own
CREATE POLICY "events_own"
  ON attendance_events FOR ALL
  USING (auth.uid() = user_id);

-- Shifts: everyone can read
CREATE POLICY "shifts_read_all"
  ON shifts FOR SELECT
  USING (TRUE);

-- ── Realtime publication ───────────────────────────────────────
-- Run in Supabase Dashboard → Database → Replication
-- or via SQL:
-- ALTER PUBLICATION supabase_realtime ADD TABLE attendance_records;
-- ALTER PUBLICATION supabase_realtime ADD TABLE break_sessions;
