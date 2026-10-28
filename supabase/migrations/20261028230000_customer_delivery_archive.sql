-- Customer archive must be based on delivered orders only.
-- Keep the same output shape as customer_stats so the existing cards can be reused.
create or replace view public.customer_delivery_stats
with (security_invoker = true)
as
select
  regexp_replace(coalesce(phone_1, ''), '\D', '', 'g') as phone_key,
  (array_agg(customer_name order by order_date desc nulls last))[1] as name,
  (array_agg(city order by order_date desc nulls last))[1] as city,
  (array_agg(phone_1 order by order_date desc nulls last))[1] as phone,
  count(*) as orders_count,
  array_agg(distinct handler_name) filter (where handler_name is not null and handler_name <> '') as sellers,
  (array_agg(handler_name order by order_date desc nulls last))[1] as last_seller,
  array_agg(distinct market) filter (where market is not null) as markets,
  array_agg(distinct brand) filter (where brand is not null) as brands,
  min(order_date) as first_order,
  max(order_date) as last_order,
  coalesce(sum(amount) filter (where currency = 'SYP'), 0) as total_syp,
  coalesce(sum(amount) filter (where currency = 'USD'), 0) as total_usd,
  coalesce(sum(amount) filter (where currency = 'TRY'), 0) as total_try,
  case
    when count(*) >= 10 then 3
    when count(*) >= 5 then 2
    when count(*) >= 2 then 1
    else 0
  end as stars,
  coalesce(sum(amount) filter (where currency = 'AED'), 0) as total_aed
from public.orders
where status = 'delivered'
  and phone_1 is not null
  and regexp_replace(coalesce(phone_1, ''), '\D', '', 'g') <> ''
group by regexp_replace(coalesce(phone_1, ''), '\D', '', 'g');

revoke all on public.customer_delivery_stats from anon, public;
grant select on public.customer_delivery_stats to authenticated;

-- Optional follow-up scheduling is stored on the existing customer note timeline.
alter table public.customer_notes
  add column if not exists follow_up_at timestamptz;

-- Keep the notes table least-privilege after adding the new optional insert column.
revoke all on table public.customer_notes from public, anon, authenticated;
grant select on table public.customer_notes to authenticated;
grant insert (phone_key, note, author, follow_up_at) on table public.customer_notes to authenticated;
