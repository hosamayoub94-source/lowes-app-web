/* eslint-env node */
// التحليلات والتقارير — منطق صرف: تواريخ محلية، فترات، حضور، مهام، مقارنات، حدود، تنبيهات، CSV.
// يعيد تشغيل نفسه تحت عدة مناطق زمنية (أخطاء toISOString تظهر خارج UTC فقط).
// Run: node test-analytics-core.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as M from './src/modules/analytics/services/reportMath.js';
import { KPI, DATE_RANGE_PRESET } from './src/modules/analytics/types/analytics.types.js';

const self = fileURLToPath(import.meta.url);
if (!process.env.ANALYTICS_TZ_CHILD) {
  let bad = 0;
  for (const tz of ['Asia/Dubai', 'UTC', 'America/New_York', 'Europe/Istanbul']) {
    const r = spawnSync(process.execPath, [self], { env: { ...process.env, TZ: tz, ANALYTICS_TZ_CHILD: '1' }, encoding: 'utf8' });
    process.stdout.write(`[TZ=${tz}] ${r.stdout.trim().split('\n').slice(-1)[0] || ''}\n`);
    if (r.status !== 0) { bad++; process.stderr.write(r.stderr + r.stdout); }
  }
  process.exit(bad ? 1 : 0);
}

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error('❌', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);

// ── التواريخ المحلية ────────────────────────────────────────────
const firstOfMonthJustAfterMidnight = new Date(2026, 9, 1, 0, 30); // 1 تشرين الأول 00:30 محلي
eq(M.resolveRange(DATE_RANGE_PRESET.THIS_MONTH, firstOfMonthJustAfterMidnight), { from: '2026-10-01', to: '2026-10-01' }, 'THIS_MONTH لا ينزاح للشهر السابق');
eq(M.resolveRange(DATE_RANGE_PRESET.TODAY, firstOfMonthJustAfterMidnight), { from: '2026-10-01', to: '2026-10-01' }, 'TODAY محلي');
eq(M.resolveRange(DATE_RANGE_PRESET.LAST_MONTH, new Date(2026, 9, 26, 12)), { from: '2026-09-01', to: '2026-09-30' }, 'LAST_MONTH');
eq(M.resolveRange(DATE_RANGE_PRESET.LAST_7_DAYS, new Date(2026, 9, 26, 12)), { from: '2026-10-20', to: '2026-10-26' }, 'LAST_7_DAYS = 7 أيام شاملة');
eq(M.resolveRange(DATE_RANGE_PRESET.YESTERDAY, new Date(2026, 10, 1, 0, 5)), { from: '2026-10-31', to: '2026-10-31' }, 'YESTERDAY عبر حدود الشهر');
eq(M.resolveRange(DATE_RANGE_PRESET.THIS_QUARTER, new Date(2026, 9, 26, 12)), { from: '2026-10-01', to: '2026-10-26' }, 'THIS_QUARTER');
eq(M.resolveRange(DATE_RANGE_PRESET.CUSTOM, new Date(2026, 9, 26), { from: '2026-01-05', to: '2026-01-09' }), { from: '2026-01-05', to: '2026-01-09' }, 'CUSTOM يحترم المدخل');

eq(M.addDays('2026-10-31', 1), '2026-11-01', 'addDays عبر الشهر');
eq(M.addDays('2026-03-01', -1), '2026-02-28', 'addDays شباط');
eq(M.parseYMD('2026-02-30'), null, 'تاريخ غير صالح');
eq(M.parseYMD('abc'), null, 'نص غير تاريخ');
ok(M.parseYMD('2026-10-26') instanceof Date, 'تاريخ صالح');
eq(M.eachDay('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'], 'eachDay');
eq(M.toSlash('2026-10-05'), '2026/10/05', 'toSlash لجدول الحضور');

