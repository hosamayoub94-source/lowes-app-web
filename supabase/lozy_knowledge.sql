-- ============================================================
-- Lozy (AI assistant) — shared learned knowledge
--
-- When an employee teaches Lozy a new fact about the company / products /
-- procedures, the ai-assistant edge function stores it here. Every future
-- conversation (for ALL users) is enriched with these facts, so Lozy keeps
-- getting smarter from the team.
--
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lozy_knowledge (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fact        TEXT        NOT NULL,
  taught_by   TEXT,                       -- employee_name who taught it
  taught_by_id UUID,                      -- profile id (optional)
  category    TEXT        DEFAULT 'general',
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lozy_knowledge_active
  ON public.lozy_knowledge (is_active, created_at DESC);

ALTER TABLE public.lozy_knowledge ENABLE ROW LEVEL SECURITY;

-- Open policies — PIN/anon model, reads/writes happen via edge function
-- (service role) and occasionally the app (anon).
DROP POLICY IF EXISTS "lozy_knowledge_all" ON public.lozy_knowledge;
CREATE POLICY "lozy_knowledge_all" ON public.lozy_knowledge
  FOR ALL USING (true) WITH CHECK (true);

-- ── lozy_chats (per-user memory) — ensure it exists ──────────
CREATE TABLE IF NOT EXISTS public.lozy_chats (
  user_id     UUID        PRIMARY KEY,
  messages    JSONB       NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lozy_chats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lozy_chats_all" ON public.lozy_chats;
CREATE POLICY "lozy_chats_all" ON public.lozy_chats
  FOR ALL USING (true) WITH CHECK (true);
