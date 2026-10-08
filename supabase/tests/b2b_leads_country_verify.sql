-- D-119 — read-only check around 20261008_b2b_leads_country.sql. Run in the SQL Editor:
--   (1) BEFORE the migration: run block A, save the two numbers.
--   (2) apply the migration.
--   (3) AFTER: run block A again (same numbers expected) and block B.
-- Nothing here writes.

-- ── A. Syria fingerprint — every pre-migration column, every row ──
-- The column list is fixed on purpose (it excludes the new `country` column) so before/after compare the same data.
-- Later, once UAE rows exist, re-run it with `FROM syria_b2b_leads WHERE country = 'SY'` to fingerprint Syria rows only.
SELECT count(*) AS syria_rows,
       md5(string_agg(row_txt, '|' ORDER BY id)) AS syria_fingerprint
FROM (
  SELECT id, concat_ws('§', id, province, city, district, name, category, address, contact_person, phone, phone_tel,
    whatsapp, whatsapp_link, instagram, instagram_link, facebook, priority, score, verified, reason, source_urls,
    status, assigned_to, notes, status_updated_at, status_updated_by, created_at, updated_at, added_by, added_manually,
    lead_type, channel, website, email, telegram, sells_beauty, accepts_sellers, delivery_coverage, lowes_presence,
    lowes_listing_url, presence_updated_at, presence_updated_by, discovered_at, last_verified_at, discovery_source) AS row_txt
  FROM syria_b2b_leads
) t;

-- ── B. After the migration only ──
SELECT count(*) FILTER (WHERE country = 'SY') AS sy_rows,
       count(*) FILTER (WHERE country <> 'SY') AS other_rows,      -- expected 0 right after the migration
       count(*) AS total
FROM syria_b2b_leads;
SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr, pg_get_expr(polwithcheck, polrelid) AS check_expr
FROM pg_policy WHERE polrelid = 'syria_b2b_leads'::regclass;
