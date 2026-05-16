// =============================================================
// healthEngine — System Health Monitor
//
// Tracks:
//   • Queue dead-letter accumulation
//   • Realtime connection uptime / downtime
//   • Event bus round-trip latency (synthetic ping)
//   • Memory usage (if available)
//   • Offline duration tracking
//
// Outputs:
//   • overall status: 'healthy' | 'degraded' | 'offline' | 'reconnecting'
//   • per-subsystem signals for the inspector
//   • emits SYSTEM_HEALTH_CHANGED on status changes
//
// Usage:
//   import { initHealthEngine, getHealthSnapshot } from '@/core/production/healthEngine';
//   initHealthEngine();
//   const { status, signals } = getHealthSnapshot();
// =============================================================
import { getFlag }                 from './productionConfig';
import { createLogger }            from './productionLogger';
import { captureError }            from './errorReporter';
import { getOfflineQueueStats }    from './offlineRecovery';
import { inspectRealtime }         from './realtimeRecovery';
import { emit, on }                from '@/core/events/eventBus';

const log = createLogger('HealthEngine');

// ── Internal state ─────────────────────────────────────────────
let _initialized    = false;
let _checkTimer     = null;
let _overallStatus  = 'healthy';
let _offlineStart   = null;
let _lastCheck      = null;

// ── Signal store ───────────────────────────────────────────────
// Each signal: { ok: bool, value: any, label: string, detail: string }
const _signals = {
  network:      { ok: true,  value: null, label: 'Network',      detail: 'Online' },
  realtime:     { ok: true,  value: null, label: 'Realtime',     detail: 'Connected' },
  offlineQueue: { ok: true,  value: 0,    label: 'Offline Queue', detail: 'Empty' },
  deadLetter:   { ok: true,  value: 0,    label: 'Dead Letter',   detail: 'Clean' },
  eventBus:     { ok: true,  value: null, label: 'Event Bus',    detail: 'Responsive' },
  memory:       { ok: true,  value: null, label: 'Memory',       detail: 'Normal' },
};

// ── Compute overall status from signals ────────────────────────
function _computeOverallStatus() {
  const isOffline      = !_signals.network.ok;
  const isReconnecting = _signals.realtime.value?.status === 'reconnecting';
  const isDegraded     =
    !_signals.deadLetter.ok  ||
    !_signals.offlineQueue.ok ||
    !_signals.eventBus.ok    ||
    !_signals.memory.ok;

  if (isOffline)      return 'offline';
  if (isReconnecting) return 'reconnecting';
  if (!_signals.realtime.ok) return 'degraded';
  if (isDegraded)     return 'degraded';
  return 'healthy';
}

// ── Individual checks ──────────────────────────────────────────
function _checkNetwork() {
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  _signals.network.ok     = online;
  _signals.network.value  = online;
  _signals.network.detail = online ? 'Online' : `Offline${_offlineStart ? ` (${Math.round((Date.now() - _offlineStart) / 1000)}s)` : ''}`;
}

function _checkRealtime() {
  try {
    const snap = inspectRealtime();
    const ok   = snap.status === 'connected';
    _signals.realtime.ok     = ok;
    _signals.realtime.value  = snap;
    _signals.realtime.detail = ok
      ? `${snap.channels.length} channel(s) healthy`
      : `${snap.status} (attempt #${snap.reconnectCount})`;
  } catch (err) {
    _signals.realtime.ok     = false;
    _signals.realtime.detail = 'Check failed';
  }
}

function _checkOfflineQueue() {
  try {
    const stats  = getOfflineQueueStats();
    const thresh = getFlag('healthDegradedThresholds').queueDeadLetter ?? 3;

    _signals.offlineQueue.ok     = stats.queueSize < thresh;
    _signals.offlineQueue.value  = stats.queueSize;
    _signals.offlineQueue.detail = stats.queueSize === 0
      ? 'Empty'
      : `${stats.queueSize} pending action(s)`;

    _signals.deadLetter.ok     = stats.deadLetterSize < thresh;
    _signals.deadLetter.value  = stats.deadLetterSize;
    _signals.deadLetter.detail = stats.deadLetterSize === 0
      ? 'Clean'
      : `${stats.deadLetterSize} failed action(s)`;
  } catch (err) {
    // offline recovery not initialized — ignore
  }
}

