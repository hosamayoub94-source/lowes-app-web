-- 1) profitability_orders: أعمدة إضافية في النهاية لتوثيق معنى orders.amount (لا تغيير بمنطق الاختيار):
--    delivery_cost / shipping_payer / payment_status / paid_amount.
--    amount = قيمة البضاعة (أساس التحصيل عند الباب) — لا تشمل أجور التوصيل (تُضاف للعميل فقط إذا shipping_payer='customer')
--    ولا يوجد عمود خصم (الخصم مدمج بالقيمة المُدخَلة)، وليست بالضرورة المحصَّل فعلياً (payment_status/paid_amount).
DROP FUNCTION IF EXISTS public.profitability_orders(timestamptz, timestamptz);
CREATE FUNCTION public.profitability_orders(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(id uuid, order_code text, market text, status text, order_date timestamp with time zone, items jsonb, amount numeric, currency text, delivered_at timestamp with time zone, delivery_basis text, delivery_source text, delivery_bulk_suspect boolean, delivered_before_return boolean, history_conflict boolean, return_at timestamp with time zone, return_source text, return_bulk_suspect boolean, hist_rows integer, reserve_qty numeric, restock_qty numeric, waste_qty numeric, delivery_cost numeric, shipping_payer text, payment_status text, paid_amount numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
fin AS (
  SELECT c.id AS order_id,
         max(h.changed_at) FILTER (WHERE h.to_status = c.status) AS final_event_at,
         (array_agg(h.source ORDER BY h.changed_at DESC) FILTER (WHERE h.to_status = c.status))[1] AS final_src,
         count(h.order_id) AS n
  FROM cand c LEFT JOIN hist h ON h.order_id = c.id GROUP BY c.id
),
retbulk AS (
  SELECT f.order_id, (count(*) OVER (PARTITION BY date_trunc('minute', h.changed_at))) >= 30 AS bulk
  FROM hist h JOIN fin f ON f.order_id = h.order_id AND h.changed_at = f.final_event_at
  WHERE h.to_status = 'returned'
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
  LEFT JOIN fin f ON f.order_id = d.order_id
  WHERE c.status = 'delivered' OR (f.final_event_at IS NOT NULL AND d.changed_at < f.final_event_at)
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
    c.delivery_cost, c.shipping_payer, c.payment_status, c.paid_amount,
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
    CASE WHEN c.status = 'returned' AND NOT coalesce(rb.bulk, false) THEN f.final_event_at END AS return_at,
    CASE WHEN c.status = 'returned' THEN f.final_src END AS return_source,
    (c.status = 'returned' AND coalesce(rb.bulk, false)) AS return_bulk_suspect,
    coalesce(f.n, 0)::int AS hist_rows,
    (c.status <> 'delivered' AND b.changed_at IS NOT NULL) AS delivered_before_return,
    (c.status <> 'delivered' AND b.changed_at IS NULL AND ad.b IS TRUE AND ab.b IS NOT TRUE) AS history_conflict,
    coalesce(i.reserve_qty, 0) AS reserve_qty, coalesce(i.restock_qty, 0) AS restock_qty, coalesce(i.waste_qty, 0) AS waste_qty
  FROM cand c
  LEFT JOIN best b ON b.order_id = c.id
  LEFT JOIN anybulk ab ON ab.order_id = c.id
  LEFT JOIN anydev ad ON ad.order_id = c.id
  LEFT JOIN fin f ON f.order_id = c.id
  LEFT JOIN retbulk rb ON rb.order_id = c.id
  LEFT JOIN inv i ON i.order_id = c.id
  LEFT JOIN LATERAL (SELECT e.delivered_at, e.carrier FROM order_delivery_evidence e
                      WHERE e.order_id = c.id AND e.source_kind = 'carrier_public_page' LIMIT 1) ev ON true
)
SELECT base.id, base.order_code, base.market, base.status, base.order_date, base.items, base.amount, base.currency,
       base.delivered_at, base.delivery_basis, base.delivery_source, base.delivery_bulk_suspect,
       base.delivered_before_return, base.history_conflict, base.return_at, base.return_source, base.return_bulk_suspect, base.hist_rows,
       base.reserve_qty, base.restock_qty, base.waste_qty,
       base.delivery_cost, base.shipping_payer, base.payment_status, base.paid_amount
FROM base
WHERE (base.delivered_at >= p_from AND base.delivered_at < p_to)
   OR (base.delivery_basis = 'unknown' AND base.status = 'delivered' AND base.order_date >= p_from - interval '60 days' AND base.order_date < p_to)
   OR (base.status = 'returned' AND base.return_at >= p_from AND base.return_at < p_to)
   OR (base.status = 'returned' AND base.return_at IS NULL AND base.order_date >= p_from - interval '60 days' AND base.order_date < p_to)
   OR (base.status IN ('returning','not_received') AND base.order_date >= p_from - interval '60 days' AND base.order_date < p_to)
   OR (base.status = 'settled' AND base.order_date >= p_from AND base.order_date < p_to)
ORDER BY base.id
$function$;
REVOKE ALL ON FUNCTION public.profitability_orders(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profitability_orders(timestamptz, timestamptz) TO authenticated, service_role;

-- 2) لا إغلاق شهر بحالة «جزئي» (سعر صرف/تكلفة/إيراد ناقص). الحالتان المقبولتان: final | estimated.
--    ملاحظة: اللقطة من العميل (المحرّك بالـJS) — هذا حاجز إضافي لا بديل عن واجهة تمنع الزر.
CREATE OR REPLACE FUNCTION public.profitability_close_month(p_month date, p_snapshot jsonb, p_name text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_month <> date_trunc('month', p_month)::date THEN RAISE EXCEPTION 'month must be the first day'; END IF;
  IF coalesce(p_snapshot->>'status', '') NOT IN ('final', 'estimated') THEN
    RAISE EXCEPTION 'MONTH_NOT_CLOSABLE: status % — missing FX rate, cost or revenue (partial)', coalesce(p_snapshot->>'status', 'unknown');
  END IF;
  INSERT INTO profitability_month_closures (month, closed_by_name, snapshot, note) VALUES (p_month, p_name, p_snapshot, p_note);
END $function$;
