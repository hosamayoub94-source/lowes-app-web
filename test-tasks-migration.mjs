process.on('uncaughtException', (e) => { console.error('CRASH:', String(e && e.message).slice(0, 300)); process.exit(2); });
process.on('unhandledRejection', (e) => { console.error('CRASH:', String(e && e.message).slice(0, 300)); process.exit(2); });
/* eslint-env node */
// tasks_ops_center_v1 (rev 2) على PGlite محلي — لا اتصال بأي قاعدة حقيقية.
// المخطط يحاكي القاعدة الحية (قراءة 25 تشرين الأول 2026): أعمدة tasks، قيد الحالة القديم، سياسة tasks_all المفتوحة،
// المشغّلات الحالية، أدوار anon/authenticated، وauth.uid(). يغطي: preflight، التطبيق، RLS/الصلاحيات الحقيقية،
// trigger تحت جلسة مستخدم، INSERT بحالة blocked، actor، سجل append-only، projects.abos_code والفهارس،
// تصادم الأسماء، التوافق قبل/بعد، وrollback الآمن (يرفض عند وجود بيانات بلا export).
// Run: node test-tasks-migration.mjs
import { PGlite } from '@electric-sql/pglite';
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
const err = async (p) => { try { await p; return null; } catch (e) { return String(e.message || e); } };
// ملفات الـmigration تفتح معاملة؛ عند الخطأ تبقى مفتوحة ومجهَضة — نُنهيها كما يفعل العميل الحقيقي
const tryx = async (d, sql) => { try { await d.exec(sql); return null; } catch (e) { try { await d.exec('rollback'); } catch { /* none open */ } return String(e.message || e); } };
const read = (f) => fs.readFileSync(f, 'utf8');

const UP = read('supabase/tasks_ops_center_v1.sql');
const DOWN = read('supabase/rollbacks/tasks_ops_center_v1_down.sql');
const EXPORT = read('supabase/rollbacks/tasks_ops_center_v1_export.sql');
const PREFLIGHT = read('supabase/preflight/tasks_ops_center_v1_preflight.sql');
const VERIFY = read('supabase/preflight/tasks_ops_center_v1_verify.sql');

const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';
const LEGACY_CHECK = `CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'in_review'::text, 'done'::text, 'completed'::text, 'cancelled'::text, 'overdue'::text])))`;

