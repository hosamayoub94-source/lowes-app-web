-- D-157: return-case lifecycle actions (additive; historical movements untouched).
-- Applies on top of 20261024_warehouse_order_stock_atomic.sql (wh_return_cases exists).
-- Rollback: supabase/rollbacks/20261025_warehouse_return_actions_down.sql
--
-- State machine (anything else is rejected, repeating the same target is a no-op):
--   in_transit -> received | cancelled
--   received   -> inspected | cancelled
--   inspected  -> restocked | quarantine | damaged
--   quarantine -> restocked | damaged
-- Only `restocked` touches stock: a `release` movement linked to the order and
-- wh_apply_stock_delta (never negative). quarantine/damaged keep the original
-- reservation consumed, so nothing becomes saleable.

alter table public.wh_return_cases
  add column if not exists received_by text,
  add column if not exists inspection_condition text
    check (inspection_condition is null or inspection_condition in ('good','suspect','damaged')),
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by text,
  add column if not exists resolution_notes text;

-- inspected_by used to be filled with the registering actor on creation. Keep the
-- column but stop trusting rows that were never inspected.
-- (No rows exist at the time of writing; this is a safety no-op.)
update public.wh_return_cases set inspected_by = null
 where inspected_at is null and inspected_by is not null;

-- Append-only audit trail of every transition.
create table if not exists public.wh_return_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.wh_return_cases(id) on delete restrict,
  order_id uuid not null,
  from_status text,
  to_status text not null,
  performed_by text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists wh_return_events_case_idx
  on public.wh_return_events(case_id, created_at);

-- The table had no RLS and full anon write grants: close it. All writes go
-- through the SECURITY DEFINER functions below; the app only reads.
alter table public.wh_return_cases enable row level security;
alter table public.wh_return_events enable row level security;
revoke all on public.wh_return_cases from anon, authenticated;
revoke all on public.wh_return_events from anon, authenticated;
grant select on public.wh_return_cases to authenticated;
grant select on public.wh_return_events to authenticated;
drop policy if exists wh_return_cases_read on public.wh_return_cases;
create policy wh_return_cases_read on public.wh_return_cases
  for select to authenticated using (true);
drop policy if exists wh_return_events_read on public.wh_return_events;
create policy wh_return_events_read on public.wh_return_events
  for select to authenticated using (true);

