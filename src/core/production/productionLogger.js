// =============================================================
// Production Logger — structured, throttled, dev/prod separated
//
// Features:
//   • Log levels: debug < info < warn < error < silent
//   • Throttling: same key can't log more than once per N ms
//   • Grouped logs in dev (console.group)
//   • Structured JSON format for prod (future: send to backend)
//   • Module tagging for easy filtering
//   • Performance marks for timing blocks
// =============================================================
import { getFlag } from './productionConfig';

// ── Level ordering ─────────────────────────────────────────────
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 99 };
const COLORS  = {
  debug: 'color:#6366f1',
  info:  'color:#0ea5e9',
  warn:  'color:#f59e0b',
  error: 'color:#ef4444',
};

// ── Throttle map ───────────────────────────────────────────────
const _throttleMap = new Map();

function _isThrottled(key) {
  const ms  = getFlag('logThrottleMs');
  const last = _throttleMap.get(key) ?? 0;
  if (Date.now() - last < ms) return true;
  _throttleMap.set(key, Date.now());
  return false;
}

// ── Core output ────────────────────────────────────────────────
function _output(level, module, message, data, throttleKey) {
  const configLevel = getFlag('logLevel');
  if (LEVELS[level] < LEVELS[configLevel]) return;

  if (throttleKey && _isThrottled(`${module}:${throttleKey}`)) return;

  const isProd   = getFlag('isProd');
  const grouped  = getFlag('enableGroupedLogs');
  const ts       = getFlag('enableTimestamps')
    ? new Date().toISOString().slice(11, 23)
    : null;

  if (isProd) {
    // In production: structured JSON (ready for log aggregation)
    if (level === 'error') {
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({ level, module, message, data, ts: Date.now() }));
    }
    return;
  }

  // Dev: pretty output
  const tag   = `[${module}]`;
  const label = ts ? `${ts} ${tag} ${message}` : `${tag} ${message}`;

  /* eslint-disable no-console */
  if (grouped && data !== undefined) {
    console.groupCollapsed(`%c${level.toUpperCase()} ${label}`, COLORS[level]);
    if (data !== undefined) console.log(data);
    console.groupEnd();
  } else if (level === 'error') {
    console.error(`%c${label}`, COLORS[level], data ?? '');
  } else if (level === 'warn') {
    console.warn(`%c${label}`, COLORS[level], data ?? '');
  } else {
    console.log(`%c${label}`, COLORS[level], ...(data !== undefined ? [data] : []));
  }
  /* eslint-enable no-console */
}

// ── Logger factory ─────────────────────────────────────────────
/**
 * Create a module-scoped logger.
 * @param {string} module  — e.g. 'RealtimeRecovery', 'HealthEngine'
 */
export function createLogger(module) {
  return {
    debug: (msg, data, opts) => _output('debug', module, msg, data, opts?.throttleKey),
    info:  (msg, data, opts) => _output('info',  module, msg, data, opts?.throttleKey),
    warn:  (msg, data, opts) => _output('warn',  module, msg, data, opts?.throttleKey),
    error: (msg, data, opts) => _output('error', module, msg, data, opts?.throttleKey),

    /** Time a block — returns a stop() function. */
    time(label) {
      const key = `${module}:${label}`;
      if (typeof performance !== 'undefined') performance.mark(`${key}:start`);
      const t0 = performance.now();
      return () => {
        const ms = (performance.now() - t0).toFixed(1);
        _output('debug', module, `⏱ ${label} took ${ms}ms`);
      };
    },

    /** Group helper — works in dev, no-op in prod. */
    group(label, fn) {
      if (!getFlag('isDev')) return fn();
      /* eslint-disable no-console */
      console.group(`[${module}] ${label}`);
      try { return fn(); }
      finally { console.groupEnd(); }
      /* eslint-enable no-console */
    },
  };
}

/** Shared root logger (use createLogger() for module-scoped). */
export const rootLogger = createLogger('App');

/** Clear throttle map (for testing). */
export function clearLogThrottle() { _throttleMap.clear(); }