// ── مخطط يحاكي الحي ───────────────────────────────────────
async function fresh({ withLinkTags = true, extra = '' } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;

    create table profiles (id uuid primary key default gen_random_uuid(), employee_name text, total_points int);
    create table task_points (id uuid primary key default gen_random_uuid(), employee_name text, task_id uuid, points int not null, reason text, created_at timestamptz not null default now());
    insert into profiles(id, employee_name) values ('${U1}', 'حسام'), ('${U2}', 'أماني');
    create table projects (id uuid primary key default gen_random_uuid(), key text unique not null, name text not null,
      icon text default '📁', is_active boolean not null default true, created_at timestamptz not null default now());
    insert into projects(key, name) values ('damascus_expo', 'معرض دمشق'), ('claudine_monthly_plan_a68d72', 'Claudine_Monthly_Plan');

    create table tasks (
      id uuid primary key default gen_random_uuid(),
      title text not null, description text,
      status text not null default 'pending', priority text not null default 'medium',
      progress smallint not null default 0, assigned_to uuid references profiles(id) on delete set null,
      created_by uuid references profiles(id) on delete set null, due_date timestamptz,
      seen_by uuid[] not null default '{}', attachments jsonb not null default '[]'::jsonb,
      tags text[] not null default '{}', created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(), completed_at timestamptz,
      platform text, task_type text, attachments_note text, completion_note text, due_time text,
      assignee_id uuid references profiles(id) on delete set null, link text, team text,
      project_id uuid references projects(id) on delete set null, is_sensitive boolean not null default false,
      tagged_ids uuid[] not null default '{}', start_date date,
      constraint tasks_priority_check check (priority = any (array['low','medium','high','urgent'])),
      constraint tasks_progress_check check (progress >= 0 and progress <= 100),
      constraint tasks_status_check check (status = any (array['pending','in_progress','in_review','done','completed','cancelled','overdue']))
    );
    create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
    create function set_completed_at() returns trigger language plpgsql as $$ begin
      if new.status in ('completed','done') and old.status is distinct from new.status then new.completed_at := now(); end if; return new; end $$;
    create function award_task_points() returns trigger language plpgsql as $$
    DECLARE pts int := 8;
    BEGIN
      IF (NEW.status IN ('done','completed')) AND (OLD.status IS DISTINCT FROM NEW.status)
         AND (OLD.status NOT IN ('done','completed')) THEN
        IF NEW.due_date IS NOT NULL AND NEW.completed_at IS NOT NULL
           AND NEW.completed_at::date <= NEW.due_date THEN
          pts := 15;
        END IF;
        INSERT INTO task_points (employee_name, task_id, points, reason)
        VALUES (
          COALESCE((SELECT employee_name FROM profiles WHERE id = NEW.assigned_to::text::uuid LIMIT 1), NEW.assigned_to::text),
          NEW.id, pts,
          CASE WHEN pts = 15 THEN 'مهمة منجزة في الوقت' ELSE 'مهمة منجزة' END
        )
        ON CONFLICT DO NOTHING;
        UPDATE profiles SET total_points = COALESCE(total_points, 0) + pts
        WHERE id = NEW.assigned_to::text::uuid OR employee_name = NEW.assigned_to::text;
      END IF;
      RETURN NEW;
    END; $$;
    create trigger trg_tasks_updated_at before update on tasks for each row execute function set_updated_at();
    create trigger trg_tasks_completed_at before update on tasks for each row execute function set_completed_at();
    create trigger trg_task_points after update on tasks for each row execute function award_task_points();

    alter table tasks enable row level security;
    create policy tasks_all on tasks for all to public using (true) with check (true);   -- كما هي حياً: مفتوحة
    grant all on tasks to anon, authenticated;
    alter table projects enable row level security;
    create policy projects_all on projects for all to public using (true) with check (true);
    grant all on projects to anon, authenticated;
    grant select on profiles to anon, authenticated;
    grant update (total_points) on profiles to anon, authenticated;   -- كما هي حياً (column_privileges، قراءة 26 تشرين الأول 2026)
    grant all on task_points to anon, authenticated;

    insert into task_points(employee_name, task_id, points, reason) values ('حسام', gen_random_uuid(), 15, 'قديم'), ('حسام', gen_random_uuid(), 8, 'قديم'), ('أماني', gen_random_uuid(), 8, 'قديم');
    update profiles set total_points = 31 where id = '${U1}';
    -- توزيع الحي: 249 completed / 10 pending / 1 in_progress / 8 cancelled
    insert into tasks(title, status, due_date, completed_at, assignee_id)
      select 'م' || g, 'completed', now() - interval '3 days', now() - interval '2 days', '${U1}' from generate_series(1, 249) g;
    insert into tasks(title, status, due_date) select 'ق' || g, 'pending', now() + interval '2 days' from generate_series(1, 10) g;
    insert into tasks(title, status) values ('جارية', 'in_progress');
    insert into tasks(title, status) select 'ل' || g, 'cancelled' from generate_series(1, 8) g;
    ${withLinkTags ? `
    update tasks set tags = '{وسم,P02,D-140,KPI:orders}' where title = 'م1';
    update tasks set tags = '{P99}' where title = 'م2';
    update tasks set tags = '{وسم}' where title = 'م3';` : ''}
    ${extra}
  `);
  return db;
}
const one = async (db, sql) => (await db.query(sql)).rows[0];
const n = async (db, sql) => Number((await one(db, sql)).c);
const fingerprint = async (db) => (await one(db, `select md5(string_agg(concat_ws('|', id, title, status, priority, coalesce(tags::text,''), coalesce(due_date::text,''), coalesce(assignee_id::text,'')), ',' order by id)) c from tasks`)).c;
async function as(db, role, sub, fn) {
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub || '']);
  try { return await fn(); } finally { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub', '', false)`); }
}
const preflight = async (db) => JSON.parse((await one(db, PREFLIGHT)).preflight);
const verify = async (db) => (await db.query(VERIFY)).rows;

// ══ A) preflight (للقراءة فقط) على الحالة قبل التطبيق ══
const db = await fresh();
await db.exec('begin read only');
const pf = await preflight(db);
await db.exec('rollback');
ok(pf.verdict.safe_to_apply === true && pf.verdict.blockers.length === 0, 'preflight: آمن للتطبيق على الحالة النظيفة');
eq(pf.verdict.rows_in_tasks, 268, 'preflight: 268 مهمة');
eq(pf.status_counts.reduce((a, s) => a + s.n, 0), 268, 'preflight: مجموع الحالات');
ok(pf.tasks_status_check === LEGACY_CHECK, 'preflight: يقرأ القيد الحالي حرفياً');
ok(pf.unknown_project_tags.some((t) => t.tag === 'P99'), 'preflight: يبلّغ عن P99 غير المعروف');
eq(pf.backfill_candidates, 2, 'preflight: صفّان سيُلمَسان بالـbackfill (تنبيه updated_at)');
ok(pf.policies.some((p) => p.table === 'tasks' && p.name === 'tasks_all' && p.using === 'true'), 'preflight: يُظهر سياسة tasks_all المفتوحة');
ok(pf.grants.some((g) => g.table === 'tasks' && g.grantee === 'anon'), 'preflight: يُظهر صلاحيات anon على tasks');
ok(pf.triggers_on_tasks.length === 3, 'preflight: مشغّلات tasks الحالية الثلاثة');
eq(pf.overdue_rows_stored, 0, 'preflight: لا صفوف status=overdue مخزنة');
ok(pf.tasks_columns.some((c) => c.c === 'due_date') && pf.projects_columns.some((c) => c.c === 'key'), 'preflight: أعمدة tasks/projects');
eq(pf.collisions, [], 'preflight: لا تصادم أسماء');

