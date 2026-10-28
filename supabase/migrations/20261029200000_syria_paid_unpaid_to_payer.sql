-- «💰 Paid / ❌ Unpaid» كانت تُكتب بعمود الناقل (shipping_company) بدل دافع الشحن — طلب حسام 29 تشرين الأول 2026. (غير مطبّقة: بانتظار موافقته على النص)
-- المعنى (حسام): Paid = الشحن علينا (نحن ندفع أجور التوصيل) ← shipping_payer='company'؛ Unpaid = الزبون يدفع ← shipping_payer='customer'.
-- النطاق: طلبات سوريا فقط التي shipping_company فيها إحدى صيغ Paid/Unpaid (فحص قراءة 29/10: 2,628 طلباً، كلها delivery_cost=0 فلا أثر مالي)،
-- وتُغيَّر عمودان فقط: shipping_payer، وshipping_company → NULL (الناقل الحقيقي غير معروف لهذه الطلبات). لا مبالغ ولا حالات ولا تواريخ ولا رواتب.
-- النسخة الاحتياطية تحفظ القيمتين الأصليتين لكل طلب. التراجع: docs/shipping/20261029200000_syria_paid_unpaid_to_payer_rollback.sql.
-- قابلة لإعادة التشغيل (ON CONFLICT DO NOTHING + تحديث الصيغ القديمة فقط).

CREATE TABLE IF NOT EXISTS public.orders_payer_cleanup_backup_20261029 (
  order_id            uuid PRIMARY KEY,
  old_shipping_company text,
  old_shipping_payer   text,
  renamed_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orders_payer_cleanup_backup_20261029 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orders_payer_cleanup_backup_20261029 FROM PUBLIC, anon, authenticated;

INSERT INTO public.orders_payer_cleanup_backup_20261029 (order_id, old_shipping_company, old_shipping_payer)
SELECT id, shipping_company, shipping_payer
FROM public.orders
WHERE market = 'syria'
  AND btrim(shipping_company) IN ('💰 Paid', '❌ Unpaid', 'مدفوع الاجور', 'غير مدفوع الاجور', 'غيرمدفوع الاجور', 'مدفوع', 'مدفوع الاجور /زبون مكرر')
ON CONFLICT (order_id) DO NOTHING;

UPDATE public.orders o
SET shipping_payer = CASE WHEN btrim(o.shipping_company) IN ('❌ Unpaid', 'غير مدفوع الاجور', 'غيرمدفوع الاجور') THEN 'customer' ELSE 'company' END,
    shipping_company = NULL
FROM public.orders_payer_cleanup_backup_20261029 b
WHERE o.id = b.order_id
  AND o.market = 'syria'
  AND btrim(o.shipping_company) IN ('💰 Paid', '❌ Unpaid', 'مدفوع الاجور', 'غير مدفوع الاجور', 'غيرمدفوع الاجور', 'مدفوع', 'مدفوع الاجور /زبون مكرر');
