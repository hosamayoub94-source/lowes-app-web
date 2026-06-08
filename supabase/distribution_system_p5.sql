-- ================================================================
-- DISTRIBUTION SYSTEM — P5 (auto-link seller_id on orders)
-- Apply in Supabase SQL Editor (idempotent). Run AFTER p0.
--
-- يملأ orders.seller_id تلقائياً من handler_name (مطابقة اسم البروفايل)
-- عند أي إدراج/تعديل — حتى يشتغل محرّك العمولات على الطلبات الجديدة من
-- كل المسارات (التطبيق، مزامنة Google Sheet، يورتيتشي...).
-- ================================================================

CREATE OR REPLACE FUNCTION public.orders_set_seller_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.seller_id IS NULL AND NEW.handler_name IS NOT NULL THEN
    SELECT id INTO NEW.seller_id
    FROM public.profiles
    WHERE lower(trim(employee_name)) = lower(trim(NEW.handler_name))
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_set_seller ON public.orders;
CREATE TRIGGER trg_orders_set_seller
  BEFORE INSERT OR UPDATE OF handler_name ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_set_seller_id();
