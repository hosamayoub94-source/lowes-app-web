-- السماح بالدرهم (AED) بجدول exchange_rates — طلب حسام 29 تشرين الأول 2026. (طُبّقت على الإنتاج بموافقته؛ هذا الملف توثيق بالمستودع.)
-- القيدان كانا يحصران from_cur/to_cur بـUSD/TRY/SYP فيُرفض أي سعر للدرهم فتظهر طلبات الإمارات «بلا سعر صرف».
-- الصف الأول: USD→AED = 3.6725 (ربط رسمي)، أُدخل يدوياً بلا set_by؛ التعديل لاحقاً يدوي من إعدادات الصرف عند الحاجة.
-- التراجع: أعد القيدين إلى USD/TRY/SYP بعد حذف صفوف AED.
ALTER TABLE public.exchange_rates DROP CONSTRAINT IF EXISTS exchange_rates_to_cur_check;
ALTER TABLE public.exchange_rates DROP CONSTRAINT IF EXISTS exchange_rates_from_cur_check;
ALTER TABLE public.exchange_rates ADD CONSTRAINT exchange_rates_to_cur_check CHECK (to_cur = ANY (ARRAY['USD'::text, 'TRY'::text, 'SYP'::text, 'AED'::text]));
ALTER TABLE public.exchange_rates ADD CONSTRAINT exchange_rates_from_cur_check CHECK (from_cur = ANY (ARRAY['USD'::text, 'TRY'::text, 'SYP'::text, 'AED'::text]));
