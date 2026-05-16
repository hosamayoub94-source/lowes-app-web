// =============================================================
// Core Events — Enterprise Event Bus (Internal)
//
// Centralised pub/sub used by every module to communicate without
// importing each other. Prevents circular deps and lets us bolt
// on websockets / worker queues / analytics without touching the
// emitter sites.
//
// Public API:
//   • emit(eventName, payload, options)
//   • on(eventName, handler, options)        → unsubscribe fn
//   • once(eventName, handler, options)      → unsubscribe fn
//   • off(eventName, handler)
//   • onAny(handler)                         → unsubscribe fn
//   • clear(eventName?)                      → testing utility
//
// Features:
//   • Async-safe handlers (Promise.allSettled — one fail ≠ all fail)
//   • Per-emit batching (microtask queue) — same event emitted N
//     times in one tick is delivered once with merged payloads
//   • Debug mode with console tracing, event timeline + source map
//   • Pluggable transports for future scalability:
//       eventBus.registerTransport({ name, send(event) })
//     Every emitted event is forwarded to all transports → easy
//     to add websocket relays, worker queues, analytics, AI
//     triggers, push notifications, etc.
// =============================================================
import {
  EVENT_SOURCES,
  resolveEventSeverity,
} from './eventTypes';

// ── Constants ────────────────────────────────────────────────
const TIMELINE_LIMIT     = 200;          // ring-buffer size for dev monitor
const DEFAULT_BATCH_MS   = 0;            // 0 = microtask (batches within a tick)
const DEFAULT_DEBOUNCE   = 150;          // for `on(..., { debounce })` and emitDebounced
const MAX_HANDLERS_WARN  = 50;           // memory-leak smell

// ── Internal state ───────────────────────────────────────────
/** @type {Map<string, Set<Function>>} */ const _handlers     = new Map();
/** @type {Set<Function>}              */ const _anyHandlers  = new Set();
/** @type {Map<string, {payloads: any[], opts: object, timer: any}>} */
const _batchQueue   = new Map();
/** @type {Map<string, number>}         */ const _debounceMap = new Map();
/** @type {Array<object>}               */ let _timeline     = [];
/** @type {Set<{ name: string, send: Function }>} */
const _transports   = new Set();

let _debug          = false;
let _seq            = 0;

// ── Helpers ──────────────────────────────────────────────────
function nextId() { return `evt_${Date.now().toString(36)}_${(++_seq).toString(36)}`; }

function trace(...args) {
  if (!_debug) return;
  // eslint-disable-next-line no-console
  console.debug('%c[eventBus]', 'color:#0ea5e9;font-weight:600', ...args);
}

function recordTimeline(entry) {
  _timeline.push(entry);
  if (_timeline.length > TIMELINE_LIMIT) {
    _timeline = _timeline.slice(-TIMELINE_LIMIT);
  }
}

function buildEnvelope(eventName, payload, opts) {
  return {
    id:        nextId(),
    name:      eventName,
    payload:   payload ?? null,
    source:    opts?.source   ?? EVENT_SOURCES.UNKNOWN,
    severity:  opts?.severity ?? resolveEventSeverity(eventName),
    timestamp: Date.now(),
    meta:      opts?.meta     ?? null,
  };
}

async function deliver(envelope) {
  const subs = _handlers.get(envelope.name);
  const handlers = subs ? Array.from(subs) : [];
  const any      = Array.from(_anyHandlers);

  recordTimeline(envelope);
  trace('→', envelope.name, envelope);

  // Fan out to transports first (non-blocking)
  for (const t of _transports) {
    try { t.send(envelope); }
    catch (err) { trace('transport failed', t.name, err); }
  }

  if (handlers.length === 0 && any.length === 0) return;

  // Run handlers concurrently; isolate failures.
  const results = await Promise.allSettled([
    ...handlers.map((fn) => Promise.resolve().then(() => fn(envelope.payload, envelope))),
    ...any.map((fn)      => Promise.resolve().then(() => fn(envelope))),
  ]);

  if (_debug) {
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        // eslint-disable-next-line no-console
        console.warn(`[eventBus] handler #${i} for "${envelope.name}" threw:`, r.reason);
      }
    });
  }
}

// ── Public — emit ────────────────────────────────────────────
/**
 * Emit an event.
 *
 * @param {string} eventName
 * @param {any}    payload
 * @param {object} [opts]
 * @param {string} [opts.source]       — module identifier (EVENT_SOURCES.*)
 * @param {string} [opts.severity]     — override severity
 * @param {object} [opts.meta]         — arbitrary debug metadata
 * @param {boolean}[opts.batch]        — coalesce repeats in same tick
 * @param {number} [opts.batchMs]      — batch window (default 0 → microtask)
 * @returns {Promise<void>}
 */