// ══ B) تصادم الأسماء: preflight ينبّه والـmigration ترفض وتترك كل شيء ══
for (const [label, extra, token] of [
  ['عمود outcome موجود', `alter table tasks add column outcome text;`, 'column tasks.outcome'],
  ['فهرس idx_tasks_status_due موجود', `create index idx_tasks_status_due on tasks(priority);`, 'idx_tasks_status_due'],
  ['جدول task_status_history موجود', `create table task_status_history(id int);`, 'task_status_history'],
  ['دالة task_status_canonical موجودة', `create function task_status_canonical(s text) returns text language sql as $$ select s $$;`, 'task_status_canonical'],
  ['قيد tasks_kpi_key_check موجود', `alter table tasks add constraint tasks_kpi_key_check check (true);`, 'tasks_kpi_key_check'],
]) {
  const d = await fresh({ extra });
  const p = await preflight(d);
  ok(p.verdict.safe_to_apply === false && JSON.stringify(p.verdict.blockers).includes(token), `preflight يمنع: ${label}`);
  const before = await fingerprint(d);
  const e = await tryx(d, UP);
  ok(e && e.includes('refused') && e.includes(token), `migration ترفض: ${label}`);
  ok((await one(d, `select pg_get_constraintdef(oid) c from pg_constraint where conname='tasks_status_check'`)).c === LEGACY_CHECK, `القيد القديم سليم بعد الرفض: ${label}`);
  eq(await n(d, `select count(*) c from pg_class where relname='tasks_ops_v1_manifest'`), 0, `لا manifest بعد الرفض: ${label}`);
  ok(await fingerprint(d) === before, `البيانات لم تتغير: ${label}`);
  // الكائن السابق ما زال هناك (لن يُحذف لاحقاً لأنه ليس من صنع الـmigration)
  if (label.startsWith('فهرس')) eq(await n(d, `select count(*) c from pg_indexes where indexname='idx_tasks_status_due'`), 1, 'الفهرس المسبق باقٍ');
}

// ══ C) التطبيق + التوافق قبل/بعد ══
const pointsFp = async (d) => (await one(d, `select count(*)::text || '|' || coalesce(sum(points),0)::text || '|' || (select total_points from profiles where id='${U1}')::text c from task_points`)).c;
const pointsBefore = await pointsFp(db);
const beforeFp = await fingerprint(db);
const beforeCounts = (await db.query(`select status, count(*)::int c from tasks group by 1 order by 1`)).rows;
await db.exec(UP);
ok(await fingerprint(db) === beforeFp, 'توافق: أعمدة المهام القديمة لم تتغير (id/title/status/priority/tags/due/assignee)');
eq((await db.query(`select status, count(*)::int c from tasks group by 1 order by 1`)).rows, beforeCounts, 'توافق: توزيع الحالات نفسه');
eq(await n(db, `select count(*) c from tasks`), 268, 'توافق: 268 مهمة');
eq(await pointsFp(db), pointsBefore, 'النقاط الحالية (task_points وtotal_points) لم تُمسّ بالـmigration');
const vr = await verify(db);
ok(vr.every((r) => r.ok === true), `verify: كل الفحوص ok (${vr.filter((r) => !r.ok).map((r) => r.check_name).join(' | ')})`);
eq(vr.length, 15, 'verify: 15 فحصاً (آخرها تحذير RLS إعلامي)');
ok(vr.find((r) => r.check_name.startsWith('WARNING')).detail.includes('UI-only'), 'verify: يطبع تحذير أن فصل الفرق واجهة فقط');
eq((await one(db, "select obj_description('public.tasks_ops_v1_manifest'::regclass,'pg_class') c")).c, 'tasks_ops_center_v1 rev 2', 'علامة الإصدار rev 2 على الـmanifest');
ok(UP.includes('SECURITY WARNING') && UP.includes('tasks_all') && UP.includes('REV 2'), 'ملف الـmigration يحمل تحذير RLS وعلامة REV 2');
for (const [name, txt] of [['export', EXPORT], ['down', DOWN], ['preflight', PREFLIGHT], ['verify', VERIFY]]) ok(txt.includes('REV 2'), `${name}: يحمل REV 2`);
const e2 = await tryx(db, UP);
ok(e2 && e2.includes('already applied'), 'تطبيق ثانٍ يُرفض بوضوح');
eq(await n(db, `select count(*) c from tasks_ops_v1_manifest`), 31, 'manifest كما هو بعد المحاولة الثانية (31 سجلاً)');

