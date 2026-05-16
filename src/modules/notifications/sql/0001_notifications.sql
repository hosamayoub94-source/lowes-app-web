-- ================================================================
-- Notifications — production schema
-- Run once in Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: all statements use IF NOT EXISTS / OR REPLACE.
-- ================================================================

-- ── Table ─────────────────────────────────────────────────────────
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
  is_read     BOOLEAN     NOT NULL DEFAULT false,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  -- Deduplication: unique per (user + type + entity + calendar day).
  -- Client computes this before insert; unique violation = swallowed silently.
  dedup_key   TEXT        UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notifications IS
  'Per-user notification inbox. Append-only from the app; users can mark as read.';

-- ── Indexes ───────────────────────────────────────────────────────
-- Primary query pattern: newest unread first for a given user
CREATE INDEX IF NOT EXISTS idx_notif_user_unread_created
  ON public.notifications (user_id, is_read, created_at DESC);

-- For fast unread count
CREATE INDEX IF NOT EXISTS idx_notif_user_is_read
  ON public.notifications (user_id, is_read);

-- Cleanup / TTL queries
CREATE INDEX IF NOT EXISTS idx_notif_created_at
  ON public.notifications (created_at DESC);

-- ── Realtime ──────────────────────────────────────────────────────
-- Required so the realtime channel streams full row data on INSERT.
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- Add to the default supabase_realtime publication (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname   = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- ── RLS ───────────────────────────────────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Each user reads only their own rows
DROP POLICY IF EXISTS "notifications_select_own"  ON public.notifications;
CREATE POLICY "notifications_select_own"
  ON public.notifications
  FOR SELECT
  USING (user_id = auth.uid());

-- Any authenticated session can INSERT (user A → notifies user B on task assign)
DROP POLICY IF EXISTS "notifications_insert_auth" ON public.notifications;
CREATE POLICY "notifications_insert_auth"
  ON public.notifications
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Users update only their own rows (mark_as_read, mark_all_as_read)
DROP POLICY IF EXISTS "notifications_update_own"  ON public.notifications;
CREATE POLICY "notifications_update_own"
  ON public.notifications
  FOR UPDATE
  USING    (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete only their own (optional housekeeping)
DROP POLICY IF EXISTS "notifications_delete_own"  ON public.notifications;
CREATE POLICY "notifications_delete_own"
  ON public.notifications
  FOR DELETE
  USING (user_id = auth.uid());
