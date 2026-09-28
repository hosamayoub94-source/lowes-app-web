// اختبارات منطق المرحلة الأولى لنظام المهام (بلا شبكة ولا قاعدة بيانات).
// التشغيل: TZ=Europe/Istanbul npx esbuild scripts/test-tasks-phase1.mjs --bundle --platform=node --format=esm --outfile=<tmp>.mjs && node <tmp>.mjs
import {
  isOverdue, effectiveStatus, computeStats, filterTasks, daysUntilDue,
  taskDeadline, startAfterDue, shortDate,
} from '../src/modules/tasks/utils/taskUtils.js';
import {
  STATUS_OPTIONS, STATUS_META, baseStatus, calcTaskPointsPreview, TEAM_META,
  PLATFORM_OPTIONS, TASK_TYPE_OPTIONS,
} from '../src/modules/tasks/types/task.types.js';
import { mapTask, toTaskInsert, toTaskUpdate } from '../src/modules/tasks/services/taskMappers.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('✅', name); } else { fail++; console.log('❌', name); } };

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = new Date();
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
// الشكل الذي تعيده القاعدة فعلاً لعمود timestamptz المخزّن بتاريخ فقط
const dbDue = (d) => `${ymd(d)}T00:00:00+00:00`;

console.log('TZ =', Intl.DateTimeFormat().resolvedOptions().timeZone, '| now =', today.toString());

// ── 4) موعد التسليم ─────────────────────────────────────────────
const dueToday = { status: 'pending', due_date: dbDue(today) };
ok('مهمة موعدها اليوم (بلا ساعة) ليست متأخرة الآن', !isOverdue(dueToday));
ok('بلا ساعة ← الموعد نهاية اليوم 23:59:59 محلياً', (() => { const d = taskDeadline(dueToday); return d.getHours() === 23 && d.getMinutes() === 59 && ymd(d) === ymd(today); })());
ok('موعد أمس ← متأخرة', isOverdue({ status: 'in_progress', due_date: dbDue(addDays(-1)) }));
ok('موعد غداً ← ليست متأخرة', !isOverdue({ status: 'pending', due_date: dbDue(addDays(1)) }));
ok('اليوم بساعة مضت 00:01 ← متأخرة', isOverdue({ status: 'pending', due_date: dbDue(today), due_time: '00:01' }));
ok('اليوم بساعة 23:59 ← ليست متأخرة', !isOverdue({ status: 'pending', due_date: dbDue(today), due_time: '23:59' }));
ok('due_date بصيغة YYYY-MM-DD مقبولة أيضاً', !isOverdue({ status: 'pending', due_date: ymd(today) }));
ok('مكتملة/ملغاة لا تكون متأخرة', !isOverdue({ status: 'completed', due_date: dbDue(addDays(-3)) }) && !isOverdue({ status: 'cancelled', due_date: dbDue(addDays(-3)) }));
ok('daysUntilDue اليوم = 0، أمس = -1، غداً = 1', daysUntilDue(dbDue(today)) === 0 && daysUntilDue(dbDue(addDays(-1))) === -1 && daysUntilDue(dbDue(addDays(1))) === 1);
ok('shortDate لا يزيح التاريخ', shortDate(dbDue(today)) === today.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }));

// توافق النقاط مع «متأخرة»
ok('نقاط مهمة موعدها اليوم (medium) = 15+1 لا 5+1', calcTaskPointsPreview({ priority: 'medium', due_date: dbDue(today) }) === 16);
ok('نقاط مهمة موعدها بعد يومين (high) = 20+3', calcTaskPointsPreview({ priority: 'high', due_date: dbDue(addDays(2)) }) === 23);
ok('نقاط مهمة متأخرة (urgent) = 5+5', calcTaskPointsPreview({ priority: 'urgent', due_date: dbDue(addDays(-2)) }) === 10);
ok('نقاط بلا موعد = 15+bonus', calcTaskPointsPreview({ priority: 'low' }) === 15);

