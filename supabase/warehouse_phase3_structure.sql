-- ================================================================
-- Warehouse System — Phase 3: per-market structure
--   سوريا: مستودع كبير (central/syria) → مبيعات سوريا + جملة وتوزيع
--   تركيا: مستودع كبير (central/turkey) → مبيعات تركيا
-- Idempotent. Apply via Supabase SQL Editor or Management API.
-- البضاعة تبقى بمكانها — الأرقام تُضبط لاحقاً بالجرد الفعلي (± جرد).
-- ================================================================

-- 1) المركزي الحالي العام → مستودع سوريا الكبير (market=syria).
--    (كان market=NULL باسم «المخزن المركزي»؛ معظم البضاعة سوريا.)
UPDATE wh_warehouses
SET name = 'مستودع سوريا الكبير', market = 'syria'
WHERE type = 'central' AND (market IS NULL OR market = '')
  AND name = 'المخزن المركزي';

-- 2) مستودع تركيا الكبير (central/turkey) — فارغ، يُعبّأ بالجرد/الاستلام.
INSERT INTO wh_warehouses (name, type, owner_name, market)
SELECT 'مستودع تركيا الكبير', 'central', NULL, 'turkey'
WHERE NOT EXISTS (
  SELECT 1 FROM wh_warehouses WHERE type = 'central' AND market = 'turkey'
);

-- 3) مخزن الجملة والتوزيع المشترك في سوريا (مناديب/متاجر/رسم أمانة).
INSERT INTO wh_warehouses (name, type, owner_name, market)
SELECT 'جملة وتوزيع سوريا', 'wholesale', NULL, 'syria'
WHERE NOT EXISTS (
  SELECT 1 FROM wh_warehouses WHERE type = 'wholesale' AND market = 'syria'
);

-- ملاحظة: type 'wholesale' نوع نصّي حرّ (لا CHECK constraint على wh_warehouses.type)،
-- فلا حاجة لتعديل قيد. التطبيق يعرف الأنواع: central | sales | wholesale | distributor | returns.
