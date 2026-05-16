// =============================================================
// workflowMetrics — Smart workflow timing + completion tracking
//
// Measures:
//   • Task completion speed (create → done)
//   • Attendance consistency (check-in timing patterns)
//   • CRM response speed (lead created → first action)
//   • Workflow completion rates
//   • Per-step breakdown inside multi-step flows
// =============================================================
import { createLogger } from '@/core/production/productionLogger';
import { on, emit }     from '@/core/events/eventBus';

const log = createLogger('WorkflowMetrics');

// ── Config ─────────────────────────────────────────────────────
const MAX_COMPLETED  = 500;
const MAX_ACTIVE     = 100;
const PERSIST_KEY    = '__lw_workflow_metrics';

// ── Active + completed workflow store ──────────────────────────
const _active    = new Map();     // workflowKey → { startedAt, steps, meta }
const _completed = [];            // completed workflow records
const _abandoned = [];            // abandoned/failed records

// ── Workflow lifecycle ─────────────────────────────────────────
/**
 * Start tracking a workflow.
 * @param {string} workflowType  e.g. 'task.create', 'attendance.check_in'
 * @param {string} instanceId    unique identifier (task ID, user ID, etc.)
 * @param {object} meta          optional context
 * @returns {string} workflowKey — pass to workflowStep() + completeWorkflow()
 */
export function startWorkflow(workflowType, instanceId, meta = {}) {
  const key = `${workflowType}:${instanceId}:${Date.now()}`;
  _active.set(key, {
    workflowType,
    instanceId,
    startedAt: Date.now(),
    steps:     [],
    meta,
  });

  if (_active.size > MAX_ACTIVE) {
    // Remove oldest
    const oldest = [..._active.keys()][0];
    _abandonWorkflow(oldest, 'evicted');
  }

  emit('ops:workflow_started', { workflowType, instanceId });
  return key;
}

export function workflowStep(key, stepName, data = {}) {
  const workflow = _active.get(key);
  if (!workflow) return;

  const prevStep = workflow.steps[workflow.steps.length - 1];
  const stepMs   = prevStep
    ? Date.now() - (workflow.startedAt + workflow.steps.reduce((s, st) => s + (st.durationMs ?? 0), 0))
    : Date.now() - workflow.startedAt;

  workflow.steps.push({ name: stepName, ts: Date.now(), durationMs: stepMs, data });
}

export function completeWorkflow(key, result = 'success') {
  const workflow = _active.get(key);
  if (!workflow) return null;

  const record = {
    ...workflow,
    completedAt:  Date.now(),
    totalMs:      Date.now() - workflow.startedAt,
    result,
    stepCount:    workflow.steps.length,
  };

  _completed.push(record);
  if (_completed.length > MAX_COMPLETED) _completed.shift();

  _active.delete(key);
  emit('ops:workflow_completed', { workflowType: record.workflowType, totalMs: record.totalMs, result });
  _flushMetrics();
  return record;
}

export function failWorkflow(key, reason = 'unknown', step = null) {
  const workflow = _active.get(key);
  if (!workflow) return;

  const record = {
    ...workflow,
    failedAt:  Date.now(),
    totalMs:   Date.now() - workflow.startedAt,
    reason,
    failStep:  step,
    result:    'fail',
  };

  _abandoned.push(record);
  _active.delete(key);
  emit('ops:workflow_failed', { workflowType: record.workflowType, reason, step });
}

function _abandonWorkflow(key, reason) {
  const workflow = _active.get(key);
  if (!workflow) return;
  _abandoned.push({ ...workflow, totalMs: Date.now() - workflow.startedAt, reason, result: 'abandoned' });
  _active.delete(key);
}

// ── Aggregated metrics ─────────────────────────────────────────
export function getWorkflowStats(workflowType = null) {
  const records = workflowType
    ? _completed.filter((r) => r.workflowType === workflowType)
    : _completed;

  if (records.length === 0) return null;

  const durations = records.map((r) => r.totalMs);
  const sorted    = [...durations].sort((a, b) => a - b);

  return {
    workflowType,
    count:      records.length,
    avgMs:      Math.round(durations.reduce((s, d) => s + d, 0) / durations.length),
    medianMs:   sorted[Math.floor(sorted.length / 2)],
    p90Ms:      sorted[Math.floor(sorted.length * 0.9)],
    minMs:      sorted[0],
    maxMs:      sorted[sorted.length - 1],
    successRate: Math.round(records.filter((r) => r.result === 'success').length / records.length * 100),
  };
}

export function getAllWorkflowTypes() {
  const types = new Set(_completed.map((r) => r.workflowType));
  return [...types].map((t) => getWorkflowStats(t)).filter(Boolean);
}

// ── Task completion speed ──────────────────────────────────────
export function getTaskCompletionMetrics() {
  const taskRecords = _completed.filter((r) => r.workflowType.startsWith('task.'));
  if (taskRecords.length === 0) return { count: 0 };

  const byType = {};
  for (const r of taskRecords) {
    byType[r.workflowType] = byType[r.workflowType] ?? [];
    byType[r.workflowType].push(r.totalMs);
  }

  return {
    count:   taskRecords.length,
    byType:  Object.entries(byType).map(([type, ms]) => ({
      type,
      avgMs: Math.round(ms.reduce((s, m) => s + m, 0) / ms.length),
      count: ms.length,
    })),
    overall: getWorkflowStats('task.create'),
  };
}

