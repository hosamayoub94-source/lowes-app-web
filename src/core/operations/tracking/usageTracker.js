// =============================================================
// usageTracker — Live employee usage monitoring
//
// Tracks without any external service:
//   • Page visits + dwell time
//   • Action frequencies (button clicks, form submits)
//   • Error occurrences per context
//   • Slow workflow detection (> threshold ms)
//   • Session activity windows
//
// All data stays in-memory + localStorage.
// Zero PII — only action types and timing, no content.
// =============================================================
import { createLogger } from '@/core/production/productionLogger';
import { emit }         from '@/core/events/eventBus';

const log = createLogger('UsageTracker');

// ── Config ─────────────────────────────────────────────────────
const MAX_PAGE_EVENTS    = 500;
const MAX_ACTION_EVENTS  = 1000;
const MAX_ERROR_EVENTS   = 200;
const SLOW_THRESHOLD_MS  = 2000;
const PERSIST_KEY        = '__lw_usage_data';
const SESSION_KEY        = '__lw_usage_session';
const FLUSH_INTERVAL_MS  = 60_000; // flush to localStorage every 60s

// ── In-memory stores ───────────────────────────────────────────
const _pageLog    = [];   // { page, enteredAt, leftAt, dwellMs, userId }
const _actionLog  = [];   // { action, context, ts, userId, durationMs }
const _errorLog   = [];   // { type, context, message, ts, userId }
const _slowLog    = [];   // { workflow, durationMs, ts, userId }

let _currentPage  = null;
let _pageEnterTs  = null;
let _sessionId    = null;
let _userId       = null;

// ── Session init ───────────────────────────────────────────────
export function initUsageTracker(userId = 'anonymous') {
  _userId    = userId;
  _sessionId = _getOrCreateSessionId();
  _loadPersistedData();

  // Flush periodically
  setInterval(_flushToStorage, FLUSH_INTERVAL_MS);

  // Flush on page unload
  window.addEventListener('beforeunload', _flushToStorage);

  log.info(`Usage tracker initialized — session: ${_sessionId}`);
}

function _getOrCreateSessionId() {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (stored) return stored;
  const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  sessionStorage.setItem(SESSION_KEY, id);
  return id;
}

// ── Page tracking ──────────────────────────────────────────────
export function trackPageEnter(page) {
  // Close previous page
  if (_currentPage && _pageEnterTs) {
    trackPageLeave();
  }
  _currentPage  = page;
  _pageEnterTs  = Date.now();

  emit('ops:page_entered', { page, userId: _userId, sessionId: _sessionId });
}

export function trackPageLeave() {
  if (!_currentPage || !_pageEnterTs) return;

  const dwellMs = Date.now() - _pageEnterTs;
  const entry   = {
    page:      _currentPage,
    enteredAt: _pageEnterTs,
    leftAt:    Date.now(),
    dwellMs,
    userId:    _userId,
    sessionId: _sessionId,
  };

  _pageLog.push(entry);
  if (_pageLog.length > MAX_PAGE_EVENTS) _pageLog.shift();

  emit('ops:page_left', { page: _currentPage, dwellMs, userId: _userId });

  _currentPage = null;
  _pageEnterTs = null;
}

// ── Action tracking ────────────────────────────────────────────
export function trackAction(action, context = {}, durationMs = null) {
  const entry = {
    action,
    context: typeof context === 'string' ? { screen: context } : context,
    ts:        Date.now(),
    durationMs,
    userId:    _userId,
    sessionId: _sessionId,
  };

  _actionLog.push(entry);
  if (_actionLog.length > MAX_ACTION_EVENTS) _actionLog.shift();

  if (durationMs && durationMs > SLOW_THRESHOLD_MS) {
    trackSlowWorkflow(action, durationMs, context);
  }

  emit('ops:action', { action, durationMs, userId: _userId });
}

/**
 * Returns a done() function that auto-calculates duration.
 * Usage:
 *   const done = startActionTimer('task.create', { screen: 'tasks' });
 *   await doWork();
 *   done(); // records with duration
 */
export function startActionTimer(action, context = {}) {
  const start = Date.now();
  return (result = 'success') => {
    const durationMs = Date.now() - start;
    trackAction(action, { ...context, result }, durationMs);
    return durationMs;
  };
}

// ── Error tracking ─────────────────────────────────────────────
export function trackError(type, message, context = {}) {
  const entry = {
    type,
    message,
    context: typeof context === 'string' ? { screen: context } : context,
    ts:      Date.now(),
    userId:  _userId,
    sessionId: _sessionId,
    page:    _currentPage,
  };

  _errorLog.push(entry);
  if (_errorLog.length > MAX_ERROR_EVENTS) _errorLog.shift();

  emit('ops:error_tracked', { type, message, userId: _userId });
  log.warn(`[UsageTracker] Error tracked: ${type} — ${message}`);
}

// ── Slow workflow tracking ─────────────────────────────────────
export function trackSlowWorkflow(workflow, durationMs, context = {}) {
  const entry = {
    workflow,
    durationMs,
    context,
    ts:       Date.now(),
    userId:   _userId,
    sessionId: _sessionId,
    page:     _currentPage,
  };

  _slowLog.push(entry);
  emit('ops:slow_workflow', { workflow, durationMs, userId: _userId });
  log.warn(`[UsageTracker] Slow workflow: ${workflow} took ${durationMs}ms`);
}

