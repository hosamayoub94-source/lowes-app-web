/* eslint-env node */
// مركز العمل — المهام: تواريخ بلا انحراف توقيت، نموذج الحالات، النطاق/الصلاحيات، مقاييس النتائج، عقد deep link.
// يعيد تشغيل نفسه تحت TZ=Europe/Istanbul وUTC وAmerica/New_York (أخطاء toISOString تظهر خارج UTC فقط).
// Run: node test-tasks-ops.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const self = fileURLToPath(import.meta.url);
if (!process.env.TASKS_TZ_CHILD) {
  let bad = 0;
  for (const tz of ['Europe/Istanbul', 'UTC', 'America/New_York', 'Asia/Dubai']) {
    const r = spawnSync(process.execPath, [self], { env: { ...process.env, TZ: tz, TASKS_TZ_CHILD: '1' }, encoding: 'utf8' });
    process.stdout.write(`[${tz}] ${r.stdout}`);
    if (r.status !== 0) { bad++; process.stderr.write(r.stderr); }
  }
  process.exit(bad ? 1 : 0);
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

const root = process.cwd();
const out = path.join(root, `.tmp-tasks-ops-${process.env.TZ.replace(/\W/g, '')}.mjs`);
const entry = `
  export * as D from './src/modules/tasks/utils/taskDates.js';
  export * as W from './src/modules/tasks/utils/taskWorkflow.js';
  export * as S from './src/modules/tasks/utils/taskScope.js';
  export * as M from './src/modules/tasks/utils/taskMetrics.js';
  export * as N from './src/modules/notifications/types/notification.types.js';
  export * as L from './src/modules/tasks/utils/taskLinks.js';
  export * as F from './src/modules/tasks/utils/taskForm.js';
`;
await build({ stdin: { contents: entry, resolveDir: root, loader: 'js' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
let mod;
try { mod = await import(pathToFileURL(out).href); } finally { fs.unlinkSync(out); }
const { D, W, S, M, N, L, F } = mod;

// ── 1) التواريخ ───────────────────────────────────────────
const at0200 = new Date(2026, 9, 25, 2, 0, 0); // 25 تشرين الأول 02:00 محلي
const at2330 = new Date(2026, 9, 25, 23, 30, 0);
eq(D.todayKey(at0200), '2026-10-25', 'todayKey 02:00');
eq(D.todayKey(at2330), '2026-10-25', 'todayKey 23:30');
eq(D.dueKey('2026-10-25T00:00:00+00:00'), '2026-10-25', 'dueKey من timestamptz مكتوب من حقل تاريخ');
eq(D.dueKey('2026-10-25'), '2026-10-25', 'dueKey تاريخ صرف');
eq(D.dueKey(null), null, 'dueKey null');
eq(D.dueKey('garbage'), null, 'dueKey نص غير صالح');
// الخطأ القديم: موعد اليوم يُعدّ متأخراً بعد 03:00 بتوقيت +3
const dueToday = { status: 'in_progress', due_date: '2026-10-25T00:00:00+00:00' };
ok(!W.isOverdue(dueToday, D.todayKey(at0200)), 'مهمة موعدها اليوم ليست متأخرة صباحاً');
ok(!W.isOverdue(dueToday, D.todayKey(at2330)), 'مهمة موعدها اليوم ليست متأخرة مساءً');
ok(W.isOverdue(dueToday, '2026-10-26'), 'تصير متأخرة صباح الغد');
eq(D.daysOverdue('2026-10-20', '2026-10-25'), 5, 'daysOverdue');
eq(D.daysOverdue('2026-10-25', '2026-10-25'), 0, 'daysOverdue اليوم نفسه');
eq(D.daysOverdue('2026-10-30', '2026-10-25'), 0, 'daysOverdue مستقبلي');
eq(D.diffDays('2026-10-31', '2026-11-01'), 1, 'diffDays عبر الشهر');
eq(D.diffDays('2026-03-28', '2026-03-30'), 2, 'diffDays عبر تغيير التوقيت الصيفي');
eq([1, 3, 4, 7, 8, 14, 15, 40].map(D.ageBucket), ['1-3', '1-3', '4-7', '4-7', '8-14', '8-14', '15+', '15+'], 'ageBucket');
eq(D.ageBucket(0), null, 'ageBucket 0');

// الخطأ القديم في التقرير: toISOString().slice(0,7) يعطي الشهر السابق خارج UTC
const mo = D.monthOptions(at0200, 3);
eq(mo.map((x) => x.val), ['2026-10', '2026-09', '2026-08'], 'monthOptions (الشهر الحالي أولاً)');
const r = D.monthRange('2026-10');
eq([r.fromKey, r.toKey], ['2026-10-01', '2026-10-31'], 'monthRange مفاتيح (آخر يوم 31 لا 30)');
eq(r.fromIso, new Date(2026, 9, 1).toISOString(), 'monthRange fromIso = بداية الشهر المحلية');
eq(r.toIso, new Date(2026, 10, 1).toISOString(), 'monthRange toIso = بداية الشهر التالي (حصري)');
eq(D.monthRange('2026-02').toKey, '2026-02-28', 'شباط 2026');
eq(D.monthRange('2028-02').toKey, '2028-02-29', 'شباط كبيس');
eq(D.monthRange('2026-12').toIso, new Date(2027, 0, 1).toISOString(), 'كانون الأول → السنة التالية');

// ── 2) الحالات ────────────────────────────────────────────
eq(['pending', 'in_review', 'done', 'overdue', null, 'x', 'blocked'].map(W.normalizeStatus),
  ['ready', 'review', 'completed', 'ready', 'ready', 'ready', 'blocked'], 'normalizeStatus');
eq(['ready', 'review', 'in_progress', 'completed', 'cancelled', 'blocked', 'waiting_reply', 'draft', 'archived'].map((s) => W.toDbStatus(s, false)),
  ['pending', 'in_review', 'in_progress', 'completed', 'cancelled', null, null, null, null], 'toDbStatus قبل الـmigration لا يكتب ما ترفضه القاعدة');
eq(['ready', 'blocked', 'waiting_reply', 'review'].map((s) => W.toDbStatus(s, true)), ['ready', 'blocked', 'waiting_reply', 'review'], 'toDbStatus بعد الـmigration');
ok(!W.selectableStatuses(false).includes('blocked'), 'قبل الـmigration لا تُعرض «عالقة»');
ok(W.selectableStatuses(true).includes('blocked') && W.selectableStatuses(true).includes('waiting_reply'), 'بعد الـmigration تُعرض');
ok(W.isClosed({ status: 'done' }) && W.isClosed({ status: 'cancelled' }) && W.isClosed({ status: 'archived' }), 'isClosed يشمل done القديمة');
ok(!W.isOverdue({ status: 'completed', due_date: '2020-01-01' }, '2026-10-25'), 'المكتملة لا تتأخر');
ok(!W.isOverdue({ status: 'cancelled', due_date: '2020-01-01' }, '2026-10-25'), 'الملغاة لا تتأخر');
ok(!W.isOverdue({ status: 'draft', due_date: '2020-01-01' }, '2026-10-25'), 'المسودة لا تتأخر');
ok(W.isOverdue({ status: 'blocked', due_date: '2026-10-01' }, '2026-10-25'), 'العالقة المتأخرة تبقى متأخرة (مشتقة)');
eq(W.ownerId({ assignee_id: 'a' }), 'a', 'ownerId assignee_id');
eq(W.ownerId({ assigned_to: { id: 'b' } }), 'b', 'ownerId كائن');
eq(W.ownerId({ assigned_to: 'c' }), 'c', 'ownerId نص');
eq(W.ownerId({}), null, 'ownerId بلا مالك');

// ── 3) تجميع «اليوم» ──────────────────────────────────────
const TODAY = '2026-10-25';
const T = (id, o) => ({ id, status: 'in_progress', priority: 'medium', due_date: null, updated_at: '2026-10-25T08:00:00Z', ...o });
const tasks = [
  T('overdue', { due_date: '2026-10-20' }),
  T('overdue-old', { due_date: '2026-10-01', priority: 'low' }),
  T('today', { due_date: '2026-10-25', status: 'pending' }),
  T('waiting', { status: 'waiting_reply', due_date: '2026-10-10' }),
  T('blocked', { status: 'blocked', blocker: 'ينتظر قرار', due_date: '2026-10-10' }),
  T('running', { due_date: '2026-11-10' }),
  T('stale', { status: 'pending', due_date: '2026-11-30', updated_at: '2026-10-20T08:00:00Z' }),
  T('fresh-ready', { status: 'pending', due_date: '2026-11-30' }),
  T('done', { status: 'completed', due_date: '2026-10-01' }),
  T('legacy-done', { status: 'done' }),
  T('cancelled', { status: 'cancelled', due_date: '2026-10-01' }),
  T('draft', { status: 'draft', due_date: '2026-10-01' }),
];
const g = W.groupForToday(tasks, { today: TODAY, userId: 'u1' });
eq(g.overdue.map((t) => t.id), ['overdue-old', 'overdue'], 'متأخر: الأقدم أولاً');
eq(g.today.map((t) => t.id).sort(), ['stale', 'today'], 'اليوم: موعده اليوم + راكدة 3 أيام');
eq(g.waiting.map((t) => t.id), ['waiting'], 'بانتظار رد (لا تظهر في المتأخر رغم تأخرها)');
eq(g.blocked.map((t) => t.id), ['blocked'], 'عالقة');
eq(g.inprogress.map((t) => t.id), ['running'], 'قيد التنفيذ');
const all = Object.values(g).flat().map((t) => t.id);
ok(!all.includes('done') && !all.includes('legacy-done') && !all.includes('cancelled') && !all.includes('draft'), 'المكتملة/الملغاة/المسودات لا تلوّث العمل النشط');
ok(!all.includes('fresh-ready'), 'جاهزة بموعد بعيد وحركة حديثة لا تظهر اليوم');
// مراجعة مطلوبة مني
const rv = T('rv', { status: 'review', review_requested_by: 'u1', due_date: '2026-12-01' });
eq(W.groupForToday([rv], { today: TODAY, userId: 'u1' }).today.map((t) => t.id), ['rv'], 'مراجعة طُلبت مني → اليوم');
eq(W.groupForToday([rv], { today: TODAY, userId: 'u2' }).today.length, 0, 'مراجعة طُلبت من غيري لا تظهر لي');
// وضع المؤسس: قرارات واعتمادات فقط، لا تنفيذ
const f = W.groupForToday([...tasks, rv, T('dec', { decision_ref: 'D-140', due_date: '2026-12-01' })], { today: TODAY, userId: 'u1', founderMode: true });
eq(Object.values(f).flat().map((t) => t.id).sort(), ['blocked', 'dec', 'rv'], 'وضع المؤسس: عالقة + قرار D-### + مراجعة مطلوبة منه');

// ── 4) قواعد الانتقال ─────────────────────────────────────
ok(!W.validateTransition({}, 'blocked', {}).ok, 'عالقة بلا عائق مرفوضة');
ok(W.validateTransition({}, 'blocked', { blocker: 'x' }).ok, 'عالقة مع عائق مقبولة');
ok(!W.validateTransition({}, 'waiting_reply', {}).ok, 'بانتظار رد بلا «ممّن» مرفوضة');
ok(!W.validateTransition({}, 'review', { evidence: 'رابط' }).ok, 'مراجعة بلا مراجع مرفوضة');
ok(!W.validateTransition({}, 'review', { review_requested_by: 'u' }).ok, 'مراجعة بلا دليل مرفوضة');
ok(W.validateTransition({}, 'review', { evidence: 'رابط', review_requested_by: 'u' }).ok, 'مراجعة كاملة مقبولة');
const c1 = W.validateTransition({}, 'completed', {});
ok(c1.ok && c1.warnings.length === 1, 'إكمال قديم بلا دليل: تحذير فقط');
ok(!W.validateTransition({}, 'completed', {}, { requireEvidence: true }).ok, 'إكمال جديد بلا دليل: مرفوض');
ok(W.validateTransition({ completion_note: 'تم' }, 'completed', {}, { requireEvidence: true }).ok, 'completion_note يُحتسب دليلاً');

// ── 5) النطاق والصلاحيات ──────────────────────────────────
const U = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const admin = S.resolveTaskScope({ id: U(1), role: 'admin', team: null }, { hasViewAll: true });
const socialMgr = S.resolveTaskScope({ id: U(2), role: 'social_manager', team: 'ميديا' }, { hasViewAll: true });
const emp = S.resolveTaskScope({ id: U(3), role: 'employee', team: 'تركيا' }, { hasViewAll: false, projectIds: [U(7), 'not-a-uuid', "x'),id.neq.(1"] });
const mgrNoTeam = S.resolveTaskScope({ id: U(4), role: 'sales_manager', team: null }, { hasViewAll: true });
ok(admin.viewAll && admin.isAdmin, 'admin: يرى الكل ويرى الحسّاس');
ok(!socialMgr.viewAll && socialMgr.team === 'ميديا', 'مدير السوشال: فريقه فقط');
ok(mgrNoTeam.viewAll, 'مدير بلا team مضبوط: السلوك القديم الآمن');
eq(emp.projectIds, [U(7)], 'projectIds تُنقّى من غير UUID (حماية .or())');
const social = { id: 't1', team: 'ميديا', assignee_id: U(2) };
const sales = { id: 't2', team: 'سوريا', assignee_id: U(5) };
const turkey = { id: 't3', team: 'تركيا', assignee_id: U(3) };
const secret = { id: 't4', team: 'ميديا', assignee_id: U(2), is_sensitive: true };
const inProj = { id: 't5', team: 'سوريا', project_id: U(7), assignee_id: U(5) };
const tagged = { id: 't6', team: 'سوريا', assignee_id: U(5), tagged_ids: [U(3)] };
ok(S.canSee(social, admin) && S.canSee(sales, admin) && S.canSee(secret, admin), 'الإدارة ترى كل الفرق والحسّاس');
ok(S.canSee(social, socialMgr) && !S.canSee(sales, socialMgr) && !S.canSee(turkey, socialMgr), 'مدير السوشال لا يرى المبيعات/سوريا/تركيا');
ok(!S.canSee(secret, socialMgr), 'الحسّاس مخفي عن مدير الفريق');
ok(S.canSee(turkey, emp) && !S.canSee(social, emp) && !S.canSee(sales, emp), 'الموظف: مهامه/فريقه فقط');
ok(S.canSee(inProj, emp) && S.canSee(tagged, emp), 'مشروعه وما أُشرك به');
ok(S.isMine(tagged, U(3)) && !S.isMine(sales, U(3)), 'isMine');
eq(S.tabsFor(admin), ['today', 'mine', 'team', 'projects', 'archive', 'all'], 'تبويبات الإدارة');
eq(S.tabsFor(socialMgr), ['today', 'mine', 'team', 'projects', 'archive'], 'مدير الفريق بلا «الكل»');
ok(!S.tabsFor(emp).includes('all'), 'الموظف بلا «الكل»');
eq([admin, socialMgr, emp].map(S.defaultTab), ['today', 'today', 'mine'], 'الافتراضي: اليوم/مهامي — لا مشروع');

// ── 6) المقاييس ───────────────────────────────────────────
const MT = [
  { id: 1, status: 'completed', due_date: '2026-10-10T00:00:00+00:00', completed_at: '2026-10-10T12:00:00Z', completion_note: 'رابط التسليم', assignee_id: U(2), project_id: 'pA', team: 'ميديا' },
  { id: 2, status: 'completed', due_date: '2026-10-10T00:00:00+00:00', completed_at: '2026-10-15T09:00:00Z', assignee_id: U(2), project_id: 'pA', team: 'ميديا' },
  { id: 3, status: 'done', completed_at: '2026-10-12T09:00:00Z', assignee_id: U(3), team: 'تركيا' },
  { id: 4, status: 'in_progress', due_date: '2026-10-20', assignee_id: U(3), team: 'تركيا' },
  { id: 5, status: 'pending', due_date: '2026-10-01', assignee_id: null, team: 'ميديا' },
  { id: 6, status: 'blocked', due_date: '2026-10-24', blocker: 'x', assignee_id: U(2), team: 'ميديا' },
  { id: 7, status: 'waiting_reply', assignee_id: U(2), team: 'ميديا' },
  { id: 8, status: 'cancelled', due_date: '2026-10-01', assignee_id: U(2), team: 'ميديا' },
  { id: 9, status: 'archived', assignee_id: U(2), team: 'ميديا' },
];
const mt = M.computeMetrics(MT, { today: TODAY });
eq(mt.total, 9, 'total');
eq(mt.completed, 3, 'completed (done القديمة تُحتسب)');
eq(mt.onTime, { done: 1, ofWhich: 2, pct: 50 }, 'في الموعد: 1 من 2 مكتملة بموعد (المهمة 3 بلا موعد خارج المقام)');
eq(mt.overdueTotal, 3, 'متأخرة (4،5،6)');
eq(mt.overdueByAge, { '1-3': 1, '4-7': 1, '8-14': 0, '15+': 1 }, 'المتأخرة حسب العمر');
eq([mt.blocked, mt.waiting], [1, 1], 'عالقة / بانتظار رد');
eq(mt.noOwner, 1, 'بلا مالك');
eq(mt.noDue, 1, 'بلا موعد (المهمة 7 فقط — المكتملة والمؤرشفة خارج النشط)');
eq(mt.documentedClosed, 1, 'مغلقة بنتيجة موثقة');
eq(mt.rawCompletionPct, 38, 'إكمال خام = 3 من 8 (الملغاة خارج المقام)');
eq(mt.byTeam.find((x) => x.name === 'ميديا').overdue, 2, 'لكل فريق');
ok(M.closedOnTime({ status: 'completed', due_date: '2026-10-10', completed_at: '2026-10-10T12:00:00Z' }) !== null, 'closedOnTime يعمل');
eq(M.visibleForReport([{ id: 1, is_sensitive: true }, { id: 2 }], false).map((t) => t.id), [2], 'التقرير يستبعد الحسّاس لغير الأدمن');
eq(M.visibleForReport([{ id: 1, is_sensitive: true }, { id: 2 }], true).length, 2, 'الأدمن يرى الحسّاس');
const rows = M.ownerRows(MT, (id) => `emp-${id.slice(-1)}`, TODAY);
ok(rows[0].overdue + rows[0].blocked >= rows[rows.length - 1].overdue + rows[rows.length - 1].blocked, 'الترتيب: الأكثر تعثراً أولاً');
ok(rows.some((x) => x.id === 'none'), 'صف «بلا مالك»');

// ── 7) عقد deep link الإشعارات (يجب ألا ينكسر) ────────────
eq(N.resolveNotifRoute({ type: 'task_assigned', entity_type: 'task', entity_id: 'abc' }), '/tasks?task=abc', 'deep link تعيين');
eq(N.resolveNotifRoute({ type: 'task_commented', entity_type: 'task', entity_id: 'abc' }), '/tasks?task=abc&tab=comments', 'deep link تعليق');
eq(N.resolveNotifRoute({ type: 'task_tagged', entity_type: 'task', entity_id: 'a b' }), '/tasks?task=a%20b', 'ترميز المعرّف');
eq(N.resolveNotifRoute({ type: 'task_overdue' }), '/tasks', 'بلا كيان → قائمة المهام');

// ── 8) الربط P/D/KPI (أعمدة بعد الـmigration، tags قبلها) ──
eq(L.ABOS_PROJECTS.map((p) => p.code), ['P01', 'P02', 'P03', 'P04', 'P06', 'P07', 'P08', 'P09', 'P10', 'P11'], 'مشاريع ABOS (P05 مُسقَط)');
eq(L.readLinks({ tags: ['x', 'P02', 'D-140', 'KPI:orders'] }), { project_code: 'P02', decision_ref: 'D-140', kpi_key: 'orders' }, 'readLinks من tags');
eq(L.readLinks({ project_code: 'P09', tags: ['P02'] }).project_code, 'P09', 'العمود يغلب tags');
eq(L.readLinks({ tags: ['P05', 'KPI:nope', 'D-1'] }), { project_code: null, decision_ref: null, kpi_key: null }, 'قيم غير صالحة تُهمَل');
eq(L.applyLinksToTags(['وسم', 'P01', 'D-9999'], { project_code: 'P02', decision_ref: 'd-140', kpi_key: 'revenue' }), ['وسم', 'P02', 'D-140', 'KPI:revenue'], 'applyLinksToTags يستبدل ولا يمسّ الوسوم العادية');
eq(L.plainTags(['وسم', 'P02', 'D-140', 'KPI:orders']), ['وسم'], 'plainTags');
ok(L.isDecisionRef('D-140') && L.isDecisionRef('d-1234') && !L.isDecisionRef('D-12') && !L.isDecisionRef('X-140'), 'صيغة D-###');

// ── 9) نموذج الإنشاء ──
const good = { ...F.EMPTY_OPS_FORM, title: 'ت', outcome: 'ن', owner: U(2), due_date: '2026-11-01' };
ok(F.validateNewTask(good).ok, 'نموذج كامل صالح');
for (const k of ['title', 'outcome', 'owner', 'due_date']) ok(!F.validateNewTask({ ...good, [k]: '  ' }).ok, `${k} إلزامي`);
ok(!F.validateNewTask({ ...good, decision_ref: 'D12' }).ok, 'D-### بصيغة خاطئة مرفوضة');
const pre = F.toTaskPayload({ ...good, participants: [U(2), U(3)], project_code: 'P02', decision_ref: 'd-140', kpi_key: 'orders', next_step: 'x' }, { v3: false, creatorId: U(1) });
eq([pre.status, pre.description, pre.tags, pre.tagged_ids, 'next_step' in pre, 'outcome' in pre], ['pending', 'ن', ['P02', 'D-140', 'KPI:orders'], [U(3)], false, false], 'قبل الـmigration: لا أعمدة جديدة، الروابط في tags، المالك لا يتكرر مشاركاً');
const v3 = F.toTaskPayload({ ...good, project_code: 'P02', decision_ref: 'D-140', kpi_key: 'orders', next_step: ' تواصل ' }, { v3: true });
eq([v3.status, v3.outcome, v3.next_step, v3.project_code, v3.decision_ref, v3.kpi_key, v3.tags], ['ready', 'ن', 'تواصل', 'P02', 'D-140', 'orders', []], 'بعد الـmigration: أعمدة حقيقية');
eq(F.toStatusExtra('blocked', { blocker: ' س ' }, true), { blocker: 'س' }, 'extra عالقة');
eq(F.toStatusExtra('blocked', { blocker: 'س' }, false), {}, 'قبل الـmigration لا يُكتب blocker');
eq(F.toStatusExtra('completed', { evidence: 'د' }, false), { completion_note: 'د' }, 'الدليل → completion_note قبل الـmigration');
eq(F.toStatusExtra('review', { evidence: 'د', review_requested_by: U(2) }, true), { evidence: 'د', review_requested_by: U(2) }, 'extra مراجعة');
ok(W.validateTransition({}, 'review', { evidence: 'د' }, { reviewerOptional: true }).ok, 'reviewerOptional قبل الـmigration');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
