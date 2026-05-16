// =============================================================
// loggingStrategy — Production-safe log management
//
// Provides:
//   • Log retention + automatic cleanup (cap at N entries)
//   • Grouped diagnostics (group logs by feature/module)
//   • Log level filtering (debug → info → warn → error)
//   • Structured export for support/debugging
//   • Production-safe: debug logs stripped automatically
// =============================================================
import { createLogger } from '@/core/production/productionLogger';

const log = createLogger('LoggingStrategy');

// ── Log storage ────────────────────────────────────────────────
const LOG_STORAGE_KEY = '__lw_log_history';
const MAX_LOG_ENTRIES = 500;
const LOG_RETENTION_MS = 48 * 60 * 60_000; // 48 hours

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const IS_PROD    = import.meta.env.PROD;
const MIN_LEVEL  = IS_PROD ? LOG_LEVELS.warn : LOG_LEVELS.debug;

// In-memory ring buffer
const _logBuffer = [];

// ── Core log writer ────────────────────────────────────────────
export function writeLog(level, module, message, meta = {}) {
  if ((LOG_LEVELS[level] ?? 0) < MIN_LEVEL) return;

  const entry = {
    level,
    module,
    message,
    meta,
    ts:    Date.now(),
    id:    _logBuffer.length,
  };

  _logBuffer.push(entry);
  if (_logBuffer.length > MAX_LOG_ENTRIES) _logBuffer.shift();

  // Persist warn + error to localStorage for post-reload analysis
  if (level === 'warn' || level === 'error') {
    _persistLog(entry);
  }
}

function _persistLog(entry) {
  try {
    const existing = _loadPersistedLogs();
    existing.push(entry);
    // Keep only last 100 persisted (warn/error only)
    const trimmed = existing.slice(-100);
    localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* quota */ }
}

function _loadPersistedLogs() {
  try {
    return JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) ?? '[]');
  } catch { return []; }
}

// ── Log retrieval ──────────────────────────────────────────────
export function getLogs(opts = {}) {
  const { level = null, module = null, limit = 100, since = 0 } = opts;

  return _logBuffer
    .filter((e) => {
      if (e.ts < since) return false;
      if (level  && e.level  !== level)  return false;
      if (module && e.module !== module) return false;
      return true;
    })
    .slice(-limit);
}

export function getPersistedLogs(opts = {}) {
  const { since = 0 } = opts;
  const now = Date.now();
  return _loadPersistedLogs()
    .filter((e) => e.ts >= since && now - e.ts < LOG_RETENTION_MS);
}

export function getErrorLogs()  { return getLogs({ level: 'error' }); }
export function getWarnLogs()   { return getLogs({ level: 'warn'  }); }
export function getModuleLogs(module) { return getLogs({ module });   }

// ── Grouped diagnostics ────────────────────────────────────────
export function getGroupedDiagnostics() {
  const groups = {};

  for (const entry of _logBuffer) {
    const key = entry.module ?? 'unknown';
    if (!groups[key]) groups[key] = { info: 0, warn: 0, error: 0, debug: 0, entries: [] };
    groups[key][entry.level] = (groups[key][entry.level] ?? 0) + 1;
    groups[key].entries.push(entry);
  }

  // Sort by error count desc, then warn
  return Object.entries(groups)
    .sort(([, a], [, b]) => (b.error - a.error) || (b.warn - a.warn))
    .map(([module, data]) => ({
      module,
      counts:  { info: data.info, warn: data.warn, error: data.error, debug: data.debug },
      recent:  data.entries.slice(-5),
      healthy: data.error === 0 && data.warn < 3,
    }));
}

// ── Log cleanup ────────────────────────────────────────────────
export function cleanupOldLogs() {
  const now  = Date.now();
  const kept = _loadPersistedLogs().filter((e) => now - e.ts < LOG_RETENTION_MS);
  try {
    localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(kept));
  } catch { /* quota */ }
  return { removed: _loadPersistedLogs().length - kept.length, kept: kept.length };
}

export function clearLogHistory() {
  _logBuffer.length = 0;
  localStorage.removeItem(LOG_STORAGE_KEY);
  log.warn('Log history cleared');
}

// ── Structured export ──────────────────────────────────────────
export function exportLogs(format = 'json') {
  const data = {
    exportedAt: new Date().toISOString(),
    environment: import.meta.env.MODE,
    appVersion:  import.meta.env.VITE_APP_VERSION ?? 'unknown',
    buffer:      _logBuffer,
    persisted:   getPersistedLogs(),
  };

  if (format === 'json') return JSON.stringify(data, null, 2);

  if (format === 'text') {
    return data.buffer
      .map((e) => `[${new Date(e.ts).toISOString()}] [${e.level.toUpperCase()}] [${e.module}] ${e.message}`)
      .join('\n');
  }

  return data;
}

// ── Log health report ──────────────────────────────────────────
export function getLogHealthReport() {
  const diagnostics = getGroupedDiagnostics();
  const errorModules = diagnostics.filter((d) => d.counts.error > 0);
  const warnModules  = diagnostics.filter((d) => d.counts.warn > 5);

  return {
    totalEntries:  _logBuffer.length,
    errorModules:  errorModules.map((m) => ({ module: m.module, errors: m.counts.error })),
    warnModules:   warnModules.map((m) => ({ module: m.module, warns: m.counts.warn })),
    groupedByModule: diagnostics,
    healthy: errorModules.length === 0,
    recommendation: errorModules.length > 0
      ? `Fix errors in: ${errorModules.map((m) => m.module).join(', ')}`
      : null,
  };
}

// ── Production logging standards validator ─────────────────────
const LOGGER_STANDARDS = {
  maxMessageLength: 200,
  forbiddenInProd:  ['password', 'token', 'secret', 'api_key', 'credential'],
};

export function validateLogEntry(level, message, meta = {}) {
  const issues = [];

  if (message.length > LOGGER_STANDARDS.maxMessageLength) {
    issues.push(`Log message exceeds ${LOGGER_STANDARDS.maxMessageLength} chars`);
  }

  if (IS_PROD) {
    const combined = (message + JSON.stringify(meta)).toLowerCase();
    for (const forbidden of LOGGER_STANDARDS.forbiddenInProd) {
      if (combined.includes(forbidden)) {
        issues.push(`Log contains sensitive field: ${forbidden}`);
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

// ── Auto-cleanup on startup ────────────────────────────────────
cleanupOldLogs();