// ── Attendance consistency ─────────────────────────────────────
export function getAttendanceConsistency() {
  const records = _completed.filter((r) => r.workflowType === 'attendance.check_in');
  if (records.length < 2) return { consistent: null, count: records.length };

  // Check check-in timing consistency (within 30min of usual time)
  const times = records.map((r) => {
    const d = new Date(r.startedAt);
    return d.getHours() * 60 + d.getMinutes();
  });

  const avg = times.reduce((s, t) => s + t, 0) / times.length;
  const variance = times.reduce((s, t) => s + Math.abs(t - avg), 0) / times.length;

  return {
    count:        records.length,
    avgCheckInTime: `${Math.floor(avg / 60)}:${String(Math.round(avg % 60)).padStart(2, '0')}`,
    variance:     Math.round(variance),
    consistent:   variance < 30, // within 30 minutes
  };
}

// ── CRM response speed ─────────────────────────────────────────
export function getCRMResponseMetrics() {
  const records = _completed.filter((r) => r.workflowType.startsWith('crm.'));
  if (records.length === 0) return { count: 0 };

  return {
    count:    records.length,
    avgMs:    Math.round(records.reduce((s, r) => s + r.totalMs, 0) / records.length),
    byAction: Object.entries(
      records.reduce((acc, r) => {
        acc[r.workflowType] = acc[r.workflowType] ?? [];
        acc[r.workflowType].push(r.totalMs);
        return acc;
      }, {})
    ).map(([type, ms]) => ({
      type,
      avgMs: Math.round(ms.reduce((s, m) => s + m, 0) / ms.length),
      count: ms.length,
    })),
  };
}

// ── Failure analysis ───────────────────────────────────────────
export function getFailureAnalysis() {
  const byType = {};
  for (const r of _abandoned) {
    byType[r.workflowType] = byType[r.workflowType] ?? [];
    byType[r.workflowType].push(r);
  }

  return Object.entries(byType).map(([type, records]) => ({
    workflowType: type,
    count:        records.length,
    topReasons:   Object.entries(
      records.reduce((acc, r) => { acc[r.reason] = (acc[r.reason] ?? 0) + 1; return acc; }, {})
    ).sort(([, a], [, b]) => b - a).slice(0, 3),
    avgTimeBeforeFailMs: Math.round(records.reduce((s, r) => s + r.totalMs, 0) / records.length),
  }));
}

// ── Productivity patterns ──────────────────────────────────────
export function getProductivityPatterns() {
  // Group completions by hour of day
  const hourCounts = Array(24).fill(0);
  for (const r of _completed) {
    const hour = new Date(r.startedAt).getHours();
    hourCounts[hour]++;
  }

  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
  const quietHour = hourCounts.indexOf(Math.min(...hourCounts.filter((c) => c > 0)));

  // Group by day of week
  const dayCounts = Array(7).fill(0);
  const dayNames  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (const r of _completed) {
    dayCounts[new Date(r.startedAt).getDay()]++;
  }

  return {
    hourly:     hourCounts.map((count, hour) => ({ hour, count })),
    daily:      dayCounts.map((count, day) => ({ day: dayNames[day], count })),
    peakHour,
    quietHour,
    totalWorkflows: _completed.length,
  };
}

// ── Persistence ────────────────────────────────────────────────
function _flushMetrics() {
  try {
    const data = {
      completed: _completed.slice(-200),
      abandoned: _abandoned.slice(-50),
      savedAt:   Date.now(),
    };
    localStorage.setItem(PERSIST_KEY, JSON.stringify(data));
  } catch { /* quota */ }
}

export function loadPersistedMetrics() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    const cutoff = Date.now() - 7 * 86_400_000; // 7 days
    _completed.push(...(data.completed ?? []).filter((r) => r.startedAt > cutoff));
    _abandoned.push(...(data.abandoned ?? []).filter((r) => r.startedAt > cutoff));
  } catch { /* ignore */ }
}

// ── Hook into event bus (auto-track known workflows) ──────────
export function wireWorkflowMetricsToEventBus() {
  const activeFlows = new Map(); // eventKey → workflowKey

  // Auto-start on known start events
  const WORKFLOW_START_EVENTS = {
    'task.create_started':       'task.create',
    'task.update_started':       'task.update',
    'attendance.checkin_started': 'attendance.check_in',
    'crm.lead_create_started':   'crm.lead_create',
    'crm.lead_update_started':   'crm.lead_update',
  };

  const WORKFLOW_END_EVENTS = {
    'task.created':              'task.create',
    'task.updated':              'task.update',
    'attendance.checked_in':     'attendance.check_in',
    'crm.lead_created':          'crm.lead_create',
    'crm.lead_updated':          'crm.lead_update',
  };

  for (const [event, type] of Object.entries(WORKFLOW_START_EVENTS)) {
    on(event, (payload) => {
      const key = startWorkflow(type, payload?.id ?? Date.now(), payload);
      activeFlows.set(type, key);
    });
  }

  for (const [event, type] of Object.entries(WORKFLOW_END_EVENTS)) {
    on(event, (payload) => {
      const key = activeFlows.get(type);
      if (key) {
        completeWorkflow(key, 'success');
        activeFlows.delete(type);
      }
    });
  }

  log.info('Workflow metrics wired to event bus');
}

export { _completed as allCompletedWorkflows, _abandoned as allAbandonedWorkflows };
