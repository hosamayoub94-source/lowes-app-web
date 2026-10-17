-- =====================================================================
-- Profitability reliability (follows 20261017120000 + 20261017180000).
-- Project: fghdumrgimoeqsafdhhh. Additive + idempotent. No order/price data is
-- modified or deleted. Everything below is either a new object, a widened CHECK,
-- or a CREATE OR REPLACE of the profitability RPCs.
--
--  1. order_status_history.source CHECK widened to the values the app really writes
--     (babel / babel_webhook / karam / ptt were silently rejected before).
--  2. order_status_history_failures: visible log for rejected history inserts.
--  3. order_delivery_evidence: delivery times read from an original external source
--     (Karam public tracking page) - never written into orders.
--  4. profitability_fx_rates: monthly manual FX (append-only, owner entered).
--  5. profitability_month_closures + profitability_retro_log + guard trigger:
--     closed months cannot change without a recorded reason (before/after kept).
--  6. profitability_expenses.accounting_entry_id: link to prevent double entry.
--  7. profitability_orders(): per-order delivery date with explicit trust basis,
--     return timing and stock evidence (read-only).
--  8. profitability_save_economics(): optional p_month (current/future only) +
--     EXECUTE for service_role so sync-prices can use the same versioned path.
-- =====================================================================

-- 1) legitimate history sources ----------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'order_status_history_source_check'
       AND conrelid = 'public.order_status_history'::regclass
       AND pg_get_constraintdef(oid) NOT LIKE '%karam%'
  ) THEN
    ALTER TABLE public.order_status_history DROP CONSTRAINT order_status_history_source_check;
    ALTER TABLE public.order_status_history ADD CONSTRAINT order_status_history_source_check
      CHECK (source = ANY (ARRAY['app','sheet','yurtici','star','babel','babel_webhook','karam','ptt']));
  END IF;
END $$;

-- 2) rejected history inserts become visible ---------------------------
CREATE TABLE IF NOT EXISTS public.order_status_history_failures (
  id bigserial PRIMARY KEY,
  order_id uuid,
  from_status text,
  to_status text,
  source text,
  changed_by text,
  error text NOT NULL,
  context text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_status_history_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_status_history_failures FROM anon;
GRANT SELECT ON public.order_status_history_failures TO authenticated;
DROP POLICY IF EXISTS "osh_failures_management_read" ON public.order_status_history_failures;
CREATE POLICY "osh_failures_management_read" ON public.order_status_history_failures
  FOR SELECT TO authenticated
  USING (public.current_role_type() IN ('admin','manager','sales_manager'));

-- 3) delivery evidence from an original external source ----------------
CREATE TABLE IF NOT EXISTS public.order_delivery_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  delivered_at timestamptz NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('carrier_public_page')),
  carrier text NOT NULL,
  tracking_number text,
  timezone_assumption text,
  stage_text text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  fetched_by text NOT NULL,
  note text,
  UNIQUE (order_id, source_kind)
);
ALTER TABLE public.order_delivery_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_delivery_evidence FROM anon;
GRANT SELECT, INSERT ON public.order_delivery_evidence TO authenticated;
DROP POLICY IF EXISTS "delivery_evidence_management" ON public.order_delivery_evidence;
CREATE POLICY "delivery_evidence_management" ON public.order_delivery_evidence
  FOR ALL TO authenticated
  USING (public.current_role_type() IN ('admin','manager','sales_manager'))
  WITH CHECK (public.current_role_type() IN ('admin','manager','sales_manager'));

-- 4) monthly manual FX (append-only; latest row per month+scope+currency wins) ----
CREATE TABLE IF NOT EXISTS public.profitability_fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL CHECK (month = date_trunc('month', month)::date),
  scope text NOT NULL CHECK (scope IN ('all','syria','turkey','uae')),
  currency text NOT NULL CHECK (currency IN ('SYP','TRY','AED')),
  units_per_usd numeric NOT NULL CHECK (units_per_usd > 0),
  note text,
  retro_reason text,
  entered_by uuid DEFAULT auth.uid(),
  entered_by_name text NOT NULL,
  entered_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profitability_fx_rates_lookup_idx
  ON public.profitability_fx_rates (month, currency, scope, entered_at DESC);
