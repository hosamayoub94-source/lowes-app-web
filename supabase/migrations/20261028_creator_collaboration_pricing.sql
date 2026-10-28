-- Creator collaboration and pricing metadata. Draft only: additive and safe to review before applying.
-- Do not apply to production without explicit approval and a named target project.
ALTER TABLE public.creator_prospects
  ADD COLUMN IF NOT EXISTS collaboration_type text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS rate_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS rate_currency text,
  ADD COLUMN IF NOT EXISTS rate_usd numeric(14,2),
  ADD COLUMN IF NOT EXISTS rate_scope text,
  ADD COLUMN IF NOT EXISTS rate_exchange_rate numeric(20,8),
  ADD COLUMN IF NOT EXISTS rate_exchange_date date;

ALTER TABLE public.creator_prospects DROP CONSTRAINT IF EXISTS creator_prospects_collaboration_type_check;
ALTER TABLE public.creator_prospects ADD CONSTRAINT creator_prospects_collaboration_type_check
  CHECK (collaboration_type IN ('paid','pr','gift','hybrid','unknown'));
ALTER TABLE public.creator_prospects DROP CONSTRAINT IF EXISTS creator_prospects_rate_currency_check;
ALTER TABLE public.creator_prospects ADD CONSTRAINT creator_prospects_rate_currency_check
  CHECK (rate_currency IS NULL OR rate_currency IN ('USD','TRY','SYP','AED','SAR','EUR','GBP','OTHER'));
ALTER TABLE public.creator_prospects DROP CONSTRAINT IF EXISTS creator_prospects_rate_amount_nonnegative_check;
ALTER TABLE public.creator_prospects ADD CONSTRAINT creator_prospects_rate_amount_nonnegative_check CHECK (rate_amount IS NULL OR rate_amount >= 0);
ALTER TABLE public.creator_prospects DROP CONSTRAINT IF EXISTS creator_prospects_rate_usd_nonnegative_check;
ALTER TABLE public.creator_prospects ADD CONSTRAINT creator_prospects_rate_usd_nonnegative_check CHECK (rate_usd IS NULL OR rate_usd >= 0);
ALTER TABLE public.creator_prospects DROP CONSTRAINT IF EXISTS creator_prospects_rate_exchange_nonnegative_check;
ALTER TABLE public.creator_prospects ADD CONSTRAINT creator_prospects_rate_exchange_nonnegative_check CHECK (rate_exchange_rate IS NULL OR rate_exchange_rate > 0);
CREATE INDEX IF NOT EXISTS creator_prospects_collaboration_type_idx ON public.creator_prospects (collaboration_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS creator_prospects_rate_currency_idx ON public.creator_prospects (rate_currency) WHERE deleted_at IS NULL;
