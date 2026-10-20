-- READ-ONLY INVENTORY RECONCILIATION REPORT
-- Target: lowes-attendance / public schema.
-- Run only after checking the target project. This script performs SELECTs only.
-- It intentionally returns stock/product/movement summaries, not customer/order payloads.
-- It does not estimate corrections or change stock.

BEGIN READ ONLY;

-- 1) High-level distribution of current negative stock.
SELECT
  COALESCE(w.market, '(unknown)') AS market,
  COALESCE(w.type, '(unknown)') AS warehouse_type,
  COUNT(*)::bigint AS negative_stock_rows,
  COUNT(DISTINCT s.product_id)::bigint AS products_affected,
  SUM(s.quantity)::bigint AS sum_negative_quantity,
  MIN(s.quantity)::integer AS lowest_row_quantity
FROM public.wh_stock AS s
LEFT JOIN public.wh_warehouses AS w ON w.id = s.warehouse_id
WHERE s.quantity < 0
GROUP BY COALESCE(w.market, '(unknown)'), COALESCE(w.type, '(unknown)')
ORDER BY negative_stock_rows DESC, market, warehouse_type;

-- 2) One row per negative product/warehouse position, plus related movement counts.
-- A movement is linked once to the source warehouse and once to a distinct destination
-- warehouse. Adjustments and reversals are reported separately; this query does not
-- infer a signed delta from them because the live movement schema does not preserve it.
WITH stock_totals AS (
  SELECT product_id, SUM(quantity)::bigint AS summed_warehouse_quantity
  FROM public.wh_stock
  GROUP BY product_id
), movement_links AS (
  SELECT
    m.id AS movement_id,
    m.product_id,
    m.from_warehouse_id AS warehouse_id,
    m.type,
    m.quantity,
    m.created_at,
    m.order_id,
    'out'::text AS direction
  FROM public.wh_movements AS m
  WHERE m.from_warehouse_id IS NOT NULL

  UNION ALL

  SELECT
    m.id AS movement_id,
    m.product_id,
    m.to_warehouse_id AS warehouse_id,
    m.type,
    m.quantity,
    m.created_at,
    m.order_id,
    'in'::text AS direction
  FROM public.wh_movements AS m
  WHERE m.to_warehouse_id IS NOT NULL
    AND m.to_warehouse_id IS DISTINCT FROM m.from_warehouse_id
), movement_summary AS (
  SELECT
    product_id,
    warehouse_id,
    COUNT(*)::bigint AS related_movement_rows,
    MAX(created_at) AS latest_related_movement_at,
    COUNT(*) FILTER (WHERE type = 'reserve' AND direction = 'out')::bigint AS reserve_rows,
    COALESCE(SUM(quantity) FILTER (WHERE type = 'reserve' AND direction = 'out'), 0)::bigint AS reserve_quantity,
    COUNT(*) FILTER (WHERE type = 'release' AND direction = 'in')::bigint AS release_rows,
    COALESCE(SUM(quantity) FILTER (WHERE type = 'release' AND direction = 'in'), 0)::bigint AS release_quantity,
    COUNT(*) FILTER (WHERE type = 'receive' AND direction = 'in')::bigint AS receive_rows,
    COALESCE(SUM(quantity) FILTER (WHERE type = 'receive' AND direction = 'in'), 0)::bigint AS receive_quantity,
    COUNT(*) FILTER (WHERE type = 'waste' AND direction = 'out')::bigint AS waste_rows,
    COALESCE(SUM(quantity) FILTER (WHERE type = 'waste' AND direction = 'out'), 0)::bigint AS waste_quantity,
    COUNT(*) FILTER (WHERE type = 'allocate' AND direction = 'out')::bigint AS allocate_out_rows,
    COALESCE(SUM(quantity) FILTER (WHERE type = 'allocate' AND direction = 'out'), 0)::bigint AS allocate_out_quantity,
    COUNT(*) FILTER (WHERE type = 'allocate' AND direction = 'in')::bigint AS allocate_in_rows,
    COALESCE(SUM(quantity) FILTER (WHERE type = 'allocate' AND direction = 'in'), 0)::bigint AS allocate_in_quantity,
    COUNT(*) FILTER (WHERE type = 'adjust')::bigint AS adjustment_rows,
    COALESCE(SUM(quantity) FILTER (WHERE type = 'adjust'), 0)::bigint AS adjustment_quantity_field_sum,
    COUNT(*) FILTER (WHERE type = 'reverse')::bigint AS reversal_rows,
    COALESCE(SUM(quantity) FILTER (WHERE type = 'reverse'), 0)::bigint AS reversal_quantity_sum,
    COUNT(DISTINCT order_id) FILTER (WHERE order_id IS NOT NULL)::bigint AS linked_order_count
  FROM movement_links
  GROUP BY product_id, warehouse_id
)
SELECT
  w.market,
  w.type AS warehouse_type,
  w.name AS warehouse_name,
  p.id AS product_id,
  p.sku,
  p.name AS product_name,
  s.quantity AS current_warehouse_quantity,
  p.quantity AS product_quantity_mirror,
  st.summed_warehouse_quantity,
  ms.related_movement_rows,
  ms.latest_related_movement_at,
  ms.reserve_rows,
  ms.reserve_quantity,
  ms.release_rows,
  ms.release_quantity,
  ms.receive_rows,
  ms.receive_quantity,
  ms.waste_rows,
  ms.waste_quantity,
  ms.allocate_out_rows,
  ms.allocate_out_quantity,
  ms.allocate_in_rows,
  ms.allocate_in_quantity,
  ms.adjustment_rows,
  ms.adjustment_quantity_field_sum,
  ms.reversal_rows,
  ms.reversal_quantity_sum,
  ms.linked_order_count
FROM public.wh_stock AS s
JOIN public.products AS p ON p.id = s.product_id
JOIN public.wh_warehouses AS w ON w.id = s.warehouse_id
LEFT JOIN stock_totals AS st ON st.product_id = s.product_id
LEFT JOIN movement_summary AS ms
  ON ms.product_id = s.product_id AND ms.warehouse_id = s.warehouse_id
WHERE s.quantity < 0
ORDER BY w.market, w.type, w.name, p.name, p.sku;

ROLLBACK;
