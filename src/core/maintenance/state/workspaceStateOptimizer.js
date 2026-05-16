// =============================================================
// workspaceStateOptimizer — Persisted state health + cleanup
//
// Handles:
//   • Detecting and repairing corrupted persisted state
//   • Cleaning up stale sessions (> 7 days old)
//   • Validating migration-safe persistence format
//   • Recovering valid state from backup when primary is broken
//   • Trimming oversized persisted arrays
// =============================================================
import { createLogger } from '@/core/production/productionLogger';

const log = createLogger('StateOptimizer');

// ── Constants ──────────────────────────────────────────────────
const SESSION_STALE_MS    = 7 * 24 * 60 * 60_000;  // 7 days
const MAX_ARRAY_SIZE      = 500;  // max items in any persisted array
const STORE_KEYS = {
  session:       '__lw_session',
  lastSession:   '__lw_last_session',
  personalization: '__lw_personalization',
  workspace:     'lw-workspace-store',
  collaboration: 'lw-collaboration-store',
  metrics:       '__lw_metrics',
  offlineQueue:  '__prod_offline_queue',
  feedbackQueue: '__lw_feedback_queue',
};

// ── State integrity validator ──────────────────────────────────
function _parseKey(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return { exists: false };
  try {
    return { exists: true, valid: true, data: JSON.parse(raw), raw };
  } catch {
    return { exists: true, valid: false, raw };
  }
}

export function validatePersistedState() {
  const results = {};

  for (const [name, key] of Object.entries(STORE_KEYS)) {
    const { exists, valid, data } = _parseKey(key);
    if (!exists) {
      results[name] = { status: 'missing', key };
      continue;
    }
    if (!valid) {
      results[name] = { status: 'corrupted', key };
      continue;
    }

    // Zustand stores should have { state: {}, version: N }
    const isZustandStore = key.startsWith('lw-');
    if (isZustandStore && !data?.state) {
      results[name] = { status: 'malformed', key, issue: 'Missing state property (Zustand format)' };
      continue;
    }

    results[name] = { status: 'ok', key };
  }

  return results;
}

// ── Corrupted state repair ─────────────────────────────────────
export function repairCorruptedState(dryRun = false) {
  const repairs = [];
  const validation = validatePersistedState();

  for (const [name, result] of Object.entries(validation)) {
    if (result.status === 'corrupted') {
      // Try to recover from backup
      const backup = _tryRestoreFromBackup(result.key);
      if (backup) {
        if (!dryRun) {
          try {
            localStorage.setItem(result.key, JSON.stringify(backup));
            repairs.push({ key: result.key, action: 'restored_from_backup' });
          } catch (err) {
            repairs.push({ key: result.key, action: 'restore_failed', reason: err.message });
          }
        } else {
          repairs.push({ key: result.key, action: 'would_restore_from_backup' });
        }
      } else {
        // No backup — remove corrupted key so app can start fresh
        if (!dryRun) {
          localStorage.removeItem(result.key);
          repairs.push({ key: result.key, action: 'removed_corrupted' });
        } else {
          repairs.push({ key: result.key, action: 'would_remove_corrupted' });
        }
      }
    }
  }

  log.info(`State repair ${dryRun ? '(dry-run)' : ''}: ${repairs.length} action(s)`);
  return { repairs, dryRun };
}

function _tryRestoreFromBackup(key) {
  try {
    const backup = JSON.parse(localStorage.getItem('__lw_backup') ?? 'null');
    if (!backup?.data?.[key]) return null;
    return JSON.parse(backup.data[key]);
  } catch { return null; }
}

// ── Stale session cleanup ──────────────────────────────────────
export function cleanupStaleSessions() {
  const now     = Date.now();
  const cleaned = [];

  for (const key of [STORE_KEYS.session, STORE_KEYS.lastSession]) {
    const { exists, valid, data } = _parseKey(key);
    if (!exists || !valid) continue;

    const ts = data?.lastActivity ?? data?.updatedAt ?? data?.createdAt;
    if (ts && now - ts > SESSION_STALE_MS) {
      localStorage.removeItem(key);
      cleaned.push({ key, ageHours: Math.round((now - ts) / 3_600_000) });
      log.info(`Stale session removed: ${key} (${Math.round((now - ts) / 86_400_000)} days old)`);
    }
  }

  return { cleaned, count: cleaned.length };
}

