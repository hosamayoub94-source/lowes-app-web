-- =============================================================
-- tasks_ops_center_v1 — REV 2 — «مركز العمل» — lowes-app-web ONLY (fghdumrgimoeqsafdhhh)
-- File names keep the v1 prefix; every file of this set (up, export, down, preflight, verify)
-- is REV 2 of the same migration. The manifest comment records it: 'tasks_ops_center_v1 rev 2'.
-- DRAFT — NOT APPLIED. Needs Hosam's explicit approval after review.
--
-- !! SECURITY WARNING — READ BEFORE APPLYING !!
-- This migration does NOT fix row-level security. The live policy on public.tasks is
--   tasks_all  FOR ALL TO public  USING (true) WITH CHECK (true)
-- so any holder of the anon key can read, write and delete every task (including is_sensitive
-- ones). Team separation and sensitive-task hiding exist in the UI ONLY. Do not treat this
-- migration as a security improvement. task_status_history is deliberately NOT more permissive
-- than its task: read follows the task policy, there is no write grant or policy for API roles.
-- Fixing tasks RLS is a separate decision (D-158) and is out of scope here.
--
-- Run order:  preflight (read-only)  →  this file  →  verify (read-only)
--   supabase/preflight/tasks_ops_center_v1_preflight.sql
--   supabase/preflight/tasks_ops_center_v1_verify.sql
-- Undo (guarded, refuses to lose data): supabase/rollbacks/tasks_ops_center_v1_down.sql
--
-- STATUS DICTIONARY (final, 9 values):
--   draft · ready · in_progress · waiting_reply · blocked · review · completed · archived · cancelled
-- LEGACY → CANONICAL (read-side mapping, see task_status_canonical()):
--   pending   → ready
--   in_review → review
--   done      → completed
--   overdue   → NOT a stored status: it is derived from due_date (+ active status).
--               A stored 'overdue' maps to 'ready' only so old rows stay readable.
-- Legacy values stay ACCEPTED by the CHECK for a compatibility window because the
-- deployed legacy UI can still write them: STATUS_OPTIONS is built from STATUS_META
-- (task.types.js:74) which contains 'overdue' (task.types.js:41), and the legacy
-- Kanban writes pending / in_review / done. The app in this branch no longer offers
-- or writes 'overdue'. When the legacy UI is retired, tighten the CHECK to the 9
-- canonical values (needs 0 rows with legacy values — see verify script).
--
-- SAFETY MODEL
--  * Refuses to run if ANY object it creates already exists (no silent adoption)
--    or if it was already applied (manifest present).
--  * Records every object it creates in tasks_ops_v1_manifest, so the rollback
--    drops only what this migration created.
--  * Additive only: nullable columns, no row is rewritten except the tag backfill.
--  * task_status_history is APPEND-ONLY: no INSERT/UPDATE/DELETE for anon or
--    authenticated, writes only through a SECURITY DEFINER trigger.
-- =============================================================
begin;

-- 0) Guard ------------------------------------------------------
do $guard$
declare
  hits text[] := '{}';
  c text;
begin
  if to_regclass('public.tasks_ops_v1_manifest') is not null then
    raise exception 'tasks_ops_center_v1 already applied (tasks_ops_v1_manifest exists) - nothing changed';
  end if;

  foreach c in array array['outcome','next_step','blocker','blocker_since','evidence','review_requested_by',
                           'project_code','decision_ref','kpi_key','status_changed_at','status_changed_by'] loop
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='tasks' and column_name=c) then
      hits := hits || ('column tasks.' || c);
    end if;
  end loop;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='abos_code') then
    hits := hits || 'column projects.abos_code';
  end if;

  foreach c in array array['abos_projects','task_status_history'] loop
    if to_regclass('public.' || c) is not null then hits := hits || ('relation public.' || c); end if;
  end loop;

  foreach c in array array['uq_projects_abos_code','idx_tasks_project_code','idx_tasks_status_due','idx_task_status_history_task'] loop
    if to_regclass('public.' || c) is not null then hits := hits || ('index ' || c); end if;
  end loop;

  foreach c in array array['task_status_canonical','tasks_track_status_before','tasks_track_status_after','task_status_history_guard'] loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=c) then
      hits := hits || ('function ' || c);
    end if;
  end loop;

  foreach c in array array['trg_tasks_status_before','trg_tasks_status_after'] loop
    if exists (select 1 from pg_trigger where tgrelid='public.tasks'::regclass and tgname=c and not tgisinternal) then
      hits := hits || ('trigger ' || c);
    end if;
  end loop;

  foreach c in array array['tasks_project_code_fkey','tasks_decision_ref_check','tasks_kpi_key_check'] loop
    if exists (select 1 from pg_constraint where conrelid='public.tasks'::regclass and conname=c) then
      hits := hits || ('constraint ' || c);
    end if;
  end loop;
  if exists (select 1 from pg_constraint where conrelid='public.projects'::regclass and conname='projects_abos_code_fkey') then
    hits := hits || 'constraint projects_abos_code_fkey';
  end if;

  if array_length(hits, 1) is not null then
    raise exception 'tasks_ops_center_v1 refused - pre-existing objects: %', array_to_string(hits, ', ');
  end if;

  -- every stored status must be one the new CHECK accepts (the ADD CONSTRAINT would fail anyway; fail early with a clear message)
  if exists (select 1 from public.tasks where status <> all (array[
      'draft','ready','in_progress','waiting_reply','blocked','review','completed','archived','cancelled',
      'pending','in_review','done','overdue'])) then
    raise exception 'tasks_ops_center_v1 refused - tasks contain statuses outside the accepted dictionary';
  end if;
