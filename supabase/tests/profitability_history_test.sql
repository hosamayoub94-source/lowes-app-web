-- Rolled-back DB test for the profitability price history + RLS.
-- Run on fghdumrgimoeqsafdhhh (e.g. Supabase SQL editor / MCP execute_sql). It ALWAYS ends with
-- RAISE EXCEPTION so nothing it writes is kept; synthetic item names start with ZZTEST-.
DO $$
DECLARE
  v_month date := date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul'))::date;
  v_prev date := (date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul')) - interval '1 month')::date;
  r date; n int; sep_price numeric; cur_price numeric; cur_cost numeric; prev_checksum text; prev_checksum2 text;
  real_before int; real_after int; neg_blocked boolean := false; emp uuid; adm uuid;
  emp_sees int; emp_write text := 'ok'; adm_sees int; anon_state text; anon_rpc text := 'ok'; out text := '';
BEGIN
  SELECT count(*) INTO real_before FROM product_economics_history WHERE item_name NOT LIKE 'ZZTEST-%';

  -- A) item priced last month; change price+cost this month
  INSERT INTO product_economics_history (item_name, effective_from, sale_price_usd, cost_usd, source) VALUES ('ZZTEST-P', v_prev, 10, 4, 'entered');
  SELECT md5(string_agg(effective_from::text||sale_price_usd||cost_usd, ',' ORDER BY effective_from)) INTO prev_checksum FROM product_economics_history WHERE item_name='ZZTEST-P' AND effective_from < v_month;
  r := profitability_save_economics('ZZTEST-P', 12, 5, NULL, NULL);
  SELECT sale_price_usd INTO sep_price FROM product_economics_history WHERE item_name='ZZTEST-P' AND effective_from = v_prev;
  SELECT sale_price_usd, cost_usd INTO cur_price, cur_cost FROM product_economics_history WHERE item_name='ZZTEST-P' AND effective_from = v_month;
  out := out || format('A: target=%s(expect %s) prev_month_price=%s(10) this_month=%s/%s(12/5) rows=%s(2)', r, v_month, sep_price, cur_price, cur_cost, (SELECT count(*) FROM product_economics_history WHERE item_name='ZZTEST-P'));

  -- B) re-save same values twice, then a new value in the same month: still one row per month, past untouched
  PERFORM profitability_save_economics('ZZTEST-P', 12, 5, NULL, NULL);
  PERFORM profitability_save_economics('ZZTEST-P', 12, 5, NULL, NULL);
  n := (SELECT count(*) FROM product_economics_history WHERE item_name='ZZTEST-P');
  PERFORM profitability_save_economics('ZZTEST-P', 13, NULL, NULL, NULL);
  SELECT sale_price_usd, cost_usd INTO cur_price, cur_cost FROM product_economics_history WHERE item_name='ZZTEST-P' AND effective_from = v_month;
  SELECT md5(string_agg(effective_from::text||sale_price_usd||cost_usd, ',' ORDER BY effective_from)) INTO prev_checksum2 FROM product_economics_history WHERE item_name='ZZTEST-P' AND effective_from < v_month;
  out := out || format(E'\nB: rows_after_two_resaves=%s(2) this_month_after_edit=%s/%s(13/5 partial keeps cost) past_rows_unchanged=%s(true) dup_keys=%s(0)', n, cur_price, cur_cost, prev_checksum = prev_checksum2,
         (SELECT count(*) FROM (SELECT item_name, effective_from FROM product_economics_history WHERE item_name='ZZTEST-P' GROUP BY 1,2 HAVING count(*)>1) d));

  -- C) brand-new item (no history, no econ row): first entry lands on the CURRENT month only, never retroactive
  r := profitability_save_economics('ZZTEST-NEW', 5, 2, 0, 0);
  out := out || format(E'\nC: target=%s(expect %s) rows_before_current_month=%s(0)', r, v_month, (SELECT count(*) FROM product_economics_history WHERE item_name='ZZTEST-NEW' AND effective_from < v_month));

  -- D) validation
  BEGIN PERFORM profitability_save_economics('ZZTEST-NEG', -1, 1, 0, 0); EXCEPTION WHEN others THEN neg_blocked := true; END;
  out := out || format(E'\nD: negative_blocked=%s(true)', neg_blocked);

  -- E) existing production history never touched by the test
  SELECT count(*) INTO real_after FROM product_economics_history WHERE item_name NOT LIKE 'ZZTEST-%';
  out := out || format(E'\nE: real_rows_before=%s after=%s (equal)', real_before, real_after);

  -- F) RLS + execute grants
  SELECT id INTO emp FROM profiles WHERE role_type='employee' LIMIT 1;
  SELECT id INTO adm FROM profiles WHERE role_type='admin' LIMIT 1;
  INSERT INTO profitability_expenses(month,market,category,amount_usd,notes) VALUES (v_month,'all','ZZTEST-rls',1,'ZZTEST');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',emp,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO emp_sees FROM profitability_expenses;
  BEGIN INSERT INTO profitability_expenses(month,market,category,amount_usd) VALUES (v_month,'all','x',1); EXCEPTION WHEN others THEN emp_write := 'blocked'; END;
  BEGIN PERFORM profitability_save_economics('ZZTEST-EMP', 1, 1, 0, 0); out := out || E'\nF: employee_rpc=EXECUTED(!)'; EXCEPTION WHEN others THEN out := out || E'\nF: employee_rpc=blocked(ok)'; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO adm_sees FROM profitability_expenses WHERE category='ZZTEST-rls';
  RESET ROLE;
  SET LOCAL ROLE anon;
  BEGIN PERFORM count(*) FROM profitability_expenses; anon_state := 'readable(!)'; EXCEPTION WHEN others THEN anon_state := 'denied(ok)'; END;
  BEGIN PERFORM count(*) FROM product_economics_history; anon_state := anon_state || ' / history readable(!)'; EXCEPTION WHEN others THEN anon_state := anon_state || ' / history denied(ok)'; END;
  BEGIN PERFORM profitability_save_economics('ZZTEST-ANON', 1, 1, 0, 0); anon_rpc := 'EXECUTED(!)'; EXCEPTION WHEN others THEN anon_rpc := 'denied(ok)'; END;
  RESET ROLE;
  out := out || format(E'\nF: employee_sees=%s(0) employee_write=%s(blocked) admin_sees=%s(1) anon=%s anon_rpc=%s', emp_sees, emp_write, adm_sees, anon_state, anon_rpc);

  RAISE EXCEPTION E'RESULT\n%', out;
END $$;
