-- Rollback of 20261026_wh_functions_authz.sql: restores the four function bodies exactly as captured from production on 2026-10-25
-- (no authorisation, EXECUTE open to anon/authenticated). Only use if the app cannot work without anon access to stock functions.
create or replace function public.wh_apply_stock_delta(p_warehouse uuid, p_product uuid, p_delta integer)
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare new_qty int;
begin
  if p_warehouse is null or p_product is null or p_delta is null then
    raise exception 'warehouse, product and delta are required';
  end if;
  select quantity into new_qty from wh_stock
   where warehouse_id = p_warehouse and product_id = p_product
   for update;
  new_qty := coalesce(new_qty, 0) + p_delta;
  if new_qty < 0 then
    raise exception 'stock cannot become negative';
  end if;
  insert into wh_stock (warehouse_id, product_id, quantity, updated_at)
  values (p_warehouse, p_product, new_qty, now())
  on conflict (warehouse_id, product_id)
  do update set quantity = excluded.quantity, updated_at = now();
  return new_qty;
end;
$function$;

create or replace function public.wh_transfer_stock(p_from uuid, p_to uuid, p_product uuid, p_qty integer)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare from_qty int;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'qty must be > 0'; end if;
  if p_from = p_to then raise exception 'source and destination are the same'; end if;
  select quantity into from_qty from wh_stock where warehouse_id = p_from and product_id = p_product for update;
  from_qty := coalesce(from_qty, 0);
  if from_qty < p_qty then raise exception 'insufficient stock: have %, need %', from_qty, p_qty; end if;
  perform public.wh_apply_stock_delta(p_from, p_product, -p_qty);
  perform public.wh_apply_stock_delta(p_to, p_product, p_qty);
end; $function$;

create or replace function public.wh_sync_order_stock(p_order_id uuid, p_warehouse uuid, p_lines jsonb, p_should_be_out boolean, p_performed_by text DEFAULT NULL::text, p_release_reason text DEFAULT NULL::text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  line jsonb; pid uuid; target_qty int; current_qty int; stock_qty int; delta int; changed int := 0;
begin
  if p_order_id is null or p_warehouse is null then
    raise exception 'order and warehouse are required';
  end if;
  if exists (select 1 from public.wh_return_cases
              where order_id = p_order_id
                and status in ('in_transit','received','inspected','quarantine','damaged')) then
    return jsonb_build_object('ok', true, 'changed_products', 0, 'skipped', 'return_case_open');
  end if;
  perform 1 from wh_movements where order_id = p_order_id for update;
  create temporary table if not exists _wh_order_target (product_id uuid primary key, target_qty int not null) on commit drop;
  truncate _wh_order_target;
  if p_should_be_out and jsonb_typeof(p_lines) = 'array' then
    for line in select value from jsonb_array_elements(p_lines) loop
      pid := nullif(line->>'productId', '')::uuid;
      target_qty := greatest(coalesce((line->>'qty')::int, 0), 0);
      if pid is not null and target_qty > 0 then
        insert into _wh_order_target(product_id, target_qty) values (pid, target_qty)
        on conflict (product_id) do update set target_qty = _wh_order_target.target_qty + excluded.target_qty;
      end if;
    end loop;
  end if;
  for pid in
    select product_id from wh_movements where order_id = p_order_id
    union
    select product_id from _wh_order_target
  loop
    select coalesce(sum(case when type = 'reserve' then quantity else -quantity end), 0)
      into current_qty from wh_movements
     where order_id = p_order_id and product_id = pid and type in ('reserve', 'release')
       and ((type = 'reserve' and from_warehouse_id = p_warehouse) or (type = 'release' and to_warehouse_id = p_warehouse));
    select coalesce(t.target_qty, 0) into target_qty from (select 1) s left join _wh_order_target t on t.product_id = pid;
    delta := target_qty - current_qty;
    if delta = 0 then continue; end if;
    select quantity into stock_qty from wh_stock where warehouse_id = p_warehouse and product_id = pid for update;
    stock_qty := coalesce(stock_qty, 0);
    if delta > 0 then
      if stock_qty < delta then
        raise exception 'insufficient stock for order %, product %: have %, need %', p_order_id, pid, stock_qty, delta;
      end if;
      perform public.wh_apply_stock_delta(p_warehouse, pid, -delta);
      insert into wh_movements(product_id, from_warehouse_id, to_warehouse_id, quantity, type, reason, performed_by, order_id)
      values (pid, p_warehouse, null, delta, 'reserve', 'حجز طلب ذري', p_performed_by, p_order_id);
    else
      perform public.wh_apply_stock_delta(p_warehouse, pid, -delta);
      insert into wh_movements(product_id, from_warehouse_id, to_warehouse_id, quantity, type, reason, performed_by, order_id)
      values (pid, null, p_warehouse, abs(delta), 'release', coalesce(p_release_reason, 'استرداد طلب ذري'), p_performed_by, p_order_id);
    end if;
    changed := changed + 1;
  end loop;
  return jsonb_build_object('ok', true, 'changed_products', changed);
end;
$function$;

create or replace function public.wh_register_order_return(p_order_id uuid, p_warehouse uuid, p_items jsonb, p_stage text, p_performed_by text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  c public.wh_return_cases%rowtype;
  next_status text;
begin
  if p_order_id is null or p_warehouse is null then
    raise exception 'order and warehouse are required';
  end if;
  next_status := case when p_stage = 'received' then 'received' else 'in_transit' end;
  select * into c from public.wh_return_cases where order_id = p_order_id for update;
  if not found then
    insert into public.wh_return_cases(order_id, warehouse_id, status, items, reason, received_at, received_by)
    values (p_order_id, p_warehouse, next_status, coalesce(p_items, '[]'::jsonb), p_reason,
            case when next_status = 'received' then now() end,
            case when next_status = 'received' then p_performed_by end)
    on conflict (order_id) do nothing
    returning * into c;
    if found then
      insert into public.wh_return_events(case_id, order_id, from_status, to_status, performed_by, notes)
      values (c.id, p_order_id, null, next_status, p_performed_by, p_reason);
      return jsonb_build_object('ok', true, 'status', next_status);
    end if;
    select * into c from public.wh_return_cases where order_id = p_order_id for update;
  end if;
  if c.status in ('in_transit','received') then
    update public.wh_return_cases set
      items = case when jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 0 then p_items else items end,
      reason = coalesce(p_reason, reason),
      status = case when c.status = 'in_transit' and next_status = 'received' then 'received' else c.status end,
      received_at = case when c.status = 'in_transit' and next_status = 'received' then now() else received_at end,
      received_by = case when c.status = 'in_transit' and next_status = 'received' then p_performed_by else received_by end,
      updated_at = now()
    where id = c.id;
    if c.status = 'in_transit' and next_status = 'received' then
      insert into public.wh_return_events(case_id, order_id, from_status, to_status, performed_by, notes)
      values (c.id, p_order_id, 'in_transit', 'received', p_performed_by, p_reason);
      return jsonb_build_object('ok', true, 'status', 'received');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'status', c.status);
end;
$function$;

drop function if exists public._wh_apply_stock_delta_internal(uuid, uuid, integer);
grant execute on function public.wh_apply_stock_delta(uuid, uuid, integer),
  public.wh_transfer_stock(uuid, uuid, uuid, integer),
  public.wh_sync_order_stock(uuid, uuid, jsonb, boolean, text, text),
  public.wh_register_order_return(uuid, uuid, jsonb, text, text, text) to public, anon, authenticated, service_role;
