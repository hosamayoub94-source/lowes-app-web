// =============================================================
// Production Config — feature flags, safe mode, monitoring toggles
//
// Single source of truth for all production behaviour switches.
// All values are read-once at boot from env vars, then frozen.
// Override at runtime via setFlag() for A/B or hotfixes.
// =============================================================

const _env = import.meta.env;
const IS_DEV  = _env.DEV  === true;
const IS_PROD = _env.PROD === true;

// ── Default config ─────────────────────────────────────────────
const _defaults = {
  // ── Environment ──────────────────────────────────────────────
  isDev:  IS_DEV,
  isProd: IS_PROD,

  // ── Monitoring ────────────────────────────────────────────────
  enableErrorReporting:    true,
  enablePerformanceMonitor: IS_DEV,
  enableHealthMonitor:     true,
  enableRealtimeRecovery:  true,
  enableOfflineRecovery:   true,
  enableActionLocking:     true,

  // ── Logging ───────────────────────────────────────────────────
  logLevel:      IS_PROD ? 'error' : 'debug',  // 'debug'|'info'|'warn'|'error'|'silent'
  logThrottleMs: 500,     // min ms between same-key log entries
  enableGroupedLogs: IS_DEV,
  enableTimestamps:  IS_DEV,

  // ── Retry / Resilience ────────────────────────────────────────
  defaultRetries:      3,
  defaultRetryBaseMs:  1_000,
  defaultTimeoutMs:    30_000,
  actionLockTtlMs:     5_000,   // prevent duplicate for 5s
  actionLockMaxSize:   500,     // max entries in lock map

  // ── Realtime ─────────────────────────────────────────────────
  realtimeHeartbeatMs: 15_000,  // ping every 15s
  realtimeMaxReconnects: 10,
  realtimeReconnectBaseMs: 2_000,
  realtimeReconnectMaxMs:  60_000,

  // ── Offline ───────────────────────────────────────────────────
  offlineQueueKey:       '__prod_offline_queue',
  offlineQueueMaxSize:   100,
  offlineReplayOnReconnect: true,

  // ── Health ────────────────────────────────────────────────────
  healthCheckIntervalMs:  10_000,
  healthDegradedThresholds: {
    queueDeadLetter:  3,    // X+ dead-letter jobs → degraded
    eventBusLatency:  2_000, // ms
    realtimeDownMs:   30_000,
  },

  // ── Safe Mode ────────────────────────────────────────────────
  safeMode:    false,  // disables non-critical background work
  readOnly:    false,  // UI shows read-only notice, blocks writes

  // ── Dev Inspector ─────────────────────────────────────────────
  showInspector:    IS_DEV,
  inspectorHotkey:  'ctrl+shift+i',  // to open inspector
};

// ── Runtime overrides (from env) ──────────────────────────────
function _applyEnvOverrides(cfg) {
  const out = { ...cfg };
  if (_env.VITE_SAFE_MODE        === 'true')  out.safeMode    = true;
  if (_env.VITE_READ_ONLY        === 'true')  out.readOnly    = true;
  if (_env.VITE_SHOW_INSPECTOR   === 'true')  out.showInspector = true;
  if (_env.VITE_LOG_LEVEL)                   out.logLevel    = _env.VITE_LOG_LEVEL;
  if (_env.VITE_DISABLE_REALTIME === 'true')  out.enableRealtimeRecovery = false;
  if (_env.VITE_DISABLE_OFFLINE  === 'true')  out.enableOfflineRecovery  = false;
  return out;
}

// ── Mutable runtime flags (for hotfix toggles) ────────────────
const _runtimeFlags = {};

// ── Public API ─────────────────────────────────────────────────
const _config = _applyEnvOverrides(_defaults);

/**
 * Get a config value. Runtime flags override static defaults.
 * @param {string} key
 */
export function getFlag(key) {
  return key in _runtimeFlags ? _runtimeFlags[key] : _config[key];
}

/**
 * Override a flag at runtime (for emergency hotfixes).
 * @param {string} key
 * @param {*}      value
 */
export function setFlag(key, value) {
  _runtimeFlags[key] = value;
  if (_config.isDev) {
     
    console.info(`[ProductionConfig] flag override: ${key} =`, value);
  }
}

/** Full config snapshot (read-only copy). */
export function getConfig() {
  return { ..._config, ..._runtimeFlags };
}

/** True if running in dev mode. */
export const isDev  = _config.isDev;
export const isProd = _config.isProd;

/** Expose on window in dev for console overrides. */
if (typeof window !== 'undefined' && IS_DEV) {
  window.__productionConfig = { getFlag, setFlag, getConfig };
}
