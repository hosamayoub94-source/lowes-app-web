-- ================================================================
-- Unify legacy /inventory (products.quantity) with the warehouse
-- system (wh_stock). products.quantity becomes a derived mirror of
-- the total warehouse stock — single source of truth.
-- ================================================================

-- 1) Seed the central warehouse from any existing products.quantity
--    (only for products not yet present in any warehouse).
INSERT INTO wh_stock (warehouse_id, product_id, quantity)
SELECT (SELECT id FROM wh_warehouses WHERE type='central' LIMIT 1), p.id, p.quantity
FROM products p
WHERE p.quantity > 0
  AND NOT EXISTS (SELECT 1 FROM wh_stock s WHERE s.product_id = p.id);

-- 2) Trigger: products.quantity = SUM(wh_stock) for that product.
CREATE OR REPLACE FUNCTION sync_product_quantity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid uuid;
BEGIN
  pid := COALESCE(NEW.product_id, OLD.product_id);
  UPDATE products SET quantity = (SELECT COALESCE(SUM(quantity),0) FROM wh_stock WHERE product_id = pid) WHERE id = pid;
  RETURN NULL;
END;$$;
DROP TRIGGER IF EXISTS trg_wh_stock_sync ON wh_stock;
CREATE TRIGGER trg_wh_stock_sync AFTER INSERT OR UPDATE OR DELETE ON wh_stock
  FOR EACH ROW EXECUTE FUNCTION sync_product_quantity();

-- 3) Backfill once from current warehouse totals.
UPDATE products p SET quantity = COALESCE((SELECT SUM(quantity) FROM wh_stock s WHERE s.product_id = p.id), 0);
