-- تعرفة الشحن التقديرية لكل شركة شحن (تُدخَل مرة، وتُعدَّل بتاريخ سريان جديد) — D-161.
-- لماذا: لا مصدر يثبت أجرة الشحن لكل طلب (delivery_cost موثّقة لنحو 167 طلباً فقط، ولا شيء للمرتجع). هذه التعرفة
-- تُنتج «تقديراً» منفصلاً ومعلَّماً في لوحة المبيعات والتسليمات، ولا تُكتب على الطلبات ولا تغيّر delivery_cost
-- ولا أي بيانات تاريخية ولا الرواتب.
--
-- القواعد:
--  • صف لكل (شركة، سوق، تاريخ سريان). التعديل = صف جديد بتاريخ أحدث؛ السعر السابق يبقى لما قبل ذلك التاريخ.
--  • لا حذف لأحد. لا تعديل لصف تاريخ سريانه قبل الشهر الحالي (التاريخ لا يُعاد كتابته).
--  • لا إدراج بتاريخ أقدم من آخر تعرفة للشركة نفسها (يغيّر تقدير أشهر مضت بصمت). السطر الأول للشركة يجوز بتاريخ قديم
--    ليغطي الأشهر السابقة بتقدير.
--  • سياسة المرتجع: none (لا يأخذون) | fixed (مبلغ ثابت return_fee) | same_as_outbound (مثل الذهاب) | unknown.
--  • القراءة المباشرة: admin/manager/sales_manager (SELECT فقط). لا INSERT ولا UPDATE ولا DELETE مباشرة لأي دور؛ الكتابة الوحيدة
--    عبر الدالة shipping_rate_save (SECURITY DEFINER) وهي لـadmin/manager فقط وتفرض قواعد التاريخ.
-- إضافي وقابل لإعادة التشغيل. التراجع: docs/shipping/20261028100000_shipping_carrier_rates_rollback.sql (لا يلمس الطلبات ولا الرواتب).

CREATE TABLE IF NOT EXISTS public.shipping_carrier_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier         text    NOT NULL,                       -- الاسم الموحّد (مثل: بابل، الكرم، قدموس، Yurtiçi)
  market          text    NOT NULL,
  currency        text    NOT NULL,
  outbound_fee    numeric NOT NULL,
  return_policy   text    NOT NULL DEFAULT 'unknown',
  return_fee      numeric,
  effective_from  date    NOT NULL,
  note            text,
  entered_by      uuid,
  entered_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scr_market_check   CHECK (market IN ('syria','turkey','uae')),
  CONSTRAINT scr_currency_check CHECK (currency IN ('SYP','TRY','AED','USD')),
  CONSTRAINT scr_policy_check   CHECK (return_policy IN ('none','fixed','same_as_outbound','unknown')),
  CONSTRAINT scr_nonneg         CHECK (outbound_fee >= 0 AND COALESCE(return_fee, 0) >= 0),
  CONSTRAINT scr_fixed_needs_fee CHECK (return_policy <> 'fixed' OR return_fee IS NOT NULL),
  CONSTRAINT scr_carrier_nonempty CHECK (btrim(carrier) <> ''),
  CONSTRAINT scr_unique UNIQUE (carrier, market, effective_from)
);
CREATE INDEX IF NOT EXISTS scr_lookup_idx ON public.shipping_carrier_rates (carrier, market, effective_from DESC);

ALTER TABLE public.shipping_carrier_rates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='shipping_carrier_rates' AND policyname='scr_management_select') THEN
    CREATE POLICY scr_management_select ON public.shipping_carrier_rates FOR SELECT TO authenticated
      USING (public.current_role_type() IN ('admin','manager','sales_manager'));
  END IF;
