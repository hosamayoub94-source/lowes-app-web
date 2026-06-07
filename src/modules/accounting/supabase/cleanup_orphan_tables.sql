-- =============================================================
-- Cleanup of orphaned/duplicate campaign + accounting tables.
-- Run ONCE in Supabase SQL Editor. Reversible-safe: real data is BACKED UP
-- (renamed), never hard-dropped. Review counts before/after.
-- =============================================================

-- ── 1. ad_campaigns (stray, 3 rows, no longer used — screen uses `campaigns`) ──
-- Back up then drop. ad_daily_logs FK now points to `campaigns`, and
-- campaign_ads FK points to `campaigns`, so nothing references ad_campaigns.
CREATE TABLE IF NOT EXISTS ad_campaigns_backup_20260607 AS TABLE ad_campaigns;
DROP TABLE IF EXISTS ad_campaigns;

-- ── 2. finance_ledger → accounting_entries (37 REAL salary rows, currently invisible) ──
-- Migrate the orphaned salary/expense history into the live accounting table
-- so it shows in the /accounting screen, treasury, and reports.
-- employee_name has no column in accounting_entries → folded into notes.
INSERT INTO accounting_entries
  (entry_type, category, description, amount_usd, amount_try, amount_syp,
   payment_method, reference_no, entry_date, notes, created_by, created_at)
SELECT
  COALESCE(type, 'expense'),
  category,
  description,
  COALESCE(amount_usd, 0), COALESCE(amount_try, 0), COALESCE(amount_syp, 0),
  payment_method,
  reference_no,
  date,
  TRIM(CONCAT(COALESCE(notes, ''),
        CASE WHEN employee_name IS NOT NULL THEN ' | الموظف: ' || employee_name ELSE '' END,
        ' | (مُرحَّل من finance_ledger)')),
  created_by,
  created_at
FROM finance_ledger
WHERE COALESCE(is_archived, false) = false
  -- guard against double-run: skip rows already migrated
  AND NOT EXISTS (
    SELECT 1 FROM accounting_entries ae
    WHERE ae.entry_date = finance_ledger.date
      AND ae.description = finance_ledger.description
      AND ae.notes LIKE '%مُرحَّل من finance_ledger%'
  );

-- Keep finance_ledger as a backup (rename) instead of dropping, so the
-- migration can be verified first. Drop manually later if desired.
ALTER TABLE finance_ledger RENAME TO finance_ledger_migrated_20260607;

-- ── Verify (run as SELECTs after) ──
-- SELECT count(*) FROM accounting_entries;                 -- should grow by ~37
-- SELECT count(*) FROM finance_ledger_migrated_20260607;   -- the old 37
