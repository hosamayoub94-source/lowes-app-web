-- 20261030_d175_verify_readonly.sql — READ ONLY. Run before and after applying D-175; paste both results into the decision register.
-- Uses aclexplode so Postgres 17's MAINTAIN privilege is visible too (information_schema hides it).
-- Expected AFTER: no policy with qual/with_check = true for INSERT/UPDATE/DELETE/ALL on the four tables; anon has only SELECT on
-- commission_rules / monthly_commission_adjustments and nothing on exchange_rates / order_status_history; authenticated has no
-- TRUNCATE/REFERENCES/TRIGGER; order_status_history and exchange_rates only INSERT+SELECT (+MAINTAIN, untouched by D-175).
select 'policy' k, tablename||' | '||policyname||' | '||cmd||' | '||array_to_string(roles,',')||' | using='||coalesce(left(regexp_replace(qual,'\s+',' ','g'),80),'-')||' | check='||coalesce(left(regexp_replace(with_check,'\s+',' ','g'),80),'-') v
  from pg_policies where schemaname='public' and tablename in ('commission_rules','monthly_commission_adjustments','exchange_rates','order_status_history')
union all
select 'grant', c.relname||' | '||coalesce(r.rolname,'PUBLIC')||' | '||string_agg(x.privilege_type, ',' order by x.privilege_type)
  from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x left join pg_roles r on r.oid = x.grantee
 where c.relnamespace = 'public'::regnamespace and c.relname in ('commission_rules','monthly_commission_adjustments','exchange_rates','order_status_history')
   and coalesce(r.rolname,'PUBLIC') in ('anon','authenticated','PUBLIC')
 group by c.relname, r.rolname
order by 1, 2;
