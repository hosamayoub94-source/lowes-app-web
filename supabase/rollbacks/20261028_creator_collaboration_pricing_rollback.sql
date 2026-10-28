-- Rollback for 20261028_creator_collaboration_pricing.sql
-- Warning: this removes all values stored in the new pricing fields.
DROP INDEX IF EXISTS public.creator_prospects_collaboration_type_idx;
DROP INDEX IF EXISTS public.creator_prospects_rate_currency_idx;
ALTER TABLE public.creator_prospects DROP CONSTRAINT IF EXISTS creator_prospects_collaboration_type_check;
ALTER TABLE public.creator_prospects DROP CONSTRAINT IF EXISTS creator_prospects_rate_currency_check;
ALTER TABLE public.creator_prospects DROP CONSTRAINT IF EXISTS creator_prospects_rate_amount_nonnegative_check;
ALTER TABLE public.creator_prospects DROP CONSTRAINT IF EXISTS creator_prospects_rate_usd_nonnegative_check;
ALTER TABLE public.creator_prospects DROP CONSTRAINT IF EXISTS creator_prospects_rate_exchange_nonnegative_check;
ALTER TABLE public.creator_prospects DROP COLUMN IF EXISTS collaboration_type;
ALTER TABLE public.creator_prospects DROP COLUMN IF EXISTS rate_amount;
ALTER TABLE public.creator_prospects DROP COLUMN IF EXISTS rate_currency;
ALTER TABLE public.creator_prospects DROP COLUMN IF EXISTS rate_usd;
ALTER TABLE public.creator_prospects DROP COLUMN IF EXISTS rate_scope;
ALTER TABLE public.creator_prospects DROP COLUMN IF EXISTS rate_exchange_rate;
ALTER TABLE public.creator_prospects DROP COLUMN IF EXISTS rate_exchange_date;
