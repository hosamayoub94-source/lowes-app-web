// =============================================================
// operationalMetrics — Employee usage + workflow analytics
//
// Tracks (locally, no backend required):
//   • Action frequency: which actions are used most
//   • Workflow completion speed (start → done timestamps)
//   • Navigation patterns (section visit counts + duration)
//   • Friction points (errors, abandoned flows, retries)
//   • Session duration
//
// All data stays in localStorage. Privacy-first: no PII stored.
// =============================================================
import { createLogger } from '@/core/production/productionLogger';

const log       = createLogger('OperationalMetrics');
const STORE_KEY = '__lw_metrics';
const MAX_EVENTS = 500;

// ── Schema ─────────────────────────────────────────────────────
function _blank() {
  return {
    version:     1,
    sessionStart: Date.now(),
    actions:     {},    // { actionKey: { count, lastAt, totalMs } }
    navSections: {},    // { section: { visits, totalDurationMs } }
    workflows:   {},    // { workflowId: { start, end, status } }
    frictions:   [],    // [{ type, context, ts }]
    events:      [],    // ring buffer of raw events
  };
}

// ── Storage ─────────────────────────────────────────────────────
function _read() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') ?? _blank(); } catch { return _blank(); }
}
function _write(data) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* quota */ }
}

let _state = _read();

function _flush() { _write(_state); }

function _addEvent(type, payload) {
  _state.events.push({ type, payload, ts: Date.now() });
  if (_state.events.length > MAX_EVENTS) _state.events.shift();
}

// ── Action tracking ─────────────────────────────────────────────
export function trackAction(actionKey, durationMs = null) {
  const existing = _state.actions[actionKey] ?? { count: 0, lastAt: null, totalMs: 0 };
  _state.actions[actionKey] = {
    count:   existing.count + 1,
    lastAt:  Date.now(),
    totalMs: existing.totalMs + (durationMs ?? 0),
  };
  _addEvent('action', { actionKey, durationMs });
  _flush();
}

export function getTopActions(n = 10) {
  return Object.entries(_state.actions)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, n)
    .map(([key, data]) => ({ key, ...data }));
}

// ── Navigation tracking ────────────────────────────────────────
let _currentSection = null;
let _sectionStart   = null;

export function trackSectionEnter(section) {
  // Save duration for previous section
  if (_currentSection && _sectionStart) {
    const duration = Date.now() - _sectionStart;
    const existing = _state.navSections[_currentSection] ?? { visits: 0, totalDurationMs: 0 };
    _state.navSections[_currentSection] = {
      visits:          existing.visits,
      totalDurationMs: existing.totalDurationMs + duration,
    };
  }
  _currentSection = section;
  _sectionStart   = Date.now();

  const existing = _state.navSections[section] ?? { visits: 0, totalDurationMs: 0 };
  _state.navSections[section] = { ...existing, visits: existing.visits + 1 };

  _addEvent('section_enter', { section });
  _flush();
}

export function getNavStats() {
  return Object.entries(_state.navSections)
    .sort((a, b) => b[1].visits - a[1].visits)
    .map(([section, data]) => ({
      section,
      visits:         data.visits,
      avgDurationSec: data.visits > 0 ? Math.round(data.totalDurationMs / data.visits / 1000) : 0,
    }));
}

// ── Workflow tracking ──────────────────────────────────────────
export function startWorkflow(workflowId, meta = {}) {
  _state.workflows[workflowId] = { start: Date.now(), end: null, status: 'running', meta };
  _addEvent('workflow_start', { workflowId });
  _flush();
}

export function completeWorkflow(workflowId, status = 'completed') {
  const wf = _state.workflows[workflowId];
  if (wf) {
    wf.end    = Date.now();
    wf.status = status;
    wf.durationMs = wf.end - wf.start;
    _addEvent('workflow_end', { workflowId, status, durationMs: wf.durationMs });
    _flush();
  }
}

export function getWorkflowStats() {
  const wfs = Object.values(_state.workflows);
  const completed = wfs.filter((w) => w.status === 'completed');
  const avgMs = completed.length > 0
    ? completed.reduce((s, w) => s + (w.durationMs ?? 0), 0) / completed.length
    : 0;
  return {
    total:        wfs.length,
    completed:    completed.length,
    abandoned:    wfs.filter((w) => w.status === 'abandoned').length,
    avgDurationMs: Math.round(avgMs),
  };
}

// ── Friction tracking ──────────────────────────────────────────
export function trackFriction(type, context = '') {
  _state.frictions.push({ type, context, ts: Date.now() });
  if (_state.frictions.length > 100) _state.frictions.shift();
  _addEvent('friction', { type, context });
  _flush();
  log.debug(`friction: ${type} @ ${context}`);
}

export function getFrictionStats() {
  const counts = {};
  _state.frictions.forEach(({ type }) => { counts[type] = (counts[type] ?? 0) + 1; });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }));
}

// ── Full snapshot ──────────────────────────────────────────────
export function getMetricsSnapshot() {
  return {
    topActions:    getTopActions(5),
    navStats:      getNavStats(),
    workflowStats: getWorkflowStats(),
    frictions:     getFrictionStats(),
    sessionDurationMs: Date.now() - (_state.sessionStart ?? Date.now()),
    eventCount:    _state.events.length,
  };
}

/** Reset all metrics (for testing or privacy reset). */
export function clearMetrics() {
  _state = _blank();
  _flush();
  log.warn('Metrics cleared');
}
