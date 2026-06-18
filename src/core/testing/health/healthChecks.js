// =============================================================
// healthChecks — Automated system readiness verification
//
// Checks: auth, database, realtime, queue, notifications,
// storage, offline sync, event bus, action locks.
//
// Each check returns: { name, status, message, durationMs, detail }
// status: 'pass' | 'fail' | 'warn' | 'skip'
//
// Usage:
//   const results = await runAllHealthChecks(supabaseClient);
// =============================================================
import { createLogger }         from '@/core/production/productionLogger';
import { captureError }          from '@/core/production/errorReporter';
import { emit, on }              from '@/core/events/eventBus';
import { getOfflineQueueStats }  from '@/core/production/offlineRecovery';
import { inspectRealtime }       from '@/core/production/realtimeRecovery';
import { inspectLocks }          from '@/core/production/actionLock';
import { getErrors }             from '@/core/production/errorReporter';

const log = createLogger('HealthChecks');

// ── Check runner ───────────────────────────────────────────────
async function runCheck(name, fn, timeoutMs = 5_000) {
  const start = performance.now();
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs)
    );
    const result = await Promise.race([fn(), timeoutPromise]);
    return {
      name,
      status:     result?.status ?? 'pass',
      message:    result?.message ?? 'OK',
      detail:     result?.detail ?? null,
      durationMs: Math.round(performance.now() - start),
    };
  } catch (err) {
    return {
      name,
      status:     'fail',
      message:    err?.message ?? 'Unknown error',
      detail:     null,
      durationMs: Math.round(performance.now() - start),
    };
  }
}

// ── Individual checks ──────────────────────────────────────────

async function checkAuth(supabase) {
  if (!supabase) return { status: 'skip', message: 'No Supabase client provided' };
  const { data, error } = await supabase.auth.getSession();
  if (error) return { status: 'fail', message: error.message };
  return {
    status:  data?.session ? 'pass' : 'warn',
    message: data?.session ? 'Session active' : 'No active session (expected for public health check)',
    detail:  { hasSession: !!data?.session },
  };
}

async function checkDatabase(supabase) {
  if (!supabase) return { status: 'skip', message: 'No Supabase client' };
  const start = Date.now();
  const { error } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
  const latencyMs = Date.now() - start;
  if (error) return { status: 'fail', message: error.message, detail: { code: error.code } };
  return {
    status:  latencyMs < 2000 ? 'pass' : 'warn',
    message: latencyMs < 2000 ? `DB reachable (${latencyMs}ms)` : `DB slow: ${latencyMs}ms`,
    detail:  { latencyMs },
  };
}

async function checkRealtime() {
  const snap = inspectRealtime();
  const ok   = snap.status === 'connected';
  return {
    status:  ok ? 'pass' : snap.status === 'reconnecting' ? 'warn' : 'fail',
    message: ok
      ? `${snap.channels.length} channel(s) connected`
      : `Realtime ${snap.status} (${snap.reconnectCount} retries)`,
    detail: snap,
  };
}

async function checkQueue() {
  const stats  = getOfflineQueueStats();
  const issues = stats.deadLetterSize > 0 || stats.queueSize > 10;
  return {
    status:  issues ? 'warn' : 'pass',
    message: issues
      ? `Queue: ${stats.queueSize} pending, ${stats.deadLetterSize} dead-letter`
      : `Queue healthy (${stats.queueSize} pending)`,
    detail: stats,
  };
}

async function checkEventBus() {
  return new Promise((resolve) => {
    const key    = `__hc_ping_${Date.now()}`;
    const start  = performance.now();
    let replied  = false;

    const unsub = on(key, () => {
      replied = true;
      const latencyMs = Math.round(performance.now() - start);
      resolve({
        status:  latencyMs < 50 ? 'pass' : 'warn',
        message: `Event bus responded in ${latencyMs}ms`,
        detail:  { latencyMs },
      });
    });

    emit(key, { ping: true });

    // Timeout: if no response in 500ms, event bus is broken
    setTimeout(() => {
      unsub?.();
      if (!replied) {
        resolve({ status: 'fail', message: 'Event bus did not respond to ping' });
      }
    }, 500);
  });
}

async function checkStorage() {
  if (typeof window === 'undefined') return { status: 'skip', message: 'Not in browser' };
  try {
    const key = '__hc_storage_test';
    localStorage.setItem(key, '1');
    const val = localStorage.getItem(key);
    localStorage.removeItem(key);
    if (val !== '1') return { status: 'fail', message: 'localStorage read/write mismatch' };

    // Check used space estimate
    let used = 0;
    for (const k in localStorage) {
      if (Object.prototype.hasOwnProperty.call(localStorage, k)) used += (localStorage[k]?.length ?? 0) + k.length;
    }
    const usedKB = Math.round(used / 1024);
    return {
      status:  usedKB < 3000 ? 'pass' : 'warn',
      message: `localStorage OK (${usedKB}KB used)`,
      detail:  { usedKB },
    };
  } catch (err) {
    return { status: 'fail', message: `Storage error: ${err.message}` };
  }
}

