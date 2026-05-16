// =============================================================
// maintenanceToolkit — Dead code + orphan detector suite
//
// Finds:
//   • Dead code (events emitted but never listened to)
//   • Unused event types (registered but never fired)
//   • Stale queue items (old, never retried)
//   • Orphan notifications (delivered but UI never consumed)
//   • Unused localStorage keys
//
// All checks are non-destructive — read-only analysis.
// =============================================================
import { createLogger }         from '@/core/production/productionLogger';
import { getOfflineQueueStats } from '@/core/production/offlineRecovery';
import { getErrors }            from '@/core/production/errorReporter';

const log = createLogger('MaintenanceToolkit');

// ── Event bus orphan detection ─────────────────────────────────
// Tracks emitted events and subscribed events to find mismatches.
const _emittedEvents   = new Set();
const _subscribedEvents = new Set();

export function recordEmittedEvent(type)    { _emittedEvents.add(type); }
export function recordSubscribedEvent(type) { _subscribedEvents.add(type); }

/**
 * Events that are emitted but have NO subscribers.
 * These might be dead code or missing listener cleanup.
 */
export function findOrphanEmits() {
  return [..._emittedEvents].filter((e) => !_subscribedEvents.has(e));
}

/**
 * Events that are subscribed to but NEVER fired.
 * These are stale subscriptions that waste memory.
 */
export function findDeadSubscriptions() {
  return [..._subscribedEvents].filter((e) => !_emittedEvents.has(e));
}

// ── Unused localStorage key detector ──────────────────────────
// Known, active localStorage keys used by the app.
const ACTIVE_STORAGE_KEYS = new Set([
  '__lw_session',
  '__lw_last_session',
  '__rollout_onboarding',
  '__lw_personalization',
  '__lw_mobile_pref',
  '__lw_show_help',
  '__lw_metrics',
  '__prod_offline_queue',
  '__prod_offline_queue:dead',
  '__lw_feedback_queue',
  '__lw_backup',
  '__lw_migrations_ran',
  'lw-workspace-store',
  'lw-collaboration-store',
]);

export function findUnusedStorageKeys() {
  const unused = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    // Skip cache entries
    if (key.startsWith('__lw_cache:')) continue;
    if (!ACTIVE_STORAGE_KEYS.has(key)) {
      const raw  = localStorage.getItem(key);
      unused.push({ key, bytes: raw ? new TextEncoder().encode(raw).length : 0 });
    }
  }
  return unused.sort((a, b) => b.bytes - a.bytes);
}

// ── Stale queue item detector ──────────────────────────────────
const QUEUE_STALE_THRESHOLD_MS = 24 * 60 * 60_000; // 24 hours

export function findStaleQueueItems() {
  const stale = [];
  const now   = Date.now();

  try {
    const queueKey = '__prod_offline_queue';
    const raw = localStorage.getItem(queueKey);
    if (!raw) return stale;

    const queue = JSON.parse(raw);
    if (!Array.isArray(queue)) return stale;

    for (const item of queue) {
      const age = now - (item.enqueuedAt ?? item.createdAt ?? now);
      if (age > QUEUE_STALE_THRESHOLD_MS) {
        stale.push({
          id:       item.id ?? 'unknown',
          type:     item.type ?? item.action,
          ageHours: Math.round(age / 3_600_000),
          retries:  item.retries ?? 0,
        });
      }
    }
  } catch { /* ignore */ }

  return stale;
}

// ── Dead letter queue inspector ────────────────────────────────
export function inspectDeadLetterQueue() {
  try {
    const raw = localStorage.getItem('__prod_offline_queue:dead');
    if (!raw) return { items: [], count: 0 };
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return { items: [], count: 0 };
    return {
      count: items.length,
      items: items.map((item) => ({
        id:     item.id,
        type:   item.type ?? item.action,
        reason: item.failReason ?? item.lastError,
        ts:     item.lastAttempt ?? item.enqueuedAt,
      })),
    };
  } catch { return { items: [], count: 0 }; }
}

