-- تراجع أعمدة تكلفة الشحن الفعلي: يحذف القيدين والأعمدة الثلاثة فقط (القيم المُدخلة بها تُفقد — خذ نسخة منها قبل ذلك إن لزم).
-- لا يمسّ أي عمود آخر بجدول orders ولا delivery_cost.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_carrier_cost_nonneg;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_carrier_cost_currency_check;
ALTER TABLE public.orders
  DROP COLUMN IF EXISTS carrier_cost_outbound,
  DROP COLUMN IF EXISTS carrier_cost_return,
  DROP COLUMN IF EXISTS carrier_cost_currency;
