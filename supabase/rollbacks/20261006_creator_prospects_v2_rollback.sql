-- =============================================================
-- ROLLBACK for 20261006_creator_prospects_v2.sql  (emergency only)
-- ⚠️ Drops the v2 columns => any data typed into them (types, focus, tags, contacts, saved…) is LOST.
-- Export first if the v2 screen was used:  select * from creator_prospects;
-- Statuses are mapped back to the closest v1 value so the v1 CHECK can be restored.
-- =============================================================
BEGIN;

ALTER TABLE public.creator_prospects DROP CONSTRAINT IF EXISTS creator_prospects_status_check;
UPDATE public.creator_prospects SET status = CASE status
  WHEN 'discovered'     THEN 'new'
  WHEN 'needs_review'   THEN 'new'
  WHEN 'verified'       THEN 'approved'
  WHEN 'interested'     THEN 'contacted'
  WHEN 'collaborating'  THEN 'posted'
  WHEN 'not_interested' THEN 'declined'
  WHEN 'inactive'       THEN 'rejected'
  ELSE status END;
ALTER TABLE public.creator_prospects ADD CONSTRAINT creator_prospects_status_check
  CHECK (status = ANY (ARRAY['new','reviewing','approved','contacted','package_sent','posted','declined','rejected']));
ALTER TABLE public.creator_prospects ALTER COLUMN status SET DEFAULT 'new';

DROP INDEX IF EXISTS public.creator_prospects_geo_idx;
DROP INDEX IF EXISTS public.creator_prospects_saved_idx;
DROP INDEX IF EXISTS public.creator_prospects_content_types_gin;
DROP INDEX IF EXISTS public.creator_prospects_skincare_focus_gin;

ALTER TABLE public.creator_prospects
  DROP CONSTRAINT IF EXISTS creator_prospects_location_confidence_check,
  DROP CONSTRAINT IF EXISTS creator_prospects_creator_type_check,
  DROP CONSTRAINT IF EXISTS creator_prospects_content_types_check,
  DROP CONSTRAINT IF EXISTS creator_prospects_skincare_focus_check,
  DROP CONSTRAINT IF EXISTS creator_prospects_verification_status_check,
  DROP CONSTRAINT IF EXISTS creator_prospects_country_check;

ALTER TABLE public.creator_prospects
  DROP COLUMN IF EXISTS country, DROP COLUMN IF EXISTS governorate, DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS location_confidence, DROP COLUMN IF EXISTS creator_type,
  DROP COLUMN IF EXISTS content_types, DROP COLUMN IF EXISTS skincare_focus, DROP COLUMN IF EXISTS tags,
  DROP COLUMN IF EXISTS bio, DROP COLUMN IF EXISTS email, DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS preferred_contact, DROP COLUMN IF EXISTS other_platforms, DROP COLUMN IF EXISTS source_url,
  DROP COLUMN IF EXISTS last_verified_at, DROP COLUMN IF EXISTS last_active_at,
  DROP COLUMN IF EXISTS verification_status, DROP COLUMN IF EXISTS saved;

COMMIT;
