-- Additive B2B market-entry fields. Existing rows are not rewritten.
begin;
alter table public.syria_b2b_leads
  add column if not exists account_status text,
  add column if not exists first_order_at timestamptz,
  add column if not exists next_action text,
  add column if not exists next_action_due_at timestamptz,
  add column if not exists blocker text,
  add column if not exists parent_organization_id text,
  add column if not exists accepts_new_brands boolean,
  add column if not exists accepts_beauty_products boolean,
  add column if not exists seller_registration_url text,
  add column if not exists supplier_contact_url text,
  add column if not exists registration_requirements jsonb not null default '[]'::jsonb,
  add column if not exists required_documents jsonb not null default '[]'::jsonb,
  add column if not exists missing_documents jsonb not null default '[]'::jsonb,
  add column if not exists contact_role text,
  add column if not exists contact_source text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'b2b_account_status_chk') then
    alter table public.syria_b2b_leads add constraint b2b_account_status_chk
      check (account_status is null or account_status in (
        'discovered','qualified','contact_needed','contacted','replied','documents_requested',
        'application_started','submitted','pending_approval','approved','live','first_order','rejected','paused'
      ));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'b2b_parent_organization_fk') then
    alter table public.syria_b2b_leads add constraint b2b_parent_organization_fk
      foreign key (parent_organization_id) references public.syria_b2b_leads(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'b2b_registration_requirements_array_chk') then
    alter table public.syria_b2b_leads add constraint b2b_registration_requirements_array_chk
      check (jsonb_typeof(registration_requirements) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'b2b_required_documents_array_chk') then
    alter table public.syria_b2b_leads add constraint b2b_required_documents_array_chk
      check (jsonb_typeof(required_documents) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'b2b_missing_documents_array_chk') then
    alter table public.syria_b2b_leads add constraint b2b_missing_documents_array_chk
      check (jsonb_typeof(missing_documents) = 'array');
  end if;
end $$;

create index if not exists syria_b2b_leads_market_entry_queue_idx
  on public.syria_b2b_leads (country, account_status, next_action_due_at)
  where deleted_at is null;
create index if not exists syria_b2b_leads_parent_org_idx
  on public.syria_b2b_leads (parent_organization_id)
  where parent_organization_id is not null;

create table if not exists public.b2b_lead_events (
  id bigint generated always as identity primary key,
  lead_id text not null references public.syria_b2b_leads(id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null,
  kind text not null,
  field_name text,
  from_value text,
  to_value text,
  note text
);
create index if not exists b2b_lead_events_lead_at_idx
  on public.b2b_lead_events (lead_id, at desc);
alter table public.b2b_lead_events enable row level security;
revoke all on public.b2b_lead_events from anon, authenticated;
grant all on public.b2b_lead_events to service_role;
commit;