// القيد والحالات
for (const s of ['draft', 'ready', 'in_progress', 'waiting_reply', 'blocked', 'review', 'completed', 'archived', 'cancelled']) {
  ok(!(await err(db.exec(`insert into tasks(title, status) values ('c-${s}', '${s}')`))), `حالة قياسية مقبولة: ${s}`);
}
for (const s of ['pending', 'in_review', 'done', 'overdue']) {
  ok(!(await err(db.exec(`insert into tasks(title, status) values ('l-${s}', '${s}')`))), `حالة قديمة ما زالت مقبولة (توافق): ${s}`);
}
ok(await err(db.exec(`insert into tasks(title, status) values ('x', 'bogus')`)), 'حالة مجهولة مرفوضة');

// الربط
const t1 = await one(db, `select project_code, decision_ref, kpi_key from tasks where title='م1'`);
eq([t1.project_code, t1.decision_ref, t1.kpi_key], ['P02', 'D-140', 'orders'], 'backfill: P02/D-140/orders');
eq((await one(db, `select project_code from tasks where title='م2'`)).project_code, null, 'backfill: P99 لا يُنسخ');
ok((await err(db.exec(`update tasks set project_code='P99' where title='م3'`)) || '').includes('foreign key'), 'project_code=P99 مرفوض (FK على المصدر)');
ok(await err(db.exec(`update tasks set project_code='P05' where title='م3'`)), 'P05 (مُسقَط) غير مقبول');
ok(await err(db.exec(`update tasks set decision_ref='D12' where title='م3'`)), 'decision_ref بصيغة خاطئة مرفوض');
ok(await err(db.exec(`update tasks set kpi_key='nps' where title='م3'`)), 'kpi_key خارج Scorecard مرفوض');
ok(!(await err(db.exec(`update tasks set project_code='P09', decision_ref='D-1234', kpi_key='revenue' where title='م3'`))), 'قيم صحيحة مقبولة');
eq(await n(db, `select count(*) c from abos_projects`), 10, 'abos_projects: 10 مشاريع');
eq(await n(db, `select count(*) c from abos_projects where code='P05'`), 0, 'abos_projects: لا P05');
ok(!(await err(db.exec(`update projects set abos_code='P02' where key='damascus_expo'`))), 'projects.abos_code=P02 مقبول');
ok(await err(db.exec(`update projects set abos_code='P02' where key='claudine_monthly_plan_a68d72'`)), 'abos_code مكرر مرفوض (فهرس فريد جزئي)');
ok(await err(db.exec(`update projects set abos_code='P99' where key='claudine_monthly_plan_a68d72'`)), 'projects.abos_code=P99 مرفوض (FK)');
ok(!(await err(db.exec(`update projects set abos_code=null where key='damascus_expo'`))), 'abos_code يقبل NULL');
// الفهارس
for (const ix of ['uq_projects_abos_code', 'idx_tasks_project_code', 'idx_tasks_status_due', 'idx_task_status_history_task']) {
  eq(await n(db, `select count(*) c from pg_indexes where indexname='${ix}'`), 1, `فهرس ${ix}`);
}
ok((await one(db, `select indexdef d from pg_indexes where indexname='uq_projects_abos_code'`)).d.includes('UNIQUE'), 'uq_projects_abos_code فريد');
ok((await one(db, `select indexdef d from pg_indexes where indexname='idx_tasks_project_code'`)).d.includes('WHERE'), 'idx_tasks_project_code جزئي');