export function emit(eventName, payload = null, opts = {}) {
  if (!eventName) return Promise.resolve();

  if (opts.batch) {
    const ms = opts.batchMs ?? DEFAULT_BATCH_MS;
    const slot = _batchQueue.get(eventName);
    if (slot) {
      slot.payloads.push(payload);
      return Promise.resolve();
    }
    const entry = { payloads: [payload], opts, timer: null };
    _batchQueue.set(eventName, entry);
    const flush = () => {
      _batchQueue.delete(eventName);
      const envelope = buildEnvelope(eventName, entry.payloads, {
        ...opts,
        meta: { ...(opts.meta || {}), batched: true, count: entry.payloads.length },
      });
      deliver(envelope);
    };
    entry.timer = ms <= 0 ? Promise.resolve().then(flush) : setTimeout(flush, ms);
    return Promise.resolve();
  }

  const envelope = buildEnvelope(eventName, payload, opts);
  return deliver(envelope);
}

/**
 * Debounced emit — repeated calls within `ms` collapse into one,
 * with the LAST payload winning. Useful for noisy UI signals.
 */
export function emitDebounced(eventName, payload, opts = {}) {
  const ms = opts.debounceMs ?? DEFAULT_DEBOUNCE;
  const key = `${eventName}::${opts.key ?? ''}`;
  const existing = _debounceMap.get(key);
  if (existing) clearTimeout(existing);
  const handle = setTimeout(() => {
    _debounceMap.delete(key);
    emit(eventName, payload, opts);
  }, ms);
  _debounceMap.set(key, handle);
}

// ── Public — on / once / off ─────────────────────────────────
/**
 * Subscribe to an event (or array of events).
 *
 * @param {string|string[]} eventName
 * @param {(payload:any, envelope:object) => void|Promise<void>} handler
 * @param {object} [opts]
 * @param {number} [opts.debounce]     — wrap handler in trailing debounce
 * @param {boolean}[opts.once]
 * @returns {() => void} unsubscribe
 */
export function on(eventName, handler, opts = {}) {
  if (Array.isArray(eventName)) {
    const offs = eventName.map((n) => on(n, handler, opts));
    return () => offs.forEach((fn) => fn());
  }
  if (typeof handler !== 'function') return () => {};

  let wrapped = handler;

  if (opts.debounce) {
    let t = null;
    wrapped = (payload, envelope) => {
      if (t) clearTimeout(t);
      t = setTimeout(() => handler(payload, envelope), opts.debounce);
    };
  }

  if (opts.once) {
    const original = wrapped;
    wrapped = (payload, envelope) => {
      off(eventName, wrapped);
      return original(payload, envelope);
    };
  }

  if (!_handlers.has(eventName)) _handlers.set(eventName, new Set());
  const set = _handlers.get(eventName);
  set.add(wrapped);

  if (set.size > MAX_HANDLERS_WARN && _debug) {
    // eslint-disable-next-line no-console
    console.warn(`[eventBus] "${eventName}" has ${set.size} handlers — possible leak`);
  }

  return () => off(eventName, wrapped);
}

/** Subscribe once — auto-unsubscribes after first delivery. */
export function once(eventName, handler) {
  return on(eventName, handler, { once: true });
}

/** Remove a specific handler. Safe to call multiple times. */
export function off(eventName, handler) {
  const set = _handlers.get(eventName);
  if (!set) return;
  set.delete(handler);
  if (set.size === 0) _handlers.delete(eventName);
}

/** Subscribe to EVERY event (debug / analytics / mirror transport). */
export function onAny(handler) {
  if (typeof handler !== 'function') return () => {};
  _anyHandlers.add(handler);
  return () => _anyHandlers.delete(handler);
}

/** Remove all handlers (test utility). */
export function clear(eventName) {
  if (eventName) _handlers.delete(eventName);
  else { _handlers.clear(); _anyHandlers.clear(); }
}

// ── Public — transports (future scalability) ─────────────────
/**
 * Register a transport that mirrors every event somewhere else.
 * Used to plug websocket relays, worker queues, push notifs,
 * analytics, AI triggers — without touching emitters.
 *
 * @param {{ name: string, send: (envelope) => void }} transport
 * @returns {() => void} unregister
 */
export function registerTransport(transport) {
  if (!transport || typeof transport.send !== 'function') return () => {};
  _transports.add(transport);
  trace('transport registered:', transport.name);
  return () => { _transports.delete(transport); };
}

// ── Public — debug ───────────────────────────────────────────
export function setDebug(on = true) { _debug = !!on; }
export function isDebug()            { return _debug; }
export function getTimeline()        { return _timeline.slice(); }
export function clearTimeline()      { _timeline = []; }

/** Snapshot of subscriber counts — handy for dev tools. */
export function inspect() {
  const subs = {};
  for (const [name, set] of _handlers.entries()) subs[name] = set.size;
  return {
    subscribers: subs,
    anyHandlers: _anyHandlers.size,
    transports:  Array.from(_transports).map((t) => t.name),
    timelineSize: _timeline.length,
    debug: _debug,
  };
}

// ── Default export — single shared bus ───────────────────────
const eventBus = Object.freeze({
  emit,
  emitDebounced,
  on,
  once,
  off,
  onAny,
  clear,
  registerTransport,
  setDebug,
  isDebug,
  getTimeline,
  clearTimeline,
  inspect,
});

export default eventBus;

// Expose on window in dev so you can poke it from the console.
if (typeof window !== 'undefined' && import.meta?.env?.DEV) {
  window.__eventBus = eventBus;
}
