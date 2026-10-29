-- 20261030_d175_verify_readonly.sql — READ ONLY. Run before and after applying D-175; paste both results into the decision register.
-- Expected AFTER: no policy with qual/with_check = true for INSERT/UPDATE/DELETE/ALL on the four tables; anon has only SELECT on
-- commission_rules / monthly_commission_adjustments / exchange_rates and nothing on order_status_history; authenticated has no
-- TRUNCATE/REFERENCES/TRIGGER, order_status_history only INSERT+SELECT, exchange_rates only INSERT+SELECT.
select 'policy' k, tablename||' | '||policyname||' | '||cmd||' | '||roles::text||' | using='||coalesce(left(regexp_replace(qual,'\s+',' ','g'),80),'-')||' | check='||coalesce(left(regexp_replace(with_check,'\s+',' ','g'),80),'-') v
  from pg_policies where schemaname='public' and tablename in ('commission_rules','monthly_commission_adjustments','exchange_rates','order_status_history')
union all
select 'grant', table_name||' | '||grantee||' | '||string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated')
   and table_name in ('commission_rules','monthly_commission_adjustments','exchange_rates','order_status_history') group by table_name, grantee
order by 1, 2;
