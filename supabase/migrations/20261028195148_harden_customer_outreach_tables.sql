-- Applied to production project fghdumrgimoeqsafdhhh on 2026-10-28.
-- Restrict customer outreach tables to real Supabase-authenticated employees.
-- These tables are used by the authenticated app; public/anon access is not required.
-- Keep shared read/write behavior needed for campaign tracking, but remove delete/truncate
-- and limit campaign conversion updates to conversion fields only.

alter table public.campaign_sends enable row level security;
alter table public.customer_notes enable row level security;

drop policy if exists campaign_sends_all on public.campaign_sends;
drop policy if exists cust_notes_all on public.customer_notes;

revoke all on table public.campaign_sends from public, anon, authenticated;
revoke all on table public.customer_notes from public, anon, authenticated;

-- Campaign history: authenticated employees can read history and append send attempts.
grant select on table public.campaign_sends to authenticated;
grant insert (campaign_key, campaign_label, template_sid, phone_key, customer_name, market, sent_by, status)
  on table public.campaign_sends to authenticated;
grant update (converted, converted_amount, converted_at, converted_by)
  on table public.campaign_sends to authenticated;

create policy campaign_sends_authenticated_select
  on public.campaign_sends for select to authenticated using (true);
create policy campaign_sends_authenticated_insert
  on public.campaign_sends for insert to authenticated with check (true);
create policy campaign_sends_authenticated_update
  on public.campaign_sends for update to authenticated using (true) with check (true);

-- Customer notes are append-only from the app: read existing notes and add new notes.
grant select on table public.customer_notes to authenticated;
grant insert (phone_key, note, author) on table public.customer_notes to authenticated;

create policy customer_notes_authenticated_select
  on public.customer_notes for select to authenticated using (true);
create policy customer_notes_authenticated_insert
  on public.customer_notes for insert to authenticated with check (true);
