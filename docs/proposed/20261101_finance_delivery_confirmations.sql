-- =====================================================================
-- مسودة (غير مطبَّقة) — تأكيدات التسليم المالية المستقلة عن order_status_history (D-179، المرحلة 1)
--
-- الغرض: تسجيل تاريخ تسليم موثَّق بمستند لطلب حالته «مسلَّم» ولا يملك تاريخاً من أي مصدر آلي (سجل الحالات/شركة الشحن)،
--        بحيث يدخل حسابات الربحية دون أن:
--          • يُدخل حدثاً في order_status_history (فلا يتأثر المخزون ولا العمولة ولا شاشة /sales-delivery)،
--          • يعدّل جدول orders أو تاريخ أي طلب.
--
-- الأولوية بـprofitability_orders (من الأعلى للأدنى): دليل صفحة شركة الشحن › حدث سجل بمصدر شحن/جدول (rnk 1-2) ›
--   **تأكيد مالي** › حدث موظف (rnk 3) › تحديث المتتبّع الآلي. أي دليل آلي أقوى يغلب التأكيد دائماً.
-- الأساس الجديد: delivery_basis = 'finance_confirmed' (مستوى «تقديري» بالمحرك: لا يمنع الإقفال، ويُعرض للمراجعة).
--
-- الضمانات: كتابة عبر RPC وحدها (لا صلاحية مباشرة) · إلحاقية (لا حذف، التصحيح بإحلال سجل جديد وسبب) ·
--   مستند إلزامي لكل تأكيد · لا تأكيد لطلب غير مسلَّم · لا تاريخ مستقبلي ولا قبل تاريخ الطلب · لا تأكيد بشهر مُقفل ·
--   دفعة واحدة كلها أو لا شيء · وضع تجربة افتراضي (p_apply=false) لا يكتب شيئاً.
-- لا يُطبَّق على الإنتاج قبل موافقة صريحة. اختباره: node test-finance-delivery-confirmation.mjs (PGlite، بلا أي قاعدة حقيقية).
-- =====================================================================

