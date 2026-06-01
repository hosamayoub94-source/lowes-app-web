-- ============================================================
-- Channel music — Discord-style per-channel music bot
-- Each chat room can have one song playing, synced via realtime.
-- Triggered from chat with: /اغنية <youtube-url>
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.channel_music (
  room_id     UUID        PRIMARY KEY,
  video_id    TEXT,
  video_title TEXT,
  started_at  TIMESTAMPTZ,
  is_playing  BOOLEAN     NOT NULL DEFAULT false,
  dj_id       TEXT,
  dj_name     TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.channel_music ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "channel_music_all" ON public.channel_music;
CREATE POLICY "channel_music_all" ON public.channel_music
  FOR ALL USING (true) WITH CHECK (true);

-- Realtime: stream full rows on change so listeners sync instantly
ALTER TABLE public.channel_music REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='channel_music'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_music;
  END IF;
END $$;
