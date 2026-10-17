-- =====================================================================
-- Monthly profitability: versioned product economics + manual monthly expenses.
-- Project: fghdumrgimoeqsafdhhh (lowes-attendance). Idempotent, additive only:
-- no DROP of data, no UPDATE/DELETE on existing rows.
--
-- Rules implemented here (see HANDOFFlowes.md, 17 Oct 2026):
--  * product_economics stays as the "current value" mirror (OrdersScreen reads it).
--  * product_economics_history holds one row per (item, effective month).
--    A report for month M uses the newest row with effective_from <= M-01.
--    => changing price/cost in October never alters September.
--  * Baseline: every existing product_economics row is copied once with
--    effective_from = 2000-01-01 ("since always"), so past months keep the values
--    that were in force before versioning started.
--  * First real price for an item that never had one lands on the baseline
--    (nothing to preserve); later changes land on the current month (Istanbul).
--  * RLS: management only (admin / manager / sales_manager) through
--    current_role_type(), which resolves profiles.id = auth.uid().
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.product_economics_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text NOT NULL,
  effective_from date NOT NULL,
  sale_price_usd numeric NOT NULL DEFAULT 0 CHECK (sale_price_usd >= 0),
  cost_usd numeric NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  ad_cost_usd numeric NOT NULL DEFAULT 0 CHECK (ad_cost_usd >= 0),
  shipping_cost_usd numeric NOT NULL DEFAULT 0 CHECK (shipping_cost_usd >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_economics_history_month_start CHECK (effective_from = date_trunc('month', effective_from)::date),
  CONSTRAINT product_economics_history_item_month UNIQUE (item_name, effective_from)
);

CREATE INDEX IF NOT EXISTS product_economics_history_lookup_idx
  ON public.product_economics_history (item_name, effective_from DESC);

-- One-time, re-runnable baseline copy (existing rows are never touched).
INSERT INTO public.product_economics_history
  (item_name, effective_from, sale_price_usd, cost_usd, ad_cost_usd, shipping_cost_usd)
SELECT pe.item_name, DATE '2000-01-01',
       COALESCE(pe.sale_price_usd,0), COALESCE(pe.cost_usd,0),
       COALESCE(pe.ad_cost_usd,0), COALESCE(pe.shipping_cost_usd,0)
FROM public.product_economics pe
WHERE NOT EXISTS (SELECT 1 FROM public.product_economics_history h WHERE h.item_name = pe.item_name)
ON CONFLICT (item_name, effective_from) DO NOTHING;
-- NOTE: the 2000-01-01 baseline is corrected by 20261017180000 (it assumed today's values were historical); the NOT EXISTS guard stops a re-run from re-creating it.

CREATE TABLE IF NOT EXISTS public.profitability_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL CHECK (month = date_trunc('month', month)::date),
  market text NOT NULL DEFAULT 'all' CHECK (market IN ('all','syria','turkey','uae')),
  category text NOT NULL CHECK (length(btrim(category)) > 0),
  amount_usd numeric NOT NULL DEFAULT 0 CHECK (amount_usd >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Deliberately NO unique(month, market, category): several bloggers / gifts /
-- invoices in the same month are separate rows, each editable and deletable.

CREATE INDEX IF NOT EXISTS profitability_expenses_month_idx
  ON public.profitability_expenses (month);

ALTER TABLE public.product_economics_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profitability_expenses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.product_economics_history FROM anon;
REVOKE ALL ON public.profitability_expenses FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_economics_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profitability_expenses TO authenticated;

DROP POLICY IF EXISTS "pe_history_management" ON public.product_economics_history;
CREATE POLICY "pe_history_management" ON public.product_economics_history
  FOR ALL TO authenticated
  USING (public.current_role_type() IN ('admin','manager','sales_manager'))
  WITH CHECK (public.current_role_type() IN ('admin','manager','sales_manager'));

DROP POLICY IF EXISTS "profit_expenses_management" ON public.profitability_expenses;
CREATE POLICY "profit_expenses_management" ON public.profitability_expenses
  FOR ALL TO authenticated
  USING (public.current_role_type() IN ('admin','manager','sales_manager'))
  WITH CHECK (public.current_role_type() IN ('admin','manager','sales_manager'));

-- Atomic save. NULL argument = keep the value currently in force for that item.
-- SECURITY INVOKER: table RLS above decides who may call it successfully.
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
  v_target date;
  v_cur record;
  v_price numeric; v_cost numeric; v_ad numeric; v_ship numeric;
BEGIN
  IF p_item IS NULL OR btrim(p_item) = '' THEN RAISE EXCEPTION 'item_name required'; END IF;
  IF COALESCE(p_price,0) < 0 OR COALESCE(p_cost,0) < 0 OR COALESCE(p_ad,0) < 0 OR COALESCE(p_ship,0) < 0 THEN
    RAISE EXCEPTION 'negative values are not allowed';
  END IF;

  -- value currently in force (newest version not after this month)
  SELECT * INTO v_cur FROM product_economics_history
   WHERE item_name = p_item AND effective_from <= v_month
   ORDER BY effective_from DESC LIMIT 1;
  IF NOT FOUND THEN
    SELECT NULL::uuid AS id, p_item AS item_name, DATE '2000-01-01' AS effective_from,
           COALESCE(sale_price_usd,0) AS sale_price_usd, COALESCE(cost_usd,0) AS cost_usd,
           COALESCE(ad_cost_usd,0) AS ad_cost_usd, COALESCE(shipping_cost_usd,0) AS shipping_cost_usd,
           now() AS created_at
      INTO v_cur FROM product_economics WHERE item_name = p_item;
  END IF;

  v_price := COALESCE(p_price, v_cur.sale_price_usd, 0);
  v_cost  := COALESCE(p_cost,  v_cur.cost_usd, 0);
  v_ad    := COALESCE(p_ad,    v_cur.ad_cost_usd, 0);
  v_ship  := COALESCE(p_ship,  v_cur.shipping_cost_usd, 0);

  -- first real values ever -> baseline (applies "since always"); otherwise this month on
  IF EXISTS (SELECT 1 FROM product_economics_history
              WHERE item_name = p_item AND (sale_price_usd > 0 OR cost_usd > 0)) THEN
    v_target := v_month;
  ELSE
    v_target := DATE '2000-01-01';
  END IF;

  INSERT INTO product_economics_history (item_name, effective_from, sale_price_usd, cost_usd, ad_cost_usd, shipping_cost_usd)
  VALUES (p_item, v_target, v_price, v_cost, v_ad, v_ship)
  ON CONFLICT (item_name, effective_from) DO UPDATE
    SET sale_price_usd = EXCLUDED.sale_price_usd, cost_usd = EXCLUDED.cost_usd,
        ad_cost_usd = EXCLUDED.ad_cost_usd, shipping_cost_usd = EXCLUDED.shipping_cost_usd;

  INSERT INTO product_economics (item_name, sale_price_usd, cost_usd, ad_cost_usd, shipping_cost_usd, updated_at)
  VALUES (p_item, v_price, v_cost, v_ad, v_ship, now())
  ON CONFLICT (item_name) DO UPDATE
    SET sale_price_usd = EXCLUDED.sale_price_usd, cost_usd = EXCLUDED.cost_usd,
        ad_cost_usd = EXCLUDED.ad_cost_usd, shipping_cost_usd = EXCLUDED.shipping_cost_usd,
        updated_at = now();

  RETURN v_target;
END;
$$;

REVOKE ALL ON FUNCTION public.profitability_save_economics(text,numeric,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profitability_save_economics(text,numeric,numeric,numeric,numeric) TO authenticated;
