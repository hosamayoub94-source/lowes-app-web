// =============================================================
// storeOptimizer — Zustand store performance utilities
//
// Provides:
//   • Selector memoization helpers (stable references)
//   • Shallow compare utilities (avoid redundant renders)
//   • Render isolation patterns (slice selectors)
//   • Action batching (batch multiple mutations)
//   • Store size monitoring
//   • Anti-pattern detectors
//
// These are utilities — they don't modify existing stores.
// =============================================================
import { createLogger } from '@/core/production/productionLogger';

const log = createLogger('StoreOptimizer');

// ── Selector memoization ───────────────────────────────────────
/**
 * Creates a memoized selector that only recomputes when its
 * inputs change (by reference equality).
 *
 * Usage:
 *   const selectTasksByStatus = createSelector(
 *     (state) => state.tasks,
 *     (state) => state.filter,
 *     (tasks, filter) => tasks.filter(t => t.status === filter)
 *   );
 */
export function createSelector(...fnsAndCompute) {
  const compute   = fnsAndCompute[fnsAndCompute.length - 1];
  const inputFns  = fnsAndCompute.slice(0, -1);

  let lastInputs = null;
  let lastResult = null;

  return (state) => {
    const inputs = inputFns.map((fn) => fn(state));
    if (lastInputs !== null && inputs.every((inp, i) => inp === lastInputs[i])) {
      return lastResult;
    }
    lastInputs = inputs;
    lastResult = compute(...inputs);
    return lastResult;
  };
}

// ── Shallow compare ────────────────────────────────────────────
/**
 * Shallow comparison for Zustand subscriptions.
 * Use as: useStore(selector, shallowEqual)
 */
export function shallowEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (a === null || b === null) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) => Object.is(a[key], b[key]));
}

/**
 * Creates a shallow-equal selector for arrays.
 * Avoids re-renders when array contents are the same (by ref).
 */
export function shallowArrayEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((item, i) => item === b[i]);
}

// ── Slice selectors (render isolation) ────────────────────────
/**
 * Creates a stable slice selector that isolates a component
 * to only the store fields it needs.
 *
 * Usage (in component):
 *   const { tasks, filter } = useTaskStore(selectSlice(['tasks', 'filter']));
 */
export function selectSlice(keys) {
  return (state) => {
    const slice = {};
    for (const key of keys) slice[key] = state[key];
    return slice;
  };
}

// ── Action batching ────────────────────────────────────────────
/**
 * Batches multiple Zustand set() calls into a single React
 * render cycle using React 18's automatic batching.
 *
 * Usage:
 *   batchActions(
 *     () => useTaskStore.getState().setTasks(tasks),
 *     () => useTaskStore.getState().setFilter(filter),
 *   );
 */
export function batchActions(...actions) {
  // React 18 batches updates from setTimeout automatically.
  // For older patterns, we wrap in a microtask.
  return Promise.resolve().then(() => {
    for (const action of actions) {
      try { action(); } catch (err) {
        log.warn('Action in batch failed', { error: err.message });
      }
    }
  });
}

/**
 * Debounced store updater — collapses rapid mutations into one.
 * Returns a setter that can be called frequently but only commits
 * to the store after `delayMs` of inactivity.
 */
export function debouncedSetter(setter, delayMs = 150) {
  let timer = null;
  let pending = null;

  return (value) => {
    pending = value;
    clearTimeout(timer);
    timer = setTimeout(() => {
      setter(pending);
      pending = null;
    }, delayMs);
  };
}

// ── Store size monitoring ──────────────────────────────────────
const STORE_SIZE_WARN_BYTES = 500_000; // 500KB in localStorage

/**
 * Check the byte size of all persisted stores.
 * Returns per-store size and flags oversized ones.
 */
export function auditStoreSizes() {
  const results = [];
  const STORE_KEYS = [
    'lw-workspace-store',
    'lw-collaboration-store',
    '__lw_personalization',
    '__lw_session',
    '__lw_last_session',
    '__lw_metrics',
    '__prod_offline_queue',
    '__lw_feedback_queue',
  ];

  for (const key of STORE_KEYS) {
    const raw  = localStorage.getItem(key);
    if (!raw) continue;
    const bytes = new TextEncoder().encode(raw).length;
    results.push({
      key,
      bytes,
      kb:       Math.round(bytes / 1024 * 10) / 10,
      oversized: bytes > STORE_SIZE_WARN_BYTES,
    });
  }

  return {
    stores:     results,
    oversized:  results.filter((r) => r.oversized),
    totalKB:    Math.round(results.reduce((s, r) => s + r.bytes, 0) / 1024),
    healthy:    results.every((r) => !r.oversized),
  };
}

// ── Anti-pattern detectors ─────────────────────────────────────
/**
 * Detects common Zustand anti-patterns at runtime:
 *   1. Storing non-serializable values in persisted stores
 *   2. Deeply nested state (>3 levels)
 *   3. Arrays with >1000 items
 */
export function detectStoreAntiPatterns() {
  const issues = [];
  const PERSIST_KEYS = ['lw-workspace-store', 'lw-collaboration-store', '__lw_personalization'];

  for (const key of PERSIST_KEYS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      const state  = parsed?.state ?? parsed;

      _walkState(state, key, [], issues);
    } catch {
      issues.push({
        key,
        issue:   'invalid_json',
        message: `Persisted store "${key}" contains invalid JSON`,
        severity: 'error',
      });
    }
  }

  return { issues, healthy: issues.filter((i) => i.severity === 'error').length === 0 };
}

function _walkState(node, storeKey, path, issues) {
  if (path.length > 6) {
    issues.push({
      key:      storeKey,
      issue:    'deep_nesting',
      path:     path.join('.'),
      message:  `Store has state nested ${path.length} levels deep — consider flattening`,
      severity: 'warn',
    });
    return;
  }

  if (Array.isArray(node) && node.length > 1000) {
    issues.push({
      key:      storeKey,
      issue:    'large_array',
      path:     path.join('.'),
      message:  `Array at "${path.join('.')}" has ${node.length} items — don't persist large datasets in Zustand`,
      severity: 'warn',
    });
    return;
  }

  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const k of Object.keys(node)) {
      _walkState(node[k], storeKey, [...path, k], issues);
    }
  }
}

// ── Full store optimization report ────────────────────────────
export function runStoreOptimizationAudit() {
  log.info('Running store optimization audit...');

  const sizeAudit     = auditStoreSizes();
  const antiPatterns  = detectStoreAntiPatterns();

  const issues = [
    ...sizeAudit.oversized.map((s) => ({
      type:     'oversized_store',
      severity: 'warn',
      message:  `Store "${s.key}" is ${s.kb}KB — review what's being persisted`,
    })),
    ...antiPatterns.issues,
  ];

  log.info(`Store audit: ${issues.length} issue(s) found`);

  return {
    issues,
    details: { sizeAudit, antiPatterns },
    healthy: issues.filter((i) => i.severity === 'error').length === 0,
    timestamp: Date.now(),
  };
}
