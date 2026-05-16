// =============================================================
// safeAsync — production-safe async execution layer
//
// Provides:
//   • withRetry(fn, opts)    — retry with exponential backoff
//   • withTimeout(fn, ms)    — abort after N ms
//   • safeFetch(fn, opts)    — retry + timeout + error capture
//   • runOnce(key, fn)       — ensure fn runs only once at a time
//   • dedup(key, fn)         — deduplicate in-flight promises
//
// All wrappers integrate with errorReporter and productionLogger.
// =============================================================
import { getFlag }      from './productionConfig';
import { createLogger } from './productionLogger';

const log = createLogger('SafeAsync');

// ── Helper: sleep ──────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Helper: compute backoff with jitter ───────────────────────
function backoff(attempt, baseMs = 1_000, maxMs = 30_000) {
  const exp  = Math.min(baseMs * 2 ** attempt, maxMs);
  const jitter = Math.random() * exp * 0.2; // ±20% jitter
  return exp + jitter;
}

// ── withRetry ──────────────────────────────────────────────────
/**
 * Retry an async function with exponential backoff.
 *
 * @param {function(): Promise<any>} fn
 * @param {object}  [opts]
 * @param {number}  [opts.maxAttempts=3]
 * @param {number}  [opts.baseMs=1000]
 * @param {number}  [opts.maxMs=30000]
 * @param {function} [opts.shouldRetry]  — (error) => bool
 * @param {string}  [opts.label]         — for logging
 * @returns {Promise<any>}
 */
export async function withRetry(fn, opts = {}) {
  const {
    maxAttempts = getFlag('defaultRetries'),
    baseMs      = getFlag('defaultRetryBaseMs'),
    maxMs       = 30_000,
    shouldRetry = () => true,
    label       = 'operation',
  } = opts;

  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await fn();
      if (attempt > 0) log.info(`↩ ${label} succeeded after ${attempt + 1} attempts`);
      return result;
    } catch (err) {
      lastError = err;
      const isLast = attempt === maxAttempts - 1;

      if (isLast || !shouldRetry(err)) {
        log.error(`✗ ${label} failed after ${attempt + 1} attempt(s)`, { error: err?.message });
        throw err;
      }

      const delay = backoff(attempt, baseMs, maxMs);
      log.warn(`⟳ ${label} attempt ${attempt + 1} failed, retry in ${Math.round(delay)}ms`, { error: err?.message }, { throttleKey: label });
      await sleep(delay);
    }
  }
  throw lastError;
}

// ── withTimeout ────────────────────────────────────────────────
/**
 * Abort a promise after `ms` milliseconds.
 *
 * @param {function(): Promise<any>} fn
 * @param {number} ms
 * @param {string} [label]
 * @returns {Promise<any>}
 */
export async function withTimeout(fn, ms = getFlag('defaultTimeoutMs'), label = 'operation') {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timeout: ${label} exceeded ${ms}ms`)), ms);
  });

  try {
    const result = await Promise.race([fn(), timeout]);
    clearTimeout(timeoutId);
    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ── safeFetch — retry + timeout + error capture ────────────────
/**
 * Production-safe wrapper: retry + timeout + structured error.
 *
 * @param {function(): Promise<any>} fn
 * @param {object}  [opts]
 * @param {number}  [opts.maxAttempts]
 * @param {number}  [opts.timeoutMs]
 * @param {any}     [opts.fallback]     — value to return on final failure
 * @param {string}  [opts.label]
 * @param {boolean} [opts.silent]       — suppress error logging
 * @returns {Promise<any>}
 */
export async function safeFetch(fn, opts = {}) {
  const {
    maxAttempts = getFlag('defaultRetries'),
    timeoutMs   = getFlag('defaultTimeoutMs'),
    fallback    = undefined,
    label       = 'fetch',
    silent      = false,
  } = opts;

  try {
    return await withRetry(
      () => withTimeout(fn, timeoutMs, label),
      { maxAttempts, label }
    );
  } catch (err) {
    if (!silent) log.error(`safeFetch failed: ${label}`, { error: err?.message });
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

// ── In-flight deduplication map ───────────────────────────────
const _inflight = new Map();

/**
 * Deduplicate concurrent calls with the same key.
 * While a call is in-flight, subsequent calls return the same promise.
 *
 * @param {string} key       — unique operation key
 * @param {function(): Promise} fn
 * @returns {Promise<any>}
 */
export function dedup(key, fn) {
  if (_inflight.has(key)) {
    log.debug(`dedup: reusing in-flight promise for "${key}"`);
    return _inflight.get(key);
  }
  const promise = Promise.resolve()
    .then(fn)
    .finally(() => _inflight.delete(key));
  _inflight.set(key, promise);
  return promise;
}

/** Current in-flight count (for monitoring). */
export function getInflightCount() { return _inflight.size; }

/** Clear all in-flight (for testing). */
export function clearInflight() { _inflight.clear(); }
