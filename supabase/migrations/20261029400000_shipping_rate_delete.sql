-- إلغاء تعرفة شحن أُدخلت بالخطأ — طلب حسام 29 تشرين الأول 2026 (فوق shipping_carrier_rates).
-- القواعد: للأدمن فقط؛ لصفوف تاريخ سريانها بالشهر الحالي أو بعده فقط (التعرفة التي سرت بشهر سابق مقفلة ولا تُحذف أبداً)؛
-- كل صف محذوف يُنسخ كاملاً إلى سجل لا يُمحى (shipping_carrier_rates_deleted) مع من حذفه ومتى. لا DELETE مباشر لأي دور:
-- الدالة SECURITY DEFINER هي الطريق الوحيد، ولا تمسّ orders ولا الرواتب ولا delivery_cost.
-- التراجع: docs/shipping/20261029400000_shipping_rate_delete_rollback.sql. إضافي وقابل لإعادة التشغيل.

CREATE TABLE IF NOT EXISTS public.shipping_carrier_rates_deleted (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_id         uuid NOT NULL,
  carrier         text NOT NULL,
  market          text NOT NULL,
  currency        text NOT NULL,
  outbound_fee    numeric NOT NULL,
  return_policy   text NOT NULL,
  return_fee      numeric,
  effective_from  date NOT NULL,
  note            text,
  entered_by      uuid,
  entered_by_name text,
  created_at      timestamptz,
  deleted_by      uuid,
  deleted_by_name text,
  deleted_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shipping_carrier_rates_deleted ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='shipping_carrier_rates_deleted' AND policyname='scrd_management_select') THEN
    CREATE POLICY scrd_management_select ON public.shipping_carrier_rates_deleted FOR SELECT TO authenticated
      USING (public.current_role_type() IN ('admin','manager','sales_manager'));
  END IF;
END $$;
REVOKE ALL ON public.shipping_carrier_rates_deleted FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.shipping_carrier_rates_deleted FROM authenticated;
GRANT SELECT ON public.shipping_carrier_rates_deleted TO authenticated;

CREATE OR REPLACE FUNCTION public.shipping_rate_delete(p_id uuid, p_name text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_now_month date := date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul'))::date;
  r public.shipping_carrier_rates%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF public.current_role_type() IS NULL OR public.current_role_type() <> 'admin' THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT * INTO r FROM public.shipping_carrier_rates WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'rate not found'; END IF;
  IF r.effective_from < v_now_month THEN
    RAISE EXCEPTION 'a past rate is locked (effective_from % is before the current month)', r.effective_from;
  END IF;
  INSERT INTO public.shipping_carrier_rates_deleted (rate_id, carrier, market, currency, outbound_fee, return_policy, return_fee, effective_from, note, entered_by, entered_by_name, created_at, deleted_by, deleted_by_name)
  VALUES (r.id, r.carrier, r.market, r.currency, r.outbound_fee, r.return_policy, r.return_fee, r.effective_from, r.note, r.entered_by, r.entered_by_name, r.created_at, auth.uid(), p_name);
  DELETE FROM public.shipping_carrier_rates WHERE id = p_id;
END $$;
REVOKE ALL ON FUNCTION public.shipping_rate_delete(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shipping_rate_delete(uuid, text) TO authenticated;
