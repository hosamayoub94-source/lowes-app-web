/* eslint-env node */
// الصفحة القديمة /tasks: المهمة المغلقة (مكتملة/ملغاة/مؤرشفة) لا تظهر «متأخرة» أبداً، والنشطة فقط تتأخر،
// وعالقة/بانتظار رد تظهران بحالتهما (مع بقاء نص التأخر كمعلومة موعد).
// السبب الجذري المثبت: countdownLabel(due_date) لا تعرف الحالة، وuseCountdown لا يمرّر الحالة لنص التأخر،
// وTaskCard يعرض `countdown || shortDate(due_date)` لكل مهمة لها موعد — فتظهر «متأخر بـ N يوم» للملغاة والمكتملة.
// Run: node test-tasks-legacy-status.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const self = fileURLToPath(import.meta.url);
if (!process.env.TASKS_TZ_CHILD) {
  let bad = 0;
  for (const tz of ['Europe/Istanbul', 'UTC']) {
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
const out = path.join(root, `.tmp-tasks-legacy-${process.env.TZ.replace(/\W/g, '')}.mjs`);
await build({
  stdin: { contents: `export * as U from './src/modules/tasks/utils/taskUtils.js'; export * as T from './src/modules/tasks/types/task.types.js';`, resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
});
let mod;
try { mod = await import(pathToFileURL(out).href); } finally { fs.unlinkSync(out); }
const { U, T } = mod;

const OLD = '2026-06-01T00:00:00+00:00'; // قديم جداً
const mk = (status, due = OLD) => ({ id: status, title: status, status, due_date: due, priority: 'medium' });
const display = (task) => (T.STATUS_DISPLAY_META || T.STATUS_META)[U.effectiveStatus(task)];
const labelOf = (task) => U.countdownLabel(task.due_date, task.status); // ما يمرّره useCountdown

// ── مغلقة + موعد قديم → لا تظهر متأخرة ──────────────────
for (const [status, word] of [['cancelled', 'ملغاة'], ['completed', 'مكتملة'], ['done', 'مكتملة'], ['archived', 'مؤرشفة']]) {
  const t = mk(status);
  ok(!U.isOverdue(t), `${status} + موعد قديم: isOverdue=false`);
  ok(U.effectiveStatus(t) !== 'overdue', `${status}: الحالة الفعلية ليست overdue`);
  ok(labelOf(t) === null, `${status}: لا نص «متأخر بـ N يوم» (got ${JSON.stringify(labelOf(t))})`);
  ok(!String(labelOf(t) || '').includes('متأخر'), `${status}: النص لا يحوي «متأخر»`);
  eq(display(t).label, word, `${status}: الشارة «${word}»`);
  ok(U.dueDateColorClass(t.due_date, t.status) === 'text-muted', `${status}: لون الموعد محايد`);
}
// الحالة بالضبط من البلاغ: ملغاة منذ 113 يوماً
const reported = mk('cancelled', new Date(Date.now() - 113 * 86400000).toISOString());
ok(labelOf(reported) === null && display(reported).label === 'ملغاة', 'بلاغ «تجهيز خزانة البرهان»: ملغاة بلا «متأخر بـ113 يوماً»');

// ── نشطة + موعد قديم → متأخرة ─────────────────────────
for (const status of ['pending', 'in_progress', 'in_review']) {
  const t = mk(status);
  ok(U.isOverdue(t), `${status} + موعد قديم: متأخرة`);
  eq(U.effectiveStatus(t), 'overdue', `${status}: الحالة الفعلية overdue`);
  ok(/^متأخر بـ \d+ (يوم|أيام)$/.test(labelOf(t)), `${status}: نص التأخر (${labelOf(t)})`);
  eq(display(t).label, 'متأخرة', `${status}: الشارة «متأخرة»`);
}
// نشطة بموعد مستقبلي أو اليوم: ليست متأخرة
const today = U.effectiveStatus; // مجرد مرجع لتفادي تحذير unused
ok(today !== undefined, 'effectiveStatus مصدَّرة');
const future = mk('in_progress', new Date(Date.now() + 5 * 86400000).toISOString());
ok(!U.isOverdue(future) && U.effectiveStatus(future) === 'in_progress', 'نشطة بموعد مستقبلي: ليست متأخرة');

// ── عالقة / بانتظار رد ───────────────────────────────
const blocked = mk('blocked');
eq(U.effectiveStatus(blocked), 'blocked', 'blocked + موعد قديم: تبقى «blocked» (لا تُبتلع بـ overdue)');
eq(display(blocked).label, 'عالقة', 'blocked: الشارة «عالقة»');
ok(U.isOverdue(blocked), 'blocked نشطة: التأخر يبقى معلومة موعد');
ok(/^متأخر بـ/.test(labelOf(blocked)), 'blocked: نص الموعد يوضّح التأخر بجانب شارة «عالقة»');
const waiting = mk('waiting_reply');
eq(U.effectiveStatus(waiting), 'waiting_reply', 'waiting_reply + موعد قديم: تبقى «waiting_reply»');
eq(display(waiting).label, 'بانتظار رد', 'waiting_reply: الشارة «بانتظار رد»');
eq(display(mk('blocked', null)).label, 'عالقة', 'blocked بلا موعد: «عالقة»');

// ── الإحصاءات والفلاتر والترتيب ───────────────────────
const set = [mk('pending'), mk('in_progress'), mk('cancelled'), mk('completed'), mk('archived'), mk('blocked'), mk('waiting_reply'), mk('in_progress', null)];
const st = U.computeStats(set);
eq(st.overdue, 4, 'الإحصاء: المتأخرة = pending + in_progress + blocked + waiting_reply فقط');
eq(st.cancelled, 1, 'الإحصاء: ملغاة 1 (غير متأخرة)');
eq(st.completed, 1, 'الإحصاء: مكتملة 1');
eq([st.blocked, st.waiting], [1, 1], 'الإحصاء: عالقة 1 وبانتظار رد 1');
const late = U.filterTasks(set, { search: '', status: '', priority: '', assignedTo: '', overdueOnly: true, completedOnly: false }).map((t) => t.status).sort();
eq(late, ['blocked', 'in_progress', 'pending', 'waiting_reply'], 'فلتر «متأخرة فقط»: لا يضم الملغاة/المكتملة/المؤرشفة');
const sorted = U.sortTasks([mk('completed'), mk('in_progress', null), mk('pending')]).map((t) => t.status);
eq(sorted[0], 'pending', 'الترتيب: المتأخرة الفعلية أولاً (لا المكتملة القديمة)');

// ── STATUS_OPTIONS (قائمة الدرج القديم) لم تتغير: لا نكتب حالات لا يديرها الدرج القديم ──
const opts = T.STATUS_OPTIONS.map((o) => o.value);
ok(!opts.includes('blocked') && !opts.includes('waiting_reply') && !opts.includes('archived') && !opts.includes('overdue'), 'STATUS_OPTIONS القديمة لا تعرض عالقة/بانتظار رد/مؤرشفة/متأخرة');

// ── الربط الفعلي بالكود (hook + بطاقة) ───────────────────
const hook = fs.readFileSync('src/modules/tasks/hooks/useCountdown.js', 'utf8');
ok(/countdownLabel\(\s*dueDate\s*,\s*status\s*\)/.test(hook), 'useCountdown يمرّر الحالة إلى countdownLabel');
const card = fs.readFileSync('src/modules/tasks/components/TaskCard.jsx', 'utf8');
ok(/STATUS_DISPLAY_META/.test(card), 'TaskCard يستخدم خريطة العرض (عالقة/بانتظار رد/مؤرشفة)');
const opsCard = fs.readFileSync('src/modules/tasks/components/OpsTaskCard.jsx', 'utf8');
ok(!/STATUS_DISPLAY_META/.test(opsCard), 'مركز العمل الجديد (OpsTaskCard) لم يُمسّ');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