-- 1) الجدول ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_delivery_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  delivered_at timestamptz NOT NULL,
  basis text NOT NULL CHECK (basis IN ('carrier_record','delivery_sheet','driver_report','cash_receipt','customer_confirmation','accounting_record','other_document')),
  evidence_ref text NOT NULL CHECK (length(btrim(evidence_ref)) >= 3),
  confirmed_by_name text NOT NULL CHECK (length(btrim(confirmed_by_name)) > 0),
  confirmed_by uuid DEFAULT auth.uid(),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  note text,
  superseded_at timestamptz,
  superseded_by uuid REFERENCES public.order_delivery_confirmations(id) DEFERRABLE INITIALLY DEFERRED,
  supersede_reason text,
  CONSTRAINT odc_supersede_consistent CHECK ((superseded_at IS NULL) = (superseded_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_odc_one_active_per_order ON public.order_delivery_confirmations (order_id) WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_odc_delivered_at ON public.order_delivery_confirmations (delivered_at);
COMMENT ON TABLE public.order_delivery_confirmations IS 'تأكيدات تسليم مالية موثَّقة بمستند، مستقلة عن order_status_history. إلحاقية. تُكتب عبر confirm_order_deliveries فقط.';

-- إلحاقي: لا حذف، ولا تعديل إلا إحلال التأكيد (حقول superseded_*) لسجل ما زال فعّالاً
CREATE OR REPLACE FUNCTION public.odc_append_only_guard() RETURNS trigger LANGUAGE plpgsql AS $g$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'order_delivery_confirmations is append-only (delete refused)'; END IF;
  IF OLD.superseded_at IS NOT NULL THEN RAISE EXCEPTION 'a superseded confirmation cannot change'; END IF;
  IF (NEW.id, NEW.order_id, NEW.delivered_at, NEW.basis, NEW.evidence_ref, NEW.confirmed_by_name, NEW.confirmed_by, NEW.confirmed_at, NEW.note)
     IS DISTINCT FROM (OLD.id, OLD.order_id, OLD.delivered_at, OLD.basis, OLD.evidence_ref, OLD.confirmed_by_name, OLD.confirmed_by, OLD.confirmed_at, OLD.note) THEN
    RAISE EXCEPTION 'confirmation content is immutable; supersede it instead';
  END IF;
  RETURN NEW;
END $g$;
DROP TRIGGER IF EXISTS trg_odc_append_only ON public.order_delivery_confirmations;
CREATE TRIGGER trg_odc_append_only BEFORE UPDATE OR DELETE ON public.order_delivery_confirmations FOR EACH ROW EXECUTE FUNCTION public.odc_append_only_guard();

ALTER TABLE public.order_delivery_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_delivery_confirmations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_delivery_confirmations TO authenticated, service_role;
DROP POLICY IF EXISTS "odc_management_read" ON public.order_delivery_confirmations;
CREATE POLICY "odc_management_read" ON public.order_delivery_confirmations FOR SELECT TO authenticated
  USING (public.current_role_type() IN ('admin','manager','sales_manager'));

-- 2) الإدخال: دفعة JSON واحدة، تجربة افتراضياً ----------------------------------------
-- p_rows: [{"order_code":"SL-3559","delivered_at":"2026-10-14T15:30:00+03:00","basis":"driver_report","evidence_ref":"كشف السائق 14/10 ص3","note":"..."}]
--   لإحلال تأكيد قائم: "supersede": true, "supersede_reason": "..."
-- p_apply=false (الافتراضي): تقرير تحقق فقط، لا كتابة. p_apply=true: كل الصفوف أو لا شيء.
CREATE OR REPLACE FUNCTION public.confirm_order_deliveries(p_rows jsonb, p_name text, p_apply boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_row jsonb; v_code text; v_basis text; v_ref text; v_at timestamptz; v_note text; v_super boolean; v_reason text;
  v_ord record; v_active uuid; v_month date; v_err text; v_n int; v_new uuid;
  v_report jsonb := '[]'::jsonb; v_bad int := 0; v_total int; v_applied int := 0;
BEGIN
  IF public.current_role_type() IS NULL OR public.current_role_type() NOT IN ('admin','manager','sales_manager') THEN
    RAISE EXCEPTION 'FORBIDDEN: role not allowed to confirm deliveries';
  END IF;
  IF coalesce(btrim(p_name), '') = '' THEN RAISE EXCEPTION 'confirmer name is required'; END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN RAISE EXCEPTION 'rows must be a non-empty array'; END IF;
  v_total := jsonb_array_length(p_rows);
  IF v_total > 500 THEN RAISE EXCEPTION 'at most 500 rows per call'; END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_err := NULL; v_active := NULL; v_new := NULL;
    v_code := btrim(coalesce(v_row->>'order_code', ''));
    v_basis := coalesce(v_row->>'basis', '');
    v_ref := btrim(coalesce(v_row->>'evidence_ref', ''));
    v_note := nullif(btrim(coalesce(v_row->>'note', '')), '');
    v_reason := btrim(coalesce(v_row->>'supersede_reason', ''));
    BEGIN v_super := coalesce((v_row->>'supersede')::boolean, false); EXCEPTION WHEN others THEN v_super := false; END;
    -- إزاحة التوقيت إلزامية (Z أو ±HH[:MM]): تاريخ بلا إزاحة يُفسَّر بتوقيت جلسة القاعدة فيزيح الساعة بصمت
    IF coalesce(v_row->>'delivered_at', '') !~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN v_at := NULL;
    ELSE BEGIN v_at := (v_row->>'delivered_at')::timestamptz; EXCEPTION WHEN others THEN v_at := NULL; END; END IF;

    SELECT count(*) INTO v_n FROM orders WHERE order_id = v_code AND deleted_at IS NULL;
    IF v_code = '' THEN v_err := 'order_code missing';
    ELSIF v_n = 0 THEN v_err := 'order not found';
    ELSIF v_n > 1 THEN v_err := 'order code ambiguous';
    END IF;

    IF v_err IS NULL THEN
      SELECT id, status, order_date INTO v_ord FROM orders WHERE order_id = v_code AND deleted_at IS NULL;
      IF v_ord.status <> 'delivered' THEN v_err := 'order status is not delivered';
      ELSIF v_at IS NULL THEN v_err := 'delivered_at invalid';
      ELSIF v_at > now() THEN v_err := 'delivered_at is in the future';
      ELSIF v_at < v_ord.order_date - interval '1 hour' THEN v_err := 'delivered_at is before the order date';
      ELSIF v_basis NOT IN ('carrier_record','delivery_sheet','driver_report','cash_receipt','customer_confirmation','accounting_record','other_document') THEN v_err := 'basis invalid';
      ELSIF length(v_ref) < 3 THEN v_err := 'evidence_ref is required';
      END IF;
    END IF;

    IF v_err IS NULL THEN
      v_month := date_trunc('month', v_at AT TIME ZONE 'Europe/Istanbul')::date;
      IF EXISTS (SELECT 1 FROM profitability_month_closures WHERE month = v_month) THEN v_err := 'delivery month is closed'; END IF;
    END IF;

    IF v_err IS NULL THEN
      SELECT id INTO v_active FROM order_delivery_confirmations WHERE order_id = v_ord.id AND superseded_at IS NULL;
      IF v_active IS NOT NULL AND NOT v_super THEN v_err := 'an active confirmation exists (use supersede)';
      ELSIF v_active IS NOT NULL AND length(v_reason) < 3 THEN v_err := 'supersede_reason is required';
      END IF;
    END IF;

    IF v_err IS NOT NULL THEN
      v_bad := v_bad + 1;
    ELSIF p_apply THEN
      v_new := gen_random_uuid();
      IF v_active IS NOT NULL THEN
        UPDATE order_delivery_confirmations SET superseded_at = now(), superseded_by = v_new, supersede_reason = v_reason WHERE id = v_active;
      END IF;
      INSERT INTO order_delivery_confirmations (id, order_id, delivered_at, basis, evidence_ref, confirmed_by_name, note)
      VALUES (v_new, v_ord.id, v_at, v_basis, v_ref, btrim(p_name), v_note);
      v_applied := v_applied + 1;
    END IF;
    v_report := v_report || jsonb_build_array(jsonb_build_object('order_code', v_code, 'ok', v_err IS NULL, 'error', v_err, 'id', v_new));
  END LOOP;

  IF p_apply AND v_bad > 0 THEN
    RAISE EXCEPTION 'CONFIRMATION_BATCH_REJECTED: % of % rows invalid, nothing saved: %', v_bad, v_total, v_report::text;
  END IF;
  RETURN jsonb_build_object('applied', p_apply, 'total', v_total, 'ok', v_total - v_bad, 'rejected', v_bad, 'inserted', v_applied, 'rows', v_report);
END $fn$;
REVOKE ALL ON FUNCTION public.confirm_order_deliveries(jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_order_deliveries(jsonb, text, boolean) TO authenticated;

-- 3) profitability_orders: يقرأ التأكيد المالي بعد الأدلة الآلية الأقوى. نفس التوقيع ونفس الأعمدة ----------------
-- التعديل الوحيد: اللصق LATERAL fc وثلاثة فروع CASE (delivered_at / delivery_basis / delivery_source).
-- p_use_finance_confirmations: الربحية تقرأ التأكيد المالي (الافتراضي true). العمولات/الرواتب/تقرير التسليمات تمرّر false ← الدالة تتصرف كما قبل هذه الهجرة تماماً
-- (قرار المالك: لا ينتقل بيع بين شهرين بسبب ورقة تأكيد). التوقيع الجديد بمعامل ثالث له قيمة افتراضية، فنداء المعاملين القديم يبقى صالحاً.
DROP FUNCTION IF EXISTS public.profitability_orders(timestamptz, timestamptz);
CREATE FUNCTION public.profitability_orders(p_from timestamp with time zone, p_to timestamp with time zone, p_use_finance_confirmations boolean DEFAULT true)
 RETURNS TABLE(id uuid, order_code text, market text, status text, order_date timestamp with time zone, items jsonb, amount numeric, currency text, delivered_at timestamp with time zone, delivery_basis text, delivery_source text, delivery_bulk_suspect boolean, delivered_before_return boolean, history_conflict boolean, return_at timestamp with time zone, return_source text, return_bulk_suspect boolean, hist_rows integer, reserve_qty numeric, restock_qty numeric, waste_qty numeric, delivery_cost numeric, shipping_payer text, payment_status text, paid_amount numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH allowed AS (SELECT public.current_role_type() IN ('admin','manager','sales_manager') AS ok),
cand AS (
  SELECT o.* FROM orders o, allowed
  WHERE allowed.ok AND o.deleted_at IS NULL
    AND o.order_date >= p_from - interval '120 days' AND o.order_date < p_to
    AND o.status IN ('delivered','settled','returned','returning','not_received')
),
hist AS (
  SELECT h.order_id, h.to_status, h.changed_at, h.source
  FROM order_status_history h WHERE h.order_id IN (SELECT c.id FROM cand c)
),
fin AS (
  SELECT c.id AS order_id,
         max(h.changed_at) FILTER (WHERE h.to_status = c.status) AS final_event_at,
         (array_agg(h.source ORDER BY h.changed_at DESC) FILTER (WHERE h.to_status = c.status))[1] AS final_src,
         count(h.order_id) AS n
  FROM cand c LEFT JOIN hist h ON h.order_id = c.id GROUP BY c.id
),
retbulk AS (
  SELECT f.order_id, (count(*) OVER (PARTITION BY date_trunc('minute', h.changed_at))) >= 30 AS bulk
  FROM hist h JOIN fin f ON f.order_id = h.order_id AND h.changed_at = f.final_event_at
  WHERE h.to_status = 'returned'
),
dev AS (
  SELECT h.order_id, h.changed_at, h.source,
         count(*) OVER (PARTITION BY h.source, date_trunc('minute', h.changed_at)) AS per_min
  FROM hist h WHERE h.to_status = 'delivered'
),
dev_valid AS (
  SELECT d.*, c.status,
    CASE WHEN d.source IN ('yurtici','babel','babel_webhook','karam','ptt') THEN 1
         WHEN d.source IN ('sheet','star') THEN 2 ELSE 3 END AS rnk,
    (d.per_min >= 30) AS bulk
  FROM dev d JOIN cand c ON c.id = d.order_id
  LEFT JOIN fin f ON f.order_id = d.order_id
  WHERE c.status = 'delivered' OR (f.final_event_at IS NOT NULL AND d.changed_at < f.final_event_at)
),
best AS (
  SELECT DISTINCT ON (order_id) order_id, changed_at, source, rnk
  FROM dev_valid WHERE NOT bulk
  ORDER BY order_id, rnk ASC, changed_at DESC
),
anybulk AS (SELECT order_id, true AS b FROM dev_valid WHERE bulk GROUP BY order_id),
anydev AS (SELECT order_id, true AS b FROM dev GROUP BY order_id),
inv AS (
  SELECT w.order_id,
         sum(w.quantity) FILTER (WHERE w.type = 'reserve') AS reserve_qty,
         sum(w.quantity) FILTER (WHERE w.type = 'release' AND w.reason = 'استرداد للمخزون') AS restock_qty,
         sum(w.quantity) FILTER (WHERE w.type = 'waste') AS waste_qty
  FROM wh_movements w WHERE w.order_id IN (SELECT c.id FROM cand c) GROUP BY w.order_id
),
base AS (
  SELECT c.id, c.order_id AS order_code, c.market, c.status, c.order_date, c.items, c.amount, c.currency,
    c.delivery_cost, c.shipping_payer, c.payment_status, c.paid_amount,
    CASE
      WHEN ev.delivered_at IS NOT NULL AND c.status = 'delivered' THEN ev.delivered_at
      WHEN b.rnk IN (1, 2) THEN b.changed_at
      WHEN fc.delivered_at IS NOT NULL AND c.status = 'delivered' THEN fc.delivered_at
      WHEN b.changed_at IS NOT NULL THEN b.changed_at
      WHEN c.status = 'delivered' AND c.updated_by IN ('الكرم-تلقائي','بابل-تلقائي','بابل-webhook','يورتيتشي-تلقائي','PTT-تلقائي')
           AND coalesce(c.tracking_number, '') <> ''
           AND NOT EXISTS (SELECT 1 FROM orders x WHERE x.tracking_number = c.tracking_number AND x.id <> c.id AND x.deleted_at IS NULL)
        THEN c.updated_at
    END AS delivered_at,
    CASE
      WHEN ev.delivered_at IS NOT NULL AND c.status = 'delivered' THEN 'carrier'
      WHEN b.rnk = 1 THEN 'carrier'
      WHEN b.rnk = 2 THEN 'external'
      WHEN fc.delivered_at IS NOT NULL AND c.status = 'delivered' THEN 'finance_confirmed'
      WHEN b.rnk = 3 THEN 'substitute_staff_event'
      WHEN b.changed_at IS NULL AND c.status = 'delivered' AND c.updated_by IN ('الكرم-تلقائي','بابل-تلقائي','بابل-webhook','يورتيتشي-تلقائي','PTT-تلقائي')
           AND coalesce(c.tracking_number, '') <> ''
           AND NOT EXISTS (SELECT 1 FROM orders x WHERE x.tracking_number = c.tracking_number AND x.id <> c.id AND x.deleted_at IS NULL)
        THEN 'substitute_tracker'
      ELSE 'unknown'
    END AS delivery_basis,
    CASE
      WHEN ev.delivered_at IS NOT NULL AND c.status = 'delivered' THEN 'carrier_public_page:' || ev.carrier
      WHEN b.rnk IN (1, 2) THEN b.source
      WHEN fc.delivered_at IS NOT NULL AND c.status = 'delivered' THEN 'finance_confirmed:' || fc.basis
      WHEN b.changed_at IS NOT NULL THEN b.source
      WHEN c.status = 'delivered' AND c.updated_by IN ('الكرم-تلقائي','بابل-تلقائي','بابل-webhook','يورتيتشي-تلقائي','PTT-تلقائي') THEN 'updated_by:' || c.updated_by
    END AS delivery_source,
    coalesce(ab.b, false) AS delivery_bulk_suspect,
    CASE WHEN c.status = 'returned' AND NOT coalesce(rb.bulk, false) THEN f.final_event_at END AS return_at,
    CASE WHEN c.status = 'returned' THEN f.final_src END AS return_source,
    (c.status = 'returned' AND coalesce(rb.bulk, false)) AS return_bulk_suspect,
    coalesce(f.n, 0)::int AS hist_rows,
    (c.status <> 'delivered' AND b.changed_at IS NOT NULL) AS delivered_before_return,
    (c.status <> 'delivered' AND b.changed_at IS NULL AND ad.b IS TRUE AND ab.b IS NOT TRUE) AS history_conflict,
    coalesce(i.reserve_qty, 0) AS reserve_qty, coalesce(i.restock_qty, 0) AS restock_qty, coalesce(i.waste_qty, 0) AS waste_qty
  FROM cand c
  LEFT JOIN best b ON b.order_id = c.id
  LEFT JOIN anybulk ab ON ab.order_id = c.id
  LEFT JOIN anydev ad ON ad.order_id = c.id
  LEFT JOIN fin f ON f.order_id = c.id
  LEFT JOIN retbulk rb ON rb.order_id = c.id
  LEFT JOIN inv i ON i.order_id = c.id
  LEFT JOIN LATERAL (SELECT e.delivered_at, e.carrier FROM order_delivery_evidence e
                      WHERE e.order_id = c.id AND e.source_kind = 'carrier_public_page' LIMIT 1) ev ON true
  LEFT JOIN LATERAL (SELECT k.delivered_at, k.basis FROM order_delivery_confirmations k
                      WHERE k.order_id = c.id AND k.superseded_at IS NULL AND p_use_finance_confirmations LIMIT 1) fc ON true
)
SELECT base.id, base.order_code, base.market, base.status, base.order_date, base.items, base.amount, base.currency,
       base.delivered_at, base.delivery_basis, base.delivery_source, base.delivery_bulk_suspect,
       base.delivered_before_return, base.history_conflict, base.return_at, base.return_source, base.return_bulk_suspect, base.hist_rows,
       base.reserve_qty, base.restock_qty, base.waste_qty,
       base.delivery_cost, base.shipping_payer, base.payment_status, base.paid_amount
FROM base
WHERE (base.delivered_at >= p_from AND base.delivered_at < p_to)
   OR (base.delivery_basis = 'unknown' AND base.status = 'delivered' AND base.order_date >= p_from - interval '60 days' AND base.order_date < p_to)
   OR (base.status = 'returned' AND base.return_at >= p_from AND base.return_at < p_to)
   OR (base.status = 'returned' AND base.return_at IS NULL AND base.order_date >= p_from - interval '60 days' AND base.order_date < p_to)
   OR (base.status IN ('returning','not_received') AND base.order_date >= p_from - interval '60 days' AND base.order_date < p_to)
   OR (base.status = 'settled' AND base.order_date >= p_from AND base.order_date < p_to)
ORDER BY base.id
$function$;
REVOKE ALL ON FUNCTION public.profitability_orders(timestamptz, timestamptz, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profitability_orders(timestamptz, timestamptz, boolean) TO authenticated, service_role;