eq(M.previousPeriod('2026-10-20', '2026-10-26'), { from: '2026-10-13', to: '2026-10-19' }, 'الفترة السابقة 7 أيام');
eq(M.previousPeriod('2026-10-01', '2026-10-01'), { from: '2026-09-30', to: '2026-09-30' }, 'الفترة السابقة ليوم واحد');
eq(M.previousPeriod('2026-03-01', '2026-03-31'), { from: '2026-01-29', to: '2026-02-28' }, 'الفترة السابقة تحافظ على الطول (31 يوماً)');

eq(M.normalizeRange('2026-10-26', '2026-10-20'), { from: '2026-10-20', to: '2026-10-26', swapped: true }, 'تبديل النطاق المعكوس');
eq(M.normalizeRange('', '2026-10-20').valid, false, 'نطاق ناقص غير صالح');
ok(M.normalizeRange('2024-01-01', '2026-10-20').tooLong === true, 'نطاق أطول من الحد يُعلَّم');

// استعلام timestamptz: بداية اليوم المحلي (ليست اليوم UTC)
const startOfLocalDay = M.dayStartISO('2026-10-01');
ok(new Date(startOfLocalDay).getTime() === new Date(2026, 9, 1).getTime(), 'dayStartISO = منتصف الليل المحلي');
eq(M.dayStartISO('bad'), null, 'dayStartISO مع مدخل خاطئ');

// ── الفلاتر ⇄ الرابط
const now = new Date(2026, 9, 26, 12);
eq(M.filtersFromSearch('?preset=this_month&team=مبيعات', now), { preset: 'this_month', from: '2026-10-01', to: '2026-10-26', team: 'مبيعات' }, 'فلاتر من الرابط (فترة جاهزة + فريق)');
eq(M.filtersFromSearch('from=2026-10-01&to=2026-10-05&emp=u1', now), { preset: 'custom', from: '2026-10-01', to: '2026-10-05', employeeId: 'u1' }, 'فلاتر من الرابط (مخصص + موظف)');
eq(M.filtersFromSearch('preset=evil&from=2026-13-01&to=x', now), {}, 'قيم غير صالحة تُهمل');
eq(M.filtersToSearch({ preset: 'last_7_days', from: '2026-10-20', to: '2026-10-26', team: null, employeeId: 'u2' }), { preset: 'last_7_days', emp: 'u2' }, 'فلاتر إلى الرابط (preset فقط)');
eq(M.filtersToSearch({ preset: 'custom', from: '2026-10-01', to: '2026-10-05' }), { preset: 'custom', from: '2026-10-01', to: '2026-10-05' }, 'فلاتر إلى الرابط (مخصص)');

// ── الحضور ──────────────────────────────────────────────────────
const att = [
  { employee_name: 'أ', date: '2026/10/20', type: 'in', was_late: true },
  { employee_name: 'أ', date: '2026/10/20', type: 'out', hours: 8 },
  { employee_name: 'ب', date: '2026/10/20', type: 'in', was_late: false },
  { employee_name: 'ب', date: '2026/10/20', type: 'out', hours: 7.5 },
  { employee_name: 'أ', date: '2026/10/21', type: 'in', was_late: false },
  { employee_name: 'أ', date: '2026/10/21', type: 'in', was_late: false }, // تكرار نفس اليوم
  { employee_name: 'أ', date: '2026/10/21', type: 'out', hours: 9 },
];
const a = M.aggregateAttendance(att, 4);
eq(a.metrics[KPI.ACTIVE_USERS].value, 2, 'ACTIVE_USERS = موظفون متميزون لديهم سجل حضور');
eq(a.metrics[KPI.LATE_EMPLOYEES].value, 1, 'حالات التأخير');
eq(a.metrics[KPI.WORKED_HOURS_TOTAL].value, 24.5, 'ساعات العمل');
// حاضرون-أيام = 3 (أ+ب يوم 20، أ يوم 21) ، أيام مسجلة = 2 ، نشطون = 4 → 3/8 = 37.5% → 38
eq(a.metrics[KPI.ATTENDANCE_RATE].value, 38, 'معدل الحضور عبر عدة أيام');
// غياب: (4-2) + (4-1) = 5
eq(a.metrics[KPI.ABSENT_EMPLOYEES].value, 5, 'الغياب = الفرق اليومي');
eq(a.metrics[KPI.OVERTIME_HOURS_TOTAL].status, 'unavailable', 'الوقت الإضافي بلا مصدر → غير متوفر');
eq(a.metrics[KPI.OVERTIME_HOURS_TOTAL].value, null, 'الوقت الإضافي بلا قيمة');
eq(a.perDay.map((d) => [d.date, d.present]), [['2026-10-20', 2], ['2026-10-21', 1]], 'تفصيل يومي مرتب بمفاتيح ISO');
eq(a.perDay[0].rate, 50, 'معدل يوم 20 = 2/4');

