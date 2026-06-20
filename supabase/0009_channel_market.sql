-- =============================================================
-- 0009 — per-market tag for accounting_channels + seed «بابل» (Syria carrier)
--
-- WHY: shipping carriers are now admin-managed (add/delete in /admin/channels)
-- and shared with the order form. A market tag keeps Syria carriers out of the
-- Turkey order form and vice-versa. The app reads this column defensively, so
-- it works whether or not this migration has been applied — applying it just
-- unlocks per-market precision + lets AdminChannels expose a market selector.
--
-- SAFE TO RE-RUN (idempotent). Apply once via Supabase → SQL Editor → Run.
-- accounting_channels is table-level GRANTed (see 0006), so the new column
-- needs no extra GRANT (unlike the column-level `profiles` table).
-- =============================================================
BEGIN;

ALTER TABLE accounting_channels
  ADD COLUMN IF NOT EXISTS market text;

-- NULL is allowed and means «both» (keeps existing rows valid).
DO $$ BEGIN
  ALTER TABLE accounting_channels
    ADD CONSTRAINT accounting_channels_market_chk
    CHECK (market IS NULL OR market IN ('syria','turkey','both'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- All carriers seeded so far are Syria-side → tag them so they never appear
-- on Turkey order forms. (Only touches untagged shipping rows.)
UPDATE accounting_channels
   SET market = 'syria'
 WHERE kind = 'shipping' AND market IS NULL;

-- New Syria carrier requested by the owner: «بابل» — used in order download
-- AND expenses (it is a shipping channel, so both surfaces pick it up).
INSERT INTO accounting_channels
  (name_ar, kind, market, allows_income, allows_expense, book, sort_order, icon)
SELECT 'بابل', 'shipping', 'syria', true, true, 'operational', 15, '🚚'
WHERE NOT EXISTS (SELECT 1 FROM accounting_channels WHERE name_ar = 'بابل');

COMMIT;
