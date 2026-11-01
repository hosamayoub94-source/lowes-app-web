-- =====================================================================
-- D-181 · قفل اعتماد الرواتب **وتسجيل دفعها** بالخادم عند تغيّر مبيعات التسليم بعد الحسبة
-- الحالة: مقترح — غير مطبَّق. لا يُطبَّق على الإنتاج إلا بموافقة المالك الصريحة.
-- الاختبار: node test-payroll-sales-drift-sql.mjs (PGlite، بيانات وهمية) — يشمل محاولات التجاوز وتطابق JS/SQL.
-- التراجع: 20261102_payroll_sales_drift_gate_rollback.sql
--
-- النطاق: الدورات التشغيلية فقط (payroll_period_is_operational: ≥ 2026-10). أيلول 2026 وما قبله لا يتأثر.
-- المسارات المغطاة (كلها بالخادم، لا تعتمد على الواجهة):
--   1) الاعتماد draft → finalized/paid: المشغّل القائم payroll_runs_zz_consistency_gate + فحص المبيعات.
--   2) تسجيل الدفع finalized → paid (payroll_mark_paid أو أي UPDATE): نفس المشغّل، فرع جديد يعيد فحص المبيعات.
--   3) نقل دورة إلى شهر خارج النطاق للتهرب من الفحص، أو إدراج دورة غير مسودّة: payroll_runs_period_guard.
--   4) تسجيل الدفع على مستوى القيد (payment_status='paid' أو paid_at): payroll_entries_payment_guard — الدفع للدورة فقط.
-- لا مسار تجاوز: لا إعداد ولا دور يتخطى الفحص (حتى المسار المميّز payroll.s2_path='rpc').
-- ملاحظة محاسبية: الفحص «حيّ» — أي مرتجع/تأكيد/تغيير حالة يمسّ مبيعات الشهر بعد الاعتماد يوقف تسجيل الدفع
-- حتى إعادة الفتح وإعادة الحسبة (قرار المالك: هل هذا المطلوب لكل تغيير؟ — انظر التقرير § 5ج).
--
-- ما يُحسب: مبيعات كل قيد آلي الآن بعملة فريق الموظف — نسخة SQL حرفية من مسار الرواتب بالواجهة:
--   profitability_orders(p_from, p_to, true)  ← نفس المصدر (FINANCE_CONFIRMED_AFFECTS_PAYROLL = true)
--   + اسم البائع من orders (غير محذوف، order_date ضمن [بداية الشهر − 120 يوماً، نهاية الشهر))   ← fetchOrderExtras
--   + deliveryEntry: delivered/settled بتاريخ موثوق داخل الشهر؛ delivered بلا تاريخ موثوق ← order_date؛
--     settled بلا تاريخ موثوق لا يُحتسب؛ returned لا يُحتسب                                      ← selectDeliveredInPeriod
--   + استبعاد سوق الإمارات، مفتاح الاسم = trim/lower/طيّ المسافات                                ← buildPayrollIndex / normalizeName
--   + أسماء الموظف = employee_name و seller_alias (كما هي، بلا إزالة تكرار)                      ← employeeNames
--   + التحويل: أسعار الدورة المثبتة لـTRY/SYP، والباقي من exchange_rates (الأحدث لكل زوج)        ← fetchRunRateMap / buildRateToUsd
-- الفرق المسموح: سنت واحد (حساب عشري بالخادم مقابل double بالمتصفح). عدد الطلبات يجب أن يطابق تماماً.
-- =====================================================================
BEGIN;