const none = M.aggregateAttendance([], 4);
eq(none.metrics[KPI.ATTENDANCE_RATE].status, 'empty', 'لا سجلات → empty');
eq(none.metrics[KPI.ACTIVE_USERS].value, null, 'لا سجلات → لا رقم وهمي');
ok(!!none.metrics[KPI.ATTENDANCE_RATE].reason, 'سبب واضح عند الفراغ');

const noTotal = M.aggregateAttendance(att, null);
eq(noTotal.metrics[KPI.ATTENDANCE_RATE].value, null, 'بلا عدد موظفين لا نسبة');
eq(noTotal.metrics[KPI.ACTIVE_USERS].value, 2, 'ACTIVE_USERS لا يحتاج العدد الكلي');
ok(M.aggregateAttendance(att, 1).metrics[KPI.ATTENDANCE_RATE].value <= 100, 'المعدل لا يتجاوز 100');

// ── المهام ──────────────────────────────────────────────────────
const helpers = {
  isCompleted: (t) => t.status === 'completed' || t.status === 'done',
  isCancelled: (t) => t.status === 'cancelled',
  isOverdue: (t, asOf) => !['completed', 'done', 'cancelled'].includes(t.status) && !!t.due_date && t.due_date.slice(0, 10) < asOf,
  ownerOf: (t) => t.assignee_id || null,
};
const created = [
  { id: 1, status: 'completed', progress: 100, assignee_id: 'u1' },
  { id: 2, status: 'in_progress', progress: 40, assignee_id: 'u1' },
  { id: 3, status: 'cancelled', progress: 0, assignee_id: 'u2' },
  { id: 4, status: 'ready', progress: 0, assignee_id: 'u2' },
];
const completedInPeriod = [{ id: 1, status: 'completed', assignee_id: 'u1' }, { id: 9, status: 'completed', assignee_id: 'u2' }];
const openCandidates = [
  { id: 2, status: 'in_progress', due_date: '2026-10-10T00:00:00Z', assignee_id: 'u1' },
  { id: 5, status: 'ready', due_date: '2026-10-26', assignee_id: 'u2' }, // اليوم ليس متأخراً
  { id: 6, status: 'ready', due_date: '2026-10-01', assignee_id: 'u2' },
];
const t = M.aggregateTasks({ created, completed: completedInPeriod, openCandidates }, helpers, '2026-10-26');
eq(t.metrics[KPI.COMPLETED_TASKS].value, 2, 'المنجزة بتاريخ الإنجاز بالفترة');
eq(t.metrics[KPI.OVERDUE_TASKS].value, 2, 'المتأخرة = المفتوحة المتجاوزة لموعدها (اليوم لا يُحسب)');
// مُنشأة غير ملغاة = 3 ، منجزة منها = 1 → 33%
eq(t.metrics[KPI.TASK_COMPLETION_RATE].value, 33, 'معدل الإنجاز يستثني الملغاة');
// متوسط التقدّم (100+40+0)/3 = 46.67 → 47
eq(t.metrics[KPI.PRODUCTIVITY_SCORE].value, 47, 'متوسط التقدم');
eq(t.overdueByOwner, { u1: 1, u2: 1 }, 'المتأخرة لكل مسؤول');
const tEmpty = M.aggregateTasks({ created: [], completed: [], openCandidates: [] }, helpers, '2026-10-26');
eq(tEmpty.metrics[KPI.TASK_COMPLETION_RATE].status, 'empty', 'لا مهام → معدل الإنجاز empty');
eq(tEmpty.metrics[KPI.PRODUCTIVITY_SCORE].value, null, 'لا مهام → لا نقاط وهمية');
eq(tEmpty.metrics[KPI.OVERDUE_TASKS].value, 0, 'لا مهام مفتوحة متأخرة = صفر حقيقي');

