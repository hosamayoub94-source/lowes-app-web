-- 20261027_anon_lockdown_b0_special.sql
-- The four tables the app legitimately touches BEFORE login, with the minimum anon access they need. Everything else of anon is removed.
--   profiles          : the login picker lists names/roles -> SELECT of 11 non-sensitive columns only (no salary, phone, PIN, face data, balances);
--                       no INSERT/UPDATE/DELETE at all (the profiles guard trigger stays as defence in depth for authenticated users).
--   activity_logs     : failed/successful login events are written before a session exists -> INSERT, and SELECT of `id` only (insert().select('id')).
--   mlm_join_requests : the public join form -> INSERT only.
--   orders            : (a) the public tracking page /track/:code (b) the Google Apps Script tracker read these nine columns directly.
--                       Customer phone/address/amount/items are no longer reachable. Transitional: both callers move to an RPC later.
-- Exact rollback: select public.security_restore_anon('b0');
select public.security_revoke_anon('b0', array['profiles', 'activity_logs', 'mlm_join_requests', 'orders']);

grant select (id, employee_name, role_type, team, manager_scope, avatar_url, is_active, order_role, order_market, extra_permissions, denied_permissions)
  on public.profiles to anon;
grant insert on public.activity_logs to anon;
grant select (id) on public.activity_logs to anon;
grant insert on public.mlm_join_requests to anon;
grant select (order_id, status, market, archived, deleted_at, shipping_company, tracking_number, customer_name, updated_at)
  on public.orders to anon;

-- anon-callable SECURITY DEFINER lookups that return whole order rows: signed-in users only.
revoke execute on function public.get_customer_orders_by_key(text) from public, anon;
grant execute on function public.get_customer_orders_by_key(text) to authenticated, service_role;
