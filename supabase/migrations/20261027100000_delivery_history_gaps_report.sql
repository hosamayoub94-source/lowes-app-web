-- تقرير قراءة فقط: طلبات مسلَّمة (delivered) بلا أي حدث تسليم في order_status_history.
-- لماذا: لوحة «محاسبة المبيعات والتسليمات» والرواتب تدخل الطلب بتاريخ انتقاله إلى delivered. الطلبات القديمة بلا سجل
-- (معظمها استيراد حزيران 2026) تُحسب بتاريخ الطلب موسومةً «تقديري»، وهذه الدالة تعطي قائمة المراجعة اليدوية.
-- لا تعدّل أي بيانات ولا تُنشئ سجلات تاريخية (لا backfill صامت). نفس بوابة الأدوار كالدالة profitability_orders.
CREATE OR REPLACE FUNCTION public.delivery_history_gaps(p_from timestamptz, p_to timestamptz)
 RETURNS TABLE(id uuid, order_code text, market text, status text, order_date timestamptz, amount numeric, currency text, handler_name text, hist_rows integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT o.id, o.order_id, o.market, o.status, o.order_date, o.amount, o.currency, o.handler_name,
         (SELECT count(*)::int FROM order_status_history h WHERE h.order_id = o.id)
  FROM orders o
  WHERE public.current_role_type() IN ('admin','manager','sales_manager')
    AND o.deleted_at IS NULL
    AND o.status IN ('delivered','settled')
    AND o.order_date >= p_from AND o.order_date < p_to
    AND NOT EXISTS (SELECT 1 FROM order_status_history h WHERE h.order_id = o.id AND h.to_status = 'delivered')
  ORDER BY o.order_date
$function$;
REVOKE ALL ON FUNCTION public.delivery_history_gaps(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delivery_history_gaps(timestamptz, timestamptz) TO authenticated, service_role;
