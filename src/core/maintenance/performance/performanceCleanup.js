// =============================================================
// performanceCleanup — Stale listener + orphan subscription audit
//
// Detects and safely cleans:
//   • Stale event bus subscriptions
//   • Orphan realtime channels
//   • Duplicate requestAnimationFrame loops
//   • Memory-heavy intervals
//   • Unused listeners attached to DOM
//
// Call cleanup() to flush orphans.
// Call audit() for a read-only report.
// =============================================================
import { createLogger }        from '@/core/production/productionLogger';
import { emit, on }            from '@/core/events/eventBus';

const log = createLogger('PerfCleanup');

// ── Interval/Timeout tracker ───────────────────────────────────
// Monkey-patches setInterval/clearInterval to detect leaked timers
const _activeIntervals = new Map(); // id → { label, createdAt, stackHint }
const _activeTimeouts  = new Map();
let   _patchedTimers   = false;

export function patchTimerTracking() {
  // Gate behind DEV only: the tracked data is consumed solely by the getTimerStats
  // diagnostic and serves no production purpose. In production this is a no-op,
  // avoiding the unbounded _activeTimeouts growth (fired one-shot timeouts are never
  // cleared, so their Map entries would accumulate for the whole session — a leak).
  if (!import.meta.env.DEV) return;
  if (_patchedTimers || typeof window === 'undefined') return;
  _patchedTimers = true;

  const _origSetInterval   = window.setInterval;
  const _origClearInterval = window.clearInterval;
  const _origSetTimeout    = window.setTimeout;
  const _origClearTimeout  = window.clearTimeout;

  window.setInterval = (fn, ms, ...args) => {
    const id = _origSetInterval(fn, ms, ...args);
    _activeIntervals.set(id, { ms, createdAt: Date.now(), label: fn?.name ?? 'anonymous' });
    return id;
  };
  window.clearInterval = (id) => {
    _activeIntervals.delete(id);
    return _origClearInterval(id);
  };
  window.setTimeout = (fn, ms, ...args) => {
    const id = _origSetTimeout(fn, ms, ...args);
    _activeTimeouts.set(id, { ms, createdAt: Date.now(), label: fn?.name ?? 'anonymous' });
    return id;
  };
  window.clearTimeout = (id) => {
    _activeTimeouts.delete(id);
    return _origClearTimeout(id);
  };

  log.info('Timer tracking patched');
}

export function getTimerStats() {
  const now = Date.now();
  const longRunning = [..._activeIntervals.entries()]
    .filter(([, info]) => now - info.createdAt > 60_000)
    .map(([id, info]) => ({ id, ...info, ageMs: now - info.createdAt }));

  return {
    activeIntervals:  _activeIntervals.size,
    activeTimeouts:   _activeTimeouts.size,
    longRunningIntervals: longRunning,
  };
}

// ── Orphan listener detection ──────────────────────────────────
const _knownListeners = new Map(); // type → Set of handlers

export function trackWindowListener(type, handler) {
  if (!_knownListeners.has(type)) _knownListeners.set(type, new Set());
  _knownListeners.get(type).add(handler);
}

export function untrackWindowListener(type, handler) {
  _knownListeners.get(type)?.delete(handler);
}

export function getOrphanListenerStats() {
  const counts = {};
  for (const [type, handlers] of _knownListeners.entries()) {
    if (handlers.size > 0) counts[type] = handlers.size;
  }
  return { types: Object.keys(counts).length, counts };
}

// ── Stale subscription audit ───────────────────────────────────
/**
 * Emit a ping on the event bus and measure how many listeners
 * respond (and how quickly). Slow or non-responding listeners
 * are flagged as potentially stale.
 */
export async function auditEventBusHealth() {
  return new Promise((resolve) => {
    const PING_EVENT = '__maintenance:ping';
    const PONG_EVENT = '__maintenance:pong';
    const responses  = [];
    const start      = Date.now();
    let   unsub      = null;

    unsub = emit ? (() => {
      // Subscribe temporarily
      let _unsub = null;
      try {
        _unsub = on(PONG_EVENT, (payload) => {
          responses.push({ source: payload?.source, latencyMs: Date.now() - start });
        });
      } catch { /* event bus unavailable */ }
      return _unsub;
    })() : null;

    emit(PING_EVENT, { ts: start });

    setTimeout(() => {
      unsub?.();
      resolve({
        respondents:  responses.length,
        responses,
        avgLatencyMs: responses.length > 0
          ? Math.round(responses.reduce((s, r) => s + r.latencyMs, 0) / responses.length)
          : null,
      });
    }, 200);
  });
}

