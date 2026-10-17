-- أسعار بيع (وتكلفة/شحن اختياريان) مستقلة لكل منتج × سوق × شهر.
-- إضافي وقابل لإعادة التشغيل. لا يمسّ product_economics ولا product_economics_history (تبقى التكلفة الموحّدة والتقديرات هناك).
-- القاعدة: سعر السوق يُقرأ من هذا الجدول فقط؛ لا يُستعمل سعر سوق آخر أبداً. غيابه = «ناقص» (أو السعر الموحّد القديم موسوماً legacy_unified في المحرّك).

CREATE TABLE IF NOT EXISTS public.product_market_prices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name         text NOT NULL,
  market            text NOT NULL,
  effective_from    date NOT NULL,
  sale_price_usd    numeric,
  cost_usd          numeric,   -- NULL = تكلفة التصنيع الموحّدة (product_economics_history)
  shipping_cost_usd numeric,   -- NULL = تقدير الشحن الموحّد
  source            text NOT NULL DEFAULT 'entered',
  entered_by        uuid,
  entered_by_name   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_market_prices_market_check CHECK (market IN ('syria','turkey','uae')),
  CONSTRAINT product_market_prices_month_start CHECK (effective_from = date_trunc('month', effective_from)::date),
  CONSTRAINT product_market_prices_source_check CHECK (source IN ('entered')),
  CONSTRAINT product_market_prices_nonneg CHECK (COALESCE(sale_price_usd,0) >= 0 AND COALESCE(cost_usd,0) >= 0 AND COALESCE(shipping_cost_usd,0) >= 0),
  CONSTRAINT product_market_prices_item_market_month UNIQUE (item_name, market, effective_from)
);
CREATE INDEX IF NOT EXISTS product_market_prices_lookup_idx ON public.product_market_prices (item_name, market, effective_from DESC);

ALTER TABLE public.product_market_prices ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='product_market_prices' AND policyname='pmp_management_select') THEN
    CREATE POLICY pmp_management_select ON public.product_market_prices FOR SELECT TO authenticated
      USING (public.current_role_type() IN ('admin','manager','sales_manager'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='product_market_prices' AND policyname='pmp_management_insert') THEN
    CREATE POLICY pmp_management_insert ON public.product_market_prices FOR INSERT TO authenticated
      WITH CHECK (public.current_role_type() IN ('admin','manager','sales_manager'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='product_market_prices' AND policyname='pmp_management_update') THEN
    CREATE POLICY pmp_management_update ON public.product_market_prices FOR UPDATE TO authenticated
      USING (public.current_role_type() IN ('admin','manager','sales_manager'))
      WITH CHECK (public.current_role_type() IN ('admin','manager','sales_manager'));
  END IF;
END $$;
REVOKE ALL ON public.product_market_prices FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.product_market_prices TO authenticated;
-- لا DELETE لأحد: التاريخ المالي لا يُمحى.

-- حفظ ذرّي: الشهر الحالي أو القادم فقط (لا ماضٍ)، وإعادة حفظ نفس الشهر تحدّث الصف نفسه بلا تكرار.
-- حقل غير مُمرَّر (NULL) يرث من آخر صف سابق لنفس المنتج والسوق (إن وُجد)، وإلا يبقى NULL.
CREATE OR REPLACE FUNCTION public.profitability_save_market_price(
  p_item text, p_market text, p_price numeric DEFAULT NULL, p_cost numeric DEFAULT NULL,
  p_ship numeric DEFAULT NULL, p_month date DEFAULT NULL, p_name text DEFAULT NULL)
RETURNS date LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_now_month date := date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul'))::date;
  v_month date;
  v_prev public.product_market_prices%ROWTYPE;
  v_price numeric; v_cost numeric; v_ship numeric;
BEGIN
  IF public.current_role_type() NOT IN ('admin','manager','sales_manager') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_item IS NULL OR btrim(p_item) = '' THEN RAISE EXCEPTION 'item_name required'; END IF;
  IF p_market IS NULL OR p_market NOT IN ('syria','turkey','uae') THEN RAISE EXCEPTION 'market must be syria|turkey|uae'; END IF;
  IF COALESCE(p_price,0) < 0 OR COALESCE(p_cost,0) < 0 OR COALESCE(p_ship,0) < 0 THEN RAISE EXCEPTION 'negative values are not allowed'; END IF;
  IF p_price IS NULL AND p_cost IS NULL AND p_ship IS NULL THEN RAISE EXCEPTION 'nothing to save'; END IF;
  v_month := COALESCE(date_trunc('month', p_month)::date, v_now_month);
  IF v_month < v_now_month THEN RAISE EXCEPTION 'past months are never rewritten (requested %, current %)', v_month, v_now_month; END IF;
  IF v_month > (v_now_month + interval '12 months')::date THEN RAISE EXCEPTION 'month too far ahead'; END IF;

  SELECT * INTO v_prev FROM public.product_market_prices
   WHERE item_name = p_item AND market = p_market AND effective_from <= v_month
   ORDER BY effective_from DESC LIMIT 1;
  v_price := COALESCE(p_price, v_prev.sale_price_usd);
  v_cost  := COALESCE(p_cost,  v_prev.cost_usd);
  v_ship  := COALESCE(p_ship,  v_prev.shipping_cost_usd);

  INSERT INTO public.product_market_prices (item_name, market, effective_from, sale_price_usd, cost_usd, shipping_cost_usd, entered_by, entered_by_name)
  VALUES (p_item, p_market, v_month, v_price, v_cost, v_ship, auth.uid(), p_name)
  ON CONFLICT (item_name, market, effective_from) DO UPDATE
    SET sale_price_usd = EXCLUDED.sale_price_usd, cost_usd = EXCLUDED.cost_usd, shipping_cost_usd = EXCLUDED.shipping_cost_usd,
        entered_by = EXCLUDED.entered_by, entered_by_name = EXCLUDED.entered_by_name, updated_at = now();
  RETURN v_month;
END $$;
REVOKE ALL ON FUNCTION public.profitability_save_market_price(text,text,numeric,numeric,numeric,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profitability_save_market_price(text,text,numeric,numeric,numeric,date,text) TO authenticated, service_role;
