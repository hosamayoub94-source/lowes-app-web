-- =============================================================
-- Enterprise Analytics & Executive Dashboard — Supabase Schema
-- Run in Supabase SQL Editor or via migration tool.
-- Depends on: update_updated_at() function (already exists from files module)
-- =============================================================

-- ── 1. Analytics Snapshots ────────────────────────────────────
-- Periodic metric snapshots (hourly / daily / weekly / monthly)
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_type TEXT        NOT NULL DEFAULT 'daily',
    -- hourly | daily | weekly | monthly
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,

  -- KPI values stored as flat JSONB for schema-evolution flexibility
  metrics       JSONB       NOT NULL DEFAULT '{}',
    -- { attendance_rate, productivity_score, completed_tasks,
    --   late_employees, active_users, avg_response_time_ms, ... }

  -- Optional dimension filters captured at snapshot time
  department_id TEXT,
  role_id       TEXT,
  shift_id      TEXT,

  generated_by  UUID        REFERENCES auth.users(id),
  is_published  BOOLEAN     NOT NULL DEFAULT FALSE,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (snapshot_type, period_start, department_id, role_id, shift_id)
);

-- ── 2. Dashboard Widgets ──────────────────────────────────────
-- Widget configuration per user / role / dashboard
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES auth.users(id),
  role_id       TEXT,                        -- NULL = user-specific
  dashboard_id  TEXT        NOT NULL DEFAULT 'executive',
    -- executive | team | attendance | productivity | system

  widget_type   TEXT        NOT NULL,
    -- stat_card | trend_chart | bar_chart | donut_chart |
    -- activity_feed | heatmap | progress | kpi_alert

  title         TEXT        NOT NULL,
  config        JSONB       NOT NULL DEFAULT '{}',
    -- { metric, period, color, thresholds, filters, ... }

  -- CSS grid position
  position_x    INTEGER     NOT NULL DEFAULT 0,
  position_y    INTEGER     NOT NULL DEFAULT 0,
  width         INTEGER     NOT NULL DEFAULT 2,
  height        INTEGER     NOT NULL DEFAULT 1,

  is_visible    BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Saved Reports ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID        NOT NULL REFERENCES auth.users(id),
  name          TEXT        NOT NULL,
  description   TEXT,
  report_type   TEXT        NOT NULL DEFAULT 'custom',
    -- attendance | productivity | tasks | notifications | system | custom

  metrics       TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  filters       JSONB       NOT NULL DEFAULT '{}',
  grouping      TEXT        NOT NULL DEFAULT 'day',

  -- Scheduling
  schedule      TEXT,             -- cron expression (NULL = on-demand)
  last_run_at   TIMESTAMPTZ,
  recipients    TEXT[],

  is_public     BOOLEAN     NOT NULL DEFAULT FALSE,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Report Exports ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_exports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     UUID        REFERENCES saved_reports(id) ON DELETE SET NULL,
  requested_by  UUID        NOT NULL REFERENCES auth.users(id),

  format        TEXT        NOT NULL DEFAULT 'csv',  -- csv | xlsx | pdf
  status        TEXT        NOT NULL DEFAULT 'pending',
    -- pending | processing | done | failed

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

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_snapshots_type_period ON analytics_snapshots (snapshot_type, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_dept        ON analytics_snapshots (department_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_widgets_user          ON dashboard_widgets (user_id, dashboard_id);
CREATE INDEX IF NOT EXISTS idx_widgets_role          ON dashboard_widgets (role_id, dashboard_id);
CREATE INDEX IF NOT EXISTS idx_reports_owner         ON saved_reports (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exports_requester     ON report_exports (requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exports_status        ON report_exports (status, created_at DESC);

-- ── Triggers ─────────────────────────────────────────────────
CREATE TRIGGER trg_dashboard_widgets_updated_at
  BEFORE UPDATE ON dashboard_widgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_saved_reports_updated_at
  BEFORE UPDATE ON saved_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_widgets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_exports      ENABLE ROW LEVEL SECURITY;

-- Snapshots: any authenticated user can read and insert
CREATE POLICY "snapshots_select" ON analytics_snapshots FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "snapshots_insert" ON analytics_snapshots FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Widgets: users own their rows; NULL user_id = role-based (readable by all)
CREATE POLICY "widgets_all"   ON dashboard_widgets FOR ALL USING (auth.uid() = user_id OR user_id IS NULL);

-- Saved reports
CREATE POLICY "reports_select" ON saved_reports FOR SELECT USING (auth.uid() = owner_id OR is_public = TRUE);
CREATE POLICY "reports_write"  ON saved_reports FOR ALL   USING (auth.uid() = owner_id);

-- Exports
CREATE POLICY "exports_owner" ON report_exports FOR ALL USING (auth.uid() = requested_by);
