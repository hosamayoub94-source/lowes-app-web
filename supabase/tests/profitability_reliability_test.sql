-- Rolled-back DB test for migration 20261018100000/110000 (history sources, delivery basis, returns, FX, closures, versioned saves).
-- Run on fghdumrgimoeqsafdhhh. It ALWAYS ends with RAISE EXCEPTION so nothing it writes is kept.
-- Synthetic orders use order_id 'ZZT-%' in November 2026 (a month with no real orders); a real order is only
-- READ (to attach history-source probes) inside the same rolled-back transaction.
DO $$
DECLARE
  adm uuid; v_out text := ''; r record; n int; real_ord uuid; pid uuid; wh uuid;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid; s5b uuid; s7 uuid; s8 uuid; s9 uuid; s10 uuid;
  v_cur date := date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul'))::date;
  ok_cnt int := 0; bad_src boolean := false; src text;
BEGIN
  SELECT id INTO adm FROM profiles WHERE role_type = 'admin' LIMIT 1;
  SELECT id INTO real_ord FROM orders WHERE deleted_at IS NULL LIMIT 1;

  -- 1) every legitimate history source inserts; an invented one is rejected by the CHECK
  FOREACH src IN ARRAY ARRAY['app','sheet','yurtici','star','babel','babel_webhook','karam','ptt'] LOOP
    INSERT INTO order_status_history(order_id, from_status, to_status, changed_by, source) VALUES (real_ord, 'a', 'b', 'ZZT', src);
    ok_cnt := ok_cnt + 1;
  END LOOP;
  BEGIN INSERT INTO order_status_history(order_id, from_status, to_status, changed_by, source) VALUES (real_ord, 'a', 'b', 'ZZT', 'invented'); EXCEPTION WHEN check_violation THEN bad_src := true; END;
  v_out := v_out || format('1: legit_sources_inserted=%s(8) invented_rejected=%s(true)', ok_cnt, bad_src);

  -- 2) synthetic orders in Nov 2026
  INSERT INTO orders(customer_name, market, order_id, order_date, status, items, amount, currency, updated_by, tracking_number, updated_at)
  VALUES ('ZZT','turkey','ZZT-1','2026-11-01T10:00:00+03','delivered','[{"name":"x","qty":1}]',1,'TRY','u',NULL,'2026-11-09T10:00:00+03') RETURNING id INTO s1;
  INSERT INTO orders(customer_name, market, order_id, order_date, status, items, amount, currency, updated_by, tracking_number, updated_at)
  VALUES ('ZZT','turkey','ZZT-2','2026-11-01T10:00:00+03','delivered','[{"name":"x","qty":1}]',1,'TRY','u',NULL,'2026-11-09T10:00:00+03') RETURNING id INTO s2;
  INSERT INTO orders(customer_name, market, order_id, order_date, status, items, amount, currency, updated_by, tracking_number, updated_at)
  VALUES ('ZZT','syria','ZZT-3','2026-11-01T10:00:00+03','delivered','[{"name":"x","qty":1}]',1,'USD','u',NULL,'2026-11-09T10:00:00+03') RETURNING id INTO s3;
  INSERT INTO orders(customer_name, market, order_id, order_date, status, items, amount, currency, updated_by, tracking_number, updated_at)
  VALUES ('ZZT','syria','ZZT-4','2026-11-01T10:00:00+03','delivered','[{"name":"x","qty":1}]',1,'USD','الكرم-تلقائي','ZZTRK-4','2026-11-12T10:00:00+03') RETURNING id INTO s4;
  INSERT INTO orders(customer_name, market, order_id, order_date, status, items, amount, currency, updated_by, tracking_number, updated_at)
  VALUES ('ZZT','syria','ZZT-5','2026-11-01T10:00:00+03','delivered','[{"name":"x","qty":1}]',1,'USD','الكرم-تلقائي','ZZTRK-5','2026-11-12T10:00:00+03') RETURNING id INTO s5;
  INSERT INTO orders(customer_name, market, order_id, order_date, status, items, amount, currency, updated_by, tracking_number, updated_at)
  VALUES ('ZZT','syria','ZZT-5b','2026-11-01T10:00:00+03','delivered','[{"name":"x","qty":1}]',1,'USD','u','ZZTRK-5','2026-11-12T10:00:00+03') RETURNING id INTO s5b;
  INSERT INTO orders(customer_name, market, order_id, order_date, status, items, amount, currency, updated_by, tracking_number, updated_at)
  VALUES ('ZZT','syria','ZZT-7','2026-11-01T10:00:00+03','delivered','[{"name":"x","qty":1}]',1,'USD','u',NULL,'2026-11-20T10:00:00+03') RETURNING id INTO s7;
  INSERT INTO orders(customer_name, market, order_id, order_date, status, items, amount, currency, updated_by, tracking_number, updated_at)
  VALUES ('ZZT','turkey','ZZT-8','2026-11-01T10:00:00+03','returned','[{"name":"x","qty":2}]',1,'TRY','u',NULL,'2026-11-25T10:00:00+03') RETURNING id INTO s8;
  INSERT INTO orders(customer_name, market, order_id, order_date, status, items, amount, currency, updated_by, tracking_number, updated_at)
  VALUES ('ZZT','turkey','ZZT-10','2026-11-01T10:00:00+03','returned','[{"name":"x","qty":2}]',1,'TRY','u',NULL,'2026-11-25T10:00:00+03') RETURNING id INTO s10;

  INSERT INTO order_status_history(order_id, from_status, to_status, changed_by, source, changed_at) VALUES
    (s1,'on_way','delivered','t','yurtici','2026-11-03T09:00:00+03'),
    (s2,'on_way','delivered','t','sheet','2026-11-04T09:00:00+03'),
    (s3,'shipped','delivered','t','app','2026-11-05T09:00:00+03'),
    (s7,'shipped','delivered','t','app','2026-11-05T09:00:00+03'),
    (s8,'on_way','delivered','t','yurtici','2026-11-02T09:00:00+03'),
    (s8,'delivered','returned','t','app','2026-11-20T09:00:00+03'),
    (s10,'on_way','delivered','t','yurtici','2026-11-02T09:00:00+03'),
    (s10,'delivered','returned','t','app','2026-11-21T09:00:00+03');
  -- evidence row overrides the app event for s7 (carrier public page said 11-04)
  INSERT INTO order_delivery_evidence(order_id, delivered_at, source_kind, carrier, tracking_number, timezone_assumption, fetched_by) VALUES (s7,'2026-11-04T08:00:00+03','carrier_public_page','karam','ZZ','Asia/Damascus +03:00','ZZT');
  -- 31 orders delivered by yurtici in the SAME minute (import burst) + 31 returned in the same minute (bulk relabel)
  INSERT INTO orders(customer_name, market, order_id, order_date, status, items, amount, currency, updated_by)
    SELECT 'ZZT','turkey','ZZT-B'||g,'2026-11-01T10:00:00+03','delivered','[{"name":"x","qty":1}]',1,'TRY','u' FROM generate_series(1,31) g;
  INSERT INTO order_status_history(order_id, from_status, to_status, changed_by, source, changed_at)
    SELECT id,'on_way','delivered','t','yurtici','2026-11-10T06:46:10+00' FROM orders WHERE order_id LIKE 'ZZT-B%';
  INSERT INTO orders(customer_name, market, order_id, order_date, status, items, amount, currency, updated_by)
    SELECT 'ZZT','turkey','ZZT-R'||g,'2026-11-01T10:00:00+03','returned','[{"name":"x","qty":1}]',1,'TRY','u' FROM generate_series(1,31) g;
  INSERT INTO order_status_history(order_id, from_status, to_status, changed_by, source, changed_at)
    SELECT id,'delivered','returned','t','app','2026-11-24T22:41:05+00' FROM orders WHERE order_id LIKE 'ZZT-R%';
  INSERT INTO order_status_history(order_id, from_status, to_status, changed_by, source, changed_at)
    SELECT id,'on_way','delivered','t','sheet', timestamptz '2026-11-08T10:00:00+00' + (row_number() OVER (ORDER BY order_id)) * interval '1 minute' FROM orders WHERE order_id LIKE 'ZZT-R%';  -- one minute apart: a real tracker run never emits 30+ in one minute

  -- stock evidence: s8 fully restocked; s10 reserved only
  SELECT id INTO pid FROM products LIMIT 1; SELECT id INTO wh FROM wh_warehouses LIMIT 1;
  INSERT INTO wh_movements(product_id, to_warehouse_id, quantity, type, reason, order_id) VALUES (pid, wh, 2, 'reserve', 'حجز طلب (في التجهيز)', s8), (pid, wh, 2, 'release', 'استرداد للمخزون', s8), (pid, wh, 2, 'reserve', 'حجز طلب (في التجهيز)', s10);

  -- 3) the function as an admin
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  FOR r IN SELECT * FROM profitability_orders('2026-11-01T00:00:00+03','2026-12-01T00:00:00+03') WHERE order_code LIKE 'ZZT-%' AND order_code NOT LIKE 'ZZT-B%' AND order_code NOT LIKE 'ZZT-R%' ORDER BY order_code LOOP
    v_out := v_out || format(E'\n%s status=%s basis=%s src=%s delivered_at=%s dbr=%s ret_at=%s retbulk=%s reserve=%s restock=%s', r.order_code, r.status, r.delivery_basis, r.delivery_source, r.delivered_at, r.delivered_before_return, r.return_at, r.return_bulk_suspect, r.reserve_qty, r.restock_qty);
  END LOOP;
  SELECT count(*) INTO n FROM profitability_orders('2026-11-01T00:00:00+03','2026-12-01T00:00:00+03') WHERE order_code LIKE 'ZZT-B%' AND delivery_basis = 'unknown' AND delivery_bulk_suspect;
  v_out := v_out || format(E'\nBURST delivered: unknown+bulk=%s(31)', n);
  SELECT count(*) INTO n FROM profitability_orders('2026-11-01T00:00:00+03','2026-12-01T00:00:00+03') WHERE order_code LIKE 'ZZT-R%' AND return_bulk_suspect AND return_at IS NULL AND delivered_before_return;
  v_out := v_out || format(E'\nBURST returned: bulk_suspect+return_at_null+delivered_before=%s(31)', n);
  RESET ROLE;

  -- 4) anon / employee cannot call the function
  BEGIN SET LOCAL ROLE anon; PERFORM count(*) FROM profitability_orders('2026-11-01','2026-12-01'); v_out := v_out || E'\n4: anon_fn=EXECUTED(!)'; EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || E'\n4: anon_fn=denied(ok)'; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',(SELECT id FROM profiles WHERE role_type='employee' LIMIT 1),'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM profitability_orders('2026-11-01T00:00:00+03','2026-12-01T00:00:00+03');
  v_out := v_out || format(E'\n4: employee_rows=%s(0)', n);
  RESET ROLE;

  -- 5) closures: a closed month needs a reason; before/after is logged; FX is append-only
  INSERT INTO profitability_month_closures(month, closed_by_name, snapshot) VALUES ('2026-11-01','ZZT','{"netProfit":0}');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN INSERT INTO profitability_expenses(month,market,category,amount_usd) VALUES ('2026-11-01','all','ZZT',5); v_out := v_out || E'\n5: closed_insert_no_reason=ALLOWED(!)'; EXCEPTION WHEN OTHERS THEN v_out := v_out || E'\n5: closed_insert_no_reason=blocked(ok)'; END;
  INSERT INTO profitability_expenses(month,market,category,amount_usd,retro_reason) VALUES ('2026-11-01','all','ZZT',5,'late invoice');
  SELECT count(*) INTO n FROM profitability_retro_log WHERE month='2026-11-01' AND kind='profitability_expenses:INSERT' AND reason='late invoice' AND after IS NOT NULL AND before IS NULL;
  v_out := v_out || format(E'\n5: retro_log_insert_row=%s(1)', n);
  BEGIN PERFORM profitability_delete_expense((SELECT id FROM profitability_expenses WHERE category='ZZT' LIMIT 1), '', 'ZZT'); v_out := v_out || E'\n5: closed_delete_no_reason=ALLOWED(!)'; EXCEPTION WHEN OTHERS THEN v_out := v_out || E'\n5: closed_delete_no_reason=blocked(ok)'; END;
  PERFORM profitability_delete_expense((SELECT id FROM profitability_expenses WHERE category='ZZT' LIMIT 1), 'duplicate entry', 'ZZT');
  SELECT count(*) INTO n FROM profitability_retro_log WHERE month='2026-11-01' AND kind='profitability_expenses:DELETE' AND reason='duplicate entry' AND before IS NOT NULL AND after IS NULL;
  v_out := v_out || format(E'\n5: retro_log_delete_row=%s(1)', n);
  INSERT INTO profitability_fx_rates(month,scope,currency,units_per_usd,entered_by_name,retro_reason) VALUES ('2026-11-01','all','SYP',131,'ZZT','late rate');
  BEGIN UPDATE profitability_fx_rates SET units_per_usd = 1 WHERE entered_by_name='ZZT'; v_out := v_out || E'\n5: fx_update=ALLOWED(!)'; EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || E'\n5: fx_update=denied(ok)'; END;
  BEGIN DELETE FROM profitability_fx_rates WHERE entered_by_name='ZZT'; v_out := v_out || E'\n5: fx_delete=ALLOWED(!)'; EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || E'\n5: fx_delete=denied(ok)'; END;
  BEGIN INSERT INTO profitability_fx_rates(month,scope,currency,units_per_usd,entered_by_name) VALUES ('2026-11-01','all','TRY',0,'ZZT'); v_out := v_out || E'\n5: fx_zero_rate=ALLOWED(!)'; EXCEPTION WHEN check_violation THEN v_out := v_out || E'\n5: fx_zero_rate=rejected(ok)'; END;
  RESET ROLE;
  -- employee cannot read/write the new finance tables
  PERFORM set_config('request.jwt.claims', json_build_object('sub',(SELECT id FROM profiles WHERE role_type='employee' LIMIT 1),'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM profitability_fx_rates; v_out := v_out || format(E'\n5: employee_sees_fx=%s(0)', n);
  SELECT count(*) INTO n FROM profitability_month_closures; v_out := v_out || format(' closures=%s(0)', n);
  SELECT count(*) INTO n FROM profitability_retro_log; v_out := v_out || format(' retro=%s(0)', n);
  RESET ROLE;

  -- 6) versioned saves: previous month never touched; sync-style call as service_role; next month separate
  INSERT INTO product_economics_history(item_name, effective_from, sale_price_usd, cost_usd, source) VALUES ('ZZTEST-S', (v_cur - interval '1 month')::date, 10, 4, 'entered');
  SET LOCAL ROLE service_role;
  PERFORM profitability_save_economics('ZZTEST-S', 12, NULL, NULL, NULL);                         -- price sync, current month
  PERFORM profitability_save_economics('ZZTEST-S', 12, NULL, NULL, NULL);                         -- re-run: no duplicate
  PERFORM profitability_save_economics('ZZTEST-S', NULL, 6, NULL, NULL, (v_cur + interval '1 month')::date);   -- cost change next month
  BEGIN PERFORM profitability_save_economics('ZZTEST-S', 99, 99, NULL, NULL, (v_cur - interval '1 month')::date); v_out := v_out || E'\n6: past_month_write=ALLOWED(!)'; EXCEPTION WHEN OTHERS THEN v_out := v_out || E'\n6: past_month_write=rejected(ok)'; END;
  RESET ROLE;
  FOR r IN SELECT effective_from, sale_price_usd, cost_usd FROM product_economics_history WHERE item_name='ZZTEST-S' ORDER BY effective_from LOOP
    v_out := v_out || format(E'\n6: ZZTEST-S %s price=%s cost=%s', r.effective_from, r.sale_price_usd, r.cost_usd);
  END LOOP;
  SELECT count(*) INTO n FROM product_economics_history WHERE item_name='ZZTEST-S';
  v_out := v_out || format(E'\n6: rows=%s(3) mirror_price=%s(12) mirror_cost=%s(4: inherited from the previous version; the next-month cost 6 must NOT reach the mirror)', n, (SELECT sale_price_usd FROM product_economics WHERE item_name='ZZTEST-S'), (SELECT cost_usd FROM product_economics WHERE item_name='ZZTEST-S'));

  RAISE EXCEPTION E'RESULT\n%', v_out;
END $$;
