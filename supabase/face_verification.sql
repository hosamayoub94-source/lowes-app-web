-- ============================================================
-- Face Verification — add face_descriptor column to profiles
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS face_descriptor jsonb DEFAULT NULL;

-- Grant access (column-level security on profiles)
GRANT SELECT (face_descriptor) ON public.profiles TO anon, authenticated;
GRANT UPDATE (face_descriptor) ON public.profiles TO anon, authenticated;

COMMENT ON COLUMN public.profiles.face_descriptor IS
  'Face recognition descriptor — Float32Array(128) stored as JSON array. Used by face-api.js for attendance verification.';
