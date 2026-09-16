-- =============================================================
-- Tasks — participants / tag (مشاركون إضافيون على المهمة)
-- Idempotent. Additive only: one array column with an empty default,
-- so existing rows and all existing code paths are untouched.
--
-- tasks.tagged_ids — profile UUIDs tagged on the task by the assignee,
-- the creator, or anyone with ASSIGN_TASKS. The task itself stays
-- single (same id / same assigned_to / same comments); tagged users
-- simply see it in "مهامي" and get a `task_tagged` notification.
-- RLS on tasks is already USING(true) (migration_v8) — no policy change.
-- =============================================================

alter table public.tasks
  add column if not exists tagged_ids uuid[] not null default '{}';

create index if not exists idx_tasks_tagged_ids
  on public.tasks using gin (tagged_ids);

comment on column public.tasks.tagged_ids is
  'Profiles tagged as extra participants on the task (visibility + notification). Does not change assigned_to.';