end
$guard$;

-- 1) Manifest (what THIS migration created) ---------------------
create table public.tasks_ops_v1_manifest (
  seq         int generated always as identity primary key,
  object_type text not null,    -- table | column | constraint | index | function | trigger | constraint_replaced
  object_name text not null,
  detail      text
);
comment on table public.tasks_ops_v1_manifest is 'tasks_ops_center_v1 rev 2';
alter table public.tasks_ops_v1_manifest enable row level security;      -- no policies: invisible to API roles
revoke all on public.tasks_ops_v1_manifest from public, anon, authenticated;

insert into public.tasks_ops_v1_manifest(object_type, object_name, detail)
select 'constraint_replaced', 'tasks.tasks_status_check', pg_get_constraintdef(oid)
from pg_constraint where conrelid='public.tasks'::regclass and conname='tasks_status_check';

-- 2) Project reference (the single source for P## codes) --------
-- Source: ABOS 05_Project_Portfolio.md. P05 was officially dropped (1 Aug 2026) and is NOT listed.
create table public.abos_projects (
  code   text primary key check (code ~ '^P[0-9]{2}$'),
  name   text not null,
  source text not null default '05_Project_Portfolio.md'
);
insert into public.abos_projects(code, name) values
  ('P01','داتا المعرض → صفقات'),
  ('P02','شبكة النجوم 76→1,000'),
  ('P03','توزيع سوريا (B2B)'),
  ('P04','منصات أونلاين سورية'),
  ('P06','المندوبون العلميون'),
  ('P07','La Rovén Iséra'),
  ('P08','إطلاق @lowes_profesyonel'),
  ('P09','نمو المبيعات (Meta)'),
  ('P10','واتساب الرسمي'),
  ('P11','قاعدة صناع المحتوى');
alter table public.abos_projects enable row level security;
revoke all on public.abos_projects from public, anon, authenticated;
grant select on public.abos_projects to anon, authenticated;
create policy abos_projects_read on public.abos_projects for select to anon, authenticated using (true);
insert into public.tasks_ops_v1_manifest(object_type, object_name) values ('table','public.abos_projects');

-- 3) tasks: status dictionary + new nullable columns ------------
alter table public.tasks drop constraint tasks_status_check;
alter table public.tasks add constraint tasks_status_check check (status = any (array[
  -- canonical
  'draft','ready','in_progress','waiting_reply','blocked','review','completed','archived','cancelled',
  -- legacy, accepted during the compatibility window only (deprecated; see header)
  'pending','in_review','done','overdue'
]));

alter table public.tasks
  add column outcome             text,
  add column next_step           text,
  add column blocker             text,
  add column blocker_since       timestamptz,
  add column evidence            text,
  add column review_requested_by uuid references public.profiles(id) on delete set null,
  add column project_code        text,
  add column decision_ref        text,
  add column kpi_key             text,
  add column status_changed_at   timestamptz,
  add column status_changed_by   uuid;     -- client claim of who changed the status (no FK: must never block an update)

alter table public.tasks add constraint tasks_project_code_fkey
  foreign key (project_code) references public.abos_projects(code) on update cascade on delete restrict;
alter table public.tasks add constraint tasks_decision_ref_check
  check (decision_ref is null or decision_ref ~ '^D-[0-9]{3,4}$');
alter table public.tasks add constraint tasks_kpi_key_check
  check (kpi_key is null or kpi_key in ('revenue','orders','customers','retention','expansion'));

alter table public.projects add column abos_code text;
alter table public.projects add constraint projects_abos_code_fkey
  foreign key (abos_code) references public.abos_projects(code) on update cascade on delete set null;

create unique index uq_projects_abos_code on public.projects(abos_code) where abos_code is not null;
create index idx_tasks_project_code on public.tasks(project_code) where project_code is not null;
create index idx_tasks_status_due on public.tasks(status, due_date);

insert into public.tasks_ops_v1_manifest(object_type, object_name) values
  ('column','tasks.outcome'),('column','tasks.next_step'),('column','tasks.blocker'),('column','tasks.blocker_since'),
  ('column','tasks.evidence'),('column','tasks.review_requested_by'),('column','tasks.project_code'),
  ('column','tasks.decision_ref'),('column','tasks.kpi_key'),('column','tasks.status_changed_at'),
  ('column','tasks.status_changed_by'),('column','projects.abos_code'),
  ('constraint','tasks.tasks_project_code_fkey'),('constraint','tasks.tasks_decision_ref_check'),
  ('constraint','tasks.tasks_kpi_key_check'),('constraint','projects.projects_abos_code_fkey'),
  ('index','public.uq_projects_abos_code'),('index','public.idx_tasks_project_code'),('index','public.idx_tasks_status_due');

