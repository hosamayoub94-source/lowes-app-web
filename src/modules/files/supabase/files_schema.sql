-- =============================================================
-- Enterprise File & Media Management — Supabase Schema
-- Run in Supabase SQL Editor or via migration tool.
-- Requires: Supabase Storage bucket named "files" to exist.
-- =============================================================

-- ── 0. Supabase Storage bucket hint ──────────────────────────
-- Create via Dashboard → Storage → New bucket → name: "files"
-- Or via SQL:
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('files', 'files', false);

-- ── 1. Folders ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS file_folders (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  parent_id   UUID        REFERENCES file_folders(id) ON DELETE CASCADE,
  owner_id    UUID        NOT NULL REFERENCES auth.users(id),
  -- Full materialised path e.g. "/root/docs/reports"
  path        TEXT        NOT NULL DEFAULT '/',
  color       TEXT,                      -- hex for UI colour coding
  is_deleted  BOOLEAN     NOT NULL DEFAULT FALSE,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Files ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS files (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,          -- display name (can be renamed)
  original_name   TEXT        NOT NULL,          -- immutable upload name
  folder_id       UUID        REFERENCES file_folders(id) ON DELETE SET NULL,
  owner_id        UUID        NOT NULL REFERENCES auth.users(id),

  -- Storage
  storage_path    TEXT        NOT NULL,          -- path inside the bucket
  bucket          TEXT        NOT NULL DEFAULT 'files',
  size_bytes      BIGINT      NOT NULL DEFAULT 0,
  mime_type       TEXT,
  -- image|pdf|document|spreadsheet|video|archive|other
  file_type       TEXT        NOT NULL DEFAULT 'other',

  -- Lifecycle
  status          TEXT        NOT NULL DEFAULT 'active',
    -- active | trashed | deleted
  is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,

  -- Versioning
  version         INTEGER     NOT NULL DEFAULT 1,
  latest_version  INTEGER     NOT NULL DEFAULT 1,

  -- Preview / thumbnail (optional, generated async)
  thumbnail_path  TEXT,

  -- Extra
  description     TEXT,
  tags            TEXT[]      DEFAULT ARRAY[]::TEXT[],
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (owner_id, storage_path)
);

-- ── 3. File versions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS file_versions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id      UUID        NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  version      INTEGER     NOT NULL,
  storage_path TEXT        NOT NULL,
  size_bytes   BIGINT      NOT NULL DEFAULT 0,
  uploaded_by  UUID        REFERENCES auth.users(id),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (file_id, version)
);

-- ── 4. File shares ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS file_shares (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id      UUID        REFERENCES files(id) ON DELETE CASCADE,
  folder_id    UUID        REFERENCES file_folders(id) ON DELETE CASCADE,
  -- shared_with NULL = public link (token-based)
  shared_with  UUID        REFERENCES auth.users(id),
  permission   TEXT        NOT NULL DEFAULT 'read',
    -- read | edit | admin
  token        TEXT        UNIQUE,        -- public share token
  expires_at   TIMESTAMPTZ,
  created_by   UUID        NOT NULL REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (file_id IS NOT NULL OR folder_id IS NOT NULL)
);

-- ── 5. File activity (audit trail) ───────────────────────────
CREATE TABLE IF NOT EXISTS file_activity (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id      UUID        REFERENCES files(id) ON DELETE CASCADE,
  folder_id    UUID        REFERENCES file_folders(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id),
  action       TEXT        NOT NULL,
    -- uploaded | downloaded | deleted | restored | shared |
    -- renamed  | moved      | previewed | versioned | trashed
  metadata     JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_files_owner        ON files (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_folder       ON files (folder_id, status);
CREATE INDEX IF NOT EXISTS idx_files_status       ON files (status, owner_id);
CREATE INDEX IF NOT EXISTS idx_files_type         ON files (file_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_files_name         ON files USING gin(to_tsvector('arabic', name));
CREATE INDEX IF NOT EXISTS idx_folders_owner      ON file_folders (owner_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent     ON file_folders (parent_id);
CREATE INDEX IF NOT EXISTS idx_shares_file        ON file_shares (file_id);
CREATE INDEX IF NOT EXISTS idx_shares_with        ON file_shares (shared_with);
CREATE INDEX IF NOT EXISTS idx_activity_file      ON file_activity (file_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_user      ON file_activity (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_versions_file      ON file_versions (file_id, version DESC);

-- ── Triggers — auto updated_at ───────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_files_updated_at
  BEFORE UPDATE ON files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_folders_updated_at
  BEFORE UPDATE ON file_folders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE files         ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_folders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_shares   ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_activity ENABLE ROW LEVEL SECURITY;

-- Owners read their own files
CREATE POLICY "files_owner_select"
  ON files FOR SELECT
  USING (auth.uid() = owner_id);

-- Shared-with users can read
CREATE POLICY "files_shared_select"
  ON files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM file_shares fs
      WHERE fs.file_id = id AND fs.shared_with = auth.uid()
        AND (fs.expires_at IS NULL OR fs.expires_at > NOW())
    )
  );

CREATE POLICY "files_owner_insert"
  ON files FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "files_owner_update"
  ON files FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "files_owner_delete"
  ON files FOR DELETE
  USING (auth.uid() = owner_id);

-- Folders: owner only (simple)
CREATE POLICY "folders_owner_all"
  ON file_folders FOR ALL
  USING (auth.uid() = owner_id);

-- Versions: visible if parent file is visible
CREATE POLICY "versions_select"
  ON file_versions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM files f WHERE f.id = file_id AND f.owner_id = auth.uid())
  );

CREATE POLICY "versions_insert"
  ON file_versions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM files f WHERE f.id = file_id AND f.owner_id = auth.uid())
  );

-- Shares: read your own shares
CREATE POLICY "shares_read"
  ON file_shares FOR SELECT
  USING (auth.uid() = created_by OR auth.uid() = shared_with);

CREATE POLICY "shares_insert"
  ON file_shares FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "shares_delete"
  ON file_shares FOR DELETE
  USING (auth.uid() = created_by);

-- Activity: own activity
CREATE POLICY "activity_select"
  ON file_activity FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "activity_insert"
  ON file_activity FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── Storage RLS (bucket = "files") ────────────────────────────
-- Run in Supabase Dashboard → Storage → Policies
-- Or via SQL (storage schema):
-- CREATE POLICY "files_bucket_owner_rw" ON storage.objects
--   FOR ALL USING (bucket_id = 'files' AND auth.uid()::text = (storage.foldername(name))[1]);