// ── Memory pressure detection ──────────────────────────────────
export function getMemoryStats() {
  if (typeof performance === 'undefined' || !performance.memory) {
    return { available: false };
  }
  const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = performance.memory;
  const usedMB   = Math.round(usedJSHeapSize  / 1_048_576);
  const totalMB  = Math.round(totalJSHeapSize / 1_048_576);
  const limitMB  = Math.round(jsHeapSizeLimit / 1_048_576);
  const pressure = usedMB / limitMB;

  return {
    available:  true,
    usedMB,
    totalMB,
    limitMB,
    pressureRatio: Math.round(pressure * 100) / 100,
    status: pressure > 0.8 ? 'critical' : pressure > 0.6 ? 'warning' : 'healthy',
  };
}

// ── Duplicate request detection ────────────────────────────────
const _requestLog = [];
const MAX_REQUEST_LOG = 200;

export function logRequest(url, method = 'GET') {
  const now = Date.now();
  _requestLog.push({ url, method, ts: now });
  if (_requestLog.length > MAX_REQUEST_LOG) _requestLog.shift();
}

export function getDuplicateRequests(windowMs = 2000) {
  const now     = Date.now();
  const recent  = _requestLog.filter((r) => now - r.ts < windowMs);
  const counts  = {};
  for (const r of recent) {
    const key = `${r.method}:${r.url}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ request: key, count }))
    .sort((a, b) => b.count - a.count);
}

// ── Stale localStorage cleanup ─────────────────────────────────
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const KEYS_WITH_TIMESTAMPS = ['__lw_session', '__lw_last_session', '__lw_metrics'];

export function findStaleStorageEntries() {
  const stale = [];
  const now   = Date.now();

  for (const key of KEYS_WITH_TIMESTAMPS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      const ts   = data?.updatedAt ?? data?.createdAt ?? data?.ts ?? data?.lastActivity;
      if (ts && now - ts > STALE_THRESHOLD_MS) {
        stale.push({ key, ageMs: now - ts, ageDays: Math.round((now - ts) / 86_400_000) });
      }
    } catch { /* ignore */ }
  }
  return stale;
}

// ── Full audit report ──────────────────────────────────────────
export async function runPerformanceCleanupAudit() {
  log.info('Running performance cleanup audit...');

  const timerStats    = getTimerStats();
  const memoryStats   = getMemoryStats();
  const orphanStats   = getOrphanListenerStats();
  const staleStorage  = findStaleStorageEntries();
  const duplicateReqs = getDuplicateRequests();

  const issues = [];

  if (timerStats.longRunningIntervals.length > 0) {
    issues.push({
      type:     'long_running_intervals',
      severity: 'warn',
      message:  `${timerStats.longRunningIntervals.length} interval(s) running for >1 minute`,
      detail:   timerStats.longRunningIntervals,
    });
  }

  if (memoryStats.status === 'critical') {
    issues.push({
      type:     'memory_pressure',
      severity: 'error',
      message:  `Memory usage at ${memoryStats.usedMB}MB/${memoryStats.limitMB}MB (${Math.round(memoryStats.pressureRatio * 100)}%)`,
    });
  } else if (memoryStats.status === 'warning') {
    issues.push({
      type:     'memory_elevated',
      severity: 'warn',
      message:  `Memory usage elevated: ${memoryStats.usedMB}MB/${memoryStats.limitMB}MB`,
    });
  }

  if (duplicateReqs.length > 0) {
    issues.push({
      type:     'duplicate_requests',
      severity: 'warn',
      message:  `${duplicateReqs.length} duplicate request(s) detected in 2s window`,
      detail:   duplicateReqs,
    });
  }

  if (staleStorage.length > 0) {
    issues.push({
      type:     'stale_storage',
      severity: 'info',
      message:  `${staleStorage.length} localStorage entry(ies) are older than 7 days`,
      detail:   staleStorage,
    });
  }

  log.info(`Performance audit complete — ${issues.length} issue(s) found`);

  return {
    issues,
    stats: { timerStats, memoryStats, orphanStats, staleStorage, duplicateReqs },
    healthy: issues.filter((i) => i.severity === 'error').length === 0,
    timestamp: Date.now(),
  };
}