// قاموس الحالات SQL مقابل JS
const out = path.join(process.cwd(), '.tmp-tasks-migration.mjs');
await build({ stdin: { contents: `export * as W from './src/modules/tasks/utils/taskWorkflow.js'; export * as L from './src/modules/tasks/utils/taskLinks.js'; export * as T from './src/modules/tasks/types/task.types.js';`, resolveDir: process.cwd(), loader: 'js' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
let mod; try { mod = await import(pathToFileURL(out).href); } finally { fs.unlinkSync(out); }
for (const s of ['pending', 'in_review', 'done', 'overdue', 'ready', 'review', 'completed', 'blocked', 'waiting_reply', 'draft', 'archived', 'cancelled', 'in_progress']) {
  eq((await one(db, `select task_status_canonical('${s}') c`)).c, mod.W.normalizeStatus(s), `mapping SQL = JS : ${s}`);
}
eq((await one(db, `select task_status_canonical('pending') a, task_status_canonical('in_review') b, task_status_canonical('done') c, task_status_canonical('overdue') d`)), { a: 'ready', b: 'review', c: 'completed', d: 'ready' }, 'mapping موثّق: pending→ready، in_review→review، done→completed، overdue→ready (مشتقة)');
// رموز المشاريع في SQL = ثابت التطبيق
const sqlCodes = [...UP.matchAll(/\('(P\d{2})','/g)].map((m) => m[1]);
eq(sqlCodes, mod.L.ABOS_PROJECTS.map((p) => p.code), 'رموز abos_projects بالـSQL = ABOS_PROJECTS بالتطبيق');
// التطبيق لا يعرض/يكتب overdue
ok(!mod.T.STATUS_OPTIONS.some((o) => o.value === 'overdue'), 'STATUS_OPTIONS لا تعرض overdue');
for (const s of ['overdue', 'pending', 'in_review', 'done']) ok(mod.W.toDbStatus(s, true) !== 'overdue', `toDbStatus(${s}) لا يكتب overdue`);

// ══ D) الصلاحيات والـRLS الحقيقية ══
for (const role of ['anon', 'authenticated']) {
  const sub = role === 'authenticated' ? U1 : '';
  await as(db, role, sub, async () => {
    ok(!(await err(db.query(`select count(*) from task_status_history`))), `${role}: يقرأ التاريخ`);
    ok(await err(db.exec(`insert into task_status_history(task_id,to_status,actor_source) select id,'x','unknown' from tasks limit 1`)), `${role}: INSERT على التاريخ مرفوض`);
    ok(await err(db.exec(`update task_status_history set blocker='x'`)), `${role}: UPDATE على التاريخ مرفوض`);
    ok(await err(db.exec(`delete from task_status_history`)), `${role}: DELETE على التاريخ مرفوض`);
    ok(await err(db.exec(`truncate task_status_history`)), `${role}: TRUNCATE على التاريخ مرفوض`);
    ok(await err(db.query(`select * from tasks_ops_v1_manifest`)), `${role}: manifest غير مقروء`);
    ok(!(await err(db.query(`select * from abos_projects`))), `${role}: يقرأ abos_projects`);
    ok(await err(db.exec(`insert into abos_projects(code,name) values ('P12','x')`)), `${role}: لا يكتب abos_projects`);
    ok(await err(db.query(`select tasks_track_status_after()`)), `${role}: لا يستدعي دالة الـdefiner مباشرة`);
  });
}
const grants = (await db.query(`select grantee, privilege_type p from information_schema.role_table_grants where table_name='task_status_history' and grantee in ('anon','authenticated','PUBLIC')`)).rows;
ok(grants.length === 2 && grants.every((g) => g.p === 'SELECT'), 'منح التاريخ: SELECT فقط لـanon وauthenticated');
const pol = (await db.query(`select cmd, qual from pg_policies where tablename='task_status_history'`)).rows;
ok(pol.length === 1 && pol[0].cmd === 'SELECT' && pol[0].qual.includes('tasks'), 'سياسة التاريخ: واحدة SELECT مرتبطة بالمهمة (ليست using(true))');
ok(!(await err(db.exec(`select 1 from tasks limit 1`))), 'ملاحظة: tasks_all لم تُمسّ');
eq(await n(db, `select count(*) c from pg_policies where tablename='tasks' and policyname='tasks_all'`), 1, 'سياسة tasks_all كما هي (القرار خارج هذا العمل)');
// المالك أيضاً لا يعدّل/يحذف التاريخ مباشرة
await db.exec(`update tasks set status='in_progress' where title='ق1'`);
ok((await err(db.exec(`update task_status_history set blocker='x'`)) || '').includes('append-only'), 'المالك: UPDATE مباشر مرفوض بالـguard');
ok((await err(db.exec(`delete from task_status_history`)) || '').includes('append-only'), 'المالك: DELETE مباشر مرفوض بالـguard');
ok((await err(db.exec(`truncate task_status_history`)) || '').includes('append-only'), 'المالك: TRUNCATE مرفوض بالـguard');

// ══ E) trigger تحت جلسة مستخدم + actor + INSERT blocked ══
await as(db, 'authenticated', U1, async () => { await db.exec(`update tasks set status='waiting_reply', next_step='ينتظر رد' where title='ق2'`); });
let h = await one(db, `select h.from_status, h.to_status, h.actor_id, h.actor_source from task_status_history h join tasks t on t.id=h.task_id where t.title='ق2'`);
eq([h.from_status, h.to_status, h.actor_id, h.actor_source], ['pending', 'waiting_reply', U1, 'auth'], 'authenticated: الفاعل من auth.uid()');
await as(db, 'anon', '', async () => { await db.query(`update tasks set status='review', status_changed_by=$1 where title='ق3'`, [U2]); });
h = await one(db, `select h.actor_id, h.actor_source from task_status_history h join tasks t on t.id=h.task_id where t.title='ق3'`);
eq([h.actor_id, h.actor_source], [U2, 'client_claim'], 'anon بلا auth.uid(): الفاعل من ادّعاء العميل ومُعلَّم client_claim');
await as(db, 'anon', '', async () => { await db.exec(`update tasks set status='in_progress' where title='ق4'`); });
h = await one(db, `select h.actor_id, h.actor_source from task_status_history h join tasks t on t.id=h.task_id where t.title='ق4'`);
eq([h.actor_id, h.actor_source], [null, 'unknown'], 'anon بلا ادّعاء: unknown');
const hc = await n(db, `select count(*) c from task_status_history`);
await as(db, 'anon', '', async () => { await db.exec(`update tasks set priority='high' where title='ق5'`); });
eq(await n(db, `select count(*) c from task_status_history`), hc, 'تحديث بلا تغيير حالة لا يكتب تاريخاً');
await as(db, 'anon', '', async () => { await db.exec(`update tasks set status='pending' where title='ق5'`); });
eq(await n(db, `select count(*) c from task_status_history`), hc, 'نفس الحالة لا تكتب تاريخاً');
// INSERT بحالة blocked
await as(db, 'anon', '', async () => { await db.query(`insert into tasks(title, status, blocker, status_changed_by) values ('عالقة-من-البداية', 'blocked', 'ينتظر قرار حسام', $1)`, [U1]); });
const ins = await one(db, `select t.blocker_since is not null bs, t.status_changed_at is not null sc from tasks t where title='عالقة-من-البداية'`);
ok(ins.bs && ins.sc, 'INSERT blocked: blocker_since وstatus_changed_at مضبوطان');
h = await one(db, `select h.from_status, h.to_status, h.blocker, h.actor_id, h.actor_source from task_status_history h join tasks t on t.id=h.task_id where t.title='عالقة-من-البداية'`);
eq([h.from_status, h.to_status, h.blocker, h.actor_id, h.actor_source], [null, 'blocked', 'ينتظر قرار حسام', U1, 'client_claim'], 'INSERT blocked: صف تاريخ أولي مع العائق والفاعل');
await db.exec(`update tasks set status='in_progress', blocker=null where title='عالقة-من-البداية'`);
eq((await one(db, `select blocker_since is null z from tasks where title='عالقة-من-البداية'`)).z, true, 'فكّ العائق يمسح blocker_since');
eq(await n(db, `select count(*) c from task_status_history h join tasks t on t.id=h.task_id where t.title='عالقة-من-البداية'`), 2, 'سجلان: إدراج ثم انتقال');
// المشغّلات الحالية ما زالت تعمل
const done = await one(db, `select 1 from tasks where title='ق6'`);
await db.exec(`update tasks set status='done' where title='ق6'`);
ok((await one(db, `select completed_at is not null c from tasks where title='ق6'`)).c, 'trg_tasks_completed_at ما زال يعمل');
ok(done !== undefined, 'قراءة ق6');
// حذف مهمة (بصلاحية anon عبر سياسة tasks_all) يحذف تاريخها بالـcascade رغم الـguard
const delId = (await one(db, `select id from tasks where title='ق2'`)).id;
eq(await n(db, `select count(*) c from task_status_history where task_id='${delId}'`), 1, 'ق2 لها صف تاريخ');
await as(db, 'anon', '', async () => { await db.exec(`delete from tasks where id='${delId}'`); });
eq(await n(db, `select count(*) c from task_status_history where task_id='${delId}'`), 0, 'حذف المهمة يحذف تاريخها بالـcascade (الاستثناء الوحيد)');

// ══ G) النقاط: مصدر واحد (trigger القاعدة) ══
// إكمال مهمة مرة واحدة عبر نفس تحديث التطبيق (status + completed_at + status_changed_by) = صف نقاط واحد.
const ptsOf = async (id) => (await db.query(`select points, reason from task_points where task_id='${id}' order by created_at`)).rows;
await db.exec(`insert into tasks(id, title, status, assigned_to, due_date) values
  ('00000000-0000-4000-8000-0000000000a1', 'نقاط-في-الوقت', 'in_progress', '${U1}', now() + interval '1 day'),
  ('00000000-0000-4000-8000-0000000000a2', 'نقاط-متأخرة', 'in_progress', '${U1}', now() - interval '3 days')`);
const tpBefore = await n(db, `select count(*) c from task_points`);
const totalBefore = Number((await one(db, `select total_points c from profiles where id='${U1}'`)).c);
await as(db, 'anon', '', async () => {
  await db.query(`update tasks set status='completed', completed_at=now(), status_changed_by=$1 where id='00000000-0000-4000-8000-0000000000a1'`, [U1]);
});
let p1 = await ptsOf('00000000-0000-4000-8000-0000000000a1');
eq(p1.length, 1, 'إكمال مرة واحدة = صف نقاط واحد فقط (لا منح مزدوج)');
eq(p1[0] && p1[0].points, 15, 'في الموعد = 15');
eq(await n(db, `select count(*) c from task_points`), tpBefore + 1, 'لم يُضَف سوى صف واحد بالجدول كله');
eq(Number((await one(db, `select total_points c from profiles where id='${U1}'`)).c), totalBefore + 15, 'total_points زاد 15 مرة واحدة');
// تحديثات لاحقة بلا تغيير حالة (تعليق، أولوية…) لا تُنتج نقاطاً
await db.exec(`update tasks set priority='high', completion_note='دليل' where id='00000000-0000-4000-8000-0000000000a1'`);
eq((await ptsOf('00000000-0000-4000-8000-0000000000a1')).length, 1, 'تحديث بلا تغيير حالة لا يضيف نقاطاً');
// متأخرة = 8
await db.exec(`update tasks set status='completed', completed_at=now() where id='00000000-0000-4000-8000-0000000000a2'`);
p1 = await ptsOf('00000000-0000-4000-8000-0000000000a2');
eq([p1.length, p1[0] && p1[0].points], [1, 8], 'متأخرة = صف واحد بـ8 نقاط');
// المعاينة بالواجهة = ما يمنحه الـtrigger
const dayKey = (off) => { const d = new Date(Date.now() + off * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
eq([mod.T.calcTaskPointsPreview({ due_date: dayKey(1) + 'T00:00:00+00:00' }), mod.T.calcTaskPointsPreview({ due_date: dayKey(-3) + 'T00:00:00+00:00' }), mod.T.calcTaskPointsPreview({})], [15, 8, 8], 'معاينة النقاط بالواجهة = قاعدة الـtrigger (15 / 8 / 8)');
// الكود لا يلمس النقاط إطلاقاً
for (const f of ['src/modules/tasks/services/taskService.js', 'src/services/taskService.js']) {
  const src = read(f);
  ok(!/from\(\s*['"]task_points['"]\s*\)/.test(src), `${f}: لا كتابة/قراءة task_points من الكود`);
  ok(!/total_points/.test(src), `${f}: لا تعديل total_points من الكود`);
  ok(!/awardPoints\s*\(/.test(src) && !/calcTaskPoints\s*\(/.test(src), `${f}: لا دوال منح نقاط`);
}
// الـmigration لا تلمس النقاط
ok(!/task_points|total_points/.test(UP.replace(/--[^\n]*/g, '')), 'ملف الـmigration لا يذكر جداول/أعمدة النقاط (خارج التعليقات)');

// ══ F) rollback ══
// F1: لا بيانات جديدة → ينجح ويعيد الحالة الأصلية حرفياً
const d1 = await fresh({ withLinkTags: false });
const fp1 = await fingerprint(d1);
const cols1 = (await d1.query(`select column_name from information_schema.columns where table_name='tasks' order by 1`)).rows.map((r) => r.column_name);
await d1.exec(UP);
await d1.exec(DOWN);
ok((await one(d1, `select pg_get_constraintdef(oid) c from pg_constraint where conname='tasks_status_check'`)).c === LEGACY_CHECK, 'F1: القيد الأصلي مُعاد حرفياً');
eq((await d1.query(`select column_name from information_schema.columns where table_name='tasks' order by 1`)).rows.map((r) => r.column_name), cols1, 'F1: أعمدة tasks كما كانت');
eq(await n(d1, `select count(*) c from pg_class where relname in ('tasks_ops_v1_manifest','abos_projects','task_status_history','idx_tasks_status_due','idx_tasks_project_code','uq_projects_abos_code')`), 0, 'F1: كل ما أنشأه الـmigration أُزيل');
eq(await n(d1, `select count(*) c from information_schema.columns where table_name='projects' and column_name='abos_code'`), 0, 'F1: projects.abos_code أُزيل');
eq(await n(d1, `select count(*) c from pg_proc where proname in ('task_status_canonical','tasks_track_status_before','tasks_track_status_after','task_status_history_guard')`), 0, 'F1: الدوال أُزيلت');
eq(await n(d1, `select count(*) c from pg_trigger where tgname like 'trg_tasks_status_%' or tgname like 'trg_task_status_history%'`), 0, 'F1: المشغّلات أُزيلت');
eq(await n(d1, `select count(*) c from pg_trigger where tgname in ('trg_tasks_updated_at','trg_tasks_completed_at','trg_task_points')`), 3, 'F1: مشغّلات tasks الأصلية سليمة');
ok(await fingerprint(d1) === fp1, 'F1: البيانات بعد الـrollback = قبل الـmigration');
// بعد rollback يمكن إعادة التطبيق
ok(!(await tryx(d1, UP)), 'F1: إعادة التطبيق بعد rollback ممكنة');

// F2: بيانات موجودة بلا export → يرفض ولا يغيّر شيئاً
const d2 = await fresh({ withLinkTags: false });
await d2.exec(UP);
await d2.exec(`update tasks set status='blocked', blocker='x', outcome='نتيجة' where title='ق1'`);
const snap2 = { manifest: await n(d2, `select count(*) c from tasks_ops_v1_manifest`), hist: await n(d2, `select count(*) c from task_status_history`), fp: await fingerprint(d2) };
const r2 = await tryx(d2, DOWN);
ok(r2 && r2.includes('rollback refused') && r2.includes('export'), 'F2: يرفض عند وجود بيانات بلا export');
eq(await n(d2, `select count(*) c from information_schema.columns where table_name='tasks' and column_name='outcome'`), 1, 'F2: العمود باقٍ');
eq([await n(d2, `select count(*) c from tasks_ops_v1_manifest`), await n(d2, `select count(*) c from task_status_history`)], [snap2.manifest, snap2.hist], 'F2: manifest والتاريخ كما هما');
eq((await one(d2, `select status c from tasks where title='ق1'`)).c, 'blocked', 'F2: الحالة لم تُحوَّل');
eq((await one(d2, `select outcome c from tasks where title='ق1'`)).c, 'نتيجة', 'F2: القيمة لم تُفقد');

// F3: export ثم rollback → ينجح، يحوّل الحالات، ولا يمسّ النسخ
await d2.exec(EXPORT);
eq(await n(d2, `select count(*) c from tasks_ops_v1_backup_tasks`), 1, 'F3: export يحفظ صف المهمة المعنية');
ok((await n(d2, `select count(*) c from tasks_ops_v1_backup_history`)) >= 1, 'F3: export يحفظ التاريخ');
ok(await err(as(d2, 'anon', '', () => d2.query(`select * from tasks_ops_v1_backup_tasks`))), 'F3: النسخ غير مقروءة لـanon');
await d2.exec(DOWN);
eq((await one(d2, `select status c from tasks where title='ق1'`)).c, 'in_progress', 'F3: blocked→in_progress بعد التأكد من الحفظ');
eq(await n(d2, `select count(*) c from information_schema.columns where table_name='tasks' and column_name='outcome'`), 0, 'F3: العمود أُزيل بعد الـexport');
eq(await n(d2, `select count(*) c from tasks_ops_v1_backup_tasks where outcome='نتيجة' and status='blocked'`), 1, 'F3: النسخة تحتفظ بالقيمة والحالة الأصلية');
ok((await one(d2, `select pg_get_constraintdef(oid) c from pg_constraint where conname='tasks_status_check'`)).c === LEGACY_CHECK, 'F3: القيد الأصلي مُعاد');

// F4: export قديم (تغيّرت البيانات بعده) → يرفض
const d4 = await fresh({ withLinkTags: false });
await d4.exec(UP);
await d4.exec(`update tasks set outcome='أ' where title='ق1'`);
await d4.exec(EXPORT);
await d4.exec(`update tasks set outcome='ب' where title='ق1'`);
const r4 = await tryx(d4, DOWN);
ok(r4 && r4.includes('stale'), 'F4: export قديم → يرفض');
eq((await one(d4, `select outcome c from tasks where title='ق1'`)).c, 'ب', 'F4: لا فقدان');
// F4b: صف جديد ببيانات بعد الـexport
await d4.exec(`drop table tasks_ops_v1_backup_tasks, tasks_ops_v1_backup_history, tasks_ops_v1_backup_projects`);
await d4.exec(EXPORT);
await d4.exec(`update tasks set next_step='جديد' where title='ق2'`);
ok((await tryx(d4, DOWN) || '').includes('stale'), 'F4b: بيانات جديدة بعد الـexport → يرفض');
// F4c: تاريخ جديد بعد الـexport
const d4c = await fresh({ withLinkTags: false });
await d4c.exec(UP); await d4c.exec(EXPORT);
await d4c.exec(`update tasks set status='in_progress' where title='ق1'`);
ok((await tryx(d4c, DOWN) || '').includes('refused'), 'F4c: حالة/تاريخ جديد بعد الـexport → يرفض');
// F4d: صف تاريخ وحده بعد الـexport (المهام مطابقة) → رسالة التاريخ
const d4d = await fresh({ withLinkTags: false });
await d4d.exec(UP); await d4d.exec(EXPORT);
await d4d.exec(`insert into task_status_history(task_id,to_status,actor_source) select id,'ready','unknown' from tasks limit 1`);
ok((await tryx(d4d, DOWN) || '').includes('history rows are not in the export'), 'F4d: صف تاريخ وحده بعد الـexport → يرفض برسالة التاريخ');

// F5: لا يحذف كائنات مسبقة الوجود أو غير مملوكة للـmigration
const d5 = await fresh({ withLinkTags: false, extra: `alter table tasks add column foo text; create index idx_tasks_other on tasks(priority);` });
await d5.exec(UP); await d5.exec(DOWN);
eq(await n(d5, `select count(*) c from information_schema.columns where table_name='tasks' and column_name='foo'`), 1, 'F5: عمود غير مرتبط باقٍ');
eq(await n(d5, `select count(*) c from pg_indexes where indexname='idx_tasks_other'`), 1, 'F5: فهرس غير مرتبط باقٍ');
// F6: لا manifest → يرفض
const r6 = await tryx(await fresh({ withLinkTags: false }), DOWN);
ok(r6 && r6.includes('manifest missing'), 'F6: بلا manifest يرفض');
// F7: حالات قديمة (pending/done/overdue) تبقى صالحة بعد الـrollback
const d7 = await fresh({ withLinkTags: false });
await d7.exec(UP);
await d7.exec(`insert into tasks(title,status) values ('o','overdue'),('d','done')`);
ok((await tryx(d7, DOWN) || '').includes('refused'), 'F7: صفوف جديدة بلا export → يرفض');
await d7.exec(EXPORT);
await d7.exec(DOWN);
eq(await n(d7, `select count(*) c from tasks where status in ('overdue','done')`), 2, 'F7: الحالات القديمة سليمة بعد rollback');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
