-- READ-ONLY ORDER ITEM VS RESERVATION DIFFERENCE REPORT
-- Target: lowes-attendance / public schema.
-- This exploratory query returns aggregate counts only: no order IDs, customer data,
-- product names/SKUs, addresses, phone numbers, or item payloads.
-- It does NOT correct stock or write movement rows.
--
-- IMPORTANT: this query has no validated inventory-tracking cohort yet. Historical
-- bulk imports / old orders may have current deducted statuses without a reserve row.
-- Treat differences as a review signal, NOT as a correction list.

BEGIN READ ONLY;

WITH
deducted(status) AS (
  VALUES ('preparing'),('ready'),('motor_prep'),('at_center'),('shipped'),
         ('on_way'),('special_delivery'),('motor'),('prepaid'),('delivered'),('settled')
),
alias_raw(alias_name, canonical_name) AS (
  VALUES
    ('ROSEMARY SERUM','Rosemary Oil'),
    ('Body toner','PORE TIHGTENNING & PURIFINE TONER'),
    ('sakal ve Bıyık Serumu','BEARD SERUM'),
    ('GÖĞÜS BAKIM SERUM','BREAST CARE SERUM'),
    ('WHITHING CREAM','WHITENING CREAM')
),
alias_norms AS (
  SELECT
    regexp_replace(regexp_replace(translate(replace(lower(alias_name), 'i̇','i'), 'ıİŞşĞğÇçÖöÜü','iissggccoouu'), '[^a-z0-9؀-ۿ]', '', 'g'), '^lowes', '') AS alias_norm,
    regexp_replace(regexp_replace(translate(replace(lower(canonical_name), 'i̇','i'), 'ıİŞşĞğÇçÖöÜü','iissggccoouu'), '[^a-z0-9؀-ۿ]', '', 'g'), '^lowes', '') AS canonical_norm
  FROM alias_raw
),
product_norms AS (
  SELECT p.id,
    regexp_replace(regexp_replace(translate(replace(lower(coalesce(p.name,'')), 'i̇','i'), 'ıİŞşĞğÇçÖöÜü','iissggccoouu'), '[^a-z0-9؀-ۿ]', '', 'g'), '^lowes', '') AS name_norm,
    regexp_replace(regexp_replace(translate(replace(lower(coalesce(p.name_en,'')), 'i̇','i'), 'ıİŞşĞğÇçÖöÜü','iissggccoouu'), '[^a-z0-9؀-ۿ]', '', 'g'), '^lowes', '') AS name_en_norm
  FROM public.products p
),
order_context AS (
  SELECT o.id AS order_id, o.status, o.market, o.handler_name,
         coalesce(o.brand,'lowes') AS brand,
         coalesce(o.source,'') AS source,
         o.items,
         (o.status IN (SELECT status FROM deducted)
          AND coalesce(o.brand,'lowes')='lowes'
          AND coalesce(o.source,'') NOT IN ('star_network','uae_sheet_import')) AS wants_stock,
         coalesce(assigned.warehouse_id, fallback.id) AS target_warehouse_id
  FROM public.orders o
  LEFT JOIN LATERAL (
    SELECT w.id AS warehouse_id
    FROM public.profiles p
    JOIN public.wh_warehouses w ON w.id=p.warehouse_id
    WHERE p.employee_name=o.handler_name
      AND (w.market IS NULL OR w.market=o.market)
    ORDER BY p.id
    LIMIT 1
  ) assigned ON true
  LEFT JOIN LATERAL (
    SELECT w.id
    FROM public.wh_warehouses w
    WHERE w.type='sales' AND w.market=o.market AND w.is_active IS TRUE
    ORDER BY w.id
    LIMIT 1
  ) fallback ON assigned.warehouse_id IS NULL
),
raw_item_lines AS (
  SELECT o.order_id, o.wants_stock, o.target_warehouse_id,
         elem.item,
         elem.item->>'name' AS item_name,
         coalesce(nullif(btrim(elem.item->>'qty'),''),'1') AS qty_text
  FROM order_context o
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(o.items)='array' THEN o.items ELSE '[]'::jsonb END
  ) AS elem(item)
),
normalized_item_lines AS (
  SELECT r.*,
    regexp_replace(regexp_replace(translate(replace(lower(coalesce(r.item_name,'')), 'i̇','i'), 'ıİŞşĞğÇçÖöÜü','iissggccoouu'), '[^a-z0-9؀-ۿ]', '', 'g'), '^lowes', '') AS item_norm,
    CASE WHEN r.qty_text ~ '^[0-9]+$' THEN r.qty_text::numeric ELSE NULL END AS qty_num
  FROM raw_item_lines r
),
matched_item_lines AS (
  SELECT i.order_id, i.wants_stock, i.target_warehouse_id, i.item_name, i.qty_text, i.qty_num,
         matched.product_id
  FROM normalized_item_lines i
  LEFT JOIN LATERAL (
    SELECT p.id AS product_id
    FROM product_norms p
    WHERE i.item_norm IN (p.name_norm, p.name_en_norm)
       OR EXISTS (
         SELECT 1 FROM alias_norms a
         WHERE a.alias_norm=i.item_norm
           AND a.canonical_norm IN (p.name_norm, p.name_en_norm)
       )
    ORDER BY
      CASE WHEN i.item_norm IN (p.name_norm,p.name_en_norm) THEN 0 ELSE 1 END,
      p.id
    LIMIT 1
  ) matched ON true
),
expected AS (
  SELECT order_id, product_id, target_warehouse_id AS warehouse_id,
         SUM(qty_num)::bigint AS desired_qty
  FROM matched_item_lines
  WHERE wants_stock IS TRUE
    AND target_warehouse_id IS NOT NULL
    AND product_id IS NOT NULL
    AND qty_num IS NOT NULL AND qty_num > 0 AND qty_num=trunc(qty_num)
  GROUP BY order_id, product_id, target_warehouse_id
),
actual AS (
  SELECT m.order_id, m.product_id,
         coalesce(m.from_warehouse_id,m.to_warehouse_id) AS warehouse_id,
         SUM(CASE WHEN m.type='reserve' THEN m.quantity ELSE -m.quantity END)::bigint AS actual_qty
  FROM public.wh_movements m
  WHERE m.order_id IS NOT NULL AND m.type IN ('reserve','release')
  GROUP BY m.order_id,m.product_id,coalesce(m.from_warehouse_id,m.to_warehouse_id)
),
keys AS (
  SELECT order_id, product_id, warehouse_id FROM expected
  UNION
  SELECT order_id, product_id, warehouse_id FROM actual
),
diffs AS (
  SELECT k.order_id,k.product_id,k.warehouse_id,
         coalesce(e.desired_qty,0)::bigint AS desired_qty,
         coalesce(a.actual_qty,0)::bigint AS actual_qty,
         coalesce(e.desired_qty,0)::bigint-coalesce(a.actual_qty,0)::bigint AS diff_qty,
         o.order_id IS NOT NULL AS order_exists
  FROM keys k
  LEFT JOIN expected e
    ON e.order_id=k.order_id AND e.product_id=k.product_id AND e.warehouse_id IS NOT DISTINCT FROM k.warehouse_id
  LEFT JOIN actual a
    ON a.order_id=k.order_id AND a.product_id=k.product_id AND a.warehouse_id IS NOT DISTINCT FROM k.warehouse_id
  LEFT JOIN order_context o ON o.order_id=k.order_id
),
order_item_summary AS (
  SELECT
    COUNT(DISTINCT order_id) FILTER (
      WHERE wants_stock AND target_warehouse_id IS NULL
        AND qty_num IS NOT NULL AND qty_num>0 AND product_id IS NOT NULL
    ) AS no_warehouse_orders,
    COUNT(*) FILTER (WHERE product_id IS NULL) AS unmatched_catalog_lines,
    COUNT(*) FILTER (WHERE qty_num IS NULL) AS non_integer_quantity_format_lines
  FROM matched_item_lines
)
SELECT metric, orders, lines, units
FROM (
  SELECT 'under_reserved_product_warehouse_lines'::text AS metric,
         count(DISTINCT order_id)::bigint AS orders,
         count(*)::bigint AS lines,
         sum(diff_qty)::bigint AS units
  FROM diffs WHERE order_exists AND diff_qty > 0

  UNION ALL
  SELECT 'over_reserved_product_warehouse_lines',
         count(DISTINCT order_id)::bigint, count(*)::bigint, sum(-diff_qty)::bigint
  FROM diffs WHERE order_exists AND diff_qty < 0

  UNION ALL
  SELECT 'orphaned_reservation_lines',
         count(DISTINCT order_id)::bigint, count(*)::bigint, sum(abs(actual_qty))::bigint
  FROM diffs WHERE NOT order_exists

  UNION ALL
  SELECT 'deducted_orders_without_source_warehouse',
         no_warehouse_orders::bigint, NULL::bigint, NULL::bigint
  FROM order_item_summary

  UNION ALL
  SELECT 'unmatched_catalog_item_lines',
         NULL::bigint, unmatched_catalog_lines::bigint, NULL::bigint
  FROM order_item_summary

  UNION ALL
  SELECT 'non_integer_quantity_format_lines',
         NULL::bigint, non_integer_quantity_format_lines::bigint, NULL::bigint
  FROM order_item_summary
) metrics
ORDER BY metric;

ROLLBACK;
