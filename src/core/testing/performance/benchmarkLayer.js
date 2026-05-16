// =============================================================
// benchmarkLayer — Performance measurement + timing
//
// Measures: startup time, route load time, widget render time,
// realtime latency, action completion latency.
//
// Results are stored in a ring buffer and exposed for the
// dev toolbar + operational dashboard.
// =============================================================
import { createLogger } from '@/core/production/productionLogger';

const log         = createLogger('Benchmark');
const MAX_SAMPLES = 200;

// ── Sample ring buffer ─────────────────────────────────────────
const _samples = [];   // [{ name, category, durationMs, ts, meta }]

function _record(name, category, durationMs, meta = {}) {
  _samples.push({ name, category, durationMs, ts: Date.now(), meta });
  if (_samples.length > MAX_SAMPLES) _samples.shift();
}

// ── Timer factory ──────────────────────────────────────────────
/**
 * Create a timer. Call start() then stop() to record.
 * @param {string} name
 * @param {string} [category]
 * @returns {{ start, stop, measure }}
 */
export function createTimer(name, category = 'general') {
  let _t0 = null;
  return {
    start() { _t0 = performance.now(); },
    stop(meta = {}) {
      if (_t0 === null) return null;
      const ms = Math.round(performance.now() - _t0);
      _record(name, category, ms, meta);
      _t0 = null;
      return ms;
    },
    /** Wrap an async function and record its duration. */
    async measure(fn, meta = {}) {
      _t0 = performance.now();
      const result = await fn();
      this.stop(meta);
      return result;
    },
  };
}

// ── Convenience: wrap async function ──────────────────────────
export async function time(name, fn, category = 'general', meta = {}) {
  const t0     = performance.now();
  const result = await fn();
  const ms     = Math.round(performance.now() - t0);
  _record(name, category, ms, meta);
  if (ms > 2000) log.warn(`Slow: ${name} took ${ms}ms`);
  return result;
}

// ── Startup time ───────────────────────────────────────────────
let _appStartTs  = null;
let _appReadyTs  = null;

export function markAppStart()  { _appStartTs  = performance.now(); }
export function markAppReady()  {
  _appReadyTs = performance.now();
  if (_appStartTs !== null) {
    const ms = Math.round(_appReadyTs - _appStartTs);
    _record('app:startup', 'startup', ms);
    log.info(`App ready in ${ms}ms`);
  }
}

// ── Route navigation timing ────────────────────────────────────
const _routeTimers = new Map();

export function markRouteStart(routePath) {
  _routeTimers.set(routePath, performance.now());
}

export function markRouteReady(routePath) {
  const t0 = _routeTimers.get(routePath);
  if (t0 == null) return;
  const ms = Math.round(performance.now() - t0);
  _record(`route:${routePath}`, 'navigation', ms, { path: routePath });
  _routeTimers.delete(routePath);
  if (ms > 1000) log.warn(`Slow route: ${routePath} took ${ms}ms`);
}

// ── Widget render timing ───────────────────────────────────────
export function measureRender(componentName, renderFn) {
  const t0     = performance.now();
  const result = renderFn();
  const ms     = Math.round(performance.now() - t0);
  _record(`render:${componentName}`, 'render', ms, { component: componentName });
  return result;
}

// ── Realtime latency ───────────────────────────────────────────
export function recordRealtimeLatency(channelName, latencyMs) {
  _record(`realtime:${channelName}`, 'realtime', latencyMs, { channel: channelName });
}

// ── Action completion ──────────────────────────────────────────
export function recordActionCompletion(actionName, durationMs, succeeded = true) {
  _record(`action:${actionName}`, 'action', durationMs, { action: actionName, succeeded });
}

// ── Analytics ─────────────────────────────────────────────────
export function getStats(category = null) {
  const filtered = category ? _samples.filter((s) => s.category === category) : _samples;
  if (filtered.length === 0) return null;

  const byName = {};
  for (const sample of filtered) {
    if (!byName[sample.name]) byName[sample.name] = [];
    byName[sample.name].push(sample.durationMs);
  }

  return Object.entries(byName).map(([name, values]) => ({
    name,
    count: values.length,
    avg:   Math.round(values.reduce((s, v) => s + v, 0) / values.length),
    min:   Math.min(...values),
    max:   Math.max(...values),
    p95:   values.sort((a, b) => a - b)[Math.floor(values.length * 0.95)] ?? values[values.length - 1],
  })).sort((a, b) => b.avg - a.avg);
}

export function getSlowOperations(thresholdMs = 1000) {
  return _samples.filter((s) => s.durationMs > thresholdMs)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 20);
}

export function getAllSamples(n = 50) {
  return _samples.slice(-n).reverse();
}

export function clearBenchmarks() {
  _samples.length = 0;
  log.info('Benchmarks cleared');
}

export function getStartupTime() {
  const s = _samples.find((s) => s.name === 'app:startup');
  return s?.durationMs ?? null;
}

// ── Dev window exposure ────────────────────────────────────────
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__benchmark = { getStats, getSlowOperations, getAllSamples, clearBenchmarks, getStartupTime };
  // Mark startup
  markAppStart();
}
