// =============================================================
// cacheStrategy — Global smart cache management
//
// Provides:
//   • TTL-based in-memory cache with automatic invalidation
//   • Smart hydration (restore from localStorage on page load)
//   • Stale-while-revalidate pattern
//   • Optimistic sync (write immediately, confirm async)
//   • Cache stats + health reporting
//
// Usage:
//   import { cache } from '@/core/maintenance/cache/cacheStrategy';
//   const data = await cache.get('tasks:list', fetchTasks, { ttl: 30_000 });
// =============================================================
import { createLogger } from '@/core/production/productionLogger';

const log = createLogger('CacheStrategy');

// ── Cache entry shape ──────────────────────────────────────────
// { value, fetchedAt, ttl, stale, hits, source }

const _store = new Map();     // key → CacheEntry
const _stats = {
  hits:        0,
  misses:      0,
  staleServed: 0,
  evictions:   0,
  hydrated:    0,
};

const PERSIST_PREFIX  = '__lw_cache:';
const DEFAULT_TTL_MS  = 60_000;      // 1 minute
const DEFAULT_STALE_MS = 300_000;    // 5 minutes (serve stale while revalidating)

// ── Core get/set ───────────────────────────────────────────────
/**
 * Get a value from cache, fetching if needed.
 * Supports stale-while-revalidate: returns stale data immediately
 * and re-fetches in background.
 */
export async function get(key, fetcher, opts = {}) {
  const { ttl = DEFAULT_TTL_MS, staleMs = DEFAULT_STALE_MS, persist = false } = opts;
  const now    = Date.now();
  const entry  = _store.get(key);

  if (entry) {
    const age   = now - entry.fetchedAt;
    const fresh = age < entry.ttl;

    if (fresh) {
      entry.hits++;
      _stats.hits++;
      return entry.value;
    }

    // Stale but within revalidation window — return stale, revalidate bg
    if (age < staleMs && fetcher) {
      _stats.staleServed++;
      entry.stale = true;
      _revalidate(key, fetcher, { ttl, persist }); // background
      return entry.value;
    }
  }

  // Cache miss — fetch now
  _stats.misses++;
  if (!fetcher) return null;

  try {
    const value = await fetcher();
    set(key, value, { ttl, persist });
    return value;
  } catch (err) {
    log.warn(`Cache fetch failed for "${key}"`, { error: err.message });
    // Return stale if available, even if expired
    return entry?.value ?? null;
  }
}

async function _revalidate(key, fetcher, opts) {
  try {
    const value = await fetcher();
    set(key, value, opts);
  } catch (err) {
    log.warn(`Background revalidation failed for "${key}"`, { error: err.message });
  }
}

/**
 * Set a value in the cache.
 */
export function set(key, value, opts = {}) {
  const { ttl = DEFAULT_TTL_MS, persist = false } = opts;

  _store.set(key, {
    value,
    fetchedAt: Date.now(),
    ttl,
    stale:     false,
    hits:      0,
    source:    'fetch',
  });

  if (persist) {
    _persistEntry(key, value, ttl);
  }
}

/**
 * Immediately invalidate one or more keys.
 */
export function invalidate(...keys) {
  for (const key of keys) {
    if (_store.delete(key)) {
      _stats.evictions++;
      log.debug(`Cache invalidated: ${key}`);
    }
    // Remove from localStorage too
    try { localStorage.removeItem(PERSIST_PREFIX + key); } catch { /* ignore */ }
  }
}

/**
 * Invalidate all keys matching a prefix.
 */
export function invalidatePrefix(prefix) {
  const keysToDelete = [..._store.keys()].filter((k) => k.startsWith(prefix));
  keysToDelete.forEach((k) => invalidate(k));
  return keysToDelete.length;
}

/**
 * Optimistic update — write immediately to cache; confirm later.
 * @returns {function} rollback — call if the async op fails
 */
export function optimisticSet(key, value, opts = {}) {
  const previous = _store.get(key)?.value ?? null;
  set(key, value, opts);

  const rollback = () => {
    if (previous !== null) set(key, previous, opts);
    else invalidate(key);
    log.warn(`Optimistic update rolled back for "${key}"`);
  };

  return rollback;
}

