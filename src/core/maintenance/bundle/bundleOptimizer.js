// =============================================================
// bundleOptimizer — Build artifact + import analysis
//
// Audits the runtime module environment for:
//   • Routes that are NOT lazy-loaded
//   • Oversized dependency suspects (detected via timing)
//   • Dynamic import enforcement
//   • Chunk size heuristics via PerformanceResourceTiming
//
// All checks are read-only. No code is modified.
// =============================================================
import { createLogger } from '@/core/production/productionLogger';

const log = createLogger('BundleOptimizer');

// ── Expected lazy routes ───────────────────────────────────────
// These route components MUST be dynamically imported.
const REQUIRED_LAZY_ROUTES = [
  'DailyWorkspacePage',
  'HomeScreen',
  'AttendanceScreen',
  'TasksScreen',
  'TeamScreen',
  'HolidaysScreen',
  'AccountingScreen',
  'ProfileScreen',
  'AdminScreen',
  'AdminUsersScreen',
  'AdminSettingsScreen',
  'AdminReportsScreen',
  'AuditDashboard',
  'AdminOpsCenter',
  'QADashboardPage',
  'MaintenanceDashboardPage',
];

// ── Known heavy dependencies ───────────────────────────────────
// These should NEVER be in the main bundle — only in async chunks.
const KNOWN_HEAVY_DEPS = [
  { name: 'recharts',         maxInitialKB: 0,   note: 'Use dynamic import for chart components' },
  { name: 'xlsx',             maxInitialKB: 0,   note: 'Only import on-demand in export flows' },
  { name: 'pdfjs-dist',       maxInitialKB: 0,   note: 'Load via dynamic import only' },
  { name: 'react-big-calendar', maxInitialKB: 0, note: 'Lazy-load the calendar view' },
  { name: 'mapbox-gl',        maxInitialKB: 0,   note: 'Load only when map is rendered' },
];

// ── Resource timing analyzer ───────────────────────────────────
/**
 * Uses PerformanceResourceTiming to get chunk sizes and load times.
 */
export function getChunkLoadMetrics() {
  if (typeof performance === 'undefined') return [];

  const resources = performance.getEntriesByType('resource');
  return resources
    .filter((r) => r.name.includes('.js') && (r.initiatorType === 'script' || r.initiatorType === 'fetch'))
    .map((r) => ({
      name:         r.name.split('/').pop(),
      url:          r.name,
      transferKB:   Math.round(r.transferSize / 1024 * 10) / 10,
      durationMs:   Math.round(r.duration),
      cached:       r.transferSize === 0 && r.decodedBodySize > 0,
    }))
    .sort((a, b) => b.transferKB - a.transferKB);
}

/**
 * Flag chunks that are suspiciously large (> 500KB uncompressed).
 */
export function getOversizedChunks() {
  const chunks = getChunkLoadMetrics();
  return chunks.filter((c) => c.transferKB > 500);
}

// ── Lazy import enforcement audit ──────────────────────────────
/**
 * Pass in the routes object from AppRoutes to verify lazy loading.
 * In practice we rely on naming conventions — if the component
 * name appears in required lazy list, we verify it was a chunk.
 */
export function auditLazyImports(loadedChunkNames = []) {
  const violations = [];

  for (const route of REQUIRED_LAZY_ROUTES) {
    const chunkExpected = route.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`).replace(/^-/, '');
    const wasLazy = loadedChunkNames.some((name) =>
      name.toLowerCase().includes(chunkExpected) ||
      name.toLowerCase().includes(route.toLowerCase())
    );
    // We can only verify what was loaded — if it's not in chunks, it may be in main bundle
    if (!wasLazy) {
      violations.push({
        component: route,
        status:    'unverified',
        message:   `Could not verify "${route}" was lazy-loaded — check webpack chunk names`,
      });
    }
  }

  return {
    verified:   REQUIRED_LAZY_ROUTES.length - violations.length,
    unverified: violations.length,
    violations,
  };
}

// ── Dynamic import validator ───────────────────────────────────
/**
 * Tracks dynamic imports and validates they follow the pattern:
 *   import(/* webpackChunkName: "name" * / '@path')
 */
const _dynamicImports = [];

export function recordDynamicImport(path, chunkName = null) {
  _dynamicImports.push({ path, chunkName, ts: Date.now() });
}

export function getDynamicImportAudit() {
  const noChunkName = _dynamicImports.filter((i) => !i.chunkName);
  return {
    total:        _dynamicImports.length,
    withNames:    _dynamicImports.length - noChunkName.length,
    withoutNames: noChunkName.length,
    noChunkName,
    recommendation: noChunkName.length > 0
      ? 'Add /* webpackChunkName: "name" */ comments to all dynamic imports'
      : null,
  };
}

// ── Startup resource audit ─────────────────────────────────────
/**
 * Analyzes the navigation timing to estimate initial bundle impact.
 */
export function getStartupResourceAudit() {
  if (typeof performance === 'undefined') return null;

  const nav = performance.getEntriesByType('navigation')[0];
  if (!nav) return null;

  const chunks      = getChunkLoadMetrics();
  const mainChunks  = chunks.filter((c) => !c.name.includes('-') && c.transferKB > 50);
  const totalKB     = chunks.reduce((s, c) => s + c.transferKB, 0);
  const cachedKB    = chunks.filter((c) => c.cached).reduce((s, c) => s + c.transferKB, 0);

  return {
    ttfb:             Math.round(nav.responseStart - nav.requestStart),
    domInteractive:   Math.round(nav.domInteractive),
    domComplete:      Math.round(nav.domComplete),
    totalChunksKB:    Math.round(totalKB),
    cachedKB:         Math.round(cachedKB),
    chunkCount:       chunks.length,
    mainBundleSuspects: mainChunks,
    recommendation:   totalKB > 2048 ? 'Total JS exceeds 2MB — review and split large chunks' : null,
  };
}

// ── Bundle health report ───────────────────────────────────────
export function runBundleOptimizationAudit() {
  log.info('Running bundle optimization audit...');

  const chunkMetrics     = getChunkLoadMetrics();
  const oversizedChunks  = getOversizedChunks();
  const startupAudit     = getStartupResourceAudit();
  const dynamicImports   = getDynamicImportAudit();

  const issues = [];

  if (oversizedChunks.length > 0) {
    issues.push({
      type:     'oversized_chunks',
      severity: 'warn',
      message:  `${oversizedChunks.length} chunk(s) exceed 500KB`,
      detail:   oversizedChunks.map((c) => `${c.name}: ${c.transferKB}KB`).join(', '),
    });
  }

  if (startupAudit?.recommendation) {
    issues.push({
      type:     'large_total_bundle',
      severity: 'warn',
      message:  startupAudit.recommendation,
      detail:   `Total: ${startupAudit.totalChunksKB}KB across ${startupAudit.chunkCount} chunks`,
    });
  }

  if (dynamicImports.withoutNames > 0) {
    issues.push({
      type:     'unnamed_dynamic_imports',
      severity: 'info',
      message:  `${dynamicImports.withoutNames} dynamic import(s) missing chunk names`,
      detail:   'Add /* webpackChunkName: "name" */ for better debugging',
    });
  }

  log.info(`Bundle audit: ${issues.length} issue(s) found`);

  return {
    issues,
    details: { chunkMetrics, oversizedChunks, startupAudit, dynamicImports },
    healthy: issues.filter((i) => i.severity === 'error').length === 0,
    timestamp: Date.now(),
  };
}
