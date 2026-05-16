-- =============================================================
-- Tasks Module — Supabase Schema (production)
-- Run order:
--   1. Apply this file in Supabase SQL editor
--   2. Enable realtime in Supabase Dashboard → Database → Replication
--      (this file already adds the tables to the supabase_realtime
--      publication; the toggle is just a UI confirmation step)
--   3. Set VITE_USE_MOCK_TASKS=false in .env.local once the schema
--      is live and your profiles table is populated
--
-- Assumptions:
--   - public.profiles already exists with at least:
--       id (uuid, PK, references auth.users.id)
--       name (text), avatar_url (text), role_type (text), team (text)
--   - Users authenticate through Supabase Auth (auth.users). If your
--     app still uses PIN-only login, see the RLS NOTE at the bottom.
-- =============================================================

-- -------------------------------------------------------------
-- Extensions
-- -------------------------------------------------------------
create extension if not exists "pgcrypto";

-- -------------------------------------------------------------
-- Tables
-- -------------------------------------------------------------

-- tasks
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  status        text not null default 'pending'
                 check (status in ('pending','in_progress','completed','cancelled')),
  priority      text not null default 'medium'
                 check (priority in ('low','medium','high','urgent')),
  progress      smallint not null default 0
                 check (progress >= 0 and progress <= 100),
  assigned_to   uuid references public.profiles(id) on delete set null,
  created_by    uuid references public.profiles(id) on delete set null,
  due_date      timestamptz,
  seen_by       uuid[] not null default '{}',
  attachments   jsonb  not null default '[]'::jsonb,
  tags          text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz
);

-- task_comments
create table if not exists public.task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  comment     text not null check (length(trim(comment)) > 0),
  created_at  timestamptz not null default now()
);

-- task_activity
create table if not exists public.task_activity (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete set null,
  action_type  text not null,         -- created | status_changed | progress_updated | assigned | comment_added | priority_changed | due_date_changed | attachment_added
  action_label text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Indexes — keep queries cheap as the dataset grows
-- -------------------------------------------------------------
create index if not exists idx_tasks_assigned_to on public.tasks(assigned_to);
create index if not exists idx_tasks_created_by  on public.tasks(created_by);
create index if not exists idx_tasks_status      on public.tasks(status);
create index if not exists idx_tasks_priority    on public.tasks(priority);
create index if not exists idx_tasks_due_date    on public.tasks(due_date);
create index if not exists idx_tasks_created_at  on public.tasks(created_at desc);

create index if not exists idx_task_comments_task on public.task_comments(task_id, created_at desc);
create index if not exists idx_task_comments_user on public.task_comments(user_id);

create index if not exists idx_task_activity_task on public.task_activity(task_id, created_at desc);
create index if not exists idx_task_activity_user on public.task_activity(user_id);
create index if not exists idx_task_activity_type on public.task_activity(action_type);

-- -------------------------------------------------------------
-- Triggers
-- -------------------------------------------------------------

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- Stamp completed_at automatically when status flips to completed
create or replace function public.set_completed_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tasks_completed_at on public.tasks;
create trigger trg_tasks_completed_at
  before update on public.tasks
  for each row execute function public.set_completed_at();

-- -------------------------------------------------------------
-- Helpers — current user's role / team. SECURITY DEFINER so the
-- helper can read public.profiles even when RLS is on.
-- -------------------------------------------------------------
create or replace function public.current_role_type()
returns text language sql security definer stable as $$
  select role_type from public.profiles where id = auth.uid()
$$;

create or replace function public.current_team()
returns text language sql security definer stable as $$
  select team from public.profiles where id = auth.uid()
$$;

-- -------------------------------------------------------------
-- Row Level Security
-- -------------------------------------------------------------
alter table public.tasks         enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_activity enable row level security;

-- Drop existing policies (idempotent re-run)
drop policy if exists "tasks_select"         on public.tasks;
drop policy if exists "tasks_insert"         on public.tasks;
drop policy if exists "tasks_update"         on public.tasks;
drop policy if exists "tasks_delete"         on public.tasks;
drop policy if exists "task_comments_select" on public.task_comments;
drop policy if exists "task_comments_insert" on public.task_comments;
drop policy if exists "task_comments_update" on public.task_comments;
drop policy if exists "task_comments_delete" on public.task_comments;
drop policy if exists "task_activity_select" on public.task_activity;
drop policy if exists "task_activity_insert" on public.task_activity;

-- ── tasks ──────────────────────────────────────────────────────
-- READ: assignee, creator, admin, OR manager of assignee's team
create policy "tasks_select" on public.tasks
  for select using (
    assigned_to = auth.uid()
    or created_by  = auth.uid()
    or public.current_role_type() = 'admin'
    or (
      public.current_role_type() in ('manager','sales_manager','social_manager')
      and exists (
        select 1 from public.profiles p
        where p.id = tasks.assigned_to
          and p.team = public.current_team()
      )
    )
  );

-- INSERT: only management roles can create tasks
create policy "tasks_insert" on public.tasks
  for insert with check (
    public.current_role_type() in ('manager','sales_manager','social_manager','admin')
    and (created_by = auth.uid() or created_by is null)
  );

-- UPDATE: assignee can update their own task; managers can update team's; admin all
create policy "tasks_update" on public.tasks
  for update using (
    assigned_to = auth.uid()
    or created_by  = auth.uid()
    or public.current_role_type() = 'admin'
    or (
      public.current_role_type() in ('manager','sales_manager','social_manager')
      and exists (
        select 1 from public.profiles p
        where p.id = tasks.assigned_to
          and p.team = public.current_team()
      )
    )
  );

-- DELETE: admin only — protects audit trail
create policy "tasks_delete" on public.tasks
  for delete using (public.current_role_type() = 'admin');

-- ── task_comments ──────────────────────────────────────────────
-- Any user who can SELECT the parent task can read/post comments.
create policy "task_comments_select" on public.task_comments
  for select using (
    exists (select 1 from public.tasks t where t.id = task_id)
  );

create policy "task_comments_insert" on public.task_comments
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.tasks t where t.id = task_id)
  );

