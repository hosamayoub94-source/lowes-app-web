-- =============================================================
-- task-attachments storage bucket (PRIVATE) + RLS policies
-- Enables in-app file uploads on tasks. Applied to production via
-- the SQL editor. App stores long-lived SIGNED urls (bucket is not
-- public). Idempotent.
-- =============================================================
insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;

drop policy if exists task_attach_select on storage.objects;
create policy task_attach_select on storage.objects for select to anon, authenticated
  using (bucket_id = 'task-attachments');

drop policy if exists task_attach_insert on storage.objects;
create policy task_attach_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'task-attachments');

drop policy if exists task_attach_update on storage.objects;
create policy task_attach_update on storage.objects for update to anon, authenticated
  using (bucket_id = 'task-attachments') with check (bucket_id = 'task-attachments');

drop policy if exists task_attach_delete on storage.objects;
create policy task_attach_delete on storage.objects for delete to anon, authenticated
  using (bucket_id = 'task-attachments');