-- 4) Backfill link tags written by the app before this migration.
--    Only codes that exist in abos_projects are copied (P99 is NOT copied; the
--    preflight lists unknown codes). NOTE: this UPDATE fires the existing
--    updated_at trigger on the touched rows; the preflight reports how many.
update public.tasks t set
  project_code = coalesce(t.project_code, (select a.code from unnest(t.tags) x join public.abos_projects a on a.code = x limit 1)),
  decision_ref = coalesce(t.decision_ref, (select x from unnest(t.tags) x where x ~ '^D-[0-9]{3,4}$' limit 1)),
  kpi_key      = coalesce(t.kpi_key,      (select substr(x, 5) from unnest(t.tags) x
                                             where x ~ '^KPI:(revenue|orders|customers|retention|expansion)$' limit 1))
where exists (select 1 from unnest(t.tags) x where x ~ '^(P[0-9]{2}|D-[0-9]{3,4}|KPI:.+)$');

-- 5) Canonical status mapping (documented, testable) ------------
create function public.task_status_canonical(s text) returns text
language sql immutable as $$
  select case s
    when 'pending'   then 'ready'
    when 'in_review' then 'review'
    when 'done'      then 'completed'
    when 'overdue'   then 'ready'     -- derived state, never stored; mapped only so old rows stay readable
    else s
  end
$$;

-- 6) Append-only status history ---------------------------------
create table public.task_status_history (
  id           bigint generated always as identity primary key,
  task_id      uuid not null references public.tasks(id) on delete cascade,
  from_status  text,
  to_status    text not null,
  blocker      text,
  changed_at   timestamptz not null default now(),
  actor_id     uuid,
  actor_source text not null check (actor_source in ('auth','client_claim','unknown'))
);
create index idx_task_status_history_task on public.task_status_history(task_id, changed_at desc);

alter table public.task_status_history enable row level security;
revoke all on public.task_status_history from public, anon, authenticated;
grant select on public.task_status_history to anon, authenticated;
-- read follows whatever the tasks policy allows (so fixing tasks RLS later fixes this too)
create policy task_status_history_read on public.task_status_history for select to anon, authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));
-- no insert/update/delete policy and no such grant: API roles cannot write.

create function public.task_status_history_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- the only allowed delete is the FK cascade when a task itself is deleted
  -- (it runs inside the RI trigger, i.e. trigger depth > 1)
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'task_status_history is append-only (% blocked)', tg_op;
end;
$$;
create trigger trg_task_status_history_guard
  before update or delete on public.task_status_history
  for each row execute function public.task_status_history_guard();
create trigger trg_task_status_history_no_truncate
  before truncate on public.task_status_history
  for each statement execute function public.task_status_history_guard();

-- 7) Status triggers --------------------------------------------
create function public.tasks_track_status_before() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.status_changed_at := now();
    if new.status = 'blocked' then
      new.blocker_since := coalesce(case when tg_op = 'UPDATE' then old.blocker_since end, now());
    else
      new.blocker_since := null;
    end if;
  end if;
  return new;
end;
$$;

-- SECURITY DEFINER: the only writer of task_status_history. Works for sessions with
-- auth.uid() = null (manual PIN / anon): the actor then comes from the client claim
-- tasks.status_changed_by and is labelled 'client_claim' (unverified), else 'unknown'.
create function public.tasks_track_status_after() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid;
  src text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;
  begin
    uid := auth.uid();
  exception when others then
    uid := null;
  end;
  if uid is not null then
    src := 'auth';
  elsif new.status_changed_by is not null then
    uid := new.status_changed_by; src := 'client_claim';
  else
    src := 'unknown';
  end if;
  insert into public.task_status_history(task_id, from_status, to_status, blocker, actor_id, actor_source)
  values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status,
          case when new.status = 'blocked' then new.blocker end, uid, src);
  return null;
end;
$$;
revoke all on function public.tasks_track_status_after() from public;

create trigger trg_tasks_status_before
  before insert or update on public.tasks
  for each row execute function public.tasks_track_status_before();
create trigger trg_tasks_status_after
  after insert or update on public.tasks
  for each row execute function public.tasks_track_status_after();

insert into public.tasks_ops_v1_manifest(object_type, object_name) values
  ('table','public.task_status_history'),
  ('index','public.idx_task_status_history_task'),
  ('function','public.task_status_canonical(text)'),
  ('function','public.task_status_history_guard()'),
  ('function','public.tasks_track_status_before()'),
  ('function','public.tasks_track_status_after()'),
  ('trigger','tasks.trg_tasks_status_before'),
  ('trigger','tasks.trg_tasks_status_after'),
  ('trigger','task_status_history.trg_task_status_history_guard'),
  ('trigger','task_status_history.trg_task_status_history_no_truncate');

commit;