let _busLatencyMs = null;
function _checkEventBus() {
  try {
    const start = performance.now();
    const key = `__health_ping_${Date.now()}`;
    let replied = false;

    const unsub = on(key, () => {
      _busLatencyMs = performance.now() - start;
      replied = true;
    });

    emit(key, {});
    // Give it one microtask; if synchronous bus, it fires immediately
    Promise.resolve().then(() => {
      unsub?.();
      const thresh = getFlag('healthDegradedThresholds').eventBusLatency ?? 2_000;
      const latency = replied ? _busLatencyMs : null;
      _signals.eventBus.ok     = replied && (latency ?? 0) < thresh;
      _signals.eventBus.value  = latency;
      _signals.eventBus.detail = replied
        ? `${latency?.toFixed(1) ?? '?'}ms`
        : 'No response';
    });
  } catch (err) {
    _signals.eventBus.ok     = false;
    _signals.eventBus.detail = 'Error';
  }
}

function _checkMemory() {
  try {
    const mem = performance?.memory;
    if (!mem) {
      _signals.memory.ok     = true;
      _signals.memory.detail = 'N/A';
      return;
    }
    const usedMB  = Math.round(mem.usedJSHeapSize / 1_048_576);
    const limitMB = Math.round(mem.jsHeapSizeLimit / 1_048_576);
    const ratio   = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
    const ok      = ratio < 0.85; // warn at 85% heap usage

    _signals.memory.ok     = ok;
    _signals.memory.value  = { usedMB, limitMB, ratio: Math.round(ratio * 100) };
    _signals.memory.detail = `${usedMB}MB / ${limitMB}MB (${Math.round(ratio * 100)}%)`;
  } catch {
    _signals.memory.ok     = true;
    _signals.memory.detail = 'N/A';
  }
}

// ── Run full check ─────────────────────────────────────────────
function _runCheck() {
  _checkNetwork();
  _checkRealtime();
  _checkOfflineQueue();
  _checkEventBus();  // async but updates _signals on next tick
  _checkMemory();

  const newStatus = _computeOverallStatus();
  _lastCheck = Date.now();

  if (newStatus !== _overallStatus) {
    const prev = _overallStatus;
    _overallStatus = newStatus;
    log.info(`health status: ${prev} → ${newStatus}`);
    emit('system:health_changed', { status: newStatus, prev, signals: { ..._signals } });
  } else if (newStatus !== 'healthy') {
    log.warn(`health: ${newStatus}`, { signals: _summarizeSignals() });
  }
}

function _summarizeSignals() {
  return Object.fromEntries(
    Object.entries(_signals).map(([k, v]) => [k, v.detail])
  );
}

// ── Online/Offline tracking ────────────────────────────────────
function _onOnline()  { _offlineStart = null; }
function _onOffline() { _offlineStart = Date.now(); }

// ── Public API ─────────────────────────────────────────────────

/**
 * Initialize health engine. Call once at app boot.
 */
export function initHealthEngine() {
  if (_initialized || !getFlag('enableHealthMonitor')) return;
  _initialized = true;

  if (typeof window !== 'undefined') {
    window.addEventListener('online',  _onOnline);
    window.addEventListener('offline', _onOffline);
    if (!navigator.onLine) _offlineStart = Date.now();
  }

  // First check immediately
  _runCheck();

  const interval = getFlag('healthCheckIntervalMs');
  _checkTimer = setInterval(_runCheck, interval);
  log.info(`HealthEngine initialized (check every ${interval}ms)`);
}

/**
 * Stop health monitoring.
 */
export function destroyHealthEngine() {
  if (_checkTimer) clearInterval(_checkTimer);
  if (typeof window !== 'undefined') {
    window.removeEventListener('online',  _onOnline);
    window.removeEventListener('offline', _onOffline);
  }
  _initialized = false;
}

/**
 * Get a full health snapshot.
 * @returns {{ status, signals, lastCheck, offlineDurationMs }}
 */
export function getHealthSnapshot() {
  return {
    status:           _overallStatus,
    signals:          { ..._signals },
    lastCheck:        _lastCheck,
    offlineDurationMs: _offlineStart ? Date.now() - _offlineStart : null,
  };
}

/** Force an immediate check. */
export function checkNow() {
  _runCheck();
  return getHealthSnapshot();
}

// ── Dev window exposure ────────────────────────────────────────
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__healthEngine = { getHealthSnapshot, checkNow };
}
