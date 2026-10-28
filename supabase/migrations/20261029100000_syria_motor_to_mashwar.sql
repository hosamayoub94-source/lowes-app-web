-- «الموتور» ← «مشوار» لسوريا (توصيل الشام وريفها) — طلب حسام 29 تشرين الأول 2026. (غير مطبّقة: تُطبَّق بعد موافقته على النص)
-- النطاق: عمود orders.shipping_company فقط، لطلبات سوريا بصيغ «الموتور» القديمة. لا يمسّ المبلغ ولا الحالة ولا التواريخ ولا delivery_cost
-- ولا الرواتب. لا يمسّ موتور تركيا («توصيل الموتور 🏍️» بإسطنبول). الفحص قبل الكتابة (قراءة فقط، 29/10/2026): 41 طلباً —
-- الموتور 20، توصيل ميتور 18، توصيل موتور 1، «توصيل موتور » 1، موتور 1 — ولا طلب محذوف بهذه الصيغ، ولا Trigger تحديث على orders.
-- التراجع: docs/shipping/20261029100000_syria_motor_to_mashwar_rollback.sql (يعيد القيم الأصلية من جدول النسخة الاحتياطية).
-- قابلة لإعادة التشغيل: النسخة الاحتياطية بـON CONFLICT DO NOTHING (لا تُكتب فوق القيمة الأصلية)، والتحديث على الصيغ القديمة فقط.

CREATE TABLE IF NOT EXISTS public.orders_carrier_rename_backup_20261029 (
  order_id            uuid PRIMARY KEY,
  old_shipping_company text,
  renamed_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orders_carrier_rename_backup_20261029 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orders_carrier_rename_backup_20261029 FROM PUBLIC, anon, authenticated;
-- لا سياسات: النسخة للتراجع فقط (service_role/المالك).

INSERT INTO public.orders_carrier_rename_backup_20261029 (order_id, old_shipping_company)
SELECT id, shipping_company
FROM public.orders
WHERE market = 'syria'
  AND btrim(shipping_company) IN ('الموتور', 'توصيل ميتور', 'توصيل موتور', 'موتور')
ON CONFLICT (order_id) DO NOTHING;

UPDATE public.orders o
SET shipping_company = 'مشوار'
FROM public.orders_carrier_rename_backup_20261029 b
WHERE o.id = b.order_id
  AND o.market = 'syria'
  AND btrim(o.shipping_company) IN ('الموتور', 'توصيل ميتور', 'توصيل موتور', 'موتور');

-- قناة الشحن المحاسبية (تظهر بقائمة اختيار الطلب): نفس الاسم الجديد
UPDATE public.accounting_channels
SET name_ar = 'مشوار'
WHERE kind = 'shipping' AND market = 'syria' AND name_ar = 'الموتور';
