-- Rollback for 20261008_b2b_leads_country.sql (D-119). ⚠️ NOT APPLIED.
-- Restores the exact pre-migration state of syria_b2b_leads.
-- STOP if any non-Syria row exists: dropping the column would turn those rows into Syria rows.
-- Export them first (select * from syria_b2b_leads where country <> 'SY'), then delete them deliberately.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM syria_b2b_leads WHERE country <> 'SY') THEN
    RAISE EXCEPTION 'rollback refused: % non-SY rows exist — export and remove them first',
      (SELECT count(*) FROM syria_b2b_leads WHERE country <> 'SY');
  END IF;
  IF EXISTS (SELECT 1 FROM syria_b2b_leads WHERE lowes_presence = 'unverified') THEN
    RAISE EXCEPTION 'rollback refused: rows with lowes_presence = unverified exist';
  END IF;
END $$;

DROP POLICY IF EXISTS "b2b_leads_direct_syria_only" ON syria_b2b_leads;
DROP POLICY IF EXISTS "syria_leads_all" ON syria_b2b_leads;
CREATE POLICY "syria_leads_all"
  ON syria_b2b_leads FOR ALL
  USING (true)
  WITH CHECK (true);

DROP INDEX IF EXISTS idx_syria_leads_country;

ALTER TABLE syria_b2b_leads DROP CONSTRAINT IF EXISTS syria_b2b_leads_lowes_presence_check;
ALTER TABLE syria_b2b_leads ADD CONSTRAINT syria_b2b_leads_lowes_presence_check
  CHECK (lowes_presence IN ('not_listed','contacted','in_talks','listed','rejected','not_applicable'));

ALTER TABLE syria_b2b_leads DROP CONSTRAINT IF EXISTS syria_b2b_leads_country_check;
ALTER TABLE syria_b2b_leads DROP COLUMN IF EXISTS country;
