-- migration_v10_shipping_payer.sql
-- يضيف عمود shipping_payer على جدول orders لتحديد من يدفع أجور الشحن:
--   'company'  → الشركة (Yurtiçi: Ödeme Tipi = G)
--   'customer' → العميل (Yurtiçi: Ödeme Tipi = A)
-- افتراضي: 'company' للطلبات الحالية والجديدة.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_payer text DEFAULT 'company';
