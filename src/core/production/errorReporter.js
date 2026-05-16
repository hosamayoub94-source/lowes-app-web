// =============================================================
// errorReporter — Global Error Capture + Structured Reporting
//
// Captures:
//   • window.onerror      — JS runtime errors
//   • unhandledrejection  — unhandled async/promise errors
//   • Event bus failures  — handlers that throw
//   • Manual capture      — captureError(err, context)
//
// Architecture:
//   • In-memory error ring buffer (last 100 errors)
//   • Error dedup by fingerprint (same error within 60s = one entry)
//   • Sentry-ready: just implement sendToSentry() and wire it in
//   • Severity tagging: fatal | error | warning | info
//   • No external deps — pure vanilla JS
// =============================================================
import { getFlag }      from './productionConfig';
import { createLogger } from './productionLogger';

const log = createLogger('ErrorReporter');

// ── Types ──────────────────────────────────────────────────────
export const SEVERITY = Object.freeze({
  FATAL:   'fatal',
  ERROR:   'error',
  WARNING: 'warning',
  INFO:    'info',
});

// ── State ──────────────────────────────────────────────────────
const RING_SIZE    = 100;
const DEDUP_TTL_MS = 60_000;

let _errors        = [];           // ring buffer
let _dedupMap      = new Map();    // fingerprint → timestamp
let _initialized   = false;
let _handlers      = [];           // pluggable sinks (e.g. Sentry)

// ── Fingerprint ────────────────────────────────────────────────
function _fingerprint(error, context = '') {
  const msg = error?.message ?? String(error);
  return `${context}::${msg.slice(0, 120)}`;
}

// ── Core capture ───────────────────────────────────────────────
/**
 * Capture an error into the reporting system.
 *
 * @param {Error|string|any}  error
 * @param {object} [ctx]
 * @param {string} [ctx.context]   — where it happened
 * @param {string} [ctx.severity]  — SEVERITY value
 * @param {object} [ctx.extra]     — arbitrary metadata
 */
export function captureError(error, ctx = {}) {
  if (!getFlag('enableErrorReporting')) return;

  const {
    context  = 'unknown',
    severity = SEVERITY.ERROR,
    extra    = {},
  } = ctx;

  // Dedup check
  const key = _fingerprint(error, context);
  const lastSeen = _dedupMap.get(key) ?? 0;
  const now = Date.now();

  if (now - lastSeen < DEDUP_TTL_MS) return; // suppress duplicate
  _dedupMap.set(key, now);

  // Normalize
  const entry = {
    id:        `err_${Date.now().toString(36)}`,
    severity,
    context,
    message:   error?.message ?? String(error),
    stack:     error?.stack?.slice(0, 800) ?? null,
    extra,
    timestamp: now,
  };

  // Ring buffer
  _errors.push(entry);
  if (_errors.length > RING_SIZE) _errors.shift();

  // Log to console
  if (severity === SEVERITY.FATAL || severity === SEVERITY.ERROR) {
    log.error(`[${context}] ${entry.message}`, { stack: entry.stack, extra });
  } else if (severity === SEVERITY.WARNING) {
    log.warn(`[${context}] ${entry.message}`, extra);
  }

  // Fan out to registered sinks
  _handlers.forEach((handler) => {
    try { handler(entry); } catch (_) { /* sink must not throw */ }
  });
}

// ── Register external sinks (Sentry, Datadog, etc.) ──────────
/**
 * @param {function(entry): void} handler
 * @returns {function} unregister
 */
export function registerErrorSink(handler) {
  _handlers.push(handler);
  return () => { _handlers = _handlers.filter((h) => h !== handler); };
}

// ── Global listeners ──────────────────────────────────────────
function _onWindowError(message, source, lineno, colno, error) {
  captureError(error ?? new Error(message), {
    context:  `window.onerror (${source}:${lineno})`,
    severity: SEVERITY.ERROR,
  });
  return false; // don't suppress default browser behavior
}

function _onUnhandledRejection(event) {
  const err = event.reason;
  captureError(err instanceof Error ? err : new Error(String(err)), {
    context:  'unhandledrejection',
    severity: SEVERITY.ERROR,
  });
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Initialize global error listeners. Call once at app boot.
 */
export function initErrorReporter() {
  if (_initialized || !getFlag('enableErrorReporting')) return;
  _initialized = true;

  if (typeof window === 'undefined') return;

  window.onerror                     = _onWindowError;
  window.onunhandledrejection        = _onUnhandledRejection;
  window.addEventListener('unhandledrejection', _onUnhandledRejection);

  log.info('ErrorReporter initialized');
}

/** Get last N captured errors (for inspector). */
export function getErrors(limit = 20) {
  return _errors.slice(-limit).reverse();
}

/** Clear error buffer (for testing). */
export function clearErrors() {
  _errors = [];
  _dedupMap.clear();
}

/** Error count by severity. */
export function getErrorStats() {
  const stats = { fatal: 0, error: 0, warning: 0, info: 0 };
  _errors.forEach((e) => { stats[e.severity] = (stats[e.severity] ?? 0) + 1; });
  return stats;
}

// ── Convenience wrappers ──────────────────────────────────────
export const captureWarning = (msg, ctx = {}) =>
  captureError(new Error(msg), { ...ctx, severity: SEVERITY.WARNING });

export const captureFatal = (err, ctx = {}) =>
  captureError(err, { ...ctx, severity: SEVERITY.FATAL });

// ── Expose on window in dev ───────────────────────────────────
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__errorReporter = { captureError, getErrors, clearErrors, getErrorStats };
}
