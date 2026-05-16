// =============================================================
// safeMigrationRunner — localStorage / config migration tracking
//
// Handles schema migrations for localStorage-persisted Zustand
// stores and other client-side data structures. Ensures users
// upgrading from older app versions don't get corrupted state.
//
// Usage:
//   register({ id: 'v1_to_v2', description: '...', up: (data) => newData, validate: (data) => bool });
//   runPendingMigrations();
// =============================================================
import { createLogger } from '@/core/production/productionLogger';

const log          = createLogger('MigrationRunner');
const REGISTRY_KEY = '__lw_migrations_ran';

// ── Migration registry ─────────────────────────────────────────
const _registry = [];   // ordered list of { id, description, targets, up, validate, rollback }

// ── Track what's been run ──────────────────────────────────────
function _getRan() {
  try { return JSON.parse(localStorage.getItem(REGISTRY_KEY) ?? '[]'); } catch { return []; }
}
function _markRan(id, status = 'success', meta = {}) {
  const ran = _getRan();
  ran.push({ id, status, ranAt: Date.now(), ...meta });
  try { localStorage.setItem(REGISTRY_KEY, JSON.stringify(ran)); } catch { /* quota */ }
}

// ── Register a migration ───────────────────────────────────────
/**
 * Register a migration.
 * @param {{ id, description, targets, up, validate?, rollback? }} migration
 *   - id:          unique migration ID (e.g. 'v1.2_add_compactMode')
 *   - description: human-readable description
 *   - targets:     array of localStorage keys this migration touches
 *   - up:          function(currentData) → migratedData (runs on each target key)
 *   - validate:    function(data) → bool  — validates result after migration
 *   - rollback:    function(originalData) → data  — restores on failure
 */
export function registerMigration(migration) {
  if (_registry.find((m) => m.id === migration.id)) {
    log.warn(`Migration already registered: ${migration.id}`);
    return;
  }
  _registry.push(migration);
}

// ── Run pending migrations ─────────────────────────────────────
export function runPendingMigrations() {
  const ran     = _getRan();
  const ranIds  = ran.map((r) => r.id);
  const pending = _registry.filter((m) => !ranIds.includes(m.id));

  if (pending.length === 0) {
    log.debug('No pending migrations');
    return { ran: 0, skipped: _registry.length, results: [] };
  }

  log.info(`Running ${pending.length} pending migration(s)`);
  const results = [];

  for (const migration of pending) {
    const result = _runSingle(migration);
    results.push(result);
    if (result.status === 'fail') {
      log.error(`Migration failed: ${migration.id} — stopping`);
      break; // don't run further migrations after a failure
    }
  }

  return { ran: results.filter((r) => r.status === 'success').length, results };
}

function _runSingle(migration) {
  log.info(`Running migration: ${migration.id} — ${migration.description}`);
  const warnings = [];
  const targets  = migration.targets ?? [];

  // Safety check: warn if target keys don't exist
  for (const key of targets) {
    if (localStorage.getItem(key) === null) {
      warnings.push(`Target key "${key}" not found in localStorage — migration may be a no-op`);
    }
  }

  // Execute migration per target
  for (const key of targets) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;

    let current;
    try { current = JSON.parse(raw); } catch { continue; }

    const original = JSON.parse(raw); // backup

    try {
      const migrated = migration.up(current, key);

      // Validate result
      if (migration.validate && !migration.validate(migrated)) {
        throw new Error(`Validation failed after migration for key "${key}"`);
      }

      localStorage.setItem(key, JSON.stringify(migrated));
      log.debug(`Migration applied to "${key}"`);
    } catch (err) {
      // Rollback
      if (migration.rollback) {
        try {
          const rolled = migration.rollback(original, key);
          localStorage.setItem(key, JSON.stringify(rolled));
          log.warn(`Migration rolled back for "${key}"`);
        } catch (rbErr) {
          log.error(`Rollback also failed for "${key}"`, { error: rbErr.message });
          // Restore original as last resort
          localStorage.setItem(key, JSON.stringify(original));
        }
      }

      _markRan(migration.id, 'fail', { error: err.message, warnings });
      return { id: migration.id, status: 'fail', error: err.message, warnings };
    }
  }

  _markRan(migration.id, 'success', { warnings });
  return { id: migration.id, status: 'success', warnings };
}

// ── Inspection ─────────────────────────────────────────────────
export function getMigrationStatus() {
  const ran     = _getRan();
  const ranIds  = ran.map((r) => r.id);
  return _registry.map((m) => {
    const record = ran.find((r) => r.id === m.id);
    return {
      id:          m.id,
      description: m.description,
      targets:     m.targets ?? [],
      status:      record?.status ?? 'pending',
      ranAt:       record?.ranAt ?? null,
      warnings:    record?.warnings ?? [],
    };
  });
}

export function clearMigrationHistory() {
  localStorage.removeItem(REGISTRY_KEY);
  log.warn('Migration history cleared — all migrations will re-run');
}

// ── Built-in migrations for known schema changes ───────────────

// Example: migrate old personalization store that lacked accessibilityMode
registerMigration({
  id:          'v1_personalization_accessibility',
  description: 'Add accessibilityMode field to personalization store',
  targets:     ['__lw_personalization'],
  up(data) {
    if (data?.state && data.state.accessibilityMode === undefined) {
      data.state.accessibilityMode = false;
    }
    return data;
  },
  validate: (data) => data?.state?.accessibilityMode !== undefined,
});

registerMigration({
  id:          'v1_session_openDrawers',
  description: 'Add openDrawers array to session recovery',
  targets:     ['__lw_session', '__lw_last_session'],
  up(data) {
    if (data && !Array.isArray(data.openDrawers)) {
      data.openDrawers = [];
    }
    return data;
  },
});
