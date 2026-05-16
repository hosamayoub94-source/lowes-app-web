// =============================================================
// offlineRecovery — Offline Action Queue + Replay Engine
//
// Handles:
//   • localStorage-backed pending action queue (survives refresh)
//   • Enqueue any action while offline
//   • Auto-replay queue when network returns
//   • Retry failed items with backoff
//   • Dead-letter slot for permanently failed actions
//   • Max queue size enforcement (evict oldest on overflow)
//   • Event bus integration for status broadcasting
//
// Usage:
//   import { enqueueOfflineAction } from '@/core/production/offlineRecovery';
//
//   // When offline, queue the action instead of failing
//   if (!navigator.onLine) {
//     enqueueOfflineAction('attendance:check_in', { userId, timestamp });
//     return;
//   }
//
//   // Register a handler so replay knows how to execute the action
//   registerActionHandler('attendance:check_in', async (payload) => {
//     await attendanceService.checkIn(payload.userId);
//   });
// =============================================================
import { getFlag }      from './productionConfig';
import { createLogger } from './productionLogger';
import { captureError } from './errorReporter';
import { emit }         from '@/core/events/eventBus';

const log = createLogger('OfflineRecovery');

// ── Storage key ────────────────────────────────────────────────
const QUEUE_KEY       = () => getFlag('offlineQueueKey');
const DEAD_LETTER_KEY = () => `${getFlag('offlineQueueKey')}:dead`;

// ── In-memory handler registry ────────────────────────────────
// actionType → async (payload) => void
const _handlers = new Map();

// ── Replay lock ───────────────────────────────────────────────
let _replaying = false;
let _initialized = false;

// ── Queue I/O ──────────────────────────────────────────────────
function _readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function _writeQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY(), JSON.stringify(queue));
  } catch (err) {
    log.warn('failed to persist offline queue', { error: err?.message });
  }
}

