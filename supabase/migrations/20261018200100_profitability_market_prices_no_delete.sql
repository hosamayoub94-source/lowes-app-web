-- الصلاحيات الافتراضية لـSupabase تمنح authenticated كل شيء على الجداول الجديدة؛ نسحب ما لا يلزم (لا حذف للتاريخ المالي).
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.product_market_prices FROM authenticated;
REVOKE ALL ON public.product_market_prices FROM anon;
