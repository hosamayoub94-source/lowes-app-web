// =============================================================
// Analytics Module — KPI Engine
//
// Fetches REAL data (attendance, tasks, profiles, local queue) and hands it
// to the pure functions in reportMath.js. There is NO mock mode and NO
// silent fallback: a failed or empty source yields a metric with
// status 'error' | 'empty' | 'unavailable' and a human reason — never an
// invented number.
//
//   computeKPIs(filters)            → { values, meta, perDay, breakdown, overdueByOwner, scope }
//   computeTimeSeries(metric, f)    → { points, status, reason, source }
//   fetchDirectory()                → { profiles, teams, employees } for the filter bar
//   fetchRecentActivity()           → { items, status, reason, source }
// =============================================================
import { supabase } from '@services/supabase';
import { fetchAllRows } from '@utils/fetchAllRows';
import { useAuthStore } from '@stores/authStore';
import { ROLES } from '@data/teams';
import { isOverdue, normalizeStatus, ownerId } from '@modules/tasks/utils/taskWorkflow';
import { visibleForReport } from '@modules/tasks/utils/taskMetrics';
import { todayKey } from '@modules/tasks/utils/taskDates';
import { KPI, ANALYTICS_CACHE_TTL_MS } from '../types/analytics.types';
import {
  addDays,
  aggregateAttendance,
  aggregateByEmployee,
  aggregateTasks,
  completedPerDay,
  dayStartISO,
  failed,
  resolveScope,
  seriesFromPerDay,
  toSlash,
  unavailable,
} from './reportMath';

// ── Sources (shown to the user) ───────────────────────────────
export const SOURCE = Object.freeze({
  ATTENDANCE: 'جدول الحضور (attendance)',
  TASKS: 'جدول المهام (tasks) — حالة المهام الحالية',
  QUEUE: 'قائمة العمليات المحلية على هذا الجهاز',
  SNAPSHOTS: 'اللقطات اليومية (analytics_snapshots)',
  ACTIVITY: 'سجل النشاط (activity_logs)',
});

const TASK_COLUMNS = 'id,status,progress,due_date,created_at,completed_at,assignee_id,assigned_to,team,is_sensitive';
const CLOSED_STATUSES = '(completed,archived,cancelled,done)';

const ATTENDANCE_KPIS = [KPI.ATTENDANCE_RATE, KPI.LATE_EMPLOYEES, KPI.ABSENT_EMPLOYEES, KPI.WORKED_HOURS_TOTAL, KPI.OVERTIME_HOURS_TOTAL, KPI.ACTIVE_USERS];
const TASK_KPIS = [KPI.PRODUCTIVITY_SCORE, KPI.COMPLETED_TASKS, KPI.OVERDUE_TASKS, KPI.TASK_COMPLETION_RATE];

// ── Tiny promise cache (one query serves KPIs, series and the previous period) ──
const _cache = new Map();

function _memo(key, loader, isCacheable = () => true) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < ANALYTICS_CACHE_TTL_MS) return hit.promise;
  const promise = loader();
  _cache.set(key, { ts: Date.now(), promise });
  promise.then((v) => { if (!isCacheable(v)) _cache.delete(key); }, () => _cache.delete(key));
  return promise;
}

export function clearKPICache() {
  _cache.clear();
}

const errText = (e) => e?.message || String(e) || 'خطأ غير معروف';

function _viewer() {
  const role = useAuthStore.getState().session?.role ?? null;
  return { role, isAdmin: role === ROLES.ADMIN };
}

// The tasks module's own status/overdue rules — not re-implemented here.
const TASK_HELPERS = {
  isCompleted: (t) => normalizeStatus(t.status) === 'completed',
  isCancelled: (t) => normalizeStatus(t.status) === 'cancelled',
  isOverdue,
  ownerOf: ownerId,
};

