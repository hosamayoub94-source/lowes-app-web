-- =============================================================
-- creator_prospects v2 — UGC / Skincare discovery fields (D-094, Draft)
-- ⚠️ NOT APPLIED. Needs Hossam's explicit approval + a named target before running.
-- Additive only: no column dropped, no row deleted. Idempotent (safe to run twice).
-- Rollback: supabase/rollbacks/20261006_creator_prospects_v2_rollback.sql
-- =============================================================

ALTER TABLE public.creator_prospects
  ADD COLUMN IF NOT EXISTS country             text,
  ADD COLUMN IF NOT EXISTS governorate         text,
  ADD COLUMN IF NOT EXISTS city                text,
  ADD COLUMN IF NOT EXISTS location_confidence text,
  ADD COLUMN IF NOT EXISTS creator_type        text,
  ADD COLUMN IF NOT EXISTS content_types       text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS skincare_focus      text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tags                text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bio                 text,
  ADD COLUMN IF NOT EXISTS email               text,
  ADD COLUMN IF NOT EXISTS phone               text,
  ADD COLUMN IF NOT EXISTS preferred_contact   text,
  ADD COLUMN IF NOT EXISTS other_platforms     jsonb,
  ADD COLUMN IF NOT EXISTS source_url          text,
  ADD COLUMN IF NOT EXISTS last_verified_at    timestamptz,
  ADD COLUMN IF NOT EXISTS last_active_at      date,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS saved               boolean NOT NULL DEFAULT false;

-- ---- value checks (drop + recreate so a re-run stays clean) ----
ALTER TABLE public.creator_prospects DROP CONSTRAINT IF EXISTS creator_prospects_location_confidence_check;
ALTER TABLE public.creator_prospects ADD CONSTRAINT creator_prospects_location_confidence_check
  CHECK (location_confidence IS NULL OR location_confidence IN ('high', 'medium', 'low'));

ALTER TABLE public.creator_prospects DROP CONSTRAINT IF EXISTS creator_prospects_creator_type_check;
ALTER TABLE public.creator_prospects ADD CONSTRAINT creator_prospects_creator_type_check
  CHECK (creator_type IS NULL OR creator_type IN ('ugc', 'skincare', 'beauty', 'unboxing', 'reviewer', 'expert', 'general'));

ALTER TABLE public.creator_prospects DROP CONSTRAINT IF EXISTS creator_prospects_content_types_check;
ALTER TABLE public.creator_prospects ADD CONSTRAINT creator_prospects_content_types_check
  CHECK (content_types <@ ARRAY['ugc', 'unboxing', 'review', 'reels', 'stories', 'photography']::text[]);

ALTER TABLE public.creator_prospects DROP CONSTRAINT IF EXISTS creator_prospects_skincare_focus_check;
ALTER TABLE public.creator_prospects ADD CONSTRAINT creator_prospects_skincare_focus_check
  CHECK (skincare_focus <@ ARRAY['face_care', 'body_care', 'sunscreen', 'serums', 'creams', 'hair_care', 'beauty']::text[]);

ALTER TABLE public.creator_prospects DROP CONSTRAINT IF EXISTS creator_prospects_verification_status_check;
ALTER TABLE public.creator_prospects ADD CONSTRAINT creator_prospects_verification_status_check
  CHECK (verification_status IN ('verified', 'partial', 'unverified'));

ALTER TABLE public.creator_prospects DROP CONSTRAINT IF EXISTS creator_prospects_country_check;
ALTER TABLE public.creator_prospects ADD CONSTRAINT creator_prospects_country_check
  CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');

-- Statuses: old + new accepted together, so the currently deployed screen keeps working until the new one ships.
ALTER TABLE public.creator_prospects DROP CONSTRAINT IF EXISTS creator_prospects_status_check;
ALTER TABLE public.creator_prospects ADD CONSTRAINT creator_prospects_status_check
  CHECK (status IN (
    'discovered', 'needs_review', 'verified', 'rejected', 'contacted', 'interested', 'collaborating', 'not_interested', 'inactive',
    'new', 'reviewing', 'approved', 'package_sent', 'posted', 'declined'
  ));

-- ---- backfill (conservative) ----
-- All 205 existing rows came from Syria creator lists (Modash/Heepsy Syria, StarNgage/WhoTag Syria) => country SY.
UPDATE public.creator_prospects SET country = 'SY' WHERE country IS NULL;

-- Governorate only when the stored location already names a Syrian governorate. Anything else stays NULL.
UPDATE public.creator_prospects p SET governorate = m.slug
FROM (VALUES
  ('damascus', 'damascus'), ('دمشق', 'damascus'),
  ('rif_dimashq', 'rif_dimashq'), ('rif dimashq', 'rif_dimashq'), ('ريف دمشق', 'rif_dimashq'),
  ('aleppo', 'aleppo'), ('حلب', 'aleppo'),
  ('homs', 'homs'), ('حمص', 'homs'),
  ('hama', 'hama'), ('حماة', 'hama'),
  ('latakia', 'latakia'), ('lattakia', 'latakia'), ('اللاذقية', 'latakia'),
  ('tartus', 'tartus'), ('tartous', 'tartus'), ('طرطوس', 'tartus'),
  ('idlib', 'idlib'), ('إدلب', 'idlib'),
  ('daraa', 'daraa'), ('درعا', 'daraa'),
  ('as_suwayda', 'as_suwayda'), ('sweida', 'as_suwayda'), ('السويداء', 'as_suwayda'),
  ('quneitra', 'quneitra'), ('القنيطرة', 'quneitra'),
  ('al_hasakah', 'al_hasakah'), ('hasakah', 'al_hasakah'), ('الحسكة', 'al_hasakah'),
  ('raqqa', 'raqqa'), ('الرقة', 'raqqa'),
  ('deir_ez_zor', 'deir_ez_zor'), ('deir ez-zor', 'deir_ez_zor'), ('دير الزور', 'deir_ez_zor')
) AS m(loc, slug)
WHERE p.governorate IS NULL AND lower(btrim(p.location)) = m.loc;

UPDATE public.creator_prospects
SET location_confidence = CASE WHEN governorate IS NOT NULL THEN 'medium' ELSE 'low' END
WHERE location_confidence IS NULL AND country IS NOT NULL;

-- Existing rows with incomplete info => Needs Review (kept, never deleted). Only the untouched default is mapped.
UPDATE public.creator_prospects SET status = 'needs_review' WHERE status = 'new';

-- Legacy rows: profile_url was the source page; nothing marked verified (verified=false for all 205).
UPDATE public.creator_prospects SET verification_status = 'verified' WHERE verified = true AND verification_status = 'unverified';

ALTER TABLE public.creator_prospects ALTER COLUMN status SET DEFAULT 'discovered';

-- ---- indexes ----
CREATE INDEX IF NOT EXISTS creator_prospects_geo_idx ON public.creator_prospects (country, governorate) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS creator_prospects_saved_idx ON public.creator_prospects (saved) WHERE deleted_at IS NULL AND saved;
CREATE INDEX IF NOT EXISTS creator_prospects_content_types_gin ON public.creator_prospects USING gin (content_types);
CREATE INDEX IF NOT EXISTS creator_prospects_skincare_focus_gin ON public.creator_prospects USING gin (skincare_focus);

-- RLS / grants unchanged: still service_role only (the creator-prospects edge function is the single door).
