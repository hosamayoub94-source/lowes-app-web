-- =============================================================
-- distribution_system_p8_fix_progress.sql
-- إصلاح apply_seller_progress ليطابق سكيمة notifications الفعلية على prod
-- ويصبح «الإشعار غير قاتل» (لا يُسقط احتساب العمولة أبداً).
--
-- السبب: notifications على prod أعمدتها الإلزامية: recipient + kind + title.
--   النسخة السابقة من الدالة كانت تُدرج (user_id,type,title,message,...) فقط
--   → ينتهك recipient/kind NOT NULL → post_order_commission تتراجع كاملة
--   → لا تُحتسب عمولة. (سُبق وأُصلح ON CONFLICT في p7.)
--
-- التغييرات:
--   • الإشعار يملأ recipient (= employee_name) + kind + title + body + severity.
--   • كل INSERT إشعار داخل BEGIN/EXCEPTION → أي فشل إشعار يُبتلع ولا يكسر العمولة.
--   • بقية المنطق (الترقية/النزول/الأوسمة) بلا تغيير.
-- idempotent: CREATE OR REPLACE.
-- =============================================================

CREATE OR REPLACE FUNCTION public.apply_seller_progress(p_seller uuid, p_month text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v            public.profiles%ROWTYPE;
  v_orders_mo  int;
  v_sales_mo   numeric;
  v_deliv_all  int;
  v_recruits   int;
  v_newlevel   text;
  v_newrank    text;
BEGIN
  SELECT * INTO v FROM public.profiles WHERE id = p_seller;
  IF NOT FOUND THEN RETURN; END IF;

  -- إحصاءات
  SELECT count(*) INTO v_orders_mo FROM public.orders
   WHERE seller_id = p_seller AND status = 'delivered'
     AND to_char(COALESCE(order_date, created_at), 'YYYY-MM') = p_month;
  SELECT COALESCE(sum(amount),0) INTO v_sales_mo FROM public.orders
   WHERE seller_id = p_seller AND status = 'delivered'
     AND to_char(COALESCE(order_date, created_at), 'YYYY-MM') = p_month;
  SELECT count(*) INTO v_deliv_all FROM public.orders
   WHERE seller_id = p_seller AND status = 'delivered';
  SELECT count(*) INTO v_recruits FROM public.profiles WHERE recruiter_id = p_seller;

  -- ترقية/نزول المندوب الميداني حسب طلبات الشهر
  IF v.seller_type = 'field_rep' THEN
    SELECT key INTO v_newlevel FROM public.rep_level_rules
      WHERE min_orders <= v_orders_mo ORDER BY min_orders DESC LIMIT 1;
    IF v_newlevel IS NOT NULL AND v_newlevel IS DISTINCT FROM v.rep_level THEN
      UPDATE public.profiles SET rep_level = v_newlevel WHERE id = p_seller;
      BEGIN
        INSERT INTO public.notifications (recipient, kind, user_id, type, title, body, severity, dedup_key)
        VALUES (v.employee_name, 'system', p_seller, 'system_alert', 'تغيّر مستواك',
                'مستواك الجديد: ' || (SELECT label FROM public.rep_level_rules WHERE key = v_newlevel),
                'info', 'lvl-' || p_seller || '-' || p_month || '-' || v_newlevel)
        ON CONFLICT (dedup_key) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN NULL;  -- الإشعار غير قاتل
      END;
    END IF;
  END IF;

  -- ترقية رتبة المسوّقة حسب مبيعات الشهر
  IF v.seller_type = 'marketer' THEN
    SELECT key INTO v_newrank FROM public.mlm_rank_rules
      WHERE min_sales <= v_sales_mo ORDER BY min_sales DESC LIMIT 1;
    IF v_newrank IS NOT NULL AND v_newrank IS DISTINCT FROM v.mlm_rank THEN
      UPDATE public.profiles SET mlm_rank = v_newrank WHERE id = p_seller;
      BEGIN
        INSERT INTO public.notifications (recipient, kind, user_id, type, title, body, severity, dedup_key)
        VALUES (v.employee_name, 'system', p_seller, 'system_alert', 'ترقية رتبة! 🎉',
                'رتبتك الجديدة: ' || (SELECT label FROM public.mlm_rank_rules WHERE key = v_newrank),
                'info', 'rank-' || p_seller || '-' || p_month || '-' || v_newrank)
        ON CONFLICT (dedup_key) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN NULL;  -- الإشعار غير قاتل
      END;
    END IF;
  END IF;

  -- منح الأوسمة الآلية (idempotent عبر UNIQUE(seller_id,badge_code))
  IF v_deliv_all >= 1  THEN INSERT INTO public.seller_badges(seller_id,badge_code) VALUES (p_seller,'first_sale')   ON CONFLICT DO NOTHING; END IF;
  IF v_deliv_all >= 10 THEN INSERT INTO public.seller_badges(seller_id,badge_code) VALUES (p_seller,'ten_orders')   ON CONFLICT DO NOTHING; END IF;
  IF v_deliv_all >= 50 THEN INSERT INTO public.seller_badges(seller_id,badge_code) VALUES (p_seller,'fifty_orders') ON CONFLICT DO NOTHING; END IF;
  IF v_recruits  >= 1  THEN INSERT INTO public.seller_badges(seller_id,badge_code) VALUES (p_seller,'recruiter')    ON CONFLICT DO NOTHING; END IF;
  IF v_recruits  >= 5  THEN INSERT INTO public.seller_badges(seller_id,badge_code) VALUES (p_seller,'team_of_five')  ON CONFLICT DO NOTHING; END IF;
  IF v.mlm_rank IN ('silver','gold','platinum','diamond') THEN INSERT INTO public.seller_badges(seller_id,badge_code) VALUES (p_seller,'silver_rank')  ON CONFLICT DO NOTHING; END IF;
  IF v.mlm_rank = 'diamond' THEN INSERT INTO public.seller_badges(seller_id,badge_code) VALUES (p_seller,'diamond_rank') ON CONFLICT DO NOTHING; END IF;
END;
$function$;