-- Shared guard + transition. Internal: not exposed to API roles.
create or replace function public.wh__return_step(
  p_order uuid, p_to text, p_by text, p_notes text, p_condition text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.wh_return_cases%rowtype;
  allowed text[];
begin
  if p_order is null then raise exception 'رقم الطلب مطلوب'; end if;
  if nullif(btrim(coalesce(p_by, '')), '') is null then
    raise exception 'اسم المسؤول عن الإجراء مطلوب';
  end if;
  select * into c from public.wh_return_cases where order_id = p_order for update;
  if not found then
    raise exception 'لا توجد حالة مرتجع لهذا الطلب';
  end if;
  if c.status = p_to then
    return jsonb_build_object('ok', true, 'idempotent', true, 'status', c.status);
  end if;
  allowed := case c.status
    when 'in_transit' then array['received','cancelled']
    when 'received'   then array['inspected','cancelled']
    when 'inspected'  then array['restocked','quarantine','damaged']
    when 'quarantine' then array['restocked','damaged']
    else array[]::text[] end;
  if not (p_to = any(allowed)) then
    raise exception 'انتقال غير مسموح: % -> %', c.status, p_to;
  end if;

  update public.wh_return_cases set
    status = p_to,
    received_at = case when p_to = 'received' then coalesce(received_at, now()) else received_at end,
    received_by = case when p_to = 'received' then p_by else received_by end,
    inspected_at = case when p_to = 'inspected' then now() else inspected_at end,
    inspected_by = case when p_to = 'inspected' then p_by else inspected_by end,
    inspection_condition = case when p_to = 'inspected' then p_condition else inspection_condition end,
    resolved_at = case when p_to in ('restocked','quarantine','damaged','cancelled') then now() else resolved_at end,
    resolved_by = case when p_to in ('restocked','quarantine','damaged','cancelled') then p_by else resolved_by end,
    resolution_notes = case when p_to in ('restocked','quarantine','damaged','cancelled')
                            then coalesce(nullif(btrim(p_notes), ''), resolution_notes) else resolution_notes end,
    notes = case when p_to in ('received','inspected') and nullif(btrim(coalesce(p_notes,'')), '') is not null
                 then p_notes else notes end,
    updated_at = now()
  where id = c.id;

  insert into public.wh_return_events(case_id, order_id, from_status, to_status, performed_by, notes)
  values (c.id, p_order, c.status, p_to, p_by, nullif(btrim(coalesce(p_notes,'')), ''));

  return jsonb_build_object('ok', true, 'idempotent', false, 'from', c.status, 'status', p_to);
end;
$$;
revoke all on function public.wh__return_step(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.wh_receive_return(
  p_order_id uuid, p_performed_by text, p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return public.wh__return_step(p_order_id, 'received', p_performed_by, p_notes);
end;
$$;

create or replace function public.wh_inspect_return(
  p_order_id uuid, p_condition text, p_performed_by text, p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_condition is null or p_condition not in ('good','suspect','damaged') then
    raise exception 'نتيجة الفحص غير صالحة (good / suspect / damaged)';
  end if;
  return public.wh__return_step(p_order_id, 'inspected', p_performed_by, p_notes, p_condition);
end;
$$;

create or replace function public.wh_quarantine_return(
  p_order_id uuid, p_performed_by text, p_notes text
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if nullif(btrim(coalesce(p_notes, '')), '') is null then
    raise exception 'سبب الحجر مطلوب';
  end if;
  return public.wh__return_step(p_order_id, 'quarantine', p_performed_by, p_notes);
end;
$$;

create or replace function public.wh_mark_return_damaged(
  p_order_id uuid, p_performed_by text, p_notes text
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if nullif(btrim(coalesce(p_notes, '')), '') is null then
    raise exception 'سبب التلف مطلوب';
  end if;
  return public.wh__return_step(p_order_id, 'damaged', p_performed_by, p_notes);
end;
$$;

-- Restock: the only action that adds saleable stock. Atomic: stock delta,
-- movement rows and the status change commit or roll back together.
create or replace function public.wh_restock_return(
  p_order_id uuid, p_performed_by text, p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.wh_return_cases%rowtype;
  it record;
  net int;
  moved int := 0;
begin
  if nullif(btrim(coalesce(p_performed_by, '')), '') is null then
    raise exception 'اسم المسؤول عن الإجراء مطلوب';
  end if;
  select * into c from public.wh_return_cases where order_id = p_order_id for update;
  if not found then raise exception 'لا توجد حالة مرتجع لهذا الطلب'; end if;
  if c.status = 'restocked' then
    return jsonb_build_object('ok', true, 'idempotent', true, 'status', 'restocked');
  end if;
  if c.status not in ('inspected','quarantine') then
    raise exception 'لا يمكن الإرجاع للمخزون قبل الفحص (الحالة الحالية: %)', c.status;
  end if;
  if c.status = 'inspected' and coalesce(c.inspection_condition, '') <> 'good' then
    raise exception 'نتيجة الفحص ليست سليمة؛ استخدم الحجر أو التالف';
  end if;
  if jsonb_typeof(c.items) <> 'array' or jsonb_array_length(c.items) = 0 then
    raise exception 'لا توجد أصناف مسجّلة في حالة المرتجع';
  end if;

  -- same lock the order sync takes, so the two can never interleave
  perform 1 from public.wh_movements where order_id = p_order_id for update;

  for it in
    select nullif(e->>'productId', '')::uuid as product_id,
           sum(greatest(coalesce((e->>'qty')::int, 0), 0))::int as qty
      from jsonb_array_elements(c.items) e
     group by 1
  loop
    if it.product_id is null then
      raise exception 'صنف غير مربوط بالكتالوج داخل المرتجع';
    end if;
    if it.qty <= 0 then continue; end if;
    select coalesce(sum(case when type = 'reserve' then quantity else -quantity end), 0)
      into net
      from public.wh_movements
     where order_id = p_order_id and product_id = it.product_id
       and type in ('reserve','release')
       and ((type = 'reserve' and from_warehouse_id = c.warehouse_id)
         or (type = 'release' and to_warehouse_id = c.warehouse_id));
    if net < it.qty then
      raise exception 'الحجز المسجّل (%) أقل من كمية المرتجع (%) للصنف %', net, it.qty, it.product_id;
    end if;
    perform public.wh_apply_stock_delta(c.warehouse_id, it.product_id, it.qty);
    insert into public.wh_movements(product_id, from_warehouse_id, to_warehouse_id,
      quantity, type, reason, performed_by, order_id)
    values (it.product_id, null, c.warehouse_id, it.qty, 'release',
      'مرتجع أُعيد للمخزون بعد الفحص', p_performed_by, p_order_id);
    moved := moved + 1;
  end loop;

  perform public.wh__return_step(p_order_id, 'restocked', p_performed_by, p_notes);
  return jsonb_build_object('ok', true, 'idempotent', false, 'status', 'restocked', 'products', moved);
end;
$$;

-- Registration from carriers/sheet: never regresses a case, never writes the
-- registering actor into inspected_by, and leaves an audit event.
create or replace function public.wh_register_order_return(
  p_order_id uuid, p_warehouse uuid, p_items jsonb, p_stage text,
  p_performed_by text default null, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
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
$$;

-- Guard inside the order sync: while a return case is open the reservation must
-- stay put, whatever status writer fires (UI, sheet, carriers).
create or replace function public.wh_sync_order_stock(
  p_order_id uuid, p_warehouse uuid, p_lines jsonb, p_should_be_out boolean,
  p_performed_by text default null, p_release_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  line jsonb;
  pid uuid;
  target_qty int;
  current_qty int;
  stock_qty int;
  delta int;
  changed int := 0;
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

    select coalesce(t.target_qty, 0) into target_qty
      from (select 1) s left join _wh_order_target t on t.product_id = pid;
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
      insert into wh_movements(product_id, from_warehouse_id, to_warehouse_id,
        quantity, type, reason, performed_by, order_id)
      values (pid, p_warehouse, null, delta, 'reserve', 'حجز طلب ذري',
        p_performed_by, p_order_id);
    else
      perform public.wh_apply_stock_delta(p_warehouse, pid, -delta);
      insert into wh_movements(product_id, from_warehouse_id, to_warehouse_id,
        quantity, type, reason, performed_by, order_id)
      values (pid, null, p_warehouse, abs(delta), 'release',
        coalesce(p_release_reason, 'استرداد طلب ذري'), p_performed_by, p_order_id);
    end if;
    changed := changed + 1;
  end loop;

  return jsonb_build_object('ok', true, 'changed_products', changed);
end;
$$;

revoke all on function public.wh_receive_return(uuid, text, text) from public, anon;
revoke all on function public.wh_inspect_return(uuid, text, text, text) from public, anon;
revoke all on function public.wh_restock_return(uuid, text, text) from public, anon;
revoke all on function public.wh_quarantine_return(uuid, text, text) from public, anon;
revoke all on function public.wh_mark_return_damaged(uuid, text, text) from public, anon;
grant execute on function public.wh_receive_return(uuid, text, text) to authenticated;
grant execute on function public.wh_inspect_return(uuid, text, text, text) to authenticated;
grant execute on function public.wh_restock_return(uuid, text, text) to authenticated;
grant execute on function public.wh_quarantine_return(uuid, text, text) to authenticated;
grant execute on function public.wh_mark_return_damaged(uuid, text, text) to authenticated;
