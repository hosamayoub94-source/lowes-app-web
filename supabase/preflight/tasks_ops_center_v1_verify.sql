-- =============================================================
-- tasks_ops_center_v1 REV 2 — VERIFY (READ-ONLY). Run AFTER the migration.
-- One SELECT; every row must have ok = true.
-- =============================================================
select check_name, ok, detail from (
  select 1 n, 'manifest present' check_name,
         to_regclass('public.tasks_ops_v1_manifest') is not null ok,
         (select count(*)::text || ' objects recorded' from public.tasks_ops_v1_manifest) detail
  union all select 2, 'status CHECK has the 9 canonical values',
         (select bool_and(pg_get_constraintdef(oid) like '%' || v || '%') from pg_constraint,
            unnest(array['draft','ready','in_progress','waiting_reply','blocked','review','completed','archived','cancelled']) v
          where conrelid='public.tasks'::regclass and conname='tasks_status_check'),
         (select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.tasks'::regclass and conname='tasks_status_check')
  union all select 3, 'all 11 new tasks columns exist',
         (select count(*) = 11 from information_schema.columns where table_schema='public' and table_name='tasks'
            and column_name in ('outcome','next_step','blocker','blocker_since','evidence','review_requested_by','project_code','decision_ref','kpi_key','status_changed_at','status_changed_by')),
         null
  union all select 4, 'projects.abos_code + unique index + FK',
         exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='abos_code')
         and to_regclass('public.uq_projects_abos_code') is not null
         and exists (select 1 from pg_constraint where conname='projects_abos_code_fkey'),
         null
  union all select 5, 'abos_projects has 10 codes, no P05',
         (select count(*) = 10 and not bool_or(code = 'P05') from public.abos_projects), null
  union all select 6, 'no task carries an unknown project_code',
         (select count(*) = 0 from public.tasks t where t.project_code is not null and not exists (select 1 from public.abos_projects a where a.code = t.project_code)), null
  union all select 7, 'history: API roles have SELECT only',
         (select coalesce(bool_and(privilege_type = 'SELECT'), true) from information_schema.role_table_grants
           where table_schema='public' and table_name='task_status_history' and grantee in ('anon','authenticated','PUBLIC')),
         (select string_agg(grantee || ':' || privilege_type, ', ') from information_schema.role_table_grants
           where table_schema='public' and table_name='task_status_history' and grantee in ('anon','authenticated','PUBLIC'))
  union all select 8, 'history: RLS on, exactly one SELECT policy, no write policy',
         (select relrowsecurity from pg_class where oid='public.task_status_history'::regclass)
         and (select count(*) = 1 and bool_and(cmd = 'SELECT') from pg_policies where schemaname='public' and tablename='task_status_history'),
         null
  union all select 9, 'append-only + status triggers present',
         (select count(*) = 4 from pg_trigger where not tgisinternal and tgname in
            ('trg_task_status_history_guard','trg_task_status_history_no_truncate','trg_tasks_status_before','trg_tasks_status_after')), null
  union all select 10, 'tasks_status_after is SECURITY DEFINER; guard functions exist',
         (select prosecdef from pg_proc where proname='tasks_track_status_after' and pronamespace='public'::regnamespace)
         and to_regprocedure('public.task_status_history_guard()') is not null
         and to_regprocedure('public.task_status_canonical(text)') is not null, null
  union all select 11, 'existing triggers untouched (updated_at, completed_at, points)',
         (select count(*) >= 3 from pg_trigger where tgrelid='public.tasks'::regclass and not tgisinternal
            and tgname in ('trg_tasks_updated_at','trg_tasks_completed_at','trg_task_points')), null
  union all select 12, 'canonical mapping',
         public.task_status_canonical('pending') = 'ready' and public.task_status_canonical('in_review') = 'review'
         and public.task_status_canonical('done') = 'completed' and public.task_status_canonical('overdue') = 'ready'
         and public.task_status_canonical('blocked') = 'blocked', null
  union all select 13, 'legacy values still stored (informational: tighten the CHECK only when this is 0)',
         true, (select count(*)::text || ' rows with pending/in_review/done/overdue' from public.tasks where status in ('pending','in_review','done','overdue'))
  union all select 14, 'version marker = rev 2',
         obj_description('public.tasks_ops_v1_manifest'::regclass, 'pg_class') = 'tasks_ops_center_v1 rev 2',
         obj_description('public.tasks_ops_v1_manifest'::regclass, 'pg_class')
  union all select 15, 'WARNING (informational): tasks RLS is NOT fixed by this migration',
         true,
         coalesce((select 'policy ' || policyname || ' USING(' || qual || ') => team separation is UI-only' from pg_policies where schemaname='public' and tablename='tasks' and qual = 'true' limit 1),
                  'no USING(true) policy on tasks')
) v order by n;