// ── Persistence layer ──────────────────────────────────────────
function _persistEntry(key, value, ttl) {
  try {
    localStorage.setItem(PERSIST_PREFIX + key, JSON.stringify({
      value,
      fetchedAt: Date.now(),
      ttl,
    }));
  } catch { /* quota */ }
}

/**
 * Hydrate cache from localStorage on startup.
 * Only loads entries that are not yet expired.
 */
export function hydrateFromStorage(keys = []) {
  const now     = Date.now();
  let   loaded  = 0;

  const targetKeys = keys.length > 0 ? keys : Object.keys(localStorage)
    .filter((k) => k.startsWith(PERSIST_PREFIX))
    .map((k) => k.slice(PERSIST_PREFIX.length));

  for (const key of targetKeys) {
    const raw = localStorage.getItem(PERSIST_PREFIX + key);
    if (!raw) continue;
    try {
      const { value, fetchedAt, ttl } = JSON.parse(raw);
      const age = now - fetchedAt;
      if (age < ttl) {
        _store.set(key, { value, fetchedAt, ttl, stale: false, hits: 0, source: 'hydrated' });
        loaded++;
        _stats.hydrated++;
      } else {
        // Expired — remove from storage
        localStorage.removeItem(PERSIST_PREFIX + key);
      }
    } catch {
      localStorage.removeItem(PERSIST_PREFIX + key);
    }
  }

  log.info(`Cache hydrated: ${loaded} entries loaded from storage`);
  return loaded;
}

// ── Stale data recovery ────────────────────────────────────────
/**
 * Recover stale entries from localStorage even if expired.
 * Used as last-resort data recovery (e.g. during offline mode).
 */
export function recoverStaleEntries(prefix = '') {
  const recovered = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith(PERSIST_PREFIX)) continue;
    const key = k.slice(PERSIST_PREFIX.length);
    if (prefix && !key.startsWith(prefix)) continue;

    const raw = localStorage.getItem(k);
    try {
      const { value, fetchedAt, ttl } = JSON.parse(raw);
      if (!_store.has(key)) {
        // Load stale — mark explicitly
        _store.set(key, { value, fetchedAt, ttl, stale: true, hits: 0, source: 'recovered' });
        recovered.push({ key, ageMs: Date.now() - fetchedAt });
      }
    } catch { /* ignore */ }
  }

  log.info(`Stale cache recovery: ${recovered.length} entries loaded`);
  return recovered;
}

// ── Eviction + cleanup ─────────────────────────────────────────
/**
 * Evict all expired entries. Call on app startup and periodically.
 */
export function evictExpired() {
  const now   = Date.now();
  let   count = 0;

  for (const [key, entry] of _store.entries()) {
    if (now - entry.fetchedAt > entry.ttl * 2) {
      _store.delete(key);
      _stats.evictions++;
      count++;
    }
  }

  if (count > 0) log.debug(`Evicted ${count} expired cache entries`);
  return count;
}

// Schedule periodic eviction every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(evictExpired, 5 * 60_000);
}

// ── Inspection ────────────────────────────────────────────────
export function getCacheStats() {
  const now    = Date.now();
  const entries = [..._store.entries()].map(([key, entry]) => ({
    key,
    ageMs:    now - entry.fetchedAt,
    ttlMs:    entry.ttl,
    fresh:    now - entry.fetchedAt < entry.ttl,
    stale:    entry.stale,
    hits:     entry.hits,
    source:   entry.source,
  }));

  return {
    size:          _store.size,
    stats:         { ..._stats },
    hitRatio:      _stats.hits + _stats.misses > 0
      ? Math.round(_stats.hits / (_stats.hits + _stats.misses) * 100)
      : 0,
    freshEntries:  entries.filter((e) => e.fresh).length,
    staleEntries:  entries.filter((e) => e.stale).length,
    entries,
  };
}

export function listCachedKeys() { return [..._store.keys()]; }
export function peek(key)        { return _store.get(key)?.value ?? null; }
export function has(key)         { return _store.has(key); }

export function clearCache() {
  _store.clear();
  log.warn('Cache cleared');
}

// ── Named cache facade (for ergonomic usage) ──────────────────
export const cache = { get, set, invalidate, invalidatePrefix, optimisticSet, peek, has, clearCache };
