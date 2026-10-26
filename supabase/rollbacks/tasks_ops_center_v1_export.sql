-- =============================================================
-- tasks_ops_center_v1 REV 2 — EXPORT (run BEFORE the rollback if the new columns,
-- the history table or any v3-only status contain data). lowes-app-web ONLY.
--
-- Snapshots into private tables inside the same database. They are never
-- dropped by the rollback. The rollback verifies each snapshot row equals the
-- live row and refuses if the export is stale (data changed after exporting).
-- Re-running needs the previous snapshot dropped consciously (create table fails otherwise).
-- Move a copy off-database too if you need a file:
--   COPY public.tasks_ops_v1_backup_tasks TO STDOUT WITH CSV HEADER   (via psql)
-- =============================================================
begin;

create table public.tasks_ops_v1_backup_tasks as
select id, status, outcome, next_step, blocker, blocker_since, evidence, review_requested_by,
       project_code, decision_ref, kpi_key, status_changed_at, status_changed_by
from public.tasks
where outcome is not null or next_step is not null or blocker is not null or blocker_since is not null
   or evidence is not null or review_requested_by is not null or project_code is not null
   or decision_ref is not null or kpi_key is not null or status_changed_at is not null
   or status_changed_by is not null
   or status in ('draft','ready','waiting_reply','blocked','review','archived');

create table public.tasks_ops_v1_backup_history as
select id, task_id, from_status, to_status, blocker, changed_at, actor_id, actor_source
from public.task_status_history;

create table public.tasks_ops_v1_backup_projects as
select id, abos_code from public.projects where abos_code is not null;

-- private: Supabase default privileges would otherwise expose new public tables to the API roles
do $priv$
declare t text;
begin
  foreach t in array array['tasks_ops_v1_backup_tasks','tasks_ops_v1_backup_history','tasks_ops_v1_backup_projects'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end
$priv$;

commit;

-- Review: select (select count(*) from public.tasks_ops_v1_backup_tasks) tasks,
--                (select count(*) from public.tasks_ops_v1_backup_history) history,
--                (select count(*) from public.tasks_ops_v1_backup_projects) projects;
