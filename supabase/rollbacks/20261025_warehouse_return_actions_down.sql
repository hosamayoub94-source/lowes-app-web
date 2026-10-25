-- Rollback for 20261025_warehouse_return_actions.sql (D-157).
-- Restores the two previous function bodies and drops the new actions.
-- wh_return_events and the added wh_return_cases columns are kept (additive,
-- append-only audit data); drop them manually only if nothing was recorded.
-- RLS / revoked table grants are intentionally NOT reverted: reopening anon
-- write access to wh_return_cases would be a security regression.

drop function if exists public.wh_receive_return(uuid, text, text);
drop function if exists public.wh_inspect_return(uuid, text, text, text);
drop function if exists public.wh_restock_return(uuid, text, text);
drop function if exists public.wh_quarantine_return(uuid, text, text);
drop function if exists public.wh_mark_return_damaged(uuid, text, text);
drop function if exists public.wh__return_step(uuid, text, text, text, text);

create or replace function public.wh_sync_order_stock(
  p_order_id uuid,
  p_warehouse uuid,
  p_lines jsonb,
  p_should_be_out boolean,
  p_performed_by text default null,
  p_release_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  line jsonb;
  pid uuid;
  target_qty int;
  current_qty int;
  stock_qty int;
  delta int;
  movement_type text;
  movement_reason text;
  changed int := 0;
begin
  if p_order_id is null or p_warehouse is null then
    raise exception 'order and warehouse are required';
  end if;

  -- Lock this order's inventory history so two status writers cannot both
  -- observe the same old balance and reserve twice.
  perform 1 from wh_movements where order_id = p_order_id for update;

  create temporary table if not exists _wh_order_target (
    product_id uuid primary key,
    target_qty int not null
  ) on commit drop;
  truncate _wh_order_target;

  if p_should_be_out and jsonb_typeof(p_lines) = 'array' then
    for line in select value from jsonb_array_elements(p_lines) loop
      pid := nullif(line->>'productId', '')::uuid;
      target_qty := greatest(coalesce((line->>'qty')::int, 0), 0);
      if pid is not null and target_qty > 0 then
        insert into _wh_order_target(product_id, target_qty)
        values (pid, target_qty)
        on conflict (product_id) do update
          set target_qty = _wh_order_target.target_qty + excluded.target_qty;
      end if;
    end loop;
  end if;

  -- Reconcile every product already touched by this order and every product
  -- currently present in the requested target.
  for pid in
    select product_id from wh_movements where order_id = p_order_id
    union
    select product_id from _wh_order_target
  loop
    select coalesce(sum(case when type = 'reserve' then quantity else -quantity end), 0)
      into current_qty
      from wh_movements
     where order_id = p_order_id
       and product_id = pid
       and type in ('reserve', 'release')
       and ((type = 'reserve' and from_warehouse_id = p_warehouse)
         or (type = 'release' and to_warehouse_id = p_warehouse));

    select coalesce(target_qty, 0) into target_qty
      from _wh_order_target where product_id = pid;
    delta := target_qty - current_qty;
    if delta = 0 then continue; end if;

    select quantity into stock_qty
      from wh_stock
     where warehouse_id = p_warehouse and product_id = pid
     for update;
    stock_qty := coalesce(stock_qty, 0);

    if delta > 0 then
      if stock_qty < delta then
        raise exception 'insufficient stock for order %, product %: have %, need %',
          p_order_id, pid, stock_qty, delta;
      end if;
      perform public.wh_apply_stock_delta(p_warehouse, pid, -delta);
      movement_type := 'reserve';
      movement_reason := 'حجز طلب ذري';
      insert into wh_movements(product_id, from_warehouse_id, to_warehouse_id,
        quantity, type, reason, performed_by, order_id)
      values (pid, p_warehouse, null, delta, movement_type, movement_reason,
        p_performed_by, p_order_id);
    else
      perform public.wh_apply_stock_delta(p_warehouse, pid, -delta);
      movement_type := 'release';
      movement_reason := coalesce(p_release_reason, 'استرداد طلب ذري');
      insert into wh_movements(product_id, from_warehouse_id, to_warehouse_id,
        quantity, type, reason, performed_by, order_id)
      values (pid, null, p_warehouse, abs(delta), movement_type, movement_reason,
        p_performed_by, p_order_id);
    end if;
    changed := changed + 1;
  end loop;

  return jsonb_build_object('ok', true, 'changed_products', changed);
end;
$$;


create or replace function public.wh_register_order_return(
  p_order_id uuid,
  p_warehouse uuid,
  p_items jsonb,
  p_stage text,
  p_performed_by text default null,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare next_status text;
begin
  if p_order_id is null or p_warehouse is null then
    raise exception 'order and warehouse are required';
  end if;
  next_status := case when p_stage = 'received' then 'received' else 'in_transit' end;
  insert into public.wh_return_cases(order_id, warehouse_id, status, items, reason, received_at, inspected_by)
  values (
    p_order_id, p_warehouse, next_status, coalesce(p_items, '[]'::jsonb), p_reason,
    case when next_status = 'received' then now() else null end, p_performed_by
  )
  on conflict (order_id) do update set
    warehouse_id = excluded.warehouse_id,
    items = excluded.items,
    reason = coalesce(excluded.reason, wh_return_cases.reason),
    status = case
      when wh_return_cases.status in ('inspected','restocked','quarantine','damaged','cancelled') then wh_return_cases.status
      else excluded.status
    end,
    received_at = case
      when excluded.status = 'received' then coalesce(wh_return_cases.received_at, now())
      else wh_return_cases.received_at
    end,
    updated_at = now();
  return jsonb_build_object('ok', true, 'status', next_status);
end;
$$;