create policy "task_comments_update" on public.task_comments
  for update using (user_id = auth.uid());

create policy "task_comments_delete" on public.task_comments
  for delete using (
    user_id = auth.uid() or public.current_role_type() = 'admin'
  );

-- ── task_activity ──────────────────────────────────────────────
-- Read activity for any task you can see. Insert is open to
-- authenticated users (the service layer is the only writer).
create policy "task_activity_select" on public.task_activity
  for select using (
    exists (select 1 from public.tasks t where t.id = task_id)
  );

create policy "task_activity_insert" on public.task_activity
  for insert with check (
    auth.uid() is not null
    and (user_id = auth.uid() or user_id is null)
  );

-- -------------------------------------------------------------
-- Realtime publication
-- -------------------------------------------------------------
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.task_comments;
alter publication supabase_realtime add table public.task_activity;

-- =============================================================
-- RLS NOTE — PIN-only auth users
-- =============================================================
-- If your app still uses the PIN-based custom auth (no Supabase
-- Auth session), `auth.uid()` will be NULL and EVERY policy above
-- denies access. Two paths forward:
--
-- A) RECOMMENDED — migrate the PIN flow to Supabase Auth:
--    - Treat profile.id as auth.users.id (one row per profile in
--      auth.users, created via supabase.auth.admin.createUser)
--    - The PIN stays as a UI step that ultimately calls
--      supabase.auth.signInWithPassword({ email, password })
--      where password = the PIN (or a derived secret)
--
-- B) STOPGAP — temporary permissive policies (NOT for production):
--    Replace the four `tasks_*` policies above with:
--      create policy "tasks_all" on public.tasks
--        for all using (true) with check (true);
--    Repeat for task_comments and task_activity. This is only
--    safe behind a private network or while in active development.
-- =============================================================
