// =============================================================
// Analytics — reportMath (pure, no React / Supabase / aliases)
//
// Single home of the report LOGIC so it is testable and never
// duplicated between pages:
//   dates & periods   resolveRange · previousPeriod · normalizeRange
//   scope             resolveScope (team / employee → names, ids, headcount)
//   aggregation       aggregateAttendance · aggregateTasks · aggregateByEmployee
//   interpretation    compareValues · thresholdInfo · buildAlerts · buildExecutiveSummary
//   export            buildCSV · exportFilename · buildKpiExportRows · buildDailyRows
//
// Metric result shape: { value:number|null, status:'ok'|'empty'|'error'|'unavailable', reason? }
// A missing number is NEVER replaced by an invented one.
// =============================================================
import { ymd, diffDays, instantKey } from '../../tasks/utils/taskDates.js';
import {
  KPI,
  KPI_LABELS,
  KPI_UNIT,
  KPI_THRESHOLDS,
  LOWER_IS_BETTER_KPIS,
  resolveDateRange,
  formatKPI,
  DATE_RANGE_PRESET,
} from '../types/analytics.types.js';

export { ymd, diffDays };

export const MAX_RANGE_DAYS = 366;

// ── Dates ─────────────────────────────────────────────────────

/** 'YYYY-MM-DD' → local Date (midnight), or null if not a real calendar day. */
export function parseYMD(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return ymd(d) === s ? d : null;
}