// ── Aggregated analytics ───────────────────────────────────────
export function getPageStats() {
  const counts = {};
  const dwells  = {};

  for (const e of _pageLog) {
    counts[e.page] = (counts[e.page] ?? 0) + 1;
    dwells[e.page] = dwells[e.page] ?? [];
    dwells[e.page].push(e.dwellMs);
  }

  return Object.entries(counts)
    .map(([page, visits]) => ({
      page,
      visits,
      avgDwellMs: Math.round(dwells[page].reduce((s, d) => s + d, 0) / dwells[page].length),
      totalDwellMs: dwells[page].reduce((s, d) => s + d, 0),
    }))
    .sort((a, b) => b.visits - a.visits);
}

export function getActionStats() {
  const counts    = {};
  const durations = {};

  for (const e of _actionLog) {
    counts[e.action] = (counts[e.action] ?? 0) + 1;
    if (e.durationMs) {
      durations[e.action] = durations[e.action] ?? [];
      durations[e.action].push(e.durationMs);
    }
  }

  return Object.entries(counts)
    .map(([action, count]) => ({
      action,
      count,
      avgDurationMs: durations[action]
        ? Math.round(durations[action].reduce((s, d) => s + d, 0) / durations[action].length)
        : null,
    }))
    .sort((a, b) => b.count - a.count);
}

export function getErrorStats() {
  const counts = {};
  for (const e of _errorLog) {
    const key = `${e.type}:${e.page ?? 'unknown'}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count, ...(_errorLog.find((e) => `${e.type}:${e.page ?? 'unknown'}` === key) ?? {}) }))
    .sort((a, b) => b.count - a.count);
}

export function getSlowWorkflows() {
  const counts    = {};
  const durations = {};
  for (const e of _slowLog) {
    counts[e.workflow] = (counts[e.workflow] ?? 0) + 1;
    durations[e.workflow] = durations[e.workflow] ?? [];
    durations[e.workflow].push(e.durationMs);
  }
  return Object.entries(counts)
    .map(([workflow, count]) => ({
      workflow,
      count,
      avgDurationMs: Math.round(durations[workflow].reduce((s, d) => s + d, 0) / durations[workflow].length),
      maxDurationMs: Math.max(...durations[workflow]),
    }))
    .sort((a, b) => b.avgDurationMs - a.avgDurationMs);
}

export function getTopActions(n = 10)      { return getActionStats().slice(0, n); }
export function getTopPages(n = 10)        { return getPageStats().slice(0, n); }
export function getTopErrors(n = 10)       { return getErrorStats().slice(0, n); }
export function getRecentActions(n = 20)   { return _actionLog.slice(-n).reverse(); }
export function getRecentErrors(n = 10)    { return _errorLog.slice(-n).reverse(); }

// ── Session summary ────────────────────────────────────────────
export function getSessionSummary() {
  const sessionEntries = _actionLog.filter((e) => e.sessionId === _sessionId);
  const sessionErrors  = _errorLog.filter((e)  => e.sessionId === _sessionId);
  const sessionPages   = _pageLog.filter((e)   => e.sessionId === _sessionId);
  const sessionSlows   = _slowLog.filter((e)   => e.sessionId === _sessionId);

  return {
    sessionId:      _sessionId,
    userId:         _userId,
    currentPage:    _currentPage,
    actions:        sessionEntries.length,
    errors:         sessionErrors.length,
    pagesVisited:   [...new Set(sessionPages.map((e) => e.page))].length,
    slowWorkflows:  sessionSlows.length,
    startedAt:      sessionEntries[0]?.ts ?? null,
  };
}

// ── Persistence ────────────────────────────────────────────────
function _flushToStorage() {
  try {
    const data = {
      pages:    _pageLog.slice(-100),
      actions:  _actionLog.slice(-200),
      errors:   _errorLog.slice(-50),
      slows:    _slowLog.slice(-50),
      savedAt:  Date.now(),
    };
    localStorage.setItem(PERSIST_KEY, JSON.stringify(data));
  } catch { /* quota */ }
}

function _loadPersistedData() {
  try {
    const raw  = localStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    // Only load entries from the last 24h
    const cutoff = Date.now() - 86_400_000;
    _pageLog.push(  ...(data.pages   ?? []).filter((e) => e.enteredAt > cutoff));
    _actionLog.push(...(data.actions ?? []).filter((e) => e.ts        > cutoff));
    _errorLog.push( ...(data.errors  ?? []).filter((e) => e.ts        > cutoff));
    _slowLog.push(  ...(data.slows   ?? []).filter((e) => e.ts        > cutoff));
  } catch { /* ignore */ }
}

export function clearUsageData() {
  _pageLog.length   = 0;
  _actionLog.length = 0;
  _errorLog.length  = 0;
  _slowLog.length   = 0;
  localStorage.removeItem(PERSIST_KEY);
  log.warn('Usage data cleared');
}

// ── Expose on window in DEV ────────────────────────────────────
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__usageTracker = {
    getPageStats, getActionStats, getErrorStats, getSlowWorkflows,
    getSessionSummary, getTopActions, getTopPages, getTopErrors,
    clearUsageData,
  };
}
