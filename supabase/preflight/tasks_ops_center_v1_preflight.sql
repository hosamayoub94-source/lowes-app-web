-- =============================================================
-- tasks_ops_center_v1 REV 2 — PREFLIGHT (READ-ONLY). Run on fghdumrgimoeqsafdhhh BEFORE the migration.
-- A single SELECT: no DDL, no DML, no function calls with side effects.
-- Result: one jsonb document. The migration may proceed only when
--   verdict.safe_to_apply = true  (blockers is empty).
-- =============================================================
with
target_cols(tbl, col) as (values
  ('tasks','outcome'),('tasks','next_step'),('tasks','blocker'),('tasks','blocker_since'),('tasks','evidence'),
  ('tasks','review_requested_by'),('tasks','project_code'),('tasks','decision_ref'),('tasks','kpi_key'),
  ('tasks','status_changed_at'),('tasks','status_changed_by'),('projects','abos_code')),
target_rels(name) as (values
  ('abos_projects'),('task_status_history'),('tasks_ops_v1_manifest'),
  ('uq_projects_abos_code'),('idx_tasks_project_code'),('idx_tasks_status_due'),('idx_task_status_history_task')),
target_fns(name) as (values
  ('task_status_canonical'),('tasks_track_status_before'),('tasks_track_status_after'),('task_status_history_guard')),
target_trgs(name) as (values ('trg_tasks_status_before'),('trg_tasks_status_after')),
target_cons(tbl, name) as (values
  ('tasks','tasks_project_code_fkey'),('tasks','tasks_decision_ref_check'),('tasks','tasks_kpi_key_check'),
  ('projects','projects_abos_code_fkey')),
known_projects(code) as (values ('P01'),('P02'),('P03'),('P04'),('P06'),('P07'),('P08'),('P09'),('P10'),('P11')),
accepted(status) as (values
  ('draft'),('ready'),('in_progress'),('waiting_reply'),('blocked'),('review'),('completed'),('archived'),('cancelled'),
  ('pending'),('in_review'),('done'),('overdue')),
collisions as (
  select 'column ' || t.tbl || '.' || t.col as what
    from target_cols t
    join information_schema.columns c on c.table_schema='public' and c.table_name=t.tbl and c.column_name=t.col
  union all select 'relation/index ' || r.name from target_rels r where to_regclass('public.' || r.name) is not null
  union all select 'function ' || f.name from target_fns f
    where exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=f.name)
  union all select 'trigger ' || g.name from target_trgs g
    where exists (select 1 from pg_trigger x where x.tgrelid='public.tasks'::regclass and x.tgname=g.name and not x.tgisinternal)
  union all select 'constraint ' || k.tbl || '.' || k.name from target_cons k
    where exists (select 1 from pg_constraint x where x.conrelid=('public.' || k.tbl)::regclass and x.conname=k.name)
),
status_rows as (
  select status, count(*) n, status not in (select status from accepted) as rejected_by_new_check
  from public.tasks group by status),
tag_hits as (
  select x as tag, count(*) n
  from public.tasks t, unnest(t.tags) x
  where x ~ '^P[0-9]{2}$' or x ~ '^D-[0-9]{3,4}$' or x like 'KPI:%'
  group by x)
select jsonb_pretty(jsonb_build_object(
  'database', jsonb_build_object('current_database', current_database(), 'server_version', current_setting('server_version')),
  'tasks_status_check', (select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.tasks'::regclass and conname='tasks_status_check'),
  'tasks_constraints', (select coalesce(jsonb_agg(jsonb_build_object('name', conname, 'def', pg_get_constraintdef(oid)) order by conname), '[]')
                         from pg_constraint where conrelid='public.tasks'::regclass),
  'tasks_columns', (select jsonb_agg(jsonb_build_object('c', column_name, 't', data_type, 'null', is_nullable) order by ordinal_position)
                    from information_schema.columns where table_schema='public' and table_name='tasks'),
  'projects_columns', (select jsonb_agg(jsonb_build_object('c', column_name, 't', data_type) order by ordinal_position)
                       from information_schema.columns where table_schema='public' and table_name='projects'),
  'projects_constraints', (select coalesce(jsonb_agg(jsonb_build_object('name', conname, 'def', pg_get_constraintdef(oid)) order by conname), '[]')
                           from pg_constraint where conrelid='public.projects'::regclass),
  'status_counts', (select coalesce(jsonb_agg(jsonb_build_object('status', status, 'n', n, 'rejected_by_new_check', rejected_by_new_check) order by n desc), '[]') from status_rows),
  'overdue_rows_stored', (select count(*) from public.tasks where status = 'overdue'),
  'grants', (select coalesce(jsonb_agg(jsonb_build_object('table', table_name, 'grantee', grantee, 'privilege', privilege_type) order by table_name, grantee, privilege_type), '[]')
             from information_schema.role_table_grants
             where table_schema='public' and grantee in ('anon','authenticated','PUBLIC')
               and table_name in ('tasks','task_comments','task_activity','task_points','projects','project_members','profiles')),
  'rls', (select coalesce(jsonb_agg(jsonb_build_object('table', relname, 'rls_enabled', relrowsecurity, 'rls_forced', relforcerowsecurity) order by relname), '[]')
          from pg_class where relnamespace='public'::regnamespace and relkind='r'
            and relname in ('tasks','task_comments','task_activity','task_points','projects','project_members')),
  'policies', (select coalesce(jsonb_agg(jsonb_build_object('table', tablename, 'name', policyname, 'cmd', cmd, 'roles', roles, 'using', qual, 'check', with_check) order by tablename, policyname), '[]')
               from pg_policies where schemaname='public' and tablename in ('tasks','task_comments','task_activity','task_points','projects','project_members')),
  'triggers_on_tasks', (select coalesce(jsonb_agg(jsonb_build_object('name', tgname, 'timing_events', pg_get_triggerdef(oid)) order by tgname), '[]')
                        from pg_trigger where tgrelid='public.tasks'::regclass and not tgisinternal),
  'tags_with_links', (select coalesce(jsonb_agg(jsonb_build_object('tag', tag, 'n', n) order by tag), '[]') from tag_hits),
  'unknown_project_tags', (select coalesce(jsonb_agg(jsonb_build_object('tag', tag, 'n', n) order by tag), '[]')
                           from tag_hits where tag ~ '^P[0-9]{2}$' and tag not in (select code from known_projects)),
  'backfill_candidates', (select count(*) from public.tasks t
                          where exists (select 1 from unnest(t.tags) x where x ~ '^(P[0-9]{2}|D-[0-9]{3,4}|KPI:.+)$')),
  'collisions', (select coalesce(jsonb_agg(what order by what), '[]') from collisions),
  'verdict', jsonb_build_object(
    'rows_in_tasks', (select count(*) from public.tasks),
    'rows_rejected_by_new_check', (select coalesce(sum(n), 0) from status_rows where rejected_by_new_check),
    'blockers', (select coalesce(jsonb_agg(b), '[]') from (
        select 'name collision: ' || what as b from collisions
        union all select 'tasks has statuses the new CHECK rejects: ' || count(*) from status_rows where rejected_by_new_check having count(*) > 0
      ) q),
    'safe_to_apply', (not exists (select 1 from collisions)) and (not exists (select 1 from status_rows where rejected_by_new_check))
  )
)) as preflight;
