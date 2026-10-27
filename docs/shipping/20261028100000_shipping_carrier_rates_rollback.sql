-- تراجع هجرة تعرفة الشحن. يحذف الجدول والدالة فقط؛ لا يلمس orders ولا payroll_* ولا delivery_cost ولا أي جدول آخر.
-- التعرفة تقديرات للعرض فقط: لا يعتمد عليها أي حساب مخزَّن.
DROP FUNCTION IF EXISTS public.shipping_rate_save(text, text, text, numeric, text, numeric, date, text, text);
DROP TABLE IF EXISTS public.shipping_carrier_rates;