// ── Directory (teams / employees for the filter bar) ──────────
export function fetchDirectory() {
  return _memo('directory', async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, employee_name, team, is_active')
      .eq('is_active', true)
      .order('employee_name');
    if (error) return { status: 'error', reason: errText(error), profiles: [], teams: [], employees: [] };
    const profiles = data ?? [];
    const teams = [...new Set(profiles.map((p) => p.team).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
    return { status: 'ok', reason: null, profiles, teams, employees: profiles.map((p) => ({ id: p.id, name: p.employee_name, team: p.team ?? '' })) };
  }, (v) => v.status === 'ok');
}

// ── One window of raw data (cached) ───────────────────────────
function _loadWindow(filters) {
  const { from, to, team = null, employeeId = null } = filters;
  const { role, isAdmin } = _viewer();
  const key = `win|${from}|${to}|${team ?? ''}|${employeeId ?? ''}|${role ?? ''}`;

  return _memo(key, async () => {
    const dir = await fetchDirectory();
    const scope = resolveScope(dir.profiles, { team, employeeId });
    const today = todayKey();
    const asOf = to < today ? to : today;
    const startIso = dayStartISO(from);
    const endIso = dayStartISO(addDays(to, 1));

    const guard = async (loader) => {
      try { return { data: await loader() }; } catch (e) { return { error: errText(e) }; }
    };
    const inScope = (t) => !scope.ids || scope.ids.has(ownerId(t));
    const visible = (rows) => visibleForReport(rows, isAdmin).filter(inScope);

    const [attendance, created, completed, open] = await Promise.all([
      guard(() => fetchAllRows(() => {
        let q = supabase.from('attendance').select('employee_name,date,type,hours,was_late')
          .gte('date', toSlash(from)).lte('date', toSlash(to))
          .order('date').order('employee_name').order('type');
        if (scope.names && scope.names.size && scope.names.size <= 300) q = q.in('employee_name', [...scope.names]);
        return q;
      })),
      guard(() => fetchAllRows(() => supabase.from('tasks').select(TASK_COLUMNS)
        .gte('created_at', startIso).lt('created_at', endIso).order('created_at').order('id'))),
      guard(() => fetchAllRows(() => supabase.from('tasks').select(TASK_COLUMNS)
        .gte('completed_at', startIso).lt('completed_at', endIso).order('completed_at').order('id'))),
      guard(() => fetchAllRows(() => supabase.from('tasks').select(TASK_COLUMNS)
        .lt('due_date', asOf).not('status', 'in', CLOSED_STATUSES).order('due_date').order('id'))),
    ]);

    const tasksError = created.error || completed.error || open.error;
    return {
      scope,
      asOf,
      directoryError: dir.status === 'error' ? dir.reason : null,
      attendance: attendance.error
        ? { error: attendance.error }
        : { data: scope.names ? attendance.data.filter((r) => scope.names.has(r.employee_name)) : attendance.data },
      tasks: tasksError
        ? { error: tasksError }
        : { created: visible(created.data), completed: visible(completed.data), openCandidates: visible(open.data) },
    };
  }, (w) => !w.attendance.error && !w.tasks.error);
}

// ── Queue (local device) ──────────────────────────────────────
async function _systemMetrics() {
  const base = {
    [KPI.AVG_RESPONSE_TIME_MS]: unavailable('لا يوجد قياس لزمن الاستجابة'),
    [KPI.STORAGE_USED_BYTES]: unavailable('لا يوجد قياس للتخزين'),
    [KPI.NOTIFICATION_ENGAGEMENT]: unavailable('لا يوجد تتبّع لتفاعل الإشعارات'),
    [KPI.FILES_UPLOADED]: unavailable('لا يوجد عدّاد للملفات المرفوعة'),
  };
  try {
    const { useQueueStore } = await import('@/core/queue/queueStore');
    const jobs = Object.values(useQueueStore.getState().jobs ?? {});
    const done = jobs.filter((j) => j.status === 'done').length;
    const bad = jobs.filter((j) => j.status === 'dead_letter' || j.status === 'failed').length;
    if (done + bad === 0) {
      const none = { value: null, status: 'empty', reason: 'لا عمليات مسجّلة في قائمة هذا الجهاز بعد' };
      return { ...base, [KPI.QUEUE_JOB_SUCCESS_RATE]: none, [KPI.SYSTEM_ERROR_COUNT]: none };
    }
    return {
      ...base,
      [KPI.QUEUE_JOB_SUCCESS_RATE]: { value: Math.round((done / (done + bad)) * 100), status: 'ok' },
      [KPI.SYSTEM_ERROR_COUNT]: { value: bad, status: 'ok' },
    };
  } catch (e) {
    return { ...base, [KPI.QUEUE_JOB_SUCCESS_RATE]: failed(errText(e)), [KPI.SYSTEM_ERROR_COUNT]: failed(errText(e)) };
  }
}

// ── Public: KPIs ──────────────────────────────────────────────
/** @param {{from:string,to:string,team?:string|null,employeeId?:string|null}} filters  local 'YYYY-MM-DD' */
export async function computeKPIs(filters) {
  const w = await _loadWindow(filters);
  const results = {};
  const sources = {};

  let perDay = [];
  if (w.attendance.error) {
    for (const k of ATTENDANCE_KPIS) results[k] = failed(w.attendance.error);
  } else {
    const agg = aggregateAttendance(w.attendance.data, w.directoryError ? null : w.scope.totalActive);
    Object.assign(results, agg.metrics);
    perDay = agg.perDay;
  }
  for (const k of ATTENDANCE_KPIS) sources[k] = SOURCE.ATTENDANCE;

  let overdueByOwner = {};
  let breakdown = [];
  if (w.tasks.error) {
    for (const k of TASK_KPIS) results[k] = failed(w.tasks.error);
  } else {
    const agg = aggregateTasks(w.tasks, TASK_HELPERS, w.asOf);
    Object.assign(results, agg.metrics);
    overdueByOwner = agg.overdueByOwner;
    if (!w.attendance.error) {
      breakdown = aggregateByEmployee({ employees: w.scope.employees, attendance: w.attendance.data, ...w.tasks }, TASK_HELPERS, w.asOf);
    }
  }
  for (const k of TASK_KPIS) sources[k] = SOURCE.TASKS;

  const system = await _systemMetrics();
  Object.assign(results, system);
  for (const k of Object.keys(system)) sources[k] = SOURCE.QUEUE;

  const values = {};
  const meta = {};
  for (const [k, r] of Object.entries(results)) {
    values[k] = r.value;
    meta[k] = { status: r.status, reason: r.reason ?? null, source: sources[k] ?? null };
  }
  return { values, meta, perDay, breakdown, overdueByOwner, scope: { totalActive: w.scope.totalActive } };
}

// ── Public: time series ───────────────────────────────────────
/**
 * Attendance-family and completed-tasks series come from the same live rows as the KPIs.
 * Other metrics come from daily snapshots when they exist (company-wide only).
 */
export async function computeTimeSeries(metric, filters) {
  const { from, to, team = null, employeeId = null } = filters;

  if (seriesFromPerDay([], metric) !== null) {
    const w = await _loadWindow(filters);
    if (w.attendance.error) return { points: [], status: 'error', reason: w.attendance.error, source: SOURCE.ATTENDANCE };
    const agg = aggregateAttendance(w.attendance.data, w.directoryError ? null : w.scope.totalActive);
    const points = seriesFromPerDay(agg.perDay, metric);
    return points.length
      ? { points, status: 'ok', reason: null, source: SOURCE.ATTENDANCE }
      : { points: [], status: 'empty', reason: 'لا توجد سجلات حضور في الفترة', source: SOURCE.ATTENDANCE };
  }

  if (metric === KPI.COMPLETED_TASKS) {
    const w = await _loadWindow(filters);
    if (w.tasks.error) return { points: [], status: 'error', reason: w.tasks.error, source: SOURCE.TASKS };
    const points = completedPerDay(w.tasks.completed, TASK_HELPERS, from, to);
    return points.some((p) => p.value > 0)
      ? { points, status: 'ok', reason: null, source: SOURCE.TASKS }
      : { points: [], status: 'empty', reason: 'لا مهام منجزة في الفترة', source: SOURCE.TASKS };
  }

  if (team || employeeId) {
    return { points: [], status: 'unavailable', reason: 'اللقطات اليومية للشركة كاملة ولا تدعم تصفية الفريق أو الموظف', source: SOURCE.SNAPSHOTS };
  }
  return _memo(`snap|${metric}|${from}|${to}`, async () => {
    try {
      const { data, error } = await supabase
        .from('analytics_snapshots')
        .select('period_start, metrics')
        .eq('snapshot_type', 'daily')
        .gte('period_start', dayStartISO(from))
        .lt('period_start', dayStartISO(addDays(to, 1)))
        .order('period_start', { ascending: true });
      if (error) throw error;
      const points = (data ?? [])
        .map((row) => ({ date: String(row.period_start).slice(0, 10), value: row.metrics?.[metric] ?? null }))
        .filter((p) => Number.isFinite(p.value));
      return points.length
        ? { points, status: 'ok', reason: null, source: SOURCE.SNAPSHOTS }
        : { points: [], status: 'empty', reason: 'لا توجد لقطات يومية محفوظة لهذا المؤشر ضمن الفترة', source: SOURCE.SNAPSHOTS };
    } catch (e) {
      return { points: [], status: 'error', reason: errText(e), source: SOURCE.SNAPSHOTS };
    }
  }, (v) => v.status !== 'error');
}

// ── Public: recent activity ───────────────────────────────────
export async function fetchRecentActivity() {
  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('id, action_label, entity_type, entity_label, user_name, created_at, severity')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    if (!data?.length) return { items: [], status: 'empty', reason: 'لا نشاط مسجّل', source: SOURCE.ACTIVITY };
    return {
      status: 'ok', reason: null, source: SOURCE.ACTIVITY,
      items: data.map((row) => ({
        id: row.id,
        type: row.entity_type ?? 'default',
        user: row.user_name ?? '',
        message: [row.action_label, row.entity_label].filter(Boolean).join(' — '),
        time: row.created_at,
        severity: row.severity ?? 'info',
      })),
    };
  } catch (e) {
    return { items: [], status: 'error', reason: errText(e), source: SOURCE.ACTIVITY };
  }
}