ALTER TABLE public.profitability_fx_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profitability_fx_rates FROM anon;
REVOKE UPDATE, DELETE ON public.profitability_fx_rates FROM authenticated;
GRANT SELECT, INSERT ON public.profitability_fx_rates TO authenticated;
DROP POLICY IF EXISTS "fx_rates_management_read" ON public.profitability_fx_rates;
CREATE POLICY "fx_rates_management_read" ON public.profitability_fx_rates
  FOR SELECT TO authenticated
  USING (public.current_role_type() IN ('admin','manager','sales_manager'));
DROP POLICY IF EXISTS "fx_rates_management_insert" ON public.profitability_fx_rates;
CREATE POLICY "fx_rates_management_insert" ON public.profitability_fx_rates
  FOR INSERT TO authenticated
  WITH CHECK (public.current_role_type() IN ('admin','manager','sales_manager') AND entered_by = auth.uid());

-- 5) month closures + retro log + guard ----------------------------------
CREATE TABLE IF NOT EXISTS public.profitability_month_closures (
  month date PRIMARY KEY CHECK (month = date_trunc('month', month)::date),
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid DEFAULT auth.uid(),
  closed_by_name text NOT NULL,
  snapshot jsonb NOT NULL,
  note text
);
CREATE TABLE IF NOT EXISTS public.profitability_retro_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL,
  kind text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  before jsonb,
  after jsonb,
  created_by uuid DEFAULT auth.uid(),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profitability_month_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profitability_retro_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profitability_month_closures FROM anon;
REVOKE ALL ON public.profitability_retro_log FROM anon;
REVOKE UPDATE, DELETE ON public.profitability_month_closures FROM authenticated;
REVOKE UPDATE, DELETE ON public.profitability_retro_log FROM authenticated;
GRANT SELECT, INSERT ON public.profitability_month_closures TO authenticated;
GRANT SELECT, INSERT ON public.profitability_retro_log TO authenticated;
DROP POLICY IF EXISTS "closures_management" ON public.profitability_month_closures;
CREATE POLICY "closures_management" ON public.profitability_month_closures
  FOR ALL TO authenticated
  USING (public.current_role_type() IN ('admin','manager','sales_manager'))
  WITH CHECK (public.current_role_type() IN ('admin','manager','sales_manager'));
DROP POLICY IF EXISTS "retro_log_management" ON public.profitability_retro_log;
CREATE POLICY "retro_log_management" ON public.profitability_retro_log
  FOR ALL TO authenticated
  USING (public.current_role_type() IN ('admin','manager','sales_manager'))
  WITH CHECK (public.current_role_type() IN ('admin','manager','sales_manager'));

ALTER TABLE public.profitability_expenses ADD COLUMN IF NOT EXISTS retro_reason text;
ALTER TABLE public.profitability_expenses ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual_extra';
-- 6) link a manual row to the accounting entry it duplicates / allocates
ALTER TABLE public.profitability_expenses ADD COLUMN IF NOT EXISTS accounting_entry_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS profitability_expenses_accounting_entry_uidx
  ON public.profitability_expenses (accounting_entry_id) WHERE accounting_entry_id IS NOT NULL;

-- A closed month never changes silently: a reason is mandatory and before/after is logged.
CREATE OR REPLACE FUNCTION public.profitability_guard_closed_month() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_month date; v_reason text; v_closed boolean;
BEGIN
  v_month := CASE WHEN TG_OP = 'DELETE' THEN OLD.month ELSE NEW.month END;
  SELECT EXISTS (SELECT 1 FROM profitability_month_closures c WHERE c.month = v_month) INTO v_closed;
  IF v_closed THEN
    v_reason := nullif(btrim(coalesce(current_setting('profitability.retro_reason', true), '')), '');
    IF v_reason IS NULL AND TG_OP <> 'DELETE' THEN v_reason := nullif(btrim(coalesce(NEW.retro_reason, '')), ''); END IF;
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'MONTH_CLOSED: % is closed; a retro reason is required', v_month USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO profitability_retro_log (month, kind, reason, before, after, created_by, created_by_name)
    VALUES (v_month, TG_TABLE_NAME || ':' || TG_OP, v_reason,
            CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
            CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END,
            auth.uid(), nullif(current_setting('profitability.actor', true), ''));
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS profitability_expenses_guard ON public.profitability_expenses;
CREATE TRIGGER profitability_expenses_guard BEFORE INSERT OR UPDATE OR DELETE ON public.profitability_expenses
  FOR EACH ROW EXECUTE FUNCTION public.profitability_guard_closed_month();