const cpd = M.completedPerDay([{ id: 1, status: 'completed', completed_at: new Date(2026, 9, 20, 23, 50).toISOString() }, { id: 2, status: 'completed', completed_at: new Date(2026, 9, 20, 1, 0).toISOString() }, { id: 3, status: 'ready', completed_at: null }], helpers, '2026-10-19', '2026-10-21');
eq(cpd, [{ date: '2026-10-19', value: 0 }, { date: '2026-10-20', value: 2 }, { date: '2026-10-21', value: 0 }], 'المنجز يوميًا بتوقيت محلي ومعبّأ بالأصفار');

// ── تفصيل لكل موظف ─────────────────────────────────────────────
const rows = M.aggregateByEmployee({
  employees: [{ id: 'u1', employee_name: 'أ', team: 'مبيعات' }, { id: 'u2', employee_name: 'ب', team: 'سوشال' }],
  attendance: att, created, completed: completedInPeriod, openCandidates,
}, helpers, '2026-10-26');
const r1 = rows.find((r) => r.id === 'u1');
eq([r1.presentDays, r1.lateDays, r1.hours], [2, 1, 17], 'تفصيل الموظف: حضور/تأخير/ساعات');
eq([r1.completed, r1.overdue], [1, 1], 'تفصيل الموظف: مهام');
ok(rows[0].overdue >= rows[rows.length - 1].overdue, 'الترتيب: الأكثر تأخراً أولاً');

// ── نطاق الفريق/الموظف وسلاسل اليوم
const profs = [{ id: 'u1', employee_name: 'أ', team: 'مبيعات', is_active: true }, { id: 'u2', employee_name: 'ب', team: 'سوشال', is_active: true }, { id: 'u3', employee_name: 'ج', team: 'مبيعات', is_active: false }];
const sAll = M.resolveScope(profs, {});
eq([sAll.totalActive, sAll.names, sAll.ids], [2, null, null], 'كل الفريق: بلا تصفية بالاسم، العدد = النشطون');
const sTeam = M.resolveScope(profs, { team: 'مبيعات' });
eq([sTeam.totalActive, [...sTeam.names], [...sTeam.ids]], [1, ['أ'], ['u1']], 'فريق: النشطون فقط');
const sEmp = M.resolveScope(profs, { employeeId: 'u2' });
eq([sEmp.totalActive, [...sEmp.names]], [1, ['ب']], 'موظف محدد');
eq(M.resolveScope(profs, { employeeId: 'nope' }).totalActive, 0, 'موظف غير موجود → صفر لا كل الفريق');
eq(M.seriesFromPerDay(a.perDay, KPI.LATE_EMPLOYEES), [{ date: '2026-10-20', value: 1 }, { date: '2026-10-21', value: 0 }], 'سلسلة التأخير اليومية');
eq(M.seriesFromPerDay(a.perDay, KPI.COMPLETED_TASKS), null, 'مقياس بلا سلسلة حضور → null');