// ── Orphan notification detector ───────────────────────────────
export function findOrphanNotifications() {
  try {
    // Notifications older than 7 days that are still in the queue
    const now  = Date.now();
    const raw  = localStorage.getItem('__lw_feedback_queue');
    if (!raw) return [];

    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return [];

    return items
      .filter((n) => now - (n.ts ?? n.createdAt ?? now) > 7 * 86_400_000)
      .map((n) => ({ id: n.id, type: n.type, ageDays: Math.round((now - n.ts) / 86_400_000) }));
  } catch { return []; }
}

// ── Dead code finder ───────────────────────────────────────────
/**
 * Heuristic: checks for global helpers that were likely polyfilled
 * or added temporarily and never removed.
 */
export function findSuspectGlobals() {
  if (typeof window === 'undefined') return [];

  const SUSPECT_PATTERNS = [
    '__legacy_', '__old_', '__temp_', '__debug_', '__hack_',
    '_v1', '_v2', '_backup', '_unused', '_deprecated',
  ];

  return Object.keys(window).filter((key) =>
    SUSPECT_PATTERNS.some((pat) => key.toLowerCase().includes(pat))
  );
}

// ── Full maintenance report ────────────────────────────────────
export function runMaintenanceToolkitAudit() {
  log.info('Running maintenance toolkit audit...');

  const orphanEmits       = findOrphanEmits();
  const deadSubs          = findDeadSubscriptions();
  const unusedStorage     = findUnusedStorageKeys();
  const staleQueue        = findStaleQueueItems();
  const deadLetters       = inspectDeadLetterQueue();
  const orphanNotifs      = findOrphanNotifications();
  const suspectGlobals    = findSuspectGlobals();

  const findings = [];

  if (orphanEmits.length > 0) {
    findings.push({
      category: 'event_bus',
      severity: 'warn',
      message:  `${orphanEmits.length} event type(s) emitted with no subscribers`,
      detail:   orphanEmits.slice(0, 10),
    });
  }

  if (deadSubs.length > 0) {
    findings.push({
      category: 'event_bus',
      severity: 'info',
      message:  `${deadSubs.length} subscription(s) registered for events that are never fired`,
      detail:   deadSubs.slice(0, 10),
    });
  }

  if (unusedStorage.length > 0) {
    findings.push({
      category: 'storage',
      severity: 'info',
      message:  `${unusedStorage.length} unrecognized localStorage key(s)`,
      detail:   unusedStorage,
    });
  }

  if (staleQueue.length > 0) {
    findings.push({
      category: 'queue',
      severity: 'warn',
      message:  `${staleQueue.length} queue item(s) older than 24 hours`,
      detail:   staleQueue,
    });
  }

  if (deadLetters.count > 0) {
    findings.push({
      category: 'queue',
      severity: 'error',
      message:  `${deadLetters.count} item(s) in dead letter queue — require manual intervention`,
      detail:   deadLetters.items.slice(0, 5),
    });
  }

  if (orphanNotifs.length > 0) {
    findings.push({
      category: 'notifications',
      severity: 'info',
      message:  `${orphanNotifs.length} notification(s) older than 7 days still in queue`,
      detail:   orphanNotifs,
    });
  }

  if (suspectGlobals.length > 0) {
    findings.push({
      category: 'globals',
      severity: 'warn',
      message:  `${suspectGlobals.length} suspect global variable(s) on window`,
      detail:   suspectGlobals,
    });
  }

  log.info(`Maintenance audit: ${findings.length} finding(s)`);

  return {
    findings,
    counts: {
      orphanEmits: orphanEmits.length,
      deadSubs:    deadSubs.length,
      unusedStorage: unusedStorage.length,
      staleQueue:  staleQueue.length,
      deadLetters: deadLetters.count,
    },
    healthy: findings.filter((f) => f.severity === 'error').length === 0,
    timestamp: Date.now(),
  };
}

// ── Expose on window in DEV ────────────────────────────────────
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__maintenanceToolkit = {
    findOrphanEmits, findDeadSubscriptions, findUnusedStorageKeys,
    findStaleQueueItems, inspectDeadLetterQueue, findOrphanNotifications,
    findSuspectGlobals, runMaintenanceToolkitAudit,
  };
}
