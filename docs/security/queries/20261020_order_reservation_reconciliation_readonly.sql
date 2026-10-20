-- READ-ONLY ORDER RESERVATION LEDGER RECONCILIATION
-- Target: lowes-attendance / public schema.
-- All statements are SELECTs inside a READ ONLY transaction. No customer payloads,
-- addresses, phone numbers, order IDs, PINs, or credentials are returned.
-- This report measures outstanding reserve-minus-release entries against each
-- order's current persisted status, brand/source exemptions, and current stock rows.
-- A positive ledger is evidence of a remaining movement balance, not proof by itself
-- that the original transaction was valid or that a correction should be applied.

BEGIN READ ONLY;

-- 1) Summary of outstanding reservation balances by issue class.
WITH reservation_lines AS (
  SELECT
    m.order_id,
    m.product_id,
    COALESCE(m.from_warehouse_id, m.to_warehouse_id) AS warehouse_id,
    SUM(CASE WHEN m.type = 'reserve' THEN m.quantity ELSE -m.quantity END)::bigint AS net_reserved
  FROM public.wh_movements AS m
  WHERE m.order_id IS NOT NULL
    AND m.type IN ('reserve', 'release')
  GROUP BY m.order_id, m.product_id, COALESCE(m.from_warehouse_id, m.to_warehouse_id)
  HAVING SUM(CASE WHEN m.type = 'reserve' THEN m.quantity ELSE -m.quantity END) > 0
), reservations_by_order AS (
  SELECT
    r.order_id,
    COUNT(*)::bigint AS reservation_lines,
    SUM(r.net_reserved)::bigint AS net_reserved_units,
    COUNT(*) FILTER (WHERE s.quantity < 0)::bigint AS lines_at_negative_stock,
    COALESCE(SUM(r.net_reserved) FILTER (WHERE s.quantity < 0), 0)::bigint AS units_at_negative_stock,
    o.id AS matched_order_id,
    o.market,
    o.status,
    COALESCE(o.brand, 'lowes') AS brand,
    o.source
  FROM reservation_lines AS r
  LEFT JOIN public.orders AS o ON o.id = r.order_id
  LEFT JOIN public.wh_stock AS s
    ON s.product_id = r.product_id AND s.warehouse_id = r.warehouse_id
  GROUP BY r.order_id, o.id, o.market, o.status, COALESCE(o.brand, 'lowes'), o.source
), classified AS (
  SELECT *,
    CASE
      WHEN matched_order_id IS NULL THEN 'missing_order_row'
      WHEN status NOT IN (
        'preparing','ready','motor_prep','at_center','shipped','on_way',
        'special_delivery','motor','prepaid','delivered','settled'
      ) THEN 'status_not_deducted_but_reservation_remains'
      WHEN brand <> 'lowes' OR source IN ('star_network','uae_sheet_import')
        THEN 'exempt_brand_or_source_still_has_reservation'
      ELSE 'deducted_status_regular_brand_or_source'
    END AS issue_class
  FROM reservations_by_order
)
SELECT
  issue_class,
  COUNT(*)::bigint AS orders_or_orphan_order_ids,
  SUM(reservation_lines)::bigint AS reservation_lines,
  SUM(net_reserved_units)::bigint AS net_reserved_units,
  SUM(lines_at_negative_stock)::bigint AS lines_where_current_stock_is_negative,
  SUM(units_at_negative_stock)::bigint AS reserved_units_where_current_stock_is_negative
FROM classified
GROUP BY issue_class
ORDER BY issue_class;

-- 2) Detail by market, current status, brand/source category. Still no order IDs.
WITH reservation_lines AS (
  SELECT
    m.order_id,
    m.product_id,
    COALESCE(m.from_warehouse_id, m.to_warehouse_id) AS warehouse_id,
    SUM(CASE WHEN m.type = 'reserve' THEN m.quantity ELSE -m.quantity END)::bigint AS net_reserved
  FROM public.wh_movements AS m
  WHERE m.order_id IS NOT NULL
    AND m.type IN ('reserve', 'release')
  GROUP BY m.order_id, m.product_id, COALESCE(m.from_warehouse_id, m.to_warehouse_id)
  HAVING SUM(CASE WHEN m.type = 'reserve' THEN m.quantity ELSE -m.quantity END) > 0
), grouped AS (
  SELECT
    r.order_id, r.product_id, r.warehouse_id, r.net_reserved,
    o.id AS matched_order_id, o.market, o.status,
    CASE WHEN COALESCE(o.brand, 'lowes') <> 'lowes'
         THEN 'non_lowes_brand' ELSE 'lowes_or_null_brand' END AS brand_class,
    CASE WHEN o.source IN ('star_network','uae_sheet_import') THEN o.source
         WHEN o.source IS NULL THEN '(null)'
         ELSE 'other_source' END AS source_class,
    s.quantity AS current_stock_quantity
  FROM reservation_lines AS r
  LEFT JOIN public.orders AS o ON o.id = r.order_id
  LEFT JOIN public.wh_stock AS s
    ON s.product_id = r.product_id AND s.warehouse_id = r.warehouse_id
)
SELECT
  COALESCE(market, '(missing order)') AS market,
  COALESCE(status, '(missing order)') AS order_status,
  brand_class,
  source_class,
  COUNT(DISTINCT order_id)::bigint AS orders_or_orphan_order_ids,
  COUNT(*)::bigint AS reservation_lines,
  SUM(net_reserved)::bigint AS net_reserved_units,
  COUNT(*) FILTER (WHERE current_stock_quantity < 0)::bigint AS lines_at_negative_stock,
  COALESCE(SUM(net_reserved) FILTER (WHERE current_stock_quantity < 0), 0)::bigint
    AS reserved_units_at_negative_stock
FROM grouped
WHERE matched_order_id IS NULL
   OR status NOT IN (
      'preparing','ready','motor_prep','at_center','shipped','on_way',
      'special_delivery','motor','prepaid','delivered','settled'
   )
   OR brand_class = 'non_lowes_brand'
   OR source_class IN ('star_network','uae_sheet_import')
GROUP BY COALESCE(market, '(missing order)'), COALESCE(status, '(missing order)'), brand_class, source_class
ORDER BY market, order_status, brand_class, source_class;

ROLLBACK;