export function addDays(key, n) {
  const d = parseYMD(key);
  if (!d) return null;
  return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

export function eachDay(from, to) {
  const out = [];
  if (!parseYMD(from) || !parseYMD(to)) return out;
  for (let k = from, guard = 0; k <= to && guard <= MAX_RANGE_DAYS * 2; k = addDays(k, 1), guard++) out.push(k);
  return out;
}

/**
 * Instant (ISO string) of LOCAL midnight starting `key` — for timestamptz range filters:
 * `.gte(dayStartISO(from)).lt(dayStartISO(addDays(to, 1)))`. The toISOString here is intentional
 * (an instant, not a calendar day).
 */
export function dayStartISO(key) {
  const d = parseYMD(key);
  return d ? d.toISOString() : null;
}

/** 'YYYY-MM-DD' → 'YYYY/MM/DD' (the attendance table's date format). */
export const toSlash = (key) => String(key).replaceAll('-', '/');
export const fromSlash = (s) => String(s).replaceAll('/', '-');

/** Preset → local {from,to}. (preset, now, custom) — thin wrapper over the types helper. */
export function resolveRange(preset, now = new Date(), custom = {}) {
  return resolveDateRange(preset, custom, now);
}

/** The period of equal length that ends the day before `from`. */
export function previousPeriod(from, to) {
  const len = diffDays(from, to);
  if (len === null || len < 0) return null;
  const prevTo = addDays(from, -1);
  return { from: addDays(prevTo, -len), to: prevTo };
}

/** Validate / order a custom range. Valid result has no `valid` key. */
export function normalizeRange(from, to) {
  if (!parseYMD(from) || !parseYMD(to)) return { valid: false };
  const swapped = from > to;
  const a = swapped ? to : from;
  const b = swapped ? from : to;
  const out = { from: a, to: b, swapped };
  if (diffDays(a, b) + 1 > MAX_RANGE_DAYS) out.tooLong = true;
  return out;
}

// ── Filters ⇄ URL (so a report link keeps its period / team / employee) ──

const KNOWN_PRESETS = new Set(Object.values(DATE_RANGE_PRESET));

/** URL query → partial filters. Unknown / invalid values are ignored (never trusted). */
export function filtersFromSearch(search, now = new Date()) {
  const p = new URLSearchParams(search);
  const out = {};
  const preset = p.get('preset');
  const from = p.get('from');
  const to = p.get('to');
  if (preset && preset !== DATE_RANGE_PRESET.CUSTOM && KNOWN_PRESETS.has(preset)) {
    Object.assign(out, { preset }, resolveRange(preset, now));
  } else if (parseYMD(from) && parseYMD(to)) {
    Object.assign(out, { preset: DATE_RANGE_PRESET.CUSTOM, from, to });
  }
  if (p.get('team')) out.team = p.get('team');
  if (p.get('emp')) out.employeeId = p.get('emp');
  return out;
}

/** filters → flat query params (empty values omitted). */
export function filtersToSearch(filters) {
  const q = {};
  if (filters.preset && filters.preset !== DATE_RANGE_PRESET.CUSTOM) q.preset = filters.preset;
  else if (filters.from && filters.to) Object.assign(q, { preset: DATE_RANGE_PRESET.CUSTOM, from: filters.from, to: filters.to });
  if (filters.team) q.team = filters.team;
  if (filters.employeeId) q.emp = filters.employeeId;
  return q;
}

// ── Scope (team / employee filter) ────────────────────────────

/**
 * @param {Array<{id,employee_name,team,is_active}>} profiles
 * @param {{team?:string|null, employeeId?:string|null}} filters
 * @returns {{employees:Array, totalActive:number, names:Set<string>|null, ids:Set<string>|null}}
 *   names/ids are null when the scope is "everyone" (no row filtering needed).
 */
export function resolveScope(profiles, filters = {}) {
  const active = (profiles ?? []).filter((p) => p.is_active !== false);
  const { team = null, employeeId = null } = filters;
  if (!team && !employeeId) {
    return { employees: active, totalActive: active.length, names: null, ids: null };
  }
  const scoped = active.filter((p) => (!employeeId || p.id === employeeId) && (!team || p.team === team));
  return {
    employees: scoped,
    totalActive: scoped.length,
    names: new Set(scoped.map((p) => p.employee_name)),
    ids: new Set(scoped.map((p) => p.id)),
  };
}

// ── Attendance ────────────────────────────────────────────────

const ok = (value, extra = {}) => ({ value, status: 'ok', ...extra });
const empty = (reason) => ({ value: null, status: 'empty', reason });
export const unavailable = (reason) => ({ value: null, status: 'unavailable', reason });
export const failed = (reason) => ({ value: null, status: 'error', reason });

const ATTENDANCE_KEYS = [
  KPI.ATTENDANCE_RATE, KPI.LATE_EMPLOYEES, KPI.ABSENT_EMPLOYEES,
  KPI.WORKED_HOURS_TOTAL, KPI.OVERTIME_HOURS_TOTAL, KPI.ACTIVE_USERS,
];
const pct0 = (n, d) => Math.round((n / d) * 100);
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Rows come from `attendance`: two rows per employee-day (type 'in' / 'out'), date 'YYYY/MM/DD'.
 * Definitions (shown to the user as source notes):
 *   ACTIVE_USERS   distinct employees with at least one 'in' record in the period
 *   LATE           employee-days whose check-in was late
 *   ATTENDANCE     present employee-days ÷ (active headcount × days that have records)
 *   ABSENT         Σ over recorded days of (headcount − present), never negative
 */
export function aggregateAttendance(rows, totalActive) {
  const inByKey = new Map(); // employee::day → { late }
  const outHours = [];
  for (const r of rows ?? []) {
    const day = fromSlash(r.date);
    if (r.type === 'in') {
      const key = `${r.employee_name}::${day}`;
      const prev = inByKey.get(key);
      inByKey.set(key, { name: r.employee_name, day, late: !!(prev?.late || r.was_late) });
    } else if (r.type === 'out') {
      outHours.push({ name: r.employee_name, day, hours: Number(r.hours) || 0 });
    }
  }

  const metrics = {};
  if (inByKey.size === 0) {
    const reason = 'لا توجد سجلات حضور في الفترة المختارة';
    for (const k of ATTENDANCE_KEYS) metrics[k] = empty(reason);
    metrics[KPI.OVERTIME_HOURS_TOTAL] = unavailable('لا يوجد عمود وقت إضافي في جدول الحضور');
    return { metrics, perDay: [], perEmployee: new Map() };
  }

  const dayMap = new Map(); // day → { present:Set, late:number, hours:number }
  const perEmployee = new Map(); // name → { presentDays, lateDays, hours }
  const emp = (name) => {
    if (!perEmployee.has(name)) perEmployee.set(name, { presentDays: 0, lateDays: 0, hours: 0 });
    return perEmployee.get(name);
  };
  const dayOf = (day) => {
    if (!dayMap.has(day)) dayMap.set(day, { present: new Set(), late: 0, hours: 0 });
    return dayMap.get(day);
  };
  for (const { name, day, late } of inByKey.values()) {
    const d = dayOf(day);
    d.present.add(name);
    if (late) d.late++;
    const e = emp(name);
    e.presentDays++;
    if (late) e.lateDays++;
  }
  let totalHours = 0;
  for (const { name, day, hours } of outHours) {
    dayOf(day).hours += hours;
    emp(name).hours += hours;
    totalHours += hours;
  }

  const hasTotal = Number.isFinite(totalActive) && totalActive > 0;
  const days = [...dayMap.keys()].sort();
  const perDay = days.map((date) => {
    const d = dayMap.get(date);
    const present = d.present.size;
    return {
      date,
      present,
      late: d.late,
      hours: round1(d.hours),
      absent: hasTotal ? Math.max(0, totalActive - present) : null,
      rate: hasTotal ? Math.min(100, pct0(present, totalActive)) : null,
    };
  });

  const presentDays = [...inByKey.values()].length;
  const lateDays = [...inByKey.values()].filter((x) => x.late).length;
  const noTotal = 'عدد الموظفين النشطين غير متاح ضمن النطاق المختار';

  metrics[KPI.ACTIVE_USERS] = ok(new Set([...inByKey.values()].map((x) => x.name)).size);
  metrics[KPI.LATE_EMPLOYEES] = ok(lateDays);
  metrics[KPI.WORKED_HOURS_TOTAL] = ok(round1(totalHours));
  metrics[KPI.OVERTIME_HOURS_TOTAL] = unavailable('لا يوجد عمود وقت إضافي في جدول الحضور');
  if (hasTotal) {
    metrics[KPI.ATTENDANCE_RATE] = ok(Math.min(100, pct0(presentDays, totalActive * days.length)));
    metrics[KPI.ABSENT_EMPLOYEES] = ok(perDay.reduce((s, d) => s + d.absent, 0));
  } else {
    metrics[KPI.ATTENDANCE_RATE] = empty(noTotal);
    metrics[KPI.ABSENT_EMPLOYEES] = empty(noTotal);
  }
  return { metrics, perDay, perEmployee };
}

const PER_DAY_FIELD = {
  [KPI.ATTENDANCE_RATE]: 'rate',
  [KPI.LATE_EMPLOYEES]: 'late',
  [KPI.ABSENT_EMPLOYEES]: 'absent',
  [KPI.WORKED_HOURS_TOTAL]: 'hours',
  [KPI.ACTIVE_USERS]: 'present',
};

/** Daily series for an attendance-family metric, or null if the metric isn't one. */
export function seriesFromPerDay(perDay, metric) {
  const field = PER_DAY_FIELD[metric];
  if (!field) return null;
  return (perDay ?? []).filter((d) => d[field] !== null).map((d) => ({ date: d.date, value: d[field] }));
}

// ── Tasks ─────────────────────────────────────────────────────

/**
 * helpers: { isCompleted(t), isCancelled(t), isOverdue(t, asOfKey), ownerOf(t) } — injected so
 * this file stays free of the tasks module's aliases (kpiEngine passes taskWorkflow's own).
 *
 * @param {{created:Array, completed:Array, openCandidates:Array}} data
 *   created        tasks created in the period
 *   completed      tasks whose completion date falls in the period
 *   openCandidates open tasks whose due day is before `asOf`
 */
export function aggregateTasks({ created, completed, openCandidates }, helpers, asOf) {
  const uniq = (list) => [...new Map((list ?? []).map((t) => [t.id, t])).values()];
  const made = uniq(created).filter((t) => !helpers.isCancelled(t));
  const done = uniq(completed).filter((t) => helpers.isCompleted(t));
  const overdue = uniq(openCandidates).filter((t) => helpers.isOverdue(t, asOf));

  const overdueByOwner = {};
  for (const t of overdue) {
    const o = helpers.ownerOf(t);
    if (o) overdueByOwner[o] = (overdueByOwner[o] ?? 0) + 1;
  }

  const metrics = {
    [KPI.COMPLETED_TASKS]: ok(done.length),
    [KPI.OVERDUE_TASKS]: ok(overdue.length),
  };
  if (made.length === 0) {
    const reason = 'لا مهام مُنشأة خلال الفترة المختارة';
    metrics[KPI.TASK_COMPLETION_RATE] = empty(reason);
    metrics[KPI.PRODUCTIVITY_SCORE] = empty(reason);
  } else {
    const completedMade = made.filter((t) => helpers.isCompleted(t)).length;
    const progress = made.reduce((s, t) => s + (helpers.isCompleted(t) ? 100 : Number(t.progress) || 0), 0) / made.length;
    metrics[KPI.TASK_COMPLETION_RATE] = ok(pct0(completedMade, made.length));
    metrics[KPI.PRODUCTIVITY_SCORE] = ok(Math.round(progress));
  }
  return { metrics, overdueByOwner, overdueList: overdue };
}

/** Completed-task count per LOCAL day, zero-filled over the whole range. */
export function completedPerDay(completed, helpers, from, to) {
  const counts = {};
  for (const t of new Map((completed ?? []).filter((x) => helpers.isCompleted(x)).map((x) => [x.id, x])).values()) {
    const k = instantKey(t.completed_at);
    if (k) counts[k] = (counts[k] ?? 0) + 1;
  }
  return eachDay(from, to).map((date) => ({ date, value: counts[date] ?? 0 }));
}

/**
 * One row per employee, worst first (overdue, then late) — a to-do list, not a leaderboard.
 */
export function aggregateByEmployee({ employees, attendance, created, completed, openCandidates }, helpers, asOf) {
  const att = aggregateAttendance(attendance, employees?.length ?? 0).perEmployee;
  const tk = aggregateTasks({ created, completed, openCandidates }, helpers, asOf);
  const doneBy = {};
  for (const t of new Map((completed ?? []).filter((x) => helpers.isCompleted(x)).map((x) => [x.id, x])).values()) {
    const o = helpers.ownerOf(t);
    if (o) doneBy[o] = (doneBy[o] ?? 0) + 1;
  }
  const rows = (employees ?? []).map((p) => {
    const a = att.get(p.employee_name);
    return {
      id: p.id,
      name: p.employee_name,
      team: p.team ?? '',
      presentDays: a?.presentDays ?? 0,
      lateDays: a?.lateDays ?? 0,
      hours: round1(a?.hours ?? 0),
      completed: doneBy[p.id] ?? 0,
      overdue: tk.overdueByOwner[p.id] ?? 0,
    };
  });
  return rows.sort((x, y) => y.overdue - x.overdue || y.lateDays - x.lateDays || x.name.localeCompare(y.name, 'ar'));
}

// ── Comparison & thresholds ───────────────────────────────────

export function compareValues(curr, prev, metric) {
  if (!Number.isFinite(curr) || !Number.isFinite(prev)) return { available: false };
  const delta = curr - prev;
  const direction = Math.abs(delta) < 0.05 ? 'flat' : delta > 0 ? 'up' : 'down';
  const lowerBetter = LOWER_IS_BETTER_KPIS.includes(metric);
  return {
    available: true,
    delta: round1(delta),
    pct: prev === 0 ? null : Math.round((delta / Math.abs(prev)) * 100),
    direction,
    improving: direction === 'flat' ? null : lowerBetter ? delta < 0 : delta > 0,
  };
}

export function compareAll(current, previous) {
  const out = {};
  for (const m of Object.keys(current ?? {})) out[m] = compareValues(current[m], previous?.[m], m);
  return out;
}

/**
 * Assessment limits that already exist in KPI_THRESHOLDS — NOT management targets.
 * proximityPct: how close a healthy value is to the warning limit (100 = at the limit).
 */
export function thresholdInfo(metric, value) {
  const th = KPI_THRESHOLDS[metric];
  if (!th) return null;
  const { warn, critical, lower_is_better: lowerBetter } = th;
  const limits = lowerBetter
    ? `تحذير عند ≥ ${warn} · حرج عند ≥ ${critical}`
    : `تحذير عند ≤ ${warn} · حرج عند ≤ ${critical}`;
  const note = `حدود تقييم (ليست أهدافاً إدارية): ${limits}`;
  if (!Number.isFinite(value)) return { status: 'unknown', warn, critical, lowerBetter, proximityPct: null, note };

  let status = 'good';
  if (lowerBetter) status = value >= critical ? 'critical' : value >= warn ? 'warn' : 'good';
  else status = value <= critical ? 'critical' : value <= warn ? 'warn' : 'good';

  let proximityPct = null;
  if (status === 'good') {
    if (lowerBetter) proximityPct = warn > 0 ? Math.round((value / warn) * 100) : null;
    else proximityPct = value > 0 ? Math.round((warn / value) * 100) : null;
  }
  return { status, warn, critical, lowerBetter, proximityPct, note };
}

// ── Alerts ("needs your attention") ───────────────────────────

const SEVERITY_ORDER = { critical: 0, warn: 1, info: 2 };
const label = (m) => KPI_LABELS[m] ?? m;

export function buildAlerts(kpis, meta = {}, trends = {}) {
  const alerts = [];
  for (const metric of Object.keys(KPI_THRESHOLDS)) {
    const info = thresholdInfo(metric, kpis?.[metric]);
    if (info && (info.status === 'warn' || info.status === 'critical')) {
      alerts.push({
        id: `threshold:${metric}`, kind: 'threshold', severity: info.status, metric,
        title: `${label(metric)} ${info.status === 'critical' ? 'في المستوى الحرج' : 'قرب/تحت حد التحذير'}`,
        detail: `القيمة الحالية ${formatKPI(metric, kpis[metric])} — ${info.note}`,
      });
    }
  }
  for (const [metric, m] of Object.entries(meta ?? {})) {
    if (m?.status === 'error') {
      alerts.push({ id: `data:${metric}`, kind: 'data', severity: 'warn', metric, title: `تعذّر تحميل «${label(metric)}»`, detail: m.reason || 'خطأ غير معروف أثناء الجلب' });
    } else if (m?.status === 'empty') {
      alerts.push({ id: `data:${metric}`, kind: 'data', severity: 'info', metric, title: `لا توجد بيانات لـ«${label(metric)}»`, detail: m.reason || 'لا بيانات ضمن الفترة المختارة' });
    }
  }
  const overdue = kpis?.[KPI.OVERDUE_TASKS];
  if (Number.isFinite(overdue) && overdue > 0) {
    alerts.push({
      id: `action:${KPI.OVERDUE_TASKS}`, kind: 'action', severity: 'warn', metric: KPI.OVERDUE_TASKS,
      title: `${overdue} مهمة متأخرة تحتاج متابعة`, detail: 'افتح تقرير المهام لمعرفة المسؤول وعمر التأخير.',
    });
  }
  for (const [metric, t] of Object.entries(trends ?? {})) {
    if (t?.available && t.improving === false && Number.isFinite(t.pct) && Math.abs(t.pct) >= 15) {
      alerts.push({
        id: `trend:${metric}`, kind: 'trend', severity: 'warn', metric,
        title: `تراجع في «${label(metric)}»`, detail: `تغيّر ${t.pct > 0 ? '+' : ''}${t.pct}% مقارنة بالفترة السابقة.`,
      });
    }
  }
  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

// ── Executive summary (plain sentences) ───────────────────────

const SUMMARY_METRICS = [KPI.ATTENDANCE_RATE, KPI.TASK_COMPLETION_RATE, KPI.COMPLETED_TASKS, KPI.OVERDUE_TASKS, KPI.LATE_EMPLOYEES];

function trendPhrase(metric, t) {
  if (!t?.available) return '';
  if (t.direction === 'flat') return ' (بلا تغيير عن الفترة السابقة)';
  const unit = KPI_UNIT[metric] === '%' ? 'نقطة' : '';
  const amount = unit ? `${Math.abs(t.delta)} ${unit}` : (t.pct === null ? `${Math.abs(t.delta)}` : `${Math.abs(t.pct)}%`);
  return ` (${t.direction === 'up' ? '↑' : '↓'} ${amount} ${t.improving ? 'تحسّن' : 'تراجع'} عن الفترة السابقة)`;
}

export function buildExecutiveSummary(kpis, trends = {}, meta = {}) {
  const lines = [];
  for (const m of SUMMARY_METRICS) {
    const v = kpis?.[m];
    if (Number.isFinite(v)) {
      lines.push(`${label(m)}: ${formatKPI(m, v)}${trendPhrase(m, trends[m])}`);
    } else {
      const reason = meta?.[m]?.reason;
      lines.push(`${label(m)}: غير متوفر${reason ? ` — ${reason}` : ''}`);
    }
  }
  return lines;
}

// ── CSV & export ──────────────────────────────────────────────

const NUMERIC = /^-?\d+(\.\d+)?$/;
const FORMULA_START = /^[=+\-@\t\r]/;

/** Neutralise spreadsheet formula injection: text starting = + - @ (and not a plain number) gets a leading '. */
export function guardFormula(value) {
  if (typeof value !== 'string') return value;
  return FORMULA_START.test(value) && !NUMERIC.test(value) ? `'${value}` : value;
}

/** Escape one CSV cell (formula-safe). */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : String(guardFormula(value));
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const BOM = String.fromCharCode(0xfeff);

/** columns: [{key,label}] · returns a string starting with a BOM so Excel reads Arabic as UTF-8. */
export function buildCSV(columns, rows) {
  const head = columns.map((c) => csvCell(c.label)).join(',');
  const body = (rows ?? []).map((r) => columns.map((c) => csvCell(r[c.key])).join(','));
  return BOM + [head, ...body].join('\r\n');
}

export function exportFilename(reportName, from, to, ext) {
  const slug = String(reportName ?? 'تقرير')
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'report';
  const period = from && to && from !== to ? `${from}_${to}` : (from || to || '');
  return `lowes_${slug}${period ? `_${period}` : ''}.${ext}`;
}

const STATUS_AR = { good: 'جيد', warn: 'تحذير', critical: 'حرج' };
const META_STATUS_AR = { empty: 'لا توجد بيانات', error: 'خطأ في التحميل', unavailable: 'غير متوفر' };

export const KPI_EXPORT_COLUMNS = ['المؤشر', 'القيمة', 'الوحدة', 'الفترة السابقة', 'التغيّر %', 'الحالة', 'المصدر', 'ملاحظة']
  .map((l) => ({ key: l, label: l }));

/** Rows for exactly the KPIs shown on screen (same numbers, same period). */
export function buildKpiExportRows({ metrics, kpis, prev = {}, trends = {}, meta = {} }) {
  const rows = metrics.map((m) => {
    const mm = meta[m] ?? {};
    const value = Number.isFinite(kpis?.[m]) ? kpis[m] : '';
    const th = value === '' ? null : thresholdInfo(m, value);
    let status;
    if (mm.status && mm.status !== 'ok') status = META_STATUS_AR[mm.status] ?? mm.status;
    else if (value === '') status = 'لا توجد بيانات';
    else status = th ? STATUS_AR[th.status] : 'بدون حد تقييم';
    const t = trends[m];
    return {
      'المؤشر': label(m),
      'القيمة': value,
      'الوحدة': KPI_UNIT[m] ?? '',
      'الفترة السابقة': Number.isFinite(prev?.[m]) ? prev[m] : '',
      'التغيّر %': t?.available && Number.isFinite(t.pct) ? t.pct : '',
      'الحالة': status,
      'المصدر': mm.source ?? '',
      'ملاحظة': mm.reason ?? (th ? th.note : ''),
    };
  });
  return { columns: KPI_EXPORT_COLUMNS, rows };
}

/** Daily table for the series currently displayed. series: {metric:[{date,value}]} */
export function buildDailyRows(series, metrics) {
  const dates = [...new Set(metrics.flatMap((m) => (series?.[m] ?? []).map((p) => p.date)))].sort();
  const columns = [{ key: 'date', label: 'التاريخ' }, ...metrics.map((m) => ({ key: m, label: label(m) }))];
  const rows = dates.map((date) => ({
    date,
    ...Object.fromEntries(metrics.map((m) => [m, (series?.[m] ?? []).find((p) => p.date === date)?.value ?? ''])),
  }));
  return { columns, rows };
}
