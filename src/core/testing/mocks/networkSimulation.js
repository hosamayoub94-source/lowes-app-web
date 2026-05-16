// =============================================================
// networkSimulation — Delay, failure, and offline simulation
//
// Use in development to test resilience without cutting cables.
// All simulation is opt-in and DEV-only by default.
//
// Usage:
//   import { withDelay, withFlakiness, simulateOffline } from './networkSimulation';
//   const data = await withDelay(fetchTasks(), 1500);      // adds 1.5s delay
//   const data = await withFlakiness(fetchTasks(), 0.3);   // 30% chance of failure
//   const restore = simulateOffline();                      // go offline
//   await waitFor(3000);
//   restore();                                              // back online
// =============================================================
import { createLogger } from '@/core/production/productionLogger';

const log = createLogger('NetworkSim');

// ── Basic utilities ────────────────────────────────────────────
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Delay wrapper ──────────────────────────────────────────────
/**
 * Add artificial network delay to any promise.
 * @param {Promise|function(): Promise} fn
 * @param {number} ms
 */
export async function withDelay(fn, ms = 500) {
  await sleep(ms);
  return typeof fn === 'function' ? fn() : fn;
}

// ── Random delay (simulates variable network) ──────────────────
export async function withJitter(fn, minMs = 100, maxMs = 800) {
  const delay = minMs + Math.random() * (maxMs - minMs);
  return withDelay(fn, delay);
}

// ── Flakiness (random failures) ───────────────────────────────
/**
 * Randomly fail a promise with given probability.
 * @param {Promise|function(): Promise} fn
 * @param {number} failRate  — 0.0 to 1.0 (probability of failure)
 * @param {string} [errorMsg]
 */
export async function withFlakiness(fn, failRate = 0.2, errorMsg = 'Simulated network error') {
  if (Math.random() < failRate) {
    log.warn(`[NetworkSim] Injecting failure (rate: ${failRate})`);
    throw new Error(errorMsg);
  }
  return typeof fn === 'function' ? fn() : fn;
}

// ── Slow connection simulation ─────────────────────────────────
export async function withSlow3G(fn) {
  return withJitter(fn, 1500, 4000);
}

export async function withSlow2G(fn) {
  return withJitter(fn, 4000, 8000);
}

// ── Timeout simulation ─────────────────────────────────────────
export async function withTimeout(fn, ms = 3000) {
  return Promise.race([
    typeof fn === 'function' ? fn() : fn,
    sleep(ms).then(() => { throw new Error(`Simulated timeout after ${ms}ms`); }),
  ]);
}

// ── Offline simulation ─────────────────────────────────────────
let _originalFetch  = null;
let _isSimOffline   = false;

/**
 * Simulate going offline. Returns a restore function.
 * Patches window.fetch and dispatches offline event.
 * @param {number} [durationMs] — auto-restore after N ms (optional)
 */
export function simulateOffline(durationMs = null) {
  if (_isSimOffline) return () => {};

  _isSimOffline  = true;
  _originalFetch = window.fetch;

  window.fetch = () => Promise.reject(new TypeError('Failed to fetch (simulated offline)'));
  window.dispatchEvent(new Event('offline'));

  log.warn('[NetworkSim] 🔴 Simulating offline');

  const restore = () => {
    if (!_isSimOffline) return;
    _isSimOffline = false;
    if (_originalFetch) {
      window.fetch = _originalFetch;
      _originalFetch = null;
    }
    window.dispatchEvent(new Event('online'));
    log.info('[NetworkSim] 🟢 Offline simulation ended');
  };

  if (durationMs) setTimeout(restore, durationMs);
  return restore;
}

export function isSimulatingOffline() { return _isSimOffline; }

// ── Bandwidth throttle (via patching fetch) ───────────────────
let _delayMs = 0;

export function throttleNetwork(delayMs = 1000) {
  _delayMs       = delayMs;
  _originalFetch = _originalFetch ?? window.fetch;

  window.fetch = async (...args) => {
    await sleep(_delayMs);
    return _originalFetch(...args);
  };

  log.warn(`[NetworkSim] Network throttled to +${delayMs}ms`);
  return () => {
    _delayMs = 0;
    if (_originalFetch) window.fetch = _originalFetch;
    _originalFetch = null;
    log.info('[NetworkSim] Network throttle removed');
  };
}

// ── Expose on window in DEV ────────────────────────────────────
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__networkSim = { simulateOffline, throttleNetwork, withDelay, withFlakiness, isSimulatingOffline };
}
