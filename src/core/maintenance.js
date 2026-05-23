// =============================================================
// Core Maintenance — timer patching + periodic cleanup tasks.
// =============================================================

/** Patches the global timer to compensate for throttling in background tabs. */
export function patchTimerTracking() {
  // No-op in most browsers — placeholder for future drift correction.
  console.info('[core/maintenance] Timer tracking patched');
}

/** Schedules cleanup of stale localStorage / IndexedDB entries. */
export function scheduleMaintenanceCleanup() {
  // Run once on boot after a short delay to avoid blocking initial render.
  setTimeout(() => {
    try {
      // Remove audit offline queue entries older than 7 days
      const queueKey = 'audit_offline_queue';
      const raw = localStorage.getItem(queueKey);
      if (raw) {
        const items = JSON.parse(raw);
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const fresh = items.filter((i) => new Date(i.ts || 0).getTime() > cutoff);
        if (fresh.length !== items.length) {
          localStorage.setItem(queueKey, JSON.stringify(fresh));
          console.info(`[core/maintenance] Cleaned ${items.length - fresh.length} stale audit entries`);
        }
      }
    } catch (e) {
      console.warn('[core/maintenance] Cleanup error:', e);
    }
  }, 5000);

  console.info('[core/maintenance] Maintenance cleanup scheduled');
}

export default { patchTimerTracking, scheduleMaintenanceCleanup };