// ── المقارنة والحدود ───────────────────────────────────────────
eq(M.compareValues(90, 80, KPI.ATTENDANCE_RATE).direction, 'up', 'ارتفاع');
eq(M.compareValues(90, 80, KPI.ATTENDANCE_RATE).improving, true, 'ارتفاع الحضور تحسّن');
eq(M.compareValues(5, 3, KPI.LATE_EMPLOYEES).improving, false, 'ارتفاع التأخير ليس تحسناً');
eq(M.compareValues(10, 0, KPI.COMPLETED_TASKS).pct, null, 'قسمة على صفر → pct=null لا Infinity');
eq(M.compareValues(null, 5, KPI.COMPLETED_TASKS).available, false, 'قيمة ناقصة → غير متاحة');
eq(M.compareValues(5, null, KPI.COMPLETED_TASKS).available, false, 'سابقة ناقصة → غير متاحة');
eq(M.compareValues(80, 80, KPI.ATTENDANCE_RATE).direction, 'flat', 'تساوي = ثابت');

eq(M.thresholdInfo(KPI.ATTENDANCE_RATE, 92).status, 'good', 'حد: جيد');
eq(M.thresholdInfo(KPI.ATTENDANCE_RATE, 75).status, 'warn', 'حد: تحذير');
eq(M.thresholdInfo(KPI.ATTENDANCE_RATE, 55).status, 'critical', 'حد: حرج');
eq(M.thresholdInfo(KPI.ATTENDANCE_RATE, null).status, 'unknown', 'null → unknown لا good');
eq(M.thresholdInfo(KPI.COMPLETED_TASKS, 10), null, 'بلا حدود → null');
eq(M.thresholdInfo(KPI.ATTENDANCE_RATE, 88).proximityPct, 91, 'الاقتراب من حد التحذير للأعلى-أفضل = warn/value');
eq(M.thresholdInfo(KPI.LATE_EMPLOYEES, 2).proximityPct, 67, 'الاقتراب للأدنى-أفضل = value/warn');
ok(/ليست أهدافاً|حدود تقييم/.test(M.thresholdInfo(KPI.ATTENDANCE_RATE, 88).note), 'تسمية: حدود تقييم لا أهداف');

// ── التنبيهات ──────────────────────────────────────────────────
const meta = {
  [KPI.ATTENDANCE_RATE]: { status: 'ok' },
  [KPI.COMPLETED_TASKS]: { status: 'error', reason: 'فشل الاتصال' },
  [KPI.ACTIVE_USERS]: { status: 'empty', reason: 'لا سجلات' },
  [KPI.AVG_RESPONSE_TIME_MS]: { status: 'unavailable', reason: 'لا مصدر' },
};
const alerts = M.buildAlerts(
  { [KPI.ATTENDANCE_RATE]: 55, [KPI.OVERDUE_TASKS]: 4, [KPI.COMPLETED_TASKS]: null },
  meta,
  { [KPI.ATTENDANCE_RATE]: { available: true, pct: -20, improving: false, direction: 'down' } },
);
ok(alerts.some((x) => x.kind === 'threshold' && x.severity === 'critical' && x.metric === KPI.ATTENDANCE_RATE), 'تنبيه حدّ حرج');
ok(alerts.some((x) => x.kind === 'data' && x.metric === KPI.COMPLETED_TASKS && x.severity === 'warn'), 'تنبيه بيانات عند الخطأ');
ok(alerts.some((x) => x.kind === 'action' && x.metric === KPI.OVERDUE_TASKS), 'إجراء مطلوب للمهام المتأخرة');
ok(alerts.some((x) => x.kind === 'trend' && x.metric === KPI.ATTENDANCE_RATE), 'تنبيه تراجع');
ok(!alerts.some((x) => x.metric === KPI.AVG_RESPONSE_TIME_MS), '«غير متوفر» الدائم لا يُغرق التنبيهات');
ok(!alerts.some((x) => x.metric === KPI.ACTIVE_USERS && x.severity === 'critical'), 'empty ليس حرجاً');
eq(alerts[0].severity, 'critical', 'الأخطر أولاً');
ok(alerts.every((x) => x.id && x.title), 'لكل تنبيه id وعنوان');

