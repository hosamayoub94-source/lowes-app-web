// =============================================================
// actionLock — Global Action Deduplication & Locking
//
// Prevents:
//   • Double check-in/check-out
//   • Duplicate order/task creation
//   • Double form submission
//   • Repeated notification sends
//   • Race-condition triggered duplicate events
//
// Usage:
//   import { acquireLock, withLock } from '@/core/production/actionLock';
//
//   // Option A — manual
//   if (!acquireLock('attendance:check_in')) return; // already running
//   try { await checkIn(userId); } finally { releaseLock('attendance:check_in'); }
//
//   // Option B — auto
//   await withLock('attendance:check_in', () => checkIn(userId));
// =============================================================
import { getFlag }      from './productionConfig';
import { createLogger } from './productionLogger';

const log = createLogger('ActionLock');

// ── Lock store ─────────────────────────────────────────────────
// { lockKey → { acquiredAt, expiresAt } }
const _locks = new Map();

// ── Cleanup stale locks ────────────────────────────────────────
function _evictStale() {
  const now   = Date.now();
  const limit = getFlag('actionLockMaxSize');

  for (const [key, { expiresAt }] of _locks) {
    if (now > expiresAt) {
      _locks.delete(key);
      log.debug(`lock evicted (TTL expired): ${key}`);
    }
  }

  // If still over limit, evict oldest
  if (_locks.size > limit) {
    const sorted = [..._locks.entries()].sort((a, b) => a[1].acquiredAt - b[1].acquiredAt);
    const toEvict = sorted.slice(0, _locks.size - limit);
    toEvict.forEach(([key]) => _locks.delete(key));
  }
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Try to acquire a lock for `key`.
 *
 * @param {string}  key        — unique action identifier
 * @param {number} [ttlMs]     — auto-release after N ms (default from config)
 * @returns {boolean}          — true if lock acquired, false if already locked
 */
export function acquireLock(key, ttlMs = null) {
  _evictStale();
  const ttl = ttlMs ?? getFlag('actionLockTtlMs');
  const now = Date.now();

  const existing = _locks.get(key);
  if (existing && now < existing.expiresAt) {
    log.debug(`lock blocked: "${key}" (locked ${now - existing.acquiredAt}ms ago)`);
    return false;
  }

  _locks.set(key, { acquiredAt: now, expiresAt: now + ttl });
  log.debug(`lock acquired: "${key}" (TTL: ${ttl}ms)`);
  return true;
}

/**
 * Manually release a lock before TTL expires.
 * @param {string} key
 */
export function releaseLock(key) {
  const had = _locks.has(key);
  _locks.delete(key);
  if (had) log.debug(`lock released: "${key}"`);
}

/**
 * Check if a lock is currently held.
 * @param {string} key
 * @returns {boolean}
 */
export function isLocked(key) {
  const entry = _locks.get(key);
  return Boolean(entry && Date.now() < entry.expiresAt);
}

/**
 * Execute fn exactly once at a time for a given key.
 * If already locked: skip + return null.
 *
 * @param {string}  key
 * @param {function(): Promise} fn
 * @param {object}  [opts]
 * @param {number}  [opts.ttlMs]
 * @param {boolean} [opts.wait]  — if true, waits and retries (not implemented; use queue instead)
 * @returns {Promise<any|null>}  — null if skipped
 */
export async function withLock(key, fn, opts = {}) {
  if (!getFlag('enableActionLocking')) return fn();

  if (!acquireLock(key, opts.ttlMs)) {
    log.warn(`withLock: action "${key}" skipped (already in progress)`);
    return null;
  }

  try {
    const result = await fn();
    return result;
  } catch (err) {
    log.error(`withLock: action "${key}" threw`, { error: err?.message });
    throw err;
  } finally {
    releaseLock(key);
  }
}

/**
 * Returns idempotent key based on action + entity.
 * Use this to build consistent lock keys.
 *
 * @example
 *   lockKey('attendance', 'check_in', userId)  → 'attendance:check_in:uid123'
 */
export function lockKey(...parts) {
  return parts.filter(Boolean).join(':');
}

/** Snapshot for inspector. */
export function inspectLocks() {
  const now = Date.now();
  return [..._locks.entries()].map(([key, { acquiredAt, expiresAt }]) => ({
    key,
    heldMs:     now - acquiredAt,
    expiresInMs: Math.max(0, expiresAt - now),
    expired:    now > expiresAt,
  }));
}

/** Clear all locks (testing / emergency). */
export function clearAllLocks() {
  _locks.clear();
  log.warn('All locks cleared');
}

// ── Pre-built lock keys for common operations ──────────────────
export const LOCK_KEYS = Object.freeze({
  ATTENDANCE_CHECK_IN:   'attendance:check_in',
  ATTENDANCE_CHECK_OUT:  'attendance:check_out',
  ATTENDANCE_BREAK:      'attendance:break',
  TASK_CREATE:           'tasks:create',
  TASK_STATUS_UPDATE:    'tasks:status_update',
  NOTIFICATION_SEND:     'notifications:send',
  ORDER_CREATE:          'orders:create',
  CRM_LEAD_CREATE:       'crm:lead_create',
  CRM_DEAL_MOVE:         'crm:deal_move',
  COMMENT_SUBMIT:        'collab:comment_submit',
  FILE_UPLOAD:           'files:upload',
});

// ── Expose on window in dev ───────────────────────────────────
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__actionLock = { acquireLock, releaseLock, isLocked, inspectLocks, clearAllLocks, LOCK_KEYS };
}
