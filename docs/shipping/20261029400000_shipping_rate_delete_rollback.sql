-- تراجع «إلغاء التعرفة»: يحذف الدالة فقط، ويُبقي سجل المحذوفات (تدقيق) ما لم تحذفه يدوياً.
-- لا يمسّ shipping_carrier_rates ولا orders ولا أي جدول آخر. لإعادة تعرفة محذوفة: أدخلها من جديد من الشاشة (الصف الأصلي محفوظ بالسجل).
DROP FUNCTION IF EXISTS public.shipping_rate_delete(uuid, text);
-- اختياري بعد التأكد: DROP TABLE public.shipping_carrier_rates_deleted;