// ── الملخص التنفيذي ─────────────────────────────────────────────
const summary = M.buildExecutiveSummary(
  { [KPI.ATTENDANCE_RATE]: 88, [KPI.OVERDUE_TASKS]: 3, [KPI.COMPLETED_TASKS]: null },
  { [KPI.ATTENDANCE_RATE]: { available: true, delta: 4, pct: 5, improving: true, direction: 'up' } },
  { [KPI.COMPLETED_TASKS]: { status: 'error', reason: 'x' } },
);
ok(summary.some((s) => s.includes('88')), 'الملخص يذكر الحضور');
ok(summary.some((s) => s.includes('غير متوفر')), 'الملخص يذكر النقص بصراحة');
ok(!summary.some((s) => /NaN|undefined|null/.test(s)), 'لا NaN/undefined في الملخص');

// ── CSV ────────────────────────────────────────────────────────
const csv = M.buildCSV([{ key: 'a', label: 'الاسم' }, { key: 'b', label: 'القيمة' }], [
  { a: '=HYPERLINK("x")', b: 5 },
  { a: '+1+1', b: -3 },
  { a: '@cmd', b: 'سطر\nمتعدد' },
  { a: 'فاصلة, و"اقتباس"', b: '-12.5' },
  { a: '\tحقن', b: null },
]);
ok(csv.startsWith('﻿'), 'BOM للعربية في Excel');
ok(csv.includes('الاسم,القيمة'), 'رؤوس عربية');
ok(csv.includes("\"'=HYPERLINK(\"\"x\"\")\""), 'حماية = من حقن الصيغ');
ok(csv.includes("'+1+1"), 'حماية +');
ok(csv.includes("'@cmd"), 'حماية @');
ok(csv.includes(',-3'), 'الأرقام السالبة الحقيقية لا تُعدَّل');
ok(csv.includes(',-12.5'), 'نص رقمي سالب لا يُعدَّل');
ok(csv.includes('"فاصلة, و""اقتباس"""'), 'تهريب الفاصلة والاقتباس');
ok(csv.includes('"سطر\nمتعدد"'), 'سطر جديد داخل اقتباس');
ok(csv.includes("'\tحقن") || csv.includes("\"'\tحقن\""), 'حماية Tab');
ok(csv.split('\r\n').length === 6, 'فواصل أسطر CRLF');

eq(M.exportFilename('تقرير الحضور', '2026-10-01', '2026-10-26', 'csv'), 'lowes_تقرير-الحضور_2026-10-01_2026-10-26.csv', 'اسم الملف: التقرير والفترة');
eq(M.exportFilename('a/b:c*?', '2026-10-01', '2026-10-01', 'csv'), 'lowes_a-b-c_2026-10-01.csv', 'تنظيف أحرف ممنوعة + يوم واحد');

const exp = M.buildKpiExportRows({
  metrics: [KPI.ATTENDANCE_RATE, KPI.ACTIVE_USERS, KPI.OVERDUE_TASKS],
  kpis: { [KPI.ATTENDANCE_RATE]: 88, [KPI.ACTIVE_USERS]: null, [KPI.OVERDUE_TASKS]: 3 },
  prev: { [KPI.ATTENDANCE_RATE]: 84, [KPI.OVERDUE_TASKS]: 1 },
  trends: { [KPI.ATTENDANCE_RATE]: { available: true, pct: 5 }, [KPI.OVERDUE_TASKS]: { available: true, pct: 200 } },
  meta: { [KPI.ACTIVE_USERS]: { status: 'empty', reason: 'لا سجلات' }, [KPI.ATTENDANCE_RATE]: { status: 'ok', source: 'جدول الحضور' } },
});
eq(exp.rows.length, 3, 'صف لكل مؤشر معروض');
eq(exp.rows[0]['القيمة'], 88, 'القيمة رقمية');
eq(exp.rows[1]['القيمة'], '', 'غير متوفر = فراغ لا صفر');
eq(exp.rows[1]['الحالة'], 'لا توجد بيانات', 'حالة عربية');
ok(exp.columns.every((c) => c.key && c.label), 'أعمدة بمفاتيح وتسميات');

console.log(`✅ نتيجة: ${pass} نجحت · ${fail} فشلت`);
process.exit(fail ? 1 : 0);
