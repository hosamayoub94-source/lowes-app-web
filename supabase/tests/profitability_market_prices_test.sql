-- اختبار أسعار السوق: يُنفَّذ كاملاً داخل DO ثم يُجهَض بـRAISE EXCEPTION بالنهاية (لا يبقى أي صف).
-- النتيجة المتوقعة: خطأ يبدأ بـ 'ROLLBACK_OK' ويحمل ملخص الفحوص. أي فشل = خطأ بنص 'FAIL:'.
DO $$
DECLARE
  cur date := date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul'))::date;
  nxt date := (cur + interval '1 month')::date;
  prv date := (cur - interval '1 month')::date;
  admin_id uuid; emp_id uuid;
  it text := 'ZZTEST-MKT-ITEM';
  n int; p numeric; c numeric; msg text; log text := '';
  hist_before int; econ_before int;
BEGIN
  SELECT id INTO admin_id FROM public.profiles WHERE role_type='admin' LIMIT 1;
  SELECT id INTO emp_id FROM public.profiles WHERE role_type NOT IN ('admin','manager','sales_manager') AND role_type IS NOT NULL LIMIT 1;
  IF admin_id IS NULL OR emp_id IS NULL THEN RAISE EXCEPTION 'FAIL: need an admin and a non-management profile'; END IF;
  SELECT count(*) INTO hist_before FROM public.product_economics_history;
  SELECT count(*) INTO econ_before FROM public.product_economics;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 1) سعر مختلف لكل سوق
  PERFORM public.profitability_save_market_price(it,'syria', 10, 3, NULL, cur, 'zz');
  PERFORM public.profitability_save_market_price(it,'turkey',12, NULL, NULL, cur, 'zz');
  SELECT sale_price_usd INTO p FROM public.product_market_prices WHERE item_name=it AND market='syria' AND effective_from=cur;
  IF p <> 10 THEN RAISE EXCEPTION 'FAIL: syria price %', p; END IF;
  SELECT sale_price_usd INTO p FROM public.product_market_prices WHERE item_name=it AND market='turkey' AND effective_from=cur;
  IF p <> 12 THEN RAISE EXCEPTION 'FAIL: turkey price %', p; END IF;
  SELECT count(*) INTO n FROM public.product_market_prices WHERE item_name=it AND market='uae';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: uae must have no row'; END IF;
  log := log || 'T1 ok; ';

  -- 4) إعادة حفظ نفس الشهر = تحديث نفس الصف (بلا تكرار) و2) تغيير سوريا لا يغيّر تركيا
  PERFORM public.profitability_save_market_price(it,'syria', 11, NULL, NULL, cur, 'zz');
  SELECT count(*) INTO n FROM public.product_market_prices WHERE item_name=it AND market='syria' AND effective_from=cur;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: duplicate syria rows %', n; END IF;
  SELECT sale_price_usd, cost_usd INTO p, c FROM public.product_market_prices WHERE item_name=it AND market='syria' AND effective_from=cur;
  IF p <> 11 OR c <> 3 THEN RAISE EXCEPTION 'FAIL: syria resave price=% cost=% (cost must be kept)', p, c; END IF;
  SELECT sale_price_usd INTO p FROM public.product_market_prices WHERE item_name=it AND market='turkey' AND effective_from=cur;
  IF p <> 12 THEN RAISE EXCEPTION 'FAIL: turkey changed by syria edit: %', p; END IF;
  log := log || 'T2,T4 ok; ';

  -- 3) سعر شهر قادم لا يغيّر الشهر الحالي؛ والتكلفة تُورَّث
  PERFORM public.profitability_save_market_price(it,'syria', 15, NULL, NULL, nxt, 'zz');
  SELECT sale_price_usd, cost_usd INTO p, c FROM public.product_market_prices WHERE item_name=it AND market='syria' AND effective_from=cur;
  IF p <> 11 OR c <> 3 THEN RAISE EXCEPTION 'FAIL: current month changed by next month save'; END IF;
  SELECT sale_price_usd, cost_usd INTO p, c FROM public.product_market_prices WHERE item_name=it AND market='syria' AND effective_from=nxt;
  IF p <> 15 OR c <> 3 THEN RAISE EXCEPTION 'FAIL: next month price=% cost=% (cost must be inherited)', p, c; END IF;
  log := log || 'T3 ok; ';

  -- 5) تغيير سعر البيع وحده لا يغيّر التكلفة التاريخية (صف الشهر الحالي ما زال 3)
  SELECT cost_usd INTO c FROM public.product_market_prices WHERE item_name=it AND market='syria' AND effective_from=cur;
  IF c <> 3 THEN RAISE EXCEPTION 'FAIL: historical cost changed'; END IF;
  log := log || 'T5 ok; ';

  -- ماضٍ مرفوض
  BEGIN
    PERFORM public.profitability_save_market_price(it,'syria', 99, NULL, NULL, prv, 'zz');
    RAISE EXCEPTION 'FAIL: past month accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
    IF msg LIKE 'FAIL:%' THEN RAISE; END IF;
    IF msg NOT LIKE 'past months are never rewritten%' THEN RAISE EXCEPTION 'FAIL: wrong past-month error: %', msg; END IF;
  END;
  -- سوق غير صالح / سالب
  BEGIN PERFORM public.profitability_save_market_price(it,'ksa', 1, NULL, NULL, cur, 'zz'); RAISE EXCEPTION 'FAIL: bad market accepted';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT; IF msg LIKE 'FAIL:%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.profitability_save_market_price(it,'uae', -1, NULL, NULL, cur, 'zz'); RAISE EXCEPTION 'FAIL: negative accepted';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT; IF msg LIKE 'FAIL:%' THEN RAISE; END IF; END;
  log := log || 'guards ok; ';

  -- لا حذف ولا تعديل مباشر لسجل الماضي بدون سياسة: DELETE ممنوع
  BEGIN
    DELETE FROM public.product_market_prices WHERE item_name=it;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE EXCEPTION 'FAIL: delete allowed (% rows)', n; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  log := log || 'no-delete ok; ';

  -- الأسعار الموحّدة لم تُمسّ
  RESET ROLE;
  IF (SELECT count(*) FROM public.product_economics_history) <> hist_before OR (SELECT count(*) FROM public.product_economics) <> econ_before THEN
    RAISE EXCEPTION 'FAIL: unified economics tables were touched';
  END IF;
  log := log || 'unified untouched; ';

  -- موظف عادي مرفوض
  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp_id, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.profitability_save_market_price(it,'syria', 5, NULL, NULL, cur, 'zz'); RAISE EXCEPTION 'FAIL: employee write accepted';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT; IF msg LIKE 'FAIL:%' THEN RAISE; END IF; END;
  SELECT count(*) INTO n FROM public.product_market_prices;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: employee can read % rows', n; END IF;
  log := log || 'employee denied; ';
  RESET ROLE;

  -- anon: لا تنفيذ
  SET LOCAL ROLE anon;
  BEGIN PERFORM public.profitability_save_market_price(it,'syria', 5, NULL, NULL, cur, 'zz'); RAISE EXCEPTION 'FAIL: anon executed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  log := log || 'anon denied';

  RAISE EXCEPTION 'ROLLBACK_OK %', log;
END $$;
