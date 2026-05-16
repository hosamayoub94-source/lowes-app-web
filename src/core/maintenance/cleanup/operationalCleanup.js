// =============================================================
// operationalCleanup — Scheduled maintenance jobs
//
// Cleans up:
//   • Old notifications (> N days)
//   • Stale drafts (unsaved form state)
//   • Failed/expired queue items
//   • Orphan activity log entries
//   • Expired cache entries
//
// All operations are idempotent and safe to run at any time.
// Returns a summary of what was cleaned.
// =============================================================
import { createLogger } from '@/core/production/productionLogger';

const log = createLogger('OperationalCleanup');

// ── Cleanup thresholds ─────────────────────────────────────────
const CLEANUP_CONFIG = {
  notificationMaxAgeDays:  30,
  draftMaxAgeHours:        48,
  queueDeadItemMaxDays:    7,
  activityLogMaxEntries:   1000,
  activityLogMaxAgeDays:   90,
  cacheMaxAgeMs:           5 * 60_000, // matches cacheStrategy TTL
};

// ── Notification cleanup ───────────────────────────────────────
export function cleanupOldNotifications(maxAgeDays = CLEANUP_CONFIG.notificationMaxAgeDays) {
  const now       = Date.now();
  const threshold = maxAgeDays * 86_400_000;
  let   removed   = 0;

  // Feedback / notification queue
  const NOTIF_KEYS = ['__lw_feedback_queue'];

  for (const key of NOTIF_KEYS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const items   = JSON.parse(raw);
      if (!Array.isArray(items)) continue;
      const fresh   = items.filter((n) => now - (n.ts ?? n.createdAt ?? now) < threshold);
      const count   = items.length - fresh.length;
      if (count > 0) {
        localStorage.setItem(key, JSON.stringify(fresh));
        removed += count;
        log.info(`Cleaned ${count} old notification(s) from ${key}`);
      }
    } catch { /* ignore */ }
  }

  return { removed, key: 'notifications' };
}

// ── Stale draft cleanup ────────────────────────────────────────
/**
 * Clears form drafts saved in localStorage that exceed the
 * configured age. Drafts follow the pattern __lw_draft:*
 */
export function cleanupStaleDrafts(maxAgeHours = CLEANUP_CONFIG.draftMaxAgeHours) {
  const now       = Date.now();
  const threshold = maxAgeHours * 3_600_000;
  const removed   = [];

  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key?.startsWith('__lw_draft:')) continue;
    try {
      const { savedAt } = JSON.parse(localStorage.getItem(key) ?? '{}');
      if (savedAt && now - savedAt > threshold) {
        localStorage.removeItem(key);
        removed.push(key);
      }
    } catch {
      // Corrupted draft — remove it
      localStorage.removeItem(key);
      removed.push(key);
    }
  }

  if (removed.length > 0) log.info(`Cleaned ${removed.length} stale draft(s)`);
  return { removed, count: removed.length, key: 'drafts' };
}

// ── Failed queue cleanup ───────────────────────────────────────
export function cleanupFailedQueue(maxAgeDays = CLEANUP_CONFIG.queueDeadItemMaxDays) {
  const now       = Date.now();
  const threshold = maxAgeDays * 86_400_000;
  let   removed   = 0;

  // Dead letter queue
  const deadKey = '__prod_offline_queue:dead';
  const raw     = localStorage.getItem(deadKey);
  if (raw) {
    try {
      const items = JSON.parse(raw);
      if (Array.isArray(items)) {
        const fresh = items.filter((item) => {
          const ts = item.lastAttempt ?? item.enqueuedAt ?? now;
          return now - ts < threshold;
        });
        removed = items.length - fresh.length;
        if (removed > 0) {
          localStorage.setItem(deadKey, JSON.stringify(fresh));
          log.info(`Cleaned ${removed} expired dead-letter item(s)`);
        }
      }
    } catch { /* ignore */ }
  }

  return { removed, key: 'failed_queue' };
}

// ── Orphan activity cleanup ────────────────────────────────────
export function cleanupOrphanActivity() {
  const now       = Date.now();
  const threshold = CLEANUP_CONFIG.activityLogMaxAgeDays * 86_400_000;
  const ACTIVITY_KEYS = ['__lw_metrics', '__lw_activity_log'];
  const results   = [];

  for (const key of ACTIVITY_KEYS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        const fresh = data
          .filter((entry) => now - (entry.ts ?? entry.createdAt ?? now) < threshold)
          .slice(-CLEANUP_CONFIG.activityLogMaxEntries); // cap to max entries
        const removed = data.length - fresh.length;
        if (removed > 0) {
          localStorage.setItem(key, JSON.stringify(fresh));
          results.push({ key, removed });
          log.info(`Cleaned ${removed} orphan activity entries from ${key}`);
        }
      }
    } catch { /* ignore */ }
  }

  return { results, count: results.reduce((s, r) => s + r.removed, 0) };
}

// ── Cache cleanup ──────────────────────────────────────────────
export function cleanupExpiredCache() {
  const now     = Date.now();
  const removed = [];

  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key?.startsWith('__lw_cache:')) continue;
    try {
      const { fetchedAt, ttl } = JSON.parse(localStorage.getItem(key) ?? '{}');
      if (fetchedAt && ttl && now - fetchedAt > ttl * 2) {
        localStorage.removeItem(key);
        removed.push(key);
      }
    } catch {
      localStorage.removeItem(key);
      removed.push(key);
    }
  }

  if (removed.length > 0) log.debug(`Cleaned ${removed.length} expired cache entry(ies)`);
  return { removed, count: removed.length };
}

// ── Full cleanup job ───────────────────────────────────────────
export function runAllCleanupJobs(opts = {}) {
  const {
    notifications = true,
    drafts        = true,
    failedQueue   = true,
    activity      = true,
    cache         = true,
  } = opts;

  log.info('Running operational cleanup jobs...');

  const results = {};

  if (notifications) results.notifications = cleanupOldNotifications();
  if (drafts)        results.drafts        = cleanupStaleDrafts();
  if (failedQueue)   results.failedQueue   = cleanupFailedQueue();
  if (activity)      results.activity      = cleanupOrphanActivity();
  if (cache)         results.cache         = cleanupExpiredCache();

  const totalRemoved = Object.values(results).reduce((sum, r) => {
    return sum + (r.removed ?? r.count ?? 0);
  }, 0);

  log.info(`Operational cleanup complete — ${totalRemoved} item(s) removed across ${Object.keys(results).length} job(s)`);

  return {
    results,
    totalRemoved,
    timestamp: Date.now(),
  };
}

// ── Schedule daily cleanup (runs once per session) ─────────────
const LAST_CLEANUP_KEY = '__lw_last_cleanup';
const CLEANUP_INTERVAL_MS = 24 * 60 * 60_000; // 24 hours

export function scheduleMaintenanceCleanup() {
  const now       = Date.now();
  const lastClean = Number(localStorage.getItem(LAST_CLEANUP_KEY) ?? 0);

  if (now - lastClean < CLEANUP_INTERVAL_MS) {
    log.debug('Maintenance cleanup skipped — ran recently');
    return false;
  }

  // Run after a short delay to not block startup
  setTimeout(() => {
    runAllCleanupJobs();
    localStorage.setItem(LAST_CLEANUP_KEY, String(Date.now()));
  }, 10_000);

  return true;
}
