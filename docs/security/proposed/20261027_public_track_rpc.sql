-- 20261027_public_track_rpc.sql  (audit F-01)
-- The public tracking page (/track/:code) read the orders table directly with the public key, which is why anon needed SELECT on orders.
-- This RPC returns ONE order by its exact code and only the customer-facing fields, so the table itself can be closed to anon later
-- (20261027_anon_lockdown_b0_special.sql currently keeps nine columns open for this page + the Google Apps Script tracker).
-- Additive and safe to apply at any time; the client falls back to the old read while this function does not exist.
-- Rollback: drop function public.public_track_order(text);
create or replace function public.public_track_order(p_code text)
 returns table (order_id text, status text, shipping_company text, tracking_number text, customer_name text, market text, updated_at timestamptz)
 language sql
 stable
 security definer
 set search_path = public, pg_temp
as $$
  select o.order_id, o.status, o.shipping_company, o.tracking_number, o.customer_name, o.market, o.updated_at
    from public.orders o
   where p_code is not null and length(p_code) between 3 and 64 and o.order_id = p_code and o.deleted_at is null
   limit 1
$$;
revoke all on function public.public_track_order(text) from public;
grant execute on function public.public_track_order(text) to anon, authenticated, service_role;
