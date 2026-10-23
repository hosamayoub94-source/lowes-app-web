-- READ-ONLY. Run BEFORE and AFTER applying 20261024_phaseA_anon_sensitive_lockdown.sql and compare.
-- Writes nothing. Safe to run any number of times. (Run it as one statement.)
--
-- Expected AFTER phase A:
--   acl_md5 / policies_md5 change (that is the point);  audit_old_md5 and the data hashes are IDENTICAL;
--   anon_open_sensitive = 0;  anon_open_total drops by the number of sensitive tables that were open.
with sens(t) as (values
 ('monthly_payroll'),('daily_sales_reports'),('sales_orders'),('purchase_orders'),('finance_ledger_migrated_20260607'),('mystery_shopper'),
 ('commissions'),('customer_contacts'),('customers'),('daily_sales_ad_results'),('delivery_results'),('leads'),('monthly_sales_records'),
 ('product_variants'),('report_other_sales'),('shipments'),('expenses'),('income'),('price_violations'),('purchase_order_items'),('sales_notes'),
 ('sales_order_items'),('warehouses'),('ad_results'),('advance_requests'),('bonus_settings'),('bonuses'),('customer_notes'),('deal_activities'),
 ('deals'),('employee_kpis'),('employee_requests'),('employees'),('followups'),('leave_balances'),('otp_codes'),('performance_scores'),
 ('requests'),('salary_deductions'),('stock_movements'),('user_sessions'),('app_settings'),('backup_log'),('commission_config'),
 ('exchange_rates'),('messages'),('network_audit'),('push_subscriptions'),('sales_targets'),('sales_value_summary'),('system_settings'),
 ('wh_stock'),('audit_log')),
rel as (select c.oid, c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m'))
select
 now() as taken_at,
 -- privileges + policies fingerprint (changes when ACLs/policies change)
 (select md5(string_agg(x, '|' order by x)) from (
    select r.relname||':'||pg_get_userbyid(a.grantee)||'='||a.privilege_type x
      from rel r join pg_class c on c.oid = r.oid cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    union all
    select r.relname||'.'||at.attname||':'||pg_get_userbyid(a.grantee)||'='||a.privilege_type
      from rel r join pg_attribute at on at.attrelid = r.oid cross join lateral aclexplode(at.attacl) a where at.attacl is not null and at.attnum > 0
  ) z) as acl_md5,
 (select md5(string_agg(tablename||':'||policyname||':'||cmd||':'||roles::text||':'||coalesce(qual,'')||':'||coalesce(with_check,''), '|' order by tablename, policyname))
    from pg_policies where schemaname = 'public') as policies_md5,
 -- how many sensitive objects anon can still touch (table-level or any column)
 (select count(*) from rel r join sens s on s.t = r.relname
   where has_any_column_privilege('anon', r.oid, 'select,insert,update,references') or has_table_privilege('anon', r.oid, 'delete,truncate,trigger')) as anon_open_sensitive,
 (select count(*) from rel r where r.relname <> 'x'
   and (has_any_column_privilege('anon', r.oid, 'select,insert,update') or has_table_privilege('anon', r.oid, 'delete'))) as anon_open_total,
 -- audit_log: the 22 original rows (ids/created_at before 2026-05-22) must be byte-identical
 (select count(*) from public.audit_log where created_at <= '2026-05-21 14:52:06.683002+00') as audit_old_rows,
 (select md5(string_agg(to_jsonb(a)::text, '|' order by a.id::text)) from public.audit_log a where a.created_at <= '2026-05-21 14:52:06.683002+00') as audit_old_md5,
 -- payroll / finance data must be untouched (grants-only migration). NOTE: live tables change during the day,
 -- so compare the SAME minute: run BEFORE then apply then AFTER within a short window.
 (select jsonb_build_object('n', count(*), 'md5', md5(string_agg(to_jsonb(x)::text, '|' order by x.id::text))) from public.payroll_runs x) as payroll_runs,
 (select jsonb_build_object('n', count(*), 'md5', md5(string_agg(to_jsonb(x)::text, '|' order by x.id::text))) from public.payroll_entries x) as payroll_entries,
 (select jsonb_build_object('n', count(*), 'md5', md5(string_agg(to_jsonb(x)::text, '|' order by x.id::text))) from public.employee_salary_settings x) as salary_settings,
 (select jsonb_build_object('n', count(*), 'md5', md5(string_agg(to_jsonb(x)::text, '|' order by x.id::text))) from public.payroll_allowances x) as payroll_allowances,
 (select jsonb_build_object('n', count(*), 'md5', md5(string_agg(to_jsonb(x)::text, '|' order by x.id::text))) from public.payroll_absence_reviews x) as absence_reviews,
 (select jsonb_build_object('n', count(*), 'md5', md5(string_agg(to_jsonb(x)::text, '|' order by x.id::text))) from public.monthly_payroll x) as monthly_payroll,
 (select jsonb_build_object('n', count(*), 'md5', md5(string_agg(to_jsonb(x)::text, '|' order by x.id::text))) from public.accounting_entries x) as accounting_entries,
 (select jsonb_build_object('n', count(*), 'md5', md5(string_agg(to_jsonb(x)::text, '|' order by x.id::text))) from public.finance_ledger_migrated_20260607 x) as finance_ledger_migrated,
 (select jsonb_build_object('n', count(*), 'md5', md5(string_agg(to_jsonb(x)::text, '|' order by x.id::text))) from public.expenses x) as expenses,
 (select jsonb_build_object('n', count(*), 'md5', md5(string_agg(to_jsonb(x)::text, '|' order by x.id::text))) from public.income x) as income;