function _readDeadLetter() {
  try {
    const raw = localStorage.getItem(DEAD_LETTER_KEY());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function _writeDeadLetter(items) {
  try {
    localStorage.setItem(DEAD_LETTER_KEY(), JSON.stringify(items));
  } catch { /* ignore */ }
}

// ── Public: register action handlers ─────────────────────────
/**
 * Register a handler for replaying a specific action type.
 *
 * @param {string}   actionType — matches the type used in enqueueOfflineAction
 * @param {function(payload): Promise<void>} handler
 */
export function registerActionHandler(actionType, handler) {
  _handlers.set(actionType, handler);
  log.debug(`handler registered: "${actionType}"`);
}

// ── Public: enqueue ────────────────────────────────────────────
/**
 * Add an action to the offline queue.
 *
 * @param {string} actionType  — e.g. 'attendance:check_in'
 * @param {object} payload     — arbitrary data needed to replay
 * @param {object} [opts]
 * @param {number} [opts.maxRetries=3]
 * @param {string} [opts.label]       — human label for inspector
 */
export function enqueueOfflineAction(actionType, payload, opts = {}) {
  if (!getFlag('enableOfflineRecovery')) return;

  const { maxRetries = 3, label = actionType } = opts;

  const item = {
    id:          `oq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    actionType,
    payload,
    label,
    maxRetries,
    retryCount:  0,
    enqueuedAt:  Date.now(),
    lastAttempt: null,
  };

  const queue = _readQueue();

  // Enforce max size — evict oldest
  const maxSize = getFlag('offlineQueueMaxSize');
  if (queue.length >= maxSize) {
    const evicted = queue.shift();
    log.warn(`queue full — evicted oldest: "${evicted?.actionType}"`);
  }

  queue.push(item);
  _writeQueue(queue);

  log.info(`action queued: "${actionType}" (queue size: ${queue.length})`);
  emit('offline:action_queued', { actionType, queueSize: queue.length });
}

// ── Replay engine ──────────────────────────────────────────────
async function _replayQueue() {
  if (_replaying) return;
  if (!navigator.onLine) return;

  const queue = _readQueue();
  if (queue.length === 0) return;

  _replaying = true;
  log.info(`replaying ${queue.length} queued action(s)`);
  emit('offline:replay_started', { count: queue.length });

  const remaining  = [];
  const deadLetter = _readDeadLetter();

  for (const item of queue) {
    const handler = _handlers.get(item.actionType);

    if (!handler) {
      log.warn(`no handler for "${item.actionType}" — moving to dead-letter`);
      deadLetter.push({ ...item, failReason: 'no_handler', failedAt: Date.now() });
      continue;
    }

    try {
      item.lastAttempt = Date.now();
      await handler(item.payload);
      log.info(`✓ replayed: "${item.actionType}" (id: ${item.id})`);
      emit('offline:action_replayed', { id: item.id, actionType: item.actionType });
    } catch (err) {
      item.retryCount++;
      log.warn(`✗ replay failed: "${item.actionType}" (attempt ${item.retryCount}/${item.maxRetries})`, {
        error: err?.message,
      });

      if (item.retryCount >= item.maxRetries) {
        log.error(`dead-lettering: "${item.actionType}" (exhausted ${item.maxRetries} retries)`);
        deadLetter.push({ ...item, failReason: err?.message ?? 'unknown', failedAt: Date.now() });
        captureError(err, {
          context: `offlineRecovery:deadLetter:${item.actionType}`,
          extra:   { item },
        });
        emit('offline:action_dead_lettered', { id: item.id, actionType: item.actionType });
      } else {
        remaining.push(item); // retry next time
      }
    }
  }

  _writeQueue(remaining);
  _writeDeadLetter(deadLetter);
  _replaying = false;

  const succeeded = queue.length - remaining.length - (deadLetter.length - _readDeadLetter().length + deadLetter.length);
  log.info(`replay complete — remaining: ${remaining.length}, dead-letter: ${deadLetter.length}`);
  emit('offline:replay_complete', {
    remaining:  remaining.length,
    deadLetter: deadLetter.length,
  });
}

// ── Online / Offline listeners ─────────────────────────────────
function _onOnline() {
  log.info('network online — triggering queue replay');
  if (getFlag('offlineReplayOnReconnect')) {
    // Small delay to let app re-establish auth/realtime first
    setTimeout(_replayQueue, 1_500);
  }
}

function _onOffline() {
  log.warn('network offline — offline queue active');
  emit('offline:went_offline', {});
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Initialize offline recovery. Call once at app boot.
 */
export function initOfflineRecovery() {
  if (_initialized || !getFlag('enableOfflineRecovery')) return;
  _initialized = true;

  if (typeof window === 'undefined') return;

  window.addEventListener('online',  _onOnline);
  window.addEventListener('offline', _onOffline);

  // Replay any leftover queue from previous session
  if (navigator.onLine) {
    const queue = _readQueue();
    if (queue.length > 0) {
      log.info(`found ${queue.length} queued action(s) from previous session`);
      setTimeout(_replayQueue, 2_000); // after app fully boots
    }
  }

  log.info('OfflineRecovery initialized', {
    queueSize:      _readQueue().length,
    deadLetterSize: _readDeadLetter().length,
  });
}

/**
 * Tear down listeners. Call on app unmount.
 */
export function destroyOfflineRecovery() {
  if (typeof window !== 'undefined') {
    window.removeEventListener('online',  _onOnline);
    window.removeEventListener('offline', _onOffline);
  }
  _initialized = false;
}

/**
 * Manually trigger a queue replay attempt.
 */
export function replayNow() {
  return _replayQueue();
}

/** Queue status snapshot. */
export function getOfflineQueueStats() {
  const queue      = _readQueue();
  const deadLetter = _readDeadLetter();
  return {
    queueSize:      queue.length,
    deadLetterSize: deadLetter.length,
    isOnline:       typeof navigator !== 'undefined' ? navigator.onLine : true,
    replaying:      _replaying,
    queue:          queue.map(({ id, actionType, label, retryCount, enqueuedAt }) => ({
      id, actionType, label, retryCount, enqueuedAt,
    })),
  };
}

/** Clear the dead-letter queue (after manual review). */
export function clearDeadLetter() {
  _writeDeadLetter([]);
  log.warn('dead-letter queue cleared');
}

/** Clear the entire offline queue (emergency). */
export function clearOfflineQueue() {
  _writeQueue([]);
  log.warn('offline queue cleared');
}

// ── Dev window exposure ────────────────────────────────────────
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__offlineRecovery = {
    enqueueOfflineAction,
    replayNow,
    getOfflineQueueStats,
    clearDeadLetter,
    clearOfflineQueue,
    registerActionHandler,
  };
}
