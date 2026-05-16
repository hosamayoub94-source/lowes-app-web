// =============================================================
// debugToolkit — Event tracing, action replay, render tracking
//
// DEV-only instrumentation that attaches to the event bus and
// records a full timeline of what happened in the session.
// Zero cost in production — all functions are no-ops when !DEV.
// =============================================================
import { createLogger } from '@/core/production/productionLogger';
import { onAny, emit }  from '@/core/events/eventBus';

const log = createLogger('DebugToolkit');
const IS_DEV = import.meta.env.DEV;

// ── Event trace store ──────────────────────────────────────────
const MAX_TRACE_EVENTS = 500;
let _traceEnabled  = false;
let _traceEvents   = [];    // [{ type, payload, ts, id }]
let _traceUnsub    = null;

// ── Render counter ─────────────────────────────────────────────
const _renderCounts = new Map();  // component → count
let   _renderTracing = false;

// ── Action replay store ────────────────────────────────────────
const _actionHistory = [];
const MAX_ACTIONS    = 100;

// ── Event tracing ──────────────────────────────────────────────
export function startEventTrace() {
  if (!IS_DEV || _traceEnabled) return;
  _traceEnabled = true;
  _traceEvents  = [];

  _traceUnsub = onAny?.((type, payload) => {
    if (type.startsWith('__')) return; // skip internal pings
    _traceEvents.push({ id: _traceEvents.length, type, payload, ts: Date.now() });
    if (_traceEvents.length > MAX_TRACE_EVENTS) _traceEvents.shift();
  });

  log.info('Event trace started');
}

export function stopEventTrace() {
  if (!_traceEnabled) return;
  _traceUnsub?.();
  _traceEnabled = false;
  log.info(`Event trace stopped — ${_traceEvents.length} events captured`);
}

export function getTraceEvents(filter = null) {
  if (!filter) return [..._traceEvents];
  return _traceEvents.filter((e) => e.type.includes(filter));
}

export function clearTrace() {
  _traceEvents = [];
  log.debug('Trace cleared');
}

/** Replay all traced events in order. */
export function replayTrace(speedMultiplier = 1) {
  if (_traceEvents.length === 0) { log.warn('No events to replay'); return; }

  log.info(`Replaying ${_traceEvents.length} event(s) at ${speedMultiplier}x speed`);
  let offset = 0;

  for (let i = 0; i < _traceEvents.length; i++) {
    const ev   = _traceEvents[i];
    const delay = i === 0 ? 0 : Math.max(0, (_traceEvents[i].ts - _traceEvents[i - 1].ts) / speedMultiplier);
    offset += delay;
    setTimeout(() => {
      log.debug(`replaying: ${ev.type}`);
      emit(ev.type, ev.payload);
    }, offset);
  }
}

// ── Action history ─────────────────────────────────────────────
export function recordAction(type, payload = {}, result = null) {
  if (!IS_DEV) return;
  _actionHistory.unshift({ type, payload, result, ts: Date.now() });
  if (_actionHistory.length > MAX_ACTIONS) _actionHistory.pop();
}

export function getActionHistory(n = 20) {
  return _actionHistory.slice(0, n);
}

/** Re-emit the last N actions (useful for reproducing issues). */
export function replayLastActions(n = 5) {
  const toReplay = _actionHistory.slice(0, n).reverse();
  toReplay.forEach((action) => {
    log.info(`replaying action: ${action.type}`);
    emit(action.type, action.payload);
  });
}

// ── Render tracing ─────────────────────────────────────────────
export function trackRender(componentName) {
  if (!IS_DEV || !_renderTracing) return;
  _renderCounts.set(componentName, (_renderCounts.get(componentName) ?? 0) + 1);
}

export function startRenderTracing()  { _renderTracing = true;  _renderCounts.clear(); }
export function stopRenderTracing()   { _renderTracing = false; }
export function getRenderCounts()     {
  return [..._renderCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([component, count]) => ({ component, count }));
}

export function getHotspots(threshold = 10) {
  return getRenderCounts().filter((r) => r.count > threshold);
}

// ── Workflow replay helper ─────────────────────────────────────
/**
 * Record the start of a user workflow.
 * @param {string} name — e.g. 'attendance:check_in'
 * @returns {function} done — call when workflow completes
 */
export function traceWorkflow(name) {
  if (!IS_DEV) return () => {};
  const start = Date.now();
  log.debug(`workflow started: ${name}`);
  recordAction(`workflow:start`, { name });

  return (status = 'completed', meta = {}) => {
    const durationMs = Date.now() - start;
    log.debug(`workflow ${status}: ${name} (${durationMs}ms)`);
    recordAction(`workflow:${status}`, { name, durationMs, ...meta });
  };
}

// ── Performance marks ──────────────────────────────────────────
export function mark(label) {
  if (!IS_DEV) return;
  performance.mark(`debug:${label}`);
}

export function measure(label, from, to) {
  if (!IS_DEV) return null;
  try {
    performance.measure(label, `debug:${from}`, `debug:${to}`);
    const entries = performance.getEntriesByName(label, 'measure');
    return entries[entries.length - 1]?.duration ?? null;
  } catch { return null; }
}

// ── Session summary ────────────────────────────────────────────
export function getDebugSummary() {
  return {
    traceActive:    _traceEnabled,
    traceEvents:    _traceEvents.length,
    actionHistory:  _actionHistory.length,
    renderTracing:  _renderTracing,
    hotspots:       getHotspots(),
    recentActions:  getActionHistory(5),
    recentEvents:   getTraceEvents().slice(-10),
  };
}

// ── Expose on window in DEV ────────────────────────────────────
if (typeof window !== 'undefined' && IS_DEV) {
  window.__debugToolkit = {
    startEventTrace, stopEventTrace, getTraceEvents, clearTrace, replayTrace,
    recordAction, getActionHistory, replayLastActions,
    startRenderTracing, stopRenderTracing, getRenderCounts, getHotspots,
    traceWorkflow, getDebugSummary,
  };
}
