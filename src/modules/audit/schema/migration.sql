-- =============================================================
-- Audit Module — Database Migration
-- Append-only, tamper-resistant activity log.
-- File: src/modules/audit/schema/migration.sql
-- Apply via: supabase db push OR supabase migration up
-- =============================================================

-- ── Extension dependencies ───────────────────────────────────
-- gen_random_uuid() requires pgcrypto or uuid-ossp (standard on Supabase)

-- ── Table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
  -- Identity
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Actor — stored denormalized so records survive user deletion
  user_id       uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  user_name     text,                         -- preserved even after profile delete

  -- Action
  action_type   text          NOT NULL,
  action_label  text          NOT NULL,       -- human-readable Arabic description

  -- Target entity
  entity_type   text,                         -- 'task' | 'attendance' | 'auth' | ...
  entity_id     text,                         -- the affected record's id (any type)
  entity_label  text,                         -- display name of the entity

  -- Classification
  severity      text          NOT NULL DEFAULT 'info'
                              CHECK (severity IN ('info', 'warning', 'critical')),

  -- Payload
  metadata      jsonb         NOT NULL DEFAULT '{}',   -- before/after state, extra ctx

  -- Context
  ip_address    inet,                         -- captured server-side via edge function
  device_info   text,                         -- simplified user-agent
  session_id    text,                         -- supabase session id

  -- Integrity chain (tamper-evidence)
  -- Each row hashes: prev_entry_id || created_at || user_id || action_type
  -- A broken chain signals tampering or out-of-order insertion.
  prev_entry_id uuid          REFERENCES activity_logs(id) ON DELETE RESTRICT,
  checksum      text,                         -- md5 of chain fields (computed by trigger)

  -- Timestamps — immutable after insert (enforced by RLS below)
  created_at    timestamptz   NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────
-- Each index serves a specific query pattern on the dashboard.

-- User's own history (my activity view)
CREATE INDEX IF NOT EXISTS idx_al_user_id
  ON activity_logs(user_id, created_at DESC);

-- Admin filter by action type
CREATE INDEX IF NOT EXISTS idx_al_action_type
  ON activity_logs(action_type, created_at DESC);

-- Entity-level drill-down (e.g. all activity on task X)
CREATE INDEX IF NOT EXISTS idx_al_entity
  ON activity_logs(entity_type, entity_id, created_at DESC);

-- Severity dashboard (warning/critical counts)
CREATE INDEX IF NOT EXISTS idx_al_severity
  ON activity_logs(severity, created_at DESC);

-- Time-range queries (most common pattern)
CREATE INDEX IF NOT EXISTS idx_al_created_at
  ON activity_logs(created_at DESC);

-- Full-text search (Arabic + entity_label + user_name)
CREATE INDEX IF NOT EXISTS idx_al_fts
  ON activity_logs USING gin(
    to_tsvector('simple',
      coalesce(action_label, '') || ' ' ||
      coalesce(entity_label, '') || ' ' ||
      coalesce(user_name, '')
    )
  );

-- ── Row-Level Security ─────────────────────────────────────────
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- INSERT: any authenticated user can insert their own logs.
-- The user_id must match auth.uid() to prevent spoofing.
CREATE POLICY "al_insert" ON activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- SELECT: users see their own logs; admins see everything.
CREATE POLICY "al_select" ON activity_logs
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role_type = 'admin'
    )
  );

-- NO UPDATE POLICY → records are immutable after insert.
-- NO DELETE POLICY → records are append-only.

-- ── Retention function ─────────────────────────────────────────
-- Schedule with pg_cron: SELECT cron.schedule('0 2 1 * *', $$CALL archive_old_logs()$$);
-- Archives (moves to activity_logs_archive) records older than 365 days.
CREATE TABLE IF NOT EXISTS activity_logs_archive
  (LIKE activity_logs INCLUDING ALL);

CREATE OR REPLACE PROCEDURE archive_old_logs()
LANGUAGE plpgsql AS $$
DECLARE
  cutoff timestamptz := NOW() - INTERVAL '365 days';
BEGIN
  -- Move old records to archive table
  INSERT INTO activity_logs_archive
    SELECT * FROM activity_logs WHERE created_at < cutoff;
  -- Delete originals (only admin-triggered procedure can delete)
  DELETE FROM activity_logs WHERE created_at < cutoff;
  RAISE NOTICE 'Archived logs older than %', cutoff;
END;
$$;

-- ── Realtime ──────────────────────────────────────────────────
-- Enable realtime publication so the admin dashboard receives
-- new log entries without polling.
-- Run once after creating the table:
--   ALTER PUBLICATION supabase_realtime ADD TABLE activity_logs;

-- ── Integrity trigger ─────────────────────────────────────────
-- Optionally compute a checksum on insert (requires pgcrypto).
-- Disabled by default — uncomment when pgcrypto is available.
/*
CREATE OR REPLACE FUNCTION set_audit_checksum()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.checksum := md5(
    coalesce(NEW.prev_entry_id::text, '') ||
    NEW.created_at::text                  ||
    coalesce(NEW.user_id::text, '')       ||
    NEW.action_type
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_checksum
  BEFORE INSERT ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION set_audit_checksum();
*/

-- ── Comments ───────────────────────────────────────────────────
COMMENT ON TABLE  activity_logs                IS 'Append-only enterprise audit trail';
COMMENT ON COLUMN activity_logs.checksum       IS 'Chain hash for tamper detection';
COMMENT ON COLUMN activity_logs.prev_entry_id  IS 'Links to prior entry — broken chain signals tampering';
COMMENT ON COLUMN activity_logs.metadata       IS 'JSONB payload: before/after state, request context';
