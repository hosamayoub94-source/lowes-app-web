// =============================================================
// operationalDashboard — Aggregated system QA data layer
//
// Collects data from every testing subsystem and returns a
// unified snapshot for the OperationalDashboard UI component.
// All reads are non-destructive — safe to call at any time.
// =============================================================
import { createLogger }           from '@/core/production/productionLogger';
import { runAllHealthChecks }      from '../health/healthChecks';
import { runDeploymentReadiness }  from '../environment/deploymentReadiness';
import { runReleaseChecklist }     from '../release/releaseChecklist';
import { getStats, getSlowOperations } from '../performance/benchmarkLayer';
import { getDebugSummary }         from '../debug/debugToolkit';
import { getMigrationStatus }      from '../migration/safeMigrationRunner';
import { getActiveStressTests }    from '../stress/stressTestUtils';
import { getOfflineQueueStats }    from '@/core/production/offlineRecovery';
import { inspectRealtime }         from '@/core/production/realtimeRecovery';
import { getErrors }               from '@/core/production/errorReporter';

const log = createLogger('OperationalDashboard');

// ── Snapshot ───────────────────────────────────────────────────
/**
 * Build a full system snapshot.
 * @param {{ supabase?: object }} opts
 * @returns {Promise<SystemSnapshot>}
 */
export async function buildSystemSnapshot(opts = {}) {
  const startedAt = Date.now();
  log.info('Building system snapshot...');

  // Run async checks in parallel
  const [healthResult, deploymentResult, checklist] = await Promise.allSettled([
    runAllHealthChecks(opts.supabase),
    runDeploymentReadiness(opts.supabase),
    Promise.resolve(runReleaseChecklist()),
  ]);

  // Collect sync data
  const perfStats    = getStats();
  const slowOps      = getSlowOperations(300);
  const debugSummary = getDebugSummary();
  const migrations   = getMigrationStatus();
  const activeStress = getActiveStressTests();
  const queueStats   = _safeGet(getOfflineQueueStats, {});
  const realtimeInfo = _safeGet(inspectRealtime, {});
  const recentErrors = _safeGet(() => getErrors(10), []);

  const health     = healthResult.status     === 'fulfilled' ? healthResult.value     : { results: [], overall: 'error' };
  const deployment = deploymentResult.status === 'fulfilled' ? deploymentResult.value : { ready: false, checks: [] };
  const release    = checklist.status        === 'fulfilled' ? checklist.value        : { overall: 'ERROR', summary: {} };

  const snapshot = {
    generatedAt:  startedAt,
    durationMs:   Date.now() - startedAt,

    // ── Overall status ─────────────────────────────────────────
    overall: _computeOverall(health, deployment, release),

    // ── Health ─────────────────────────────────────────────────
    health: {
      overall:  health.overall ?? 'unknown',
      results:  health.results ?? [],
      failed:   (health.results ?? []).filter((r) => r.status === 'fail'),
      warned:   (health.results ?? []).filter((r) => r.status === 'warn'),
    },

    // ── Deployment / Environment ───────────────────────────────
    deployment: {
      ready:         deployment.ready,
      blockers:      deployment.blockers ?? [],
      checks:        deployment.checks   ?? [],
      missingEnvs:   (deployment.checks ?? []).filter((c) => c.status === 'fail').map((c) => c.name),
    },

    // ── Release checklist ──────────────────────────────────────
    release: {
      overall:  release.overall,
      summary:  release.summary,
      items:    release.items ?? [],
      failed:   (release.items ?? []).filter((i) => i.status === 'fail'),
    },

    // ── Performance ────────────────────────────────────────────
    performance: {
      stats:    perfStats,
      slowOps,
      hasSlowOps: slowOps.length > 0,
    },

    // ── Queue ──────────────────────────────────────────────────
    queue: {
      ...queueStats,
      hasDeadLetters: (queueStats.dead ?? 0) > 0,
    },

    // ── Realtime ───────────────────────────────────────────────
    realtime: {
      ...realtimeInfo,
      reconnects: realtimeInfo.reconnects ?? 0,
    },

    // ── Migrations ─────────────────────────────────────────────
    migrations: {
      all:     migrations,
      failed:  migrations.filter((m) => m.status === 'fail'),
      pending: migrations.filter((m) => m.status === 'pending'),
    },

    // ── Debug ──────────────────────────────────────────────────
    debug: {
      ...debugSummary,
      hotspots: debugSummary.hotspots ?? [],
    },

    // ── Stress tests ───────────────────────────────────────────
    stress: {
      active: activeStress,
      running: activeStress.length > 0,
    },

    // ── Errors ─────────────────────────────────────────────────
    errors: {
      recent: recentErrors,
      count:  recentErrors.length,
    },
  };

  log.info(`Snapshot built in ${snapshot.durationMs}ms — overall: ${snapshot.overall}`);
  return snapshot;
}

// ── Helpers ────────────────────────────────────────────────────
function _safeGet(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

function _computeOverall(health, deployment, release) {
  if (health.overall === 'critical' || !deployment.ready || release.overall === 'BLOCKED') return 'BLOCKED';
  if (health.overall === 'degraded' || release.overall === 'CAUTION') return 'CAUTION';
  if (health.overall === 'healthy'  && deployment.ready && release.overall === 'READY') return 'READY';
  return 'UNKNOWN';
}

// ── Quick summary (lightweight, sync) ─────────────────────────
export function getQuickStatus() {
  const queueStats   = _safeGet(getOfflineQueueStats, {});
  const recentErrors = _safeGet(() => getErrors(5), []);
  const migrations   = _safeGet(getMigrationStatus, []);
  const slowOps      = _safeGet(() => getSlowOperations(500), []);

  return {
    ts:            Date.now(),
    queuePending:  queueStats.pending ?? 0,
    queueDead:     queueStats.dead    ?? 0,
    recentErrors:  recentErrors.length,
    migrationsFailed: migrations.filter((m) => m.status === 'fail').length,
    slowOpsCount:  slowOps.length,
    stressRunning: getActiveStressTests().length > 0,
  };
}