END $$;
-- لا سياسات INSERT/UPDATE/DELETE: لا طريق مباشر للكتابة. (تنظيف لأي نسخة سابقة من هذه الهجرة)
DROP POLICY IF EXISTS scr_finance_insert ON public.shipping_carrier_rates;
DROP POLICY IF EXISTS scr_finance_update ON public.shipping_carrier_rates;
REVOKE ALL ON public.shipping_carrier_rates FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.shipping_carrier_rates FROM authenticated;
GRANT SELECT ON public.shipping_carrier_rates TO authenticated;
-- كل كتابة عبر shipping_rate_save فقط؛ لا DELETE لأحد.

-- حفظ ذرّي بالقواعد أعلاه.
CREATE OR REPLACE FUNCTION public.shipping_rate_save(
  p_carrier text, p_market text, p_currency text, p_outbound numeric,
  p_return_policy text DEFAULT 'unknown', p_return_fee numeric DEFAULT NULL,
  p_effective_from date DEFAULT NULL, p_note text DEFAULT NULL, p_name text DEFAULT NULL)
RETURNS date LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_now_month date := date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul'))::date;
  v_today     date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_carrier   text := btrim(p_carrier);
  v_eff       date := COALESCE(p_effective_from, v_today);
  v_last      date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF public.current_role_type() IS NULL OR public.current_role_type() NOT IN ('admin','manager') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF v_carrier IS NULL OR v_carrier = '' THEN RAISE EXCEPTION 'carrier required'; END IF;
  IF p_market IS NULL OR p_market NOT IN ('syria','turkey','uae') THEN RAISE EXCEPTION 'market must be syria|turkey|uae'; END IF;
  IF p_currency IS NULL OR p_currency NOT IN ('SYP','TRY','AED','USD') THEN RAISE EXCEPTION 'currency must be SYP|TRY|AED|USD'; END IF;
  IF p_outbound IS NULL OR p_outbound < 0 THEN RAISE EXCEPTION 'outbound fee must be >= 0'; END IF;
  IF COALESCE(p_return_policy, 'unknown') NOT IN ('none','fixed','same_as_outbound','unknown') THEN RAISE EXCEPTION 'invalid return policy'; END IF;
  IF p_return_policy = 'fixed' AND (p_return_fee IS NULL OR p_return_fee < 0) THEN RAISE EXCEPTION 'fixed return policy needs return_fee >= 0'; END IF;
  IF v_eff > (v_today + interval '12 months')::date THEN RAISE EXCEPTION 'effective date too far ahead'; END IF;

  SELECT max(effective_from) INTO v_last FROM public.shipping_carrier_rates WHERE carrier = v_carrier AND market = p_market;
  IF v_last IS NOT NULL AND v_eff < v_last THEN
    RAISE EXCEPTION 'history is never rewritten: latest rate for this carrier starts % (requested %)', v_last, v_eff;
  END IF;
  IF v_eff < v_now_month AND EXISTS (SELECT 1 FROM public.shipping_carrier_rates WHERE carrier = v_carrier AND market = p_market AND effective_from = v_eff) THEN
    RAISE EXCEPTION 'a past rate is locked (effective_from % is before the current month)', v_eff;
  END IF;

  INSERT INTO public.shipping_carrier_rates (carrier, market, currency, outbound_fee, return_policy, return_fee, effective_from, note, entered_by, entered_by_name)
  VALUES (v_carrier, p_market, p_currency, p_outbound, COALESCE(p_return_policy, 'unknown'), CASE WHEN p_return_policy = 'fixed' THEN p_return_fee END, v_eff, NULLIF(btrim(p_note), ''), auth.uid(), p_name)
  ON CONFLICT (carrier, market, effective_from) DO UPDATE
    SET currency = EXCLUDED.currency, outbound_fee = EXCLUDED.outbound_fee, return_policy = EXCLUDED.return_policy,
        return_fee = EXCLUDED.return_fee, note = EXCLUDED.note, entered_by = EXCLUDED.entered_by, entered_by_name = EXCLUDED.entered_by_name, updated_at = now();
  RETURN v_eff;
END $$;
REVOKE ALL ON FUNCTION public.shipping_rate_save(text, text, text, numeric, text, numeric, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shipping_rate_save(text, text, text, numeric, text, numeric, date, text, text) TO authenticated;
