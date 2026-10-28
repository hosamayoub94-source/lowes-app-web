-- تراجع «الموتور ← مشوار»: يعيد قيمة shipping_company الأصلية لكل طلب من جدول النسخة الاحتياطية، ثم يعيد اسم القناة.
-- لا يمسّ أي عمود آخر ولا أي طلب غير مذكور بالنسخة الاحتياطية.
UPDATE public.orders o
SET shipping_company = b.old_shipping_company
FROM public.orders_carrier_rename_backup_20261029 b
WHERE o.id = b.order_id AND o.market = 'syria' AND o.shipping_company = 'مشوار';

UPDATE public.accounting_channels
SET name_ar = 'الموتور'
WHERE kind = 'shipping' AND market = 'syria' AND name_ar = 'مشوار';
-- جدول النسخة يبقى للتدقيق؛ يُحذف يدوياً بعد التأكد: DROP TABLE public.orders_carrier_rename_backup_20261029;
