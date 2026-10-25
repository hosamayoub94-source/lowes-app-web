-- Make market-entry row updates and their audit events one atomic database transaction.
-- Apply after 20261025140000_b2b_market_entry.sql. No existing rows are rewritten.
begin;

create or replace function public.b2b_update_market_entry_atomic(
  p_lead_id text,
  p_country text,
  p_patch jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_existing public.syria_b2b_leads%rowtype;
  v_updated public.syria_b2b_leads%rowtype;
  v_key text;
  v_old jsonb;
  v_new jsonb;
  v_old_text text;
  v_new_text text;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'invalid_patch' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_patch) as k(key)
    where k.key not in (
      'account_status','first_order_at','next_action','next_action_due_at','blocker','parent_organization_id',
      'accepts_new_brands','accepts_beauty_products','seller_registration_url','supplier_contact_url',
      'registration_requirements','required_documents','missing_documents','contact_role','contact_source'
    )
  ) then
    raise exception 'invalid_patch_field' using errcode = '22023';
  end if;

  select * into v_existing
  from public.syria_b2b_leads
  where id = p_lead_id and country = p_country and deleted_at is null
  for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  update public.syria_b2b_leads as l
  set
    account_status = case when p_patch ? 'account_status' then p_patch->>'account_status' else l.account_status end,
    first_order_at = case when p_patch ? 'first_order_at' then nullif(p_patch->>'first_order_at','')::timestamptz else l.first_order_at end,
    next_action = case when p_patch ? 'next_action' then p_patch->>'next_action' else l.next_action end,
    next_action_due_at = case when p_patch ? 'next_action_due_at' then nullif(p_patch->>'next_action_due_at','')::timestamptz else l.next_action_due_at end,
    blocker = case when p_patch ? 'blocker' then p_patch->>'blocker' else l.blocker end,
    parent_organization_id = case when p_patch ? 'parent_organization_id' then p_patch->>'parent_organization_id' else l.parent_organization_id end,
    accepts_new_brands = case when p_patch ? 'accepts_new_brands' then (p_patch->>'accepts_new_brands')::boolean else l.accepts_new_brands end,
    accepts_beauty_products = case when p_patch ? 'accepts_beauty_products' then (p_patch->>'accepts_beauty_products')::boolean else l.accepts_beauty_products end,
    seller_registration_url = case when p_patch ? 'seller_registration_url' then p_patch->>'seller_registration_url' else l.seller_registration_url end,
    supplier_contact_url = case when p_patch ? 'supplier_contact_url' then p_patch->>'supplier_contact_url' else l.supplier_contact_url end,
    registration_requirements = case when p_patch ? 'registration_requirements' then p_patch->'registration_requirements' else l.registration_requirements end,
    required_documents = case when p_patch ? 'required_documents' then p_patch->'required_documents' else l.required_documents end,
    missing_documents = case when p_patch ? 'missing_documents' then p_patch->'missing_documents' else l.missing_documents end,
    contact_role = case when p_patch ? 'contact_role' then p_patch->>'contact_role' else l.contact_role end,
    contact_source = case when p_patch ? 'contact_source' then p_patch->>'contact_source' else l.contact_source end,
    updated_at = now()
  where l.id = p_lead_id and l.country = p_country and l.deleted_at is null
  returning l.* into v_updated;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  for v_key in select jsonb_object_keys(p_patch)
  loop
    v_old := to_jsonb(v_existing) -> v_key;
    v_new := to_jsonb(v_updated) -> v_key;

    if v_old is distinct from v_new then
      v_old_text := case
        when v_old is null or v_old = 'null'::jsonb then null
        when jsonb_typeof(v_old) = 'string' then v_old #>> '{}'
        else v_old::text
      end;
      v_new_text := case
        when v_new is null or v_new = 'null'::jsonb then null
        when jsonb_typeof(v_new) = 'string' then v_new #>> '{}'
        else v_new::text
      end;

      insert into public.b2b_lead_events (
        lead_id, actor, kind, field_name, from_value, to_value
      ) values (
        p_lead_id, left(coalesce(nullif(trim(p_actor), ''), 'unknown'), 100),
        'market_entry_update', v_key, v_old_text, v_new_text
      );
    end if;
  end loop;

  return jsonb_build_object('row', to_jsonb(v_updated), 'audit_warning', false);
end;
$function$;

revoke all on function public.b2b_update_market_entry_atomic(text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.b2b_update_market_entry_atomic(text, text, jsonb, text) to service_role;

commit;
