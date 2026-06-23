-- =============================================================
-- Sequential per-team order codes — atomic & gap-free.
-- Replaces the buggy client-side generation (random/colliding codes
-- from a partial in-memory list + a 200-probe timestamp fallback).
--
-- Teams:
--   turkey:lowes  -> TL-     turkey:strong -> TS-     syria (any) -> SL-
-- NOTE: Syria has NO Strong brand — ALL Syria orders share one series (SL-),
-- regardless of the row's brand value.
--
-- The prefixes do not appear in ANY existing code, so generated codes can
-- never collide with the global UNIQUE(order_id) constraint. Each counter is
-- SEEDED from the current max trailing number per team so numbering continues
-- (e.g. turkey-lowes -> TL-28580).
--
-- Idempotent: safe to re-run. Can also be pasted into the Supabase SQL Editor.
-- =============================================================

-- 1) Counter table — one row per team. Locked down (RLS, no policies);
--    only the SECURITY DEFINER trigger below touches it.
CREATE TABLE IF NOT EXISTS order_code_counters (
  team   text   PRIMARY KEY,        -- 'turkey:lowes' | 'turkey:strong' | 'syria:lowes'
  prefix text   NOT NULL,
  seq    bigint NOT NULL DEFAULT 0
);
ALTER TABLE order_code_counters ENABLE ROW LEVEL SECURITY;

-- 2) Ensure the team rows + their prefixes exist (Syria = one series).
INSERT INTO order_code_counters (team, prefix, seq) VALUES
  ('turkey:lowes',  'TL-', 0),
  ('turkey:strong', 'TS-', 0),
  ('syria:lowes',   'SL-', 0)
ON CONFLICT (team) DO NOTHING;

-- Drop the never-used Syria-Strong counter if a previous run created it.
DELETE FROM order_code_counters WHERE team = 'syria:strong';

-- 3) Seed seq = current max trailing number per team (continue the series).
--    Syria is collapsed to one team. Considers only codes that end in a digit.
WITH maxnum AS (
  SELECT (CASE WHEN market = 'syria'
               THEN 'syria:lowes'
               ELSE market || ':' || COALESCE(NULLIF(brand, ''), 'lowes')
          END) AS team,
         MAX( (substring(order_id from '([0-9]+)$'))::bigint ) AS mx
  FROM orders
  WHERE order_id ~ '[0-9]$'
  GROUP BY 1
)
UPDATE order_code_counters c
   SET seq = GREATEST(c.seq, COALESCE(m.mx, 0))
  FROM maxnum m
 WHERE m.team = c.team;

-- 4) Atomic code assigner. SECURITY DEFINER so the inserting role
--    (anon/authenticated) needs no grants on order_code_counters.
--    Only fires when order_id is missing — provided codes pass through
--    untouched (bulk import, sheet->app, archive import, manual entry).
CREATE OR REPLACE FUNCTION assign_order_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_team   text;
  v_prefix text;
  v_seq    bigint;
BEGIN
  IF NEW.order_id IS NULL OR btrim(NEW.order_id) = '' THEN
    -- Syria has no Strong brand → always one Syria series.
    v_team := CASE WHEN NEW.market = 'syria'
                   THEN 'syria:lowes'
                   ELSE NEW.market || ':' || COALESCE(NULLIF(NEW.brand, ''), 'lowes')
              END;

    UPDATE order_code_counters
       SET seq = seq + 1
     WHERE team = v_team
     RETURNING prefix, seq INTO v_prefix, v_seq;

    IF NOT FOUND THEN
      v_prefix := CASE v_team
        WHEN 'turkey:lowes'  THEN 'TL-'
        WHEN 'turkey:strong' THEN 'TS-'
        WHEN 'syria:lowes'   THEN 'SL-'
        ELSE upper(left(NEW.market, 1)) || '-'
      END;
      INSERT INTO order_code_counters (team, prefix, seq)
        VALUES (v_team, v_prefix, 1)
        ON CONFLICT (team) DO UPDATE SET seq = order_code_counters.seq + 1
        RETURNING prefix, seq INTO v_prefix, v_seq;
    END IF;

    NEW.order_id := v_prefix || v_seq;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_order_code ON orders;
CREATE TRIGGER trg_assign_order_code
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION assign_order_code();

-- OPTIONAL one-time data cleanup (Syria has no Strong) — review before running:
--   UPDATE orders SET brand = 'lowes' WHERE market = 'syria' AND brand = 'strong';
