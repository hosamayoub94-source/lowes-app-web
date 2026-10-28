-- ما دفعناه فعلياً لشركة الشحن لكل طلب (ذهاب/إرجاع) — طلب حسام 29 تشرين الأول 2026 («أعمدة تكلفة الشحن الفعلي»).
-- delivery_cost بالطلب = أجور التوصيل المحصَّلة/المسجَّلة للعميل غالباً؛ هذه الأعمدة منفصلة وتعني: ما دفعناه نحن للناقل فعلاً.
-- إضافية فقط: ثلاثة أعمدة قابلة للفراغ (NULL = غير موثّق، لا صفر). لا تغيير على أي بيانات موجودة ولا على delivery_cost ولا الرواتب.
-- الأولوية بلوحة المحاسبة: الفعلي الموثّق (هذه الأعمدة) يغلب التقدير من التعرفة؛ ما لا فعلي له يبقى تقديراً.
-- التراجع: docs/shipping/20261029500000_orders_carrier_actual_cost_rollback.sql. قابلة لإعادة التشغيل.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS carrier_cost_outbound numeric,
  ADD COLUMN IF NOT EXISTS carrier_cost_return   numeric,
  ADD COLUMN IF NOT EXISTS carrier_cost_currency text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_carrier_cost_nonneg' AND conrelid = 'public.orders'::regclass) THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_carrier_cost_nonneg
      CHECK (COALESCE(carrier_cost_outbound, 0) >= 0 AND COALESCE(carrier_cost_return, 0) >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_carrier_cost_currency_check' AND conrelid = 'public.orders'::regclass) THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_carrier_cost_currency_check
      CHECK (carrier_cost_currency IS NULL OR carrier_cost_currency IN ('USD','TRY','SYP','AED'));
  END IF;
END $$;
