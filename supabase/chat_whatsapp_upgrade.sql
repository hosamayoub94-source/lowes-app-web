-- Chat WhatsApp upgrade (June 2026)
-- 1) Group photo support
ALTER TABLE public.chat_rooms ADD COLUMN IF NOT EXISTS avatar_url text;

-- 2) Remove music system tables entirely (no code references remain)
DROP TABLE IF EXISTS public.channel_music_queue CASCADE;
DROP TABLE IF EXISTS public.channel_music       CASCADE;
DROP TABLE IF EXISTS public.music_room_state    CASCADE;