async function checkOfflineSync() {
  const stats = getOfflineQueueStats();
  if (!navigator.onLine) {
    return { status: 'warn', message: `Offline — ${stats.queueSize} action(s) queued`, detail: stats };
  }
  if (stats.deadLetterSize > 5) {
    return { status: 'fail', message: `${stats.deadLetterSize} actions failed permanently`, detail: stats };
  }
  return { status: 'pass', message: 'Offline sync ready', detail: stats };
}

async function checkActionLocks() {
  const locks  = inspectLocks();
  const stale  = locks.filter((l) => l.expired);
  const active = locks.filter((l) => !l.expired);
  return {
    status:  stale.length > 10 ? 'warn' : 'pass',
    message: `${active.length} active lock(s), ${stale.length} stale`,
    detail:  { active: active.length, stale: stale.length },
  };
}

async function checkErrorRate() {
  const errors = getErrors(50);
  const recent = errors.filter((e) => Date.now() - e.timestamp < 60_000);
  const fatals = recent.filter((e) => e.severity === 'fatal').length;
  return {
    status:  fatals > 0 ? 'fail' : recent.length > 10 ? 'warn' : 'pass',
    message: fatals > 0
      ? `${fatals} fatal error(s) in last 60s`
      : `${recent.length} error(s) in last 60s`,
    detail: { total: errors.length, recentCount: recent.length, fatals },
  };
}

async function checkMemory() {
  const mem = performance?.memory;
  if (!mem) return { status: 'skip', message: 'performance.memory not available' };
  const usedMB  = Math.round(mem.usedJSHeapSize / 1_048_576);
  const limitMB = Math.round(mem.jsHeapSizeLimit / 1_048_576);
  const ratio   = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
  return {
    status:  ratio > 0.9 ? 'fail' : ratio > 0.75 ? 'warn' : 'pass',
    message: `JS heap: ${usedMB}MB / ${limitMB}MB (${Math.round(ratio * 100)}%)`,
    detail:  { usedMB, limitMB, ratio },
  };
}

// ── Master runner ──────────────────────────────────────────────
const CHECKS = [
  { name: 'Auth',         fn: (sb) => checkAuth(sb) },
  { name: 'Database',     fn: (sb) => checkDatabase(sb) },
  { name: 'Realtime',     fn: ()   => checkRealtime() },
  { name: 'Queue',        fn: ()   => checkQueue() },
  { name: 'Event Bus',    fn: ()   => checkEventBus() },
  { name: 'Storage',      fn: ()   => checkStorage() },
  { name: 'Offline Sync', fn: ()   => checkOfflineSync() },
  { name: 'Action Locks', fn: ()   => checkActionLocks() },
  { name: 'Error Rate',   fn: ()   => checkErrorRate() },
  { name: 'Memory',       fn: ()   => checkMemory() },
];

/**
 * Run all health checks.
 * @param {SupabaseClient|null} supabaseClient
 * @returns {Promise<{ results, summary }>}
 */
export async function runAllHealthChecks(supabaseClient = null) {
  log.info('Running health checks...');
  const start   = performance.now();

  const results = await Promise.all(
    CHECKS.map((check) => runCheck(check.name, () => check.fn(supabaseClient)))
  );

  const summary = {
    total:      results.length,
    pass:       results.filter((r) => r.status === 'pass').length,
    warn:       results.filter((r) => r.status === 'warn').length,
    fail:       results.filter((r) => r.status === 'fail').length,
    skip:       results.filter((r) => r.status === 'skip').length,
    durationMs: Math.round(performance.now() - start),
    overall:    results.some((r) => r.status === 'fail') ? 'fail'
              : results.some((r) => r.status === 'warn') ? 'warn'
              : 'pass',
  };

  log.info(`Health checks done: ${summary.pass} pass, ${summary.warn} warn, ${summary.fail} fail`, { durationMs: summary.durationMs });
  emit('qa:health_checks_complete', { summary, results });
  return { results, summary };
}

/** Run a single check by name. */
export async function runCheck_byName(name, supabaseClient = null) {
  const check = CHECKS.find((c) => c.name === name);
  if (!check) return { name, status: 'skip', message: `Check "${name}" not found` };
  return runCheck(check.name, () => check.fn(supabaseClient));
}

/** Get list of all check names. */
export function getCheckNames() { return CHECKS.map((c) => c.name); }