-- حارس ما قبل التطبيق: لا نكتب فوق نسخة من المشغّل غير التي رُوجعت (1/11/2026)، ولا فوق كائنات بنفس الأسماء.
DO $guard$
DECLARE m text;
BEGIN
  SELECT md5(prosrc) INTO m FROM pg_proc WHERE oid = 'public.payroll_run_consistency_gate()'::regprocedure;
  IF m IS DISTINCT FROM '8a108d81cd819569e6463ed949471264' THEN
    RAISE EXCEPTION 'D-181: payroll_run_consistency_gate تغيّر منذ مراجعة 1/11/2026 (md5 %) — لا تطبيق قبل إعادة المراجعة.', m;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'payroll_runs_zz_consistency_gate' AND tgrelid = 'public.payroll_runs'::regclass AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'D-181: المشغّل payroll_runs_zz_consistency_gate غير موجود أو معطَّل — لا تطبيق.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
              AND p.proname IN ('payroll_norm_name', 'payroll_live_team_sales', 'payroll_sales_drift', 'payroll_assert_sales_fresh',
                                'payroll_runs_period_guard', 'payroll_entries_payment_guard'))
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgname IN ('payroll_runs_period_guard', 'payroll_entries_payment_guard')) THEN
    RAISE EXCEPTION 'D-181: توجد مسبقاً دوال/مشغّلات بأسماء هذه الـmigration — لا تطبيق قبل المراجعة.';
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.payroll_norm_name(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(lower(regexp_replace(coalesce(p, ''), '^\s+|\s+$', '', 'g')), '\s+', ' ', 'g')
$$;

-- مبيعات كل موظف لقيود الدورة الآلية الآن (عملة الفريق). داخلية: لا تُستدعى من الواجهة مباشرة.
CREATE OR REPLACE FUNCTION public.payroll_live_team_sales(p_run_id uuid)
RETURNS TABLE (employee_id uuid, live_local numeric, live_count int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE
  r public.payroll_runs%ROWTYPE;
  f timestamptz; t timestamptz;
  ny int; nm int;
BEGIN
  SELECT * INTO r FROM public.payroll_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'الدورة غير موجودة.'; END IF;
  -- profitability_orders لا تُرجع شيئاً لغير هذه الأدوار؛ صمتها هنا يعني «لا مبيعات» فنرفض بدل ذلك.
  IF coalesce(public.current_role_type(), '') NOT IN ('admin', 'manager', 'sales_manager') THEN
    RAISE EXCEPTION 'تعذّر التحقق من مبيعات التسليمات: الدور الحالي لا يقرأ مصدر المبيعات.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  ny := CASE WHEN r.period_month = 12 THEN r.period_year + 1 ELSE r.period_year END;
  nm := CASE WHEN r.period_month = 12 THEN 1 ELSE r.period_month + 1 END;
  -- حدود إسطنبول بإزاحة ISO صريحة (+03:00) — مثل periodBounds بالواجهة
  f := format('%s-%s-01T00:00:00+03:00', r.period_year, lpad(r.period_month::text, 2, '0'))::timestamptz;
  t := format('%s-%s-01T00:00:00+03:00', ny, lpad(nm::text, 2, '0'))::timestamptz;

  RETURN QUERY
  WITH rpc AS (
    SELECT DISTINCT ON (p.id) p.* FROM public.profitability_orders(f, t, true) p ORDER BY p.id
  ),
  ex AS (
    SELECT o.id, o.handler_name FROM public.orders o
     WHERE o.deleted_at IS NULL AND o.order_date >= f - interval '120 days' AND o.order_date < t
       AND o.status IN ('delivered', 'settled', 'returned', 'returning', 'not_received')
  ),
  ent AS (
    SELECT p.market, p.status, coalesce(nullif(p.currency, ''), 'USD') AS cur, coalesce(p.amount, 0) AS amount,
           public.payroll_norm_name(ex.handler_name) AS h,
           CASE
             WHEN p.status NOT IN ('delivered', 'settled') THEN NULL
             WHEN p.delivered_at IS NOT NULL AND p.delivery_basis IS NOT NULL AND p.delivery_basis <> 'unknown' THEN p.delivered_at
             WHEN p.status = 'settled' THEN NULL
             ELSE p.order_date
           END AS at
      FROM rpc p JOIN ex ON ex.id = p.id
  ),
  buckets AS (
    SELECT h, cur, sum(amount) AS total, count(*)::int AS n
      FROM ent
     WHERE at IS NOT NULL AND at >= f AND at < t AND market IS DISTINCT FROM 'uae' AND h <> ''
     GROUP BY h, cur
  ),
  xr AS (  -- exchange_rates: الأحدث لكل زوج، ثم المباشر X→USD أو المعاكس USD→X أيهما أحدث
    SELECT DISTINCT ON (from_cur, to_cur) from_cur, to_cur, rate, created_at
      FROM public.exchange_rates ORDER BY from_cur, to_cur, created_at DESC
  ),
  rates AS (
    SELECT c.cur,
           CASE
             WHEN c.cur = 'USD' THEN 1::numeric
             WHEN c.cur = 'TRY' AND coalesce(r.rate_usd_try, 0) > 0 THEN 1 / r.rate_usd_try
             WHEN c.cur = 'SYP' AND coalesce(r.rate_usd_syp, 0) > 0 THEN 1 / r.rate_usd_syp
             ELSE (SELECT CASE WHEN d.rate > 0 AND (i.rate IS NULL OR i.rate <= 0 OR d.created_at >= i.created_at) THEN d.rate
                               WHEN i.rate > 0 THEN 1 / i.rate END
                     FROM (SELECT 1) one
                     LEFT JOIN xr d ON d.from_cur = c.cur AND d.to_cur = 'USD'
                     LEFT JOIN xr i ON i.from_cur = 'USD' AND i.to_cur = c.cur)
           END AS to_usd
      FROM (SELECT DISTINCT cur FROM buckets UNION SELECT 'USD' UNION SELECT 'TRY' UNION SELECT 'SYP') c
  ),
  emps AS (
    SELECT DISTINCT e.employee_id, pr.employee_name, pr.seller_alias,
           CASE btrim(coalesce(pr.team, '')) WHEN 'سوريا' THEN 'USD' WHEN 'تركيا' THEN 'TRY' END AS tcur
      FROM public.payroll_entries e JOIN public.profiles pr ON pr.id = e.employee_id
     WHERE e.run_id = p_run_id AND e.source IS DISTINCT FROM 'manual'
  ),
  names AS (  -- كما employeeNames: الاسم والاسم البديل، كلٌّ على حدة (بلا دمج المكرر)
    SELECT employee_id, tcur, public.payroll_norm_name(employee_name) AS h FROM emps WHERE tcur IS NOT NULL
    UNION ALL
    SELECT employee_id, tcur, public.payroll_norm_name(seller_alias) FROM emps WHERE tcur IS NOT NULL
  )
  SELECT em.employee_id,
         round(coalesce(sum(
           CASE WHEN b.cur = n.tcur THEN b.total
                WHEN n.tcur = 'USD' THEN b.total * coalesce(ru.to_usd, 0)
                ELSE CASE WHEN coalesce(rt.to_usd, 0) > 0 THEN b.total * coalesce(ru.to_usd, 0) / rt.to_usd ELSE 0 END
           END), 0), 2) AS live_local,
         coalesce(sum(b.n), 0)::int AS live_count
    FROM (SELECT DISTINCT employee_id, tcur FROM emps WHERE tcur IS NOT NULL) em
    LEFT JOIN names n ON n.employee_id = em.employee_id AND n.h <> ''
    LEFT JOIN buckets b ON b.h = n.h
    LEFT JOIN rates ru ON ru.cur = b.cur
    LEFT JOIN rates rt ON rt.cur = n.tcur
   GROUP BY em.employee_id;
END $$;

-- القيود التي تغيّرت مبيعاتها منذ الحسبة (فارغة = الدورة حديثة). لحسام وأماني فقط (من يملك الاعتماد).
CREATE OR REPLACE FUNCTION public.payroll_sales_drift(p_run_id uuid)
RETURNS TABLE (employee_id uuid, employee_name text, stored_local numeric, live_local numeric, stored_count int, live_count int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.payroll_can_finalize() THEN
    RAISE EXCEPTION 'فحص حداثة الرواتب لحسام وأماني فقط (D-090).' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT e.employee_id, pr.employee_name, round(coalesce(e.sales_local, 0), 2), coalesce(l.live_local, 0),
         coalesce(e.sales_orders_count, 0), coalesce(l.live_count, 0)
    FROM public.payroll_entries e
    JOIN public.profiles pr ON pr.id = e.employee_id
    LEFT JOIN public.payroll_live_team_sales(p_run_id) l ON l.employee_id = e.employee_id
   WHERE e.run_id = p_run_id AND e.source IS DISTINCT FROM 'manual' AND e.team IN ('syria', 'turkey')
     AND (abs(round(coalesce(e.sales_local, 0), 2) - coalesce(l.live_local, 0)) > 0.01
          OR coalesce(e.sales_orders_count, 0) <> coalesce(l.live_count, 0));
END $$;

REVOKE ALL ON FUNCTION public.payroll_live_team_sales(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payroll_sales_drift(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_sales_drift(uuid) TO authenticated;

-- يرفض العملية (اعتماد/دفع) إن تغيّرت مبيعات أي قيد آلي منذ الحسبة، أو تعذّر التحقق (أي خطأ يمرّ كما هو فيرفض).
CREATE OR REPLACE FUNCTION public.payroll_assert_sales_fresh(p_run_id uuid, p_action text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE bad int; names text;
BEGIN
  -- قراءة مصدر المبيعات دائماً — حتى لو لم يكن بالدورة قيد مبيعات يُقارَن — فيفشل الفحص مغلقاً إن تعذّرت القراءة
  -- (بدونها: دورة بلا قيود مبيعات كانت تمرّ دون أن يُقرأ المصدر أصلاً؛ اكتشفه اختبار دورة أكتوبر).
  PERFORM 1 FROM public.payroll_live_team_sales(p_run_id);
  SELECT count(*), string_agg(format('%s: %s→%s طلب، %s→%s', d.employee_name, d.stored_count, d.live_count, d.stored_local, d.live_local), '؛ ')
    INTO bad, names
    FROM public.payroll_sales_drift(p_run_id) d;
  IF bad > 0 THEN
    RAISE EXCEPTION '%: مبيعات التسليمات تغيّرت بعد آخر حسبة لـ% موظف (%) — أعد فتح/تشغيل الدورة أولاً.', p_action, bad, names
      USING ERRCODE = 'check_violation';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.payroll_assert_sales_fresh(uuid, text) FROM PUBLIC, anon, authenticated;

-- المشغّل القائم كما هو بالإنتاج (1/11/2026) + فحص المبيعات عند الاعتماد + فرع تسجيل الدفع.
CREATE OR REPLACE FUNCTION public.payroll_run_consistency_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n int; t numeric; bad int; names text; act text;
begin
  if not public.payroll_period_is_operational(old.period_year, old.period_month) then return new; end if;
  -- D-181: الاعتماد (من مسودة) وتسجيل الدفع (من معتمدة) يمرّان بكل الفحوص نفسها ثم بفحص المبيعات الحية.
  -- يُعاد الكل عند الدفع لأن المسار المميّز يستطيع تعديل قيود دورة معتمدة.
  -- 'approved' غير موجودة بالجدول (CHECK) وتُذكر دفاعياً فقط.
  if old.status in ('finalized', 'approved') and new.status = 'paid' then act := 'لا يُسجَّل الدفع';
  elsif old.status = 'draft' and new.status in ('finalized', 'approved', 'paid') then act := 'لا تُعتمد الدورة';
  else return new;
  end if;

  select count(*)::int, coalesce(sum(net_salary_usd), 0) into n, t from public.payroll_entries where run_id = old.id;
  if old.employee_count is distinct from n or round(coalesce(old.total_net_usd, 0), 2) <> round(t, 2) then
    raise exception 'ملخص الدورة لا يطابق القيود: الملخص % موظف / $% بينما القيود % موظف / $% — أعد تشغيل الدورة.',
      coalesce(old.employee_count, 0), round(coalesce(old.total_net_usd, 0), 2), n, round(t, 2);
  end if;

  select count(*), string_agg(p.employee_name, '، ') into bad, names
    from public.payroll_entries e join public.profiles p on p.id = e.employee_id
   where e.run_id = old.id and p.payroll_excluded;
  if bad > 0 then
    raise exception 'بالدورة قيود لموظفين مستبعدين من الرواتب (%): احذفها قبل الاعتماد.', names;
  end if;

  select count(*) into bad from public.payroll_entries e
   where e.run_id = old.id
     and abs(coalesce(e.net_salary_usd, 0) - (coalesce(e.base_salary_usd, 0) + coalesce(e.allowances_usd, 0)
         + coalesce(e.commission_usd, 0) + coalesce(e.bonus_usd, 0) - coalesce(e.deductions_usd, 0)
         - coalesce(e.absence_deduction_usd, 0) - coalesce(e.shortfall_deduction_usd, 0)
         - coalesce(e.advance_deduction_usd, 0))) > 0.011;
  if bad > 0 then raise exception '% قيد صافيه لا يساوي مجموع مكوناته — أعد تشغيل الدورة.', bad; end if;

  select count(*) into bad from public.payroll_entries e
   where e.run_id = old.id and e.source is distinct from 'manual'
     and abs(coalesce(e.allowances_usd, 0) - coalesce((
           select sum((i ->> 'usd')::numeric) from jsonb_array_elements(e.allowances_detail) i), 0)) > 0.011;
  if bad > 0 then raise exception '% قيد آلي بدلاته لا تطابق تفصيل البدلات المحفوظ — أعد تشغيل الدورة.', bad; end if;

  -- D-181: مبيعات التسليم الآن = المحفوظة بالقيود؟ (تأكيد مالي/إثبات شحن/تغيير حالة بعد الحسبة ⇒ رفض)
  perform public.payroll_assert_sales_fresh(old.id, act);

  return new;
end $function$;

-- D-181: لا تهرّب من الفحص بتغيير شهر الدورة، ولا دورة تشغيلية تولد غير مسودّة (حتى بالمسار المميّز).
CREATE OR REPLACE FUNCTION public.payroll_runs_period_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF public.payroll_period_is_operational(NEW.period_year, NEW.period_month) AND NEW.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'دورة تشغيلية (تشرين الأول 2026+) تبدأ مسودة فقط ثم تُعتمد وتُدفع عبر الفحوص (D-181).' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.period_year, NEW.period_month) IS DISTINCT FROM (OLD.period_year, OLD.period_month)
     AND (public.payroll_period_is_operational(OLD.period_year, OLD.period_month)
          OR public.payroll_period_is_operational(NEW.period_year, NEW.period_month)) THEN
    RAISE EXCEPTION 'لا يُغيَّر شهر دورة رواتب تشغيلية (% → %) — أنشئ دورة جديدة للشهر الصحيح (D-181).',
      OLD.period_year * 100 + OLD.period_month, NEW.period_year * 100 + NEW.period_month USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS payroll_runs_period_guard ON public.payroll_runs;
CREATE TRIGGER payroll_runs_period_guard BEFORE INSERT OR UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.payroll_runs_period_guard();

-- D-181: الدفع يُسجَّل للدورة فقط (payroll_mark_paid). لا قيد يُعلَّم «مدفوع» أو يُعطى paid_at بدورة تشغيلية
-- (لا كاتب شرعي لهذين العمودين اليوم: كل الـ287 قيداً pending). «hold» مسموح كما هو.
CREATE OR REPLACE FUNCTION public.payroll_entries_payment_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE op boolean;
BEGIN
  SELECT public.payroll_period_is_operational(r.period_year, r.period_month) INTO op FROM public.payroll_runs r WHERE r.id = NEW.run_id;
  IF NOT coalesce(op, false) THEN RETURN NEW; END IF;
  IF (TG_OP = 'INSERT' AND (NEW.payment_status = 'paid' OR NEW.paid_at IS NOT NULL))
     OR (TG_OP = 'UPDATE' AND ((NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid')
                               OR NEW.paid_at IS DISTINCT FROM OLD.paid_at)) THEN
    RAISE EXCEPTION 'الدفع يُسجَّل للدورة كاملة عبر payroll_mark_paid فقط، لا للقيد الفردي (D-181).' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS payroll_entries_payment_guard ON public.payroll_entries;
CREATE TRIGGER payroll_entries_payment_guard BEFORE INSERT OR UPDATE ON public.payroll_entries
  FOR EACH ROW EXECUTE FUNCTION public.payroll_entries_payment_guard();

COMMIT;