DROP TRIGGER IF EXISTS profitability_fx_guard ON public.profitability_fx_rates;
CREATE TRIGGER profitability_fx_guard BEFORE INSERT ON public.profitability_fx_rates
  FOR EACH ROW EXECUTE FUNCTION public.profitability_guard_closed_month();

CREATE OR REPLACE FUNCTION public.profitability_delete_expense(p_id uuid, p_reason text DEFAULT NULL, p_actor text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM set_config('profitability.retro_reason', coalesce(p_reason, ''), true);
  PERFORM set_config('profitability.actor', coalesce(p_actor, ''), true);
  DELETE FROM profitability_expenses WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION public.profitability_close_month(p_month date, p_snapshot jsonb, p_name text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF p_month <> date_trunc('month', p_month)::date THEN RAISE EXCEPTION 'month must be the first day'; END IF;
  INSERT INTO profitability_month_closures (month, closed_by_name, snapshot, note) VALUES (p_month, p_name, p_snapshot, p_note);
END $$;

CREATE OR REPLACE FUNCTION public.profitability_log_retro(p_month date, p_reason text, p_before jsonb, p_after jsonb, p_name text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  INSERT INTO profitability_retro_log (month, kind, reason, before, after, created_by_name)
  VALUES (p_month, 'acknowledged_drift', p_reason, p_before, p_after, p_name);
END $$;

REVOKE ALL ON FUNCTION public.profitability_delete_expense(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profitability_close_month(date, jsonb, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profitability_log_retro(date, text, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profitability_delete_expense(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profitability_close_month(date, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profitability_log_retro(date, text, jsonb, jsonb, text) TO authenticated;

-- 7) per-order delivery / return facts (read-only) -----------------------
-- delivery_basis: carrier (shipping source) | external (sheet/star) | substitute_staff_event (app) |
--                 substitute_tracker (orders.updated_at set by a tracker in the same write as the status) | unknown
-- A delivered-event minute bucket with >= 30 events from one source is treated as an import burst
-- (observed: 50 on 2026-09-14 06:46 UTC) and is never used as a delivery time.
CREATE OR REPLACE FUNCTION public.profitability_orders(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (
  id uuid, order_code text, market text, status text, order_date timestamptz, items jsonb, amount numeric, currency text,
  delivered_at timestamptz, delivery_basis text, delivery_source text, delivery_bulk_suspect boolean,
  delivered_before_return boolean, history_conflict boolean,
  return_at timestamptz, return_source text, hist_rows integer,
  reserve_qty numeric, restock_qty numeric, waste_qty numeric
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH allowed AS (SELECT public.current_role_type() IN ('admin','manager','sales_manager') AS ok),
cand AS (
  SELECT o.* FROM orders o, allowed
  WHERE allowed.ok AND o.deleted_at IS NULL
    AND o.order_date >= p_from - interval '120 days' AND o.order_date < p_to
    AND o.status IN ('delivered','settled','returned','returning','not_received')
),
hist AS (
  SELECT h.order_id, h.to_status, h.changed_at, h.source
  FROM order_status_history h WHERE h.order_id IN (SELECT c.id FROM cand c)
),
firstret AS (
  SELECT order_id, min(changed_at) FILTER (WHERE to_status IN ('returned','returning','not_received')) AS first_retish,
         min(changed_at) FILTER (WHERE to_status = 'returned') AS first_returned,
         (array_agg(source ORDER BY changed_at) FILTER (WHERE to_status = 'returned'))[1] AS ret_src,
         count(*) AS n
  FROM hist GROUP BY order_id
),
dev AS (
  SELECT h.order_id, h.changed_at, h.source,
         count(*) OVER (PARTITION BY h.source, date_trunc('minute', h.changed_at)) AS per_min
  FROM hist h WHERE h.to_status = 'delivered'
),
dev_valid AS (
  SELECT d.*, c.status,
    CASE WHEN d.source IN ('yurtici','babel','babel_webhook','karam','ptt') THEN 1
         WHEN d.source IN ('sheet','star') THEN 2 ELSE 3 END AS rnk,
    (d.per_min >= 30) AS bulk
  FROM dev d JOIN cand c ON c.id = d.order_id
  LEFT JOIN firstret f ON f.order_id = d.order_id
  WHERE c.status = 'delivered' OR d.changed_at < f.first_retish
),
best AS (
  SELECT DISTINCT ON (order_id) order_id, changed_at, source, rnk
  FROM dev_valid WHERE NOT bulk
  ORDER BY order_id, rnk ASC, changed_at DESC
),
anybulk AS (SELECT order_id, true AS b FROM dev_valid WHERE bulk GROUP BY order_id),
anydev AS (SELECT order_id, true AS b FROM dev GROUP BY order_id),
inv AS (
  SELECT w.order_id,
         sum(w.quantity) FILTER (WHERE w.type = 'reserve') AS reserve_qty,
         sum(w.quantity) FILTER (WHERE w.type = 'release' AND w.reason = 'استرداد للمخزون') AS restock_qty,
         sum(w.quantity) FILTER (WHERE w.type = 'waste') AS waste_qty
  FROM wh_movements w WHERE w.order_id IN (SELECT c.id FROM cand c) GROUP BY w.order_id
),
base AS (
  SELECT c.id, c.order_id AS order_code, c.market, c.status, c.order_date, c.items, c.amount, c.currency,
    CASE
      WHEN ev.delivered_at IS NOT NULL AND c.status = 'delivered' THEN ev.delivered_at
      WHEN b.changed_at IS NOT NULL THEN b.changed_at
      WHEN c.status = 'delivered' AND c.updated_by IN ('الكرم-تلقائي','بابل-تلقائي','بابل-webhook','يورتيتشي-تلقائي','PTT-تلقائي')
           AND coalesce(c.tracking_number, '') <> ''
           AND NOT EXISTS (SELECT 1 FROM orders x WHERE x.tracking_number = c.tracking_number AND x.id <> c.id AND x.deleted_at IS NULL)
        THEN c.updated_at
    END AS delivered_at,
    CASE
      WHEN ev.delivered_at IS NOT NULL AND c.status = 'delivered' THEN 'carrier'
      WHEN b.rnk = 1 THEN 'carrier'
      WHEN b.rnk = 2 THEN 'external'
      WHEN b.rnk = 3 THEN 'substitute_staff_event'
      WHEN b.changed_at IS NULL AND c.status = 'delivered' AND c.updated_by IN ('الكرم-تلقائي','بابل-تلقائي','بابل-webhook','يورتيتشي-تلقائي','PTT-تلقائي')
           AND coalesce(c.tracking_number, '') <> ''
           AND NOT EXISTS (SELECT 1 FROM orders x WHERE x.tracking_number = c.tracking_number AND x.id <> c.id AND x.deleted_at IS NULL)
        THEN 'substitute_tracker'
      ELSE 'unknown'
    END AS delivery_basis,
    CASE
      WHEN ev.delivered_at IS NOT NULL AND c.status = 'delivered' THEN 'carrier_public_page:' || ev.carrier
      WHEN b.changed_at IS NOT NULL THEN b.source
      WHEN c.status = 'delivered' AND c.updated_by IN ('الكرم-تلقائي','بابل-تلقائي','بابل-webhook','يورتيتشي-تلقائي','PTT-تلقائي') THEN 'updated_by:' || c.updated_by
    END AS delivery_source,
    coalesce(ab.b, false) AS delivery_bulk_suspect,
    f.first_returned AS return_at, f.ret_src AS return_source, coalesce(f.n, 0)::int AS hist_rows,
    -- delivered earlier than the first return event (usable evidence of a sale before the return)
    (c.status <> 'delivered' AND b.changed_at IS NOT NULL) AS delivered_before_return,
    -- delivered events exist but only AFTER the return event: contradictory history, no sale is assumed
    (c.status <> 'delivered' AND b.changed_at IS NULL AND ad.b IS TRUE) AS history_conflict,
    coalesce(i.reserve_qty, 0) AS reserve_qty, coalesce(i.restock_qty, 0) AS restock_qty, coalesce(i.waste_qty, 0) AS waste_qty
  FROM cand c
  LEFT JOIN best b ON b.order_id = c.id
  LEFT JOIN anybulk ab ON ab.order_id = c.id
  LEFT JOIN anydev ad ON ad.order_id = c.id
  LEFT JOIN firstret f ON f.order_id = c.id
  LEFT JOIN inv i ON i.order_id = c.id
  LEFT JOIN LATERAL (SELECT e.delivered_at, e.carrier FROM order_delivery_evidence e
                      WHERE e.order_id = c.id AND e.source_kind = 'carrier_public_page' LIMIT 1) ev ON true
)
SELECT base.id, base.order_code, base.market, base.status, base.order_date, base.items, base.amount, base.currency,
       base.delivered_at, base.delivery_basis, base.delivery_source, base.delivery_bulk_suspect,
       base.delivered_before_return, base.history_conflict, base.return_at, base.return_source, base.hist_rows,
       base.reserve_qty, base.restock_qty, base.waste_qty
FROM base
WHERE (base.delivered_at >= p_from AND base.delivered_at < p_to)
   OR (base.delivery_basis = 'unknown' AND base.status = 'delivered' AND base.order_date >= p_from - interval '60 days' AND base.order_date < p_to)
   OR (base.status = 'returned' AND base.return_at >= p_from AND base.return_at < p_to)
   OR (base.status = 'returned' AND base.return_at IS NULL AND base.order_date >= p_from - interval '60 days' AND base.order_date < p_to)
   OR (base.status IN ('returning','not_received') AND base.order_date >= p_from - interval '60 days' AND base.order_date < p_to)
   OR (base.status = 'settled' AND base.order_date >= p_from AND base.order_date < p_to)
ORDER BY base.id
$$;
REVOKE ALL ON FUNCTION public.profitability_orders(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profitability_orders(timestamptz, timestamptz) TO authenticated;

-- 8) one versioned save path for UI, OrdersScreen and sync-prices ------------
DROP FUNCTION IF EXISTS public.profitability_save_economics(text, numeric, numeric, numeric, numeric);
CREATE OR REPLACE FUNCTION public.profitability_save_economics(
  p_item text,
  p_price numeric DEFAULT NULL,
  p_cost numeric DEFAULT NULL,
  p_ad numeric DEFAULT NULL,
  p_ship numeric DEFAULT NULL,
  p_month date DEFAULT NULL
) RETURNS date
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_now_month date := date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul'))::date;
  v_month date;
  v_cur record;
  v_price numeric; v_cost numeric; v_ad numeric; v_ship numeric;
BEGIN
  IF p_item IS NULL OR btrim(p_item) = '' THEN RAISE EXCEPTION 'item_name required'; END IF;
  IF COALESCE(p_price,0) < 0 OR COALESCE(p_cost,0) < 0 OR COALESCE(p_ad,0) < 0 OR COALESCE(p_ship,0) < 0 THEN
    RAISE EXCEPTION 'negative values are not allowed';
  END IF;
  v_month := COALESCE(date_trunc('month', p_month)::date, v_now_month);
  IF v_month < v_now_month THEN RAISE EXCEPTION 'past months are never rewritten (requested %, current %)', v_month, v_now_month; END IF;
  IF v_month > (v_now_month + interval '12 months')::date THEN RAISE EXCEPTION 'month too far ahead'; END IF;

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

  INSERT INTO product_economics_history (item_name, effective_from, sale_price_usd, cost_usd, ad_cost_usd, shipping_cost_usd, source)
  VALUES (p_item, v_month, v_price, v_cost, v_ad, v_ship, 'entered')
  ON CONFLICT (item_name, effective_from) DO UPDATE
    SET sale_price_usd = EXCLUDED.sale_price_usd, cost_usd = EXCLUDED.cost_usd,
        ad_cost_usd = EXCLUDED.ad_cost_usd, shipping_cost_usd = EXCLUDED.shipping_cost_usd,
        source = 'entered';

  -- the "current value" mirror (read by OrdersScreen) only follows the CURRENT month
  IF v_month = v_now_month THEN
    INSERT INTO product_economics (item_name, sale_price_usd, cost_usd, ad_cost_usd, shipping_cost_usd, updated_at)
    VALUES (p_item, v_price, v_cost, v_ad, v_ship, now())
    ON CONFLICT (item_name) DO UPDATE
      SET sale_price_usd = EXCLUDED.sale_price_usd, cost_usd = EXCLUDED.cost_usd,
          ad_cost_usd = EXCLUDED.ad_cost_usd, shipping_cost_usd = EXCLUDED.shipping_cost_usd,
          updated_at = now();
  END IF;

  RETURN v_month;
END;
$$;
REVOKE ALL ON FUNCTION public.profitability_save_economics(text,numeric,numeric,numeric,numeric,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profitability_save_economics(text,numeric,numeric,numeric,numeric,date) TO authenticated, service_role;
