-- Tasks v2 migration — team + link columns
-- Run in Supabase SQL Editor

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS link    text,
  ADD COLUMN IF NOT EXISTS team    text;

-- profiles uses column-level grants — tasks table uses normal RLS so no extra grants needed
-- But grant to be safe if anon/authenticated need to read:
-- (tasks table should already be covered by existing RLS policies)

COMMENT ON COLUMN tasks.link IS 'Optional URL attached to the task (Drive, Figma, etc.)';
COMMENT ON COLUMN tasks.team IS 'Team responsible for this task (social, sales, ops)';
