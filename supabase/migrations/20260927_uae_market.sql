-- =============================================================
-- سوق الإمارات (uae) — قناة بيع ثالثة بنفس نظام تركيا/سوريا.
-- طلب حسام 27 أيلول 2026.
--
-- 1) كل CHECK يحصر market بـ(syria,turkey) يُوسَّع ليقبل 'uae'.
-- 2) سلسلة أكواد مستقلة للإمارات: UL-1, UL-2 ... (لويز فقط، بلا سترونغ).
-- 3) مخزن مبيعات الإمارات (مخزن دبي) — الأعداد تُدخَل يدوياً من الشاشة.
-- 4) الفيوهات customer_stats / sales_value_summary: عمود AED جديد (يُلحق بالآخر
--    فقط — CREATE OR REPLACE VIEW لا يسمح بتغيير ترتيب الأعمدة القائمة).
-- Idempotent.
-- =============================================================

-- 1) CHECK constraints
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_market_check;
ALTER TABLE orders ADD CONSTRAINT orders_market_check
  CHECK (market = ANY (ARRAY['syria','turkey','uae']));

-- عملة الإمارات: الدرهم
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_currency_check;
ALTER TABLE orders ADD CONSTRAINT orders_currency_check
  CHECK (currency = ANY (ARRAY['TRY','SYP','USD','AED']));

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_order_market_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_order_market_check
  CHECK (order_market = ANY (ARRAY['turkey','syria','uae','all']));

ALTER TABLE referral_codes DROP CONSTRAINT IF EXISTS referral_codes_market_check;
ALTER TABLE referral_codes ADD CONSTRAINT referral_codes_market_check
  CHECK (market = ANY (ARRAY['syria','turkey','uae']));

ALTER TABLE inventory_daily_log DROP CONSTRAINT IF EXISTS inventory_daily_log_market_check;
ALTER TABLE inventory_daily_log ADD CONSTRAINT inventory_daily_log_market_check
  CHECK (market = ANY (ARRAY['syria','turkey','uae']));

ALTER TABLE territories DROP CONSTRAINT IF EXISTS territories_market_check;
ALTER TABLE territories ADD CONSTRAINT territories_market_check
  CHECK (market = ANY (ARRAY['syria','turkey','uae']));

ALTER TABLE accounting_channels DROP CONSTRAINT IF EXISTS accounting_channels_market_check;
ALTER TABLE accounting_channels ADD CONSTRAINT accounting_channels_market_check
  CHECK (market = ANY (ARRAY['syria','turkey','uae','both']));

-- 2) Order codes: UAE = one Lowe's series, prefix UL-
INSERT INTO order_code_counters (team, prefix, seq)
VALUES ('uae:lowes', 'UL-', 0)
ON CONFLICT (team) DO NOTHING;

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
    -- Syria and UAE have no Strong brand → one series each.
    v_team := CASE WHEN NEW.market = 'syria' THEN 'syria:lowes'
                   WHEN NEW.market = 'uae'   THEN 'uae:lowes'
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
        WHEN 'uae:lowes'     THEN 'UL-'
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

-- 3) UAE sales warehouse (stock entered manually)
INSERT INTO wh_warehouses (name, type, market, is_active)
SELECT 'مخزن دبي', 'sales', 'uae', true
WHERE NOT EXISTS (SELECT 1 FROM wh_warehouses WHERE market = 'uae' AND type = 'sales');

-- 4) Views — append AED totals
CREATE OR REPLACE VIEW customer_stats WITH (security_invoker = true) AS
 SELECT regexp_replace(COALESCE(phone_1, ''::text), '\D'::text, ''::text, 'g'::text) AS phone_key,
    (array_agg(customer_name ORDER BY order_date DESC NULLS LAST))[1] AS name,
    (array_agg(city ORDER BY order_date DESC NULLS LAST))[1] AS city,
    (array_agg(phone_1 ORDER BY order_date DESC NULLS LAST))[1] AS phone,
    count(*) AS orders_count,
    array_agg(DISTINCT handler_name) FILTER (WHERE ((handler_name IS NOT NULL) AND (handler_name <> ''::text))) AS sellers,
    (array_agg(handler_name ORDER BY order_date DESC NULLS LAST))[1] AS last_seller,
    array_agg(DISTINCT market) FILTER (WHERE (market IS NOT NULL)) AS markets,
    array_agg(DISTINCT brand) FILTER (WHERE (brand IS NOT NULL)) AS brands,
    min(order_date) AS first_order,
    max(order_date) AS last_order,
    COALESCE(sum(amount) FILTER (WHERE (currency = 'SYP'::text)), (0)::numeric) AS total_syp,
    COALESCE(sum(amount) FILTER (WHERE (currency = 'USD'::text)), (0)::numeric) AS total_usd,
    COALESCE(sum(amount) FILTER (WHERE (currency = 'TRY'::text)), (0)::numeric) AS total_try,
        CASE
            WHEN (count(*) >= 10) THEN 3
            WHEN (count(*) >= 5) THEN 2
            WHEN (count(*) >= 2) THEN 1
            ELSE 0
        END AS stars,
    COALESCE(sum(amount) FILTER (WHERE (currency = 'AED'::text)), (0)::numeric) AS total_aed
   FROM orders
  WHERE ((phone_1 IS NOT NULL) AND (regexp_replace(COALESCE(phone_1, ''::text), '\D'::text, ''::text, 'g'::text) <> ''::text))
  GROUP BY (regexp_replace(COALESCE(phone_1, ''::text), '\D'::text, ''::text, 'g'::text));

CREATE OR REPLACE VIEW sales_value_summary WITH (security_invoker = true) AS
 SELECT market,
    brand,
    count(*) AS orders,
    COALESCE(sum(amount) FILTER (WHERE (currency = 'SYP'::text)), (0)::numeric) AS syp,
    COALESCE(sum(amount) FILTER (WHERE (currency = 'USD'::text)), (0)::numeric) AS usd,
    COALESCE(sum(amount) FILTER (WHERE (currency = 'TRY'::text)), (0)::numeric) AS try_,
    COALESCE(sum(amount) FILTER (WHERE (currency = 'AED'::text)), (0)::numeric) AS aed
   FROM orders
  GROUP BY market, brand;