// ── 2) قيد المراجعة ────────────────────────────────────────────
ok('STATUS_META.in_review = «قيد المراجعة»', STATUS_META.in_review?.label === 'قيد المراجعة');
ok('effectiveStatus(in_review) = in_review', effectiveStatus({ status: 'in_review', due_date: dbDue(addDays(2)) }) === 'in_review');
ok('in_review بعد الموعد تبقى «قيد المراجعة» (سلّمها المسؤول)', effectiveStatus({ status: 'in_review', due_date: dbDue(addDays(-2)) }) === 'in_review');
const sample = [
  { status: 'pending' }, { status: 'in_progress' }, { status: 'in_review' }, { status: 'in_review' },
  { status: 'completed' }, { status: 'done' }, { status: 'cancelled' },
  { status: 'in_progress', due_date: dbDue(addDays(-1)) },
];
const st = computeStats(sample);
ok('الإحصائيات تعدّ قيد المراجعة منفصلة (2) ولا تضيفها للانتظار', st.inReview === 2 && st.pending === 1);
ok('الإحصائيات: مكتملة 2 (done+completed)، متأخرة 1', st.completed === 2 && st.overdue === 1);
ok('فلتر الحالة in_review يعيد مهمتين', filterTasks(sample, { status: 'in_review' }).length === 2);
ok('فلتر «متأخرة فقط» يعيد مهمة واحدة', filterTasks(sample, { overdueOnly: true }).length === 1);

// ── 7) متأخرة ليست خياراً يدوياً ─────────────────────────────
const opts = STATUS_OPTIONS.map((o) => o.value);
ok('قائمة الحالات اليدوية بلا overdue وفيها in_review', !opts.includes('overdue') && opts.includes('in_review'));
ok('baseStatus لمهمة متأخرة = حالتها المخزّنة', baseStatus({ status: 'in_progress', due_date: dbDue(addDays(-1)) }) === 'in_progress');
ok('baseStatus(done) = completed', baseStatus({ status: 'done' }) === 'completed');
ok('mapTask يحتفظ بالحالة المخزّنة (لا يكتب overdue)', mapTask({ id: 'x', status: 'in_progress', due_date: dbDue(addDays(-5)) }).status === 'in_progress');

// ── 1) تاريخ البدء ─────────────────────────────────────────────
ok('mapTask: مهمة قديمة بلا start_date ← null', mapTask({ id: 'x' }).start_date === null);
ok('mapTask: start_date يُقرأ', mapTask({ id: 'x', start_date: '2026-10-01' }).start_date === '2026-10-01');
ok('toTaskInsert يكتب start_date', toTaskInsert({ title: 't', start_date: '2026-10-01' }).start_date === '2026-10-01');
ok('toTaskUpdate يكتب start_date/platform/task_type/project_id', (() => {
  const r = toTaskUpdate({ start_date: null, platform: 'tiktok', task_type: 'video_editing', project_id: 'p1' });
  return 'start_date' in r && r.platform === 'tiktok' && r.task_type === 'video_editing' && r.project_id === 'p1';
})());
ok('startAfterDue: بدء بعد التسليم مرفوض، قبله/مساوٍ مقبول، فارغ مقبول',
  startAfterDue('2026-10-05', dbDue(new Date(2026, 9, 3))) && !startAfterDue('2026-10-03', '2026-10-03') && !startAfterDue('', '2026-10-03'));

// ── 3/6) القوائم ────────────────────────────────────────────────
ok('فرق النماذج = ميديا/سوريا/تركيا فقط', JSON.stringify(Object.keys(TEAM_META)) === JSON.stringify(['ميديا', 'سوريا', 'تركيا']));
ok('قوائم المنصة (6) والنوع (11) بنفس القيم', PLATFORM_OPTIONS.length === 6 && TASK_TYPE_OPTIONS.length === 11 && PLATFORM_OPTIONS[0].value === 'instagram');

console.log(`\n${pass} نجح · ${fail} فشل`);
process.exit(fail ? 1 : 0);