// ── Array trimming ─────────────────────────────────────────────
/**
 * Trim oversized arrays in persisted state.
 * Keeps the LAST N items (most recent first assumed).
 */
export function trimOversizedArrays() {
  const trimmed = [];

  const keysToCheck = [
    STORE_KEYS.offlineQueue,
    STORE_KEYS.feedbackQueue,
    STORE_KEYS.metrics,
  ];

  for (const key of keysToCheck) {
    const { exists, valid, data } = _parseKey(key);
    if (!exists || !valid) continue;

    // Handle both direct arrays and Zustand { state: { items: [] } } patterns
    const targets = [];
    if (Array.isArray(data)) targets.push({ ref: null, key });
    else _findArrays(data, key, [], targets);

    for (const target of targets) {
      if (target.size > MAX_ARRAY_SIZE) {
        // Would trim — we only report here (actual trim done via offline queue API)
        trimmed.push({
          key,
          path:    target.path,
          size:    target.size,
          wouldKeep: MAX_ARRAY_SIZE,
        });
      }
    }
  }

  if (trimmed.length > 0) {
    log.warn(`Array trimming advisory: ${trimmed.length} array(s) exceed ${MAX_ARRAY_SIZE} items`);
  }

  return { trimmed, count: trimmed.length };
}

function _findArrays(obj, key, path, results) {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v) && v.length > MAX_ARRAY_SIZE) {
      results.push({ key, path: [...path, k].join('.'), size: v.length });
    } else if (v && typeof v === 'object') {
      _findArrays(v, key, [...path, k], results);
    }
  }
}

// ── Migration-safe persistence validator ───────────────────────
export function validateMigrationSafePersistence() {
  const issues = [];

  // Check migration history integrity
  try {
    const ran = JSON.parse(localStorage.getItem('__lw_migrations_ran') ?? '[]');
    if (!Array.isArray(ran)) {
      issues.push({ key: '__lw_migrations_ran', issue: 'Migration history is not an array' });
    } else {
      // Check for duplicate IDs
      const ids   = ran.map((r) => r.id);
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      if (dupes.length > 0) {
        issues.push({ key: '__lw_migrations_ran', issue: `Duplicate migration IDs: ${dupes.join(', ')}` });
      }
    }
  } catch {
    issues.push({ key: '__lw_migrations_ran', issue: 'Migration history is corrupted' });
  }

  return { issues, healthy: issues.length === 0 };
}

// ── Full state optimization report ────────────────────────────
export function runWorkspaceStateAudit(opts = {}) {
  const { autoRepair = false } = opts;
  log.info('Running workspace state audit...');

  const validation    = validatePersistedState();
  const staleCleanup  = cleanupStaleSessions();
  const arrayAdvisory = trimOversizedArrays();
  const migrationCheck = validateMigrationSafePersistence();

  let repairs = null;
  if (autoRepair) {
    repairs = repairCorruptedState(false);
  }

  const issues = [
    ...Object.entries(validation)
      .filter(([, r]) => r.status !== 'ok' && r.status !== 'missing')
      .map(([name, r]) => ({ type: 'state_integrity', severity: 'error', name, ...r })),
    ...staleCleanup.cleaned.map((c) => ({ type: 'stale_session', severity: 'info', ...c })),
    ...arrayAdvisory.trimmed.map((t) => ({ type: 'oversized_array', severity: 'warn', ...t })),
    ...migrationCheck.issues.map((i) => ({ type: 'migration_integrity', severity: 'error', ...i })),
  ];

  log.info(`State audit: ${issues.length} issue(s)`);

  return {
    issues,
    details: { validation, staleCleanup, arrayAdvisory, migrationCheck, repairs },
    healthy: issues.filter((i) => i.severity === 'error').length === 0,
    timestamp: Date.now(),
  };
}
