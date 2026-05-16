// =============================================================
// backupRestore — Workspace backup + emergency restore helpers
//
// Backs up: localStorage, session state, onboarding state,
// personalization, offline queue, workspace preferences.
// Restore: re-populates from backup file or clipboard.
// =============================================================
import { createLogger } from '@/core/production/productionLogger';

const log       = createLogger('BackupRestore');
const BACKUP_KEY = '__lw_backup';

// ── Keys to include in backup ──────────────────────────────────
const BACKUP_KEYS = [
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
  'lw-workspace-store',
  'lw-collaboration-store',
];

// ── Backup ─────────────────────────────────────────────────────
export function createBackup(label = '') {
  const snapshot = {
    label,
    createdAt:   Date.now(),
    version:     1,
    appVersion:  import.meta.env.VITE_APP_VERSION ?? 'unknown',
    data:        {},
  };

  for (const key of BACKUP_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) snapshot.data[key] = value;
  }

  log.info(`Backup created: "${label}" (${Object.keys(snapshot.data).length} keys)`);
  return snapshot;
}

/** Save backup to localStorage (latest only). */
export function saveBackup(label = '') {
  const backup = createBackup(label);
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
    log.info('Backup saved to localStorage');
  } catch (err) {
    log.warn('Backup save failed (quota?)', { error: err.message });
  }
  return backup;
}

/** Export backup as downloadable JSON file. */
export function downloadBackup(label = 'backup') {
  const backup = createBackup(label);
  const json   = JSON.stringify(backup, null, 2);
  const blob   = new Blob([json], { type: 'application/json' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = `lw_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  log.info('Backup downloaded');
}

/** Copy backup JSON to clipboard. */
export async function copyBackupToClipboard() {
  const backup = createBackup('clipboard');
  await navigator.clipboard.writeText(JSON.stringify(backup));
  log.info('Backup copied to clipboard');
}

// ── Restore ────────────────────────────────────────────────────
export function restoreFromBackup(backup, { dryRun = false } = {}) {
  if (!backup?.data) {
    log.error('Invalid backup: missing data');
    return { success: false, message: 'Invalid backup format' };
  }

  const restored = [];
  const skipped  = [];

  for (const [key, value] of Object.entries(backup.data)) {
    if (!BACKUP_KEYS.includes(key)) {
      skipped.push(key);
      continue;
    }
    if (!dryRun) {
      try {
        localStorage.setItem(key, value);
        restored.push(key);
      } catch (err) {
        skipped.push(`${key} (${err.message})`);
      }
    } else {
      restored.push(key);
    }
  }

  log.info(`Restore ${dryRun ? '(dry-run)' : ''}: ${restored.length} keys restored, ${skipped.length} skipped`);

  if (!dryRun) {
    log.warn('Reload required to apply restored state');
  }

  return { success: true, restored, skipped, requiresReload: !dryRun };
}

/** Load backup from localStorage. */
export function loadSavedBackup() {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Restore from localStorage backup. */
export function restoreSavedBackup(opts = {}) {
  const backup = loadSavedBackup();
  if (!backup) return { success: false, message: 'No saved backup found' };
  return restoreFromBackup(backup, opts);
}

/** Emergency reset: clear all app localStorage keys. */
export function emergencyReset(confirm = false) {
  if (!confirm) {
    log.warn('emergencyReset called without confirm=true — aborted');
    return { success: false, message: 'Pass confirm=true to proceed' };
  }
  const removed = [];
  for (const key of BACKUP_KEYS) {
    if (localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
      removed.push(key);
    }
  }
  log.warn(`Emergency reset: removed ${removed.length} keys`);
  return { success: true, removed };
}

// ── Queue recovery ─────────────────────────────────────────────
/** Recover failed offline queue items from backup. */
export function recoverQueueFromBackup(backup) {
  if (!backup?.data) return { success: false };
  const queueKey = '__prod_offline_queue';
  const raw = backup.data[queueKey];
  if (!raw) return { success: false, message: 'No queue data in backup' };

  try {
    const queue = JSON.parse(raw);
    localStorage.setItem(queueKey, raw);
    log.info(`Queue recovered: ${queue.length} item(s) from backup`);
    return { success: true, count: queue.length };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ── Expose on window in DEV ────────────────────────────────────
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__backupRestore = { createBackup, saveBackup, downloadBackup, copyBackupToClipboard, restoreFromBackup, loadSavedBackup, restoreSavedBackup, emergencyReset, recoverQueueFromBackup };
}
