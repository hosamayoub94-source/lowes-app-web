-- تراجع «Paid/Unpaid ← دافع الشحن»: يعيد shipping_company وshipping_payer الأصليين لكل طلب من النسخة الاحتياطية.
-- لا يمسّ أي عمود آخر ولا أي طلب غير مذكور بالنسخة. شرط الأمان: الطلب ما زال بلا ناقل (NULL) فلا يُكتب فوق تعديل لاحق.
UPDATE public.orders o
SET shipping_company = b.old_shipping_company,
    shipping_payer   = b.old_shipping_payer
FROM public.orders_payer_cleanup_backup_20261029 b
WHERE o.id = b.order_id AND o.market = 'syria' AND o.shipping_company IS NULL;
-- جدول النسخة يبقى للتدقيق؛ يُحذف يدوياً بعد التأكد: DROP TABLE public.orders_payer_cleanup_backup_20261029;
