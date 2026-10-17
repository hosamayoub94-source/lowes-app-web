-- =====================================================================
-- Profitability: price-history integrity fix (follows 20261017120000).
-- Project: fghdumrgimoeqsafdhhh. Additive + idempotent; no rows deleted.
--
-- Problem found in review: the first migration copied every existing
-- product_economics row into product_economics_history with
-- effective_from = 2000-01-01, i.e. it ASSUMED today's price/cost was the true
-- historical value for every earlier month. That is not known.
--
-- Fix:
--  1. Add product_economics_history.source ('entered' | 'legacy_backfill').
--  2. Move the untouched legacy baseline rows from 2000-01-01 to the month of the
--     product_economics.updated_at they came from (the only evidence we have of
--     when that value became known). Earlier months now have NO version and are
--     reported as missing instead of being silently priced.
--  3. profitability_save_economics always writes the CURRENT month (Istanbul),
--     never a baseline and never a past month; saving again in the same month
--     updates that one row (unique item+month), earlier months are never touched.
-- =====================================================================

ALTER TABLE public.product_economics_history
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'entered'
  CHECK (source IN ('entered', 'legacy_backfill'));

UPDATE public.product_economics_history h
   SET effective_from = date_trunc('month', e.updated_at AT TIME ZONE 'Europe/Istanbul')::date,
       source = 'legacy_backfill'
  FROM public.product_economics e
 WHERE h.item_name = e.item_name
   AND h.effective_from = DATE '2000-01-01'
   AND h.source = 'entered'
   AND NOT EXISTS (
         SELECT 1 FROM public.product_economics_history x
          WHERE x.item_name = h.item_name
            AND x.effective_from = date_trunc('month', e.updated_at AT TIME ZONE 'Europe/Istanbul')::date
       );

CREATE OR REPLACE FUNCTION public.profitability_save_economics(
  p_item text,
  p_price numeric DEFAULT NULL,
  p_cost numeric DEFAULT NULL,
  p_ad numeric DEFAULT NULL,
  p_ship numeric DEFAULT NULL
) RETURNS date
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_month date := date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul'))::date;
  v_cur record;
  v_price numeric; v_cost numeric; v_ad numeric; v_ship numeric;
BEGIN
  IF p_item IS NULL OR btrim(p_item) = '' THEN RAISE EXCEPTION 'item_name required'; END IF;
  IF COALESCE(p_price,0) < 0 OR COALESCE(p_cost,0) < 0 OR COALESCE(p_ad,0) < 0 OR COALESCE(p_ship,0) < 0 THEN
    RAISE EXCEPTION 'negative values are not allowed';
  END IF;

  -- value currently in force (newest version not after this month); used only to
  -- fill arguments the caller left NULL (OrdersScreen sends the price alone)
  SELECT * INTO v_cur FROM product_economics_history
   WHERE item_name = p_item AND effective_from <= v_month
   ORDER BY effective_from DESC LIMIT 1;
  IF NOT FOUND THEN
    SELECT NULL::uuid AS id, p_item AS item_name, v_month AS effective_from,
           COALESCE(sale_price_usd,0) AS sale_price_usd, COALESCE(cost_usd,0) AS cost_usd,
           COALESCE(ad_cost_usd,0) AS ad_cost_usd, COALESCE(shipping_cost_usd,0) AS shipping_cost_usd,
           now() AS created_at, 'entered'::text AS source
      INTO v_cur FROM product_economics WHERE item_name = p_item;
  END IF;

  v_price := COALESCE(p_price, v_cur.sale_price_usd, 0);
  v_cost  := COALESCE(p_cost,  v_cur.cost_usd, 0);
  v_ad    := COALESCE(p_ad,    v_cur.ad_cost_usd, 0);
  v_ship  := COALESCE(p_ship,  v_cur.shipping_cost_usd, 0);

  -- one row per (item, month): re-saving in the same month updates that row only
  INSERT INTO product_economics_history (item_name, effective_from, sale_price_usd, cost_usd, ad_cost_usd, shipping_cost_usd, source)
  VALUES (p_item, v_month, v_price, v_cost, v_ad, v_ship, 'entered')
  ON CONFLICT (item_name, effective_from) DO UPDATE
    SET sale_price_usd = EXCLUDED.sale_price_usd, cost_usd = EXCLUDED.cost_usd,
        ad_cost_usd = EXCLUDED.ad_cost_usd, shipping_cost_usd = EXCLUDED.shipping_cost_usd,
        source = 'entered';

  -- "current value" mirror still read by OrdersScreen
  INSERT INTO product_economics (item_name, sale_price_usd, cost_usd, ad_cost_usd, shipping_cost_usd, updated_at)
  VALUES (p_item, v_price, v_cost, v_ad, v_ship, now())
  ON CONFLICT (item_name) DO UPDATE
    SET sale_price_usd = EXCLUDED.sale_price_usd, cost_usd = EXCLUDED.cost_usd,
        ad_cost_usd = EXCLUDED.ad_cost_usd, shipping_cost_usd = EXCLUDED.shipping_cost_usd,
        updated_at = now();

  RETURN v_month;
END;
$$;

REVOKE ALL ON FUNCTION public.profitability_save_economics(text,numeric,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profitability_save_economics(text,numeric,numeric,numeric,numeric) TO authenticated;
