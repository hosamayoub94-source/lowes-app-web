// =============================================================
// src/core/production/index.js
// Production hardening layer — barrel export
// =============================================================

// Config
export { getFlag, setFlag, getConfig, isDev, isProd } from './productionConfig';

// Logger
export { createLogger, rootLogger, clearLogThrottle } from './productionLogger';

// Safe async
export { withRetry, withTimeout, safeFetch, dedup, getInflightCount, clearInflight } from './safeAsync';

// Action locking
export {
  acquireLock, releaseLock, isLocked, withLock, lockKey,
  inspectLocks, clearAllLocks, LOCK_KEYS,
} from './actionLock';

// Error reporting
export {
  captureError, captureWarning, captureFatal,
  initErrorReporter, registerErrorSink,
  getErrors, getErrorStats, clearErrors, SEVERITY,
} from './errorReporter';

// Realtime recovery
export {
  initRealtimeRecovery, destroyRealtimeRecovery,
  registerChannel, unregisterChannel,
  forceReconnect, inspectRealtime,
  getRealtimeStatus, getReconnectCount, getLastHeartbeat,
} from './realtimeRecovery';

// Offline recovery
export {
  initOfflineRecovery, destroyOfflineRecovery,
  enqueueOfflineAction, registerActionHandler,
  replayNow, getOfflineQueueStats,
  clearDeadLetter, clearOfflineQueue,
} from './offlineRecovery';

// Health engine
export {
  initHealthEngine, destroyHealthEngine,
  getHealthSnapshot, checkNow,
} from './healthEngine';

// React hook
export { useSystemHealth } from './useSystemHealth';

// UI components
export { SystemHealthBanner }  from './SystemHealthBanner';
export { ProductionInspector } from './ProductionInspector';

// ── Boot helper ────────────────────────────────────────────────
import { initErrorReporter }    from './errorReporter';
import { initOfflineRecovery }  from './offlineRecovery';
import { initHealthEngine }     from './healthEngine';
import { initRealtimeRecovery } from './realtimeRecovery';

/**
 * Initialize the full production layer in one call.
 * Call this early in App.jsx before rendering.
 *
 * @param {SupabaseClient} [supabaseClient]
 */
export function bootProductionLayer(supabaseClient = null) {
  initErrorReporter();
  initOfflineRecovery();
  initHealthEngine();
  if (supabaseClient) initRealtimeRecovery(supabaseClient);
}
