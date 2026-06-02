-- ============================================================
-- Channel music QUEUE — Discord-style up-next list per channel
-- When a song is already playing, /اغنية adds to this queue.
-- /تخطي plays the next one. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.channel_music_queue (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID        NOT NULL,
  video_id   TEXT        NOT NULL,
  title      TEXT,
  added_by   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_music_queue_room ON public.channel_music_queue (room_id, created_at);

ALTER TABLE public.channel_music_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "channel_music_queue_all" ON public.channel_music_queue;
CREATE POLICY "channel_music_queue_all" ON public.channel_music_queue
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.channel_music_queue REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='channel_music_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_music_queue;
  END IF;
END $$;
