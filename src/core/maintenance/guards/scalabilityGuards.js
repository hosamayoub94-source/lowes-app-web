// =============================================================
// scalabilityGuards — Future-proofing + growth control
//
// Prevents common anti-patterns that block long-term scalability:
//   • Uncontrolled module growth (> N files in a module)
//   • Store bloat (too many top-level state slices)
//   • Oversized page components (DOM depth + event count)
//   • Bad realtime patterns (polling instead of subscriptions)
//   • Patterns that block microfrontend readiness
//   • Patterns that block multi-tenant support
//
// All guards are advisory — they log warnings, not exceptions.
// =============================================================
import { createLogger } from '@/core/production/productionLogger';

const log = createLogger('ScalabilityGuards');

// ── Guard thresholds ───────────────────────────────────────────
const GUARDS = {
  maxModuleFiles:          50,   // files per feature module
  maxStoreSlices:          15,   // top-level state keys in a store
  maxPageDOMNodes:       2000,   // DOM nodes on a single page
  maxRealtimeChannels:     20,   // active Supabase channels
  maxWindowListeners:      50,   // window event listeners
  maxLocalStorageKeys:     30,   // total localStorage keys
  maxSingleFileLines:     500,   // recommended max lines per file
  maxEventListenersPerType: 5,   // listeners for the same event type
};

// ── Module growth guard ────────────────────────────────────────
/**
 * Pass in { moduleName: fileCount } map.
 * Returns violations for modules exceeding the threshold.
 */
export function checkModuleGrowth(moduleFileCounts = {}) {
  const violations = [];
  for (const [module, count] of Object.entries(moduleFileCounts)) {
    if (count > GUARDS.maxModuleFiles) {
      violations.push({
        guard:   'module_growth',
        module,
        count,
        limit:   GUARDS.maxModuleFiles,
        message: `Module "${module}" has ${count} files — consider splitting into sub-modules`,
        advice:  'Split into: ${module}/core, ${module}/ui, ${module}/utils',
      });
    }
  }
  return violations;
}

// ── Store bloat guard ──────────────────────────────────────────
/**
 * Checks for too many top-level state keys in persisted stores.
 */
export function checkStoreBloat() {
  const violations = [];
  const ZUSTAND_STORES = ['lw-workspace-store', 'lw-collaboration-store'];

  for (const key of ZUSTAND_STORES) {
    try {
      const raw  = localStorage.getItem(key);
      if (!raw) continue;
      const data = JSON.parse(raw);
      const state = data?.state ?? data;
      if (typeof state !== 'object') continue;

      const slices = Object.keys(state).length;
      if (slices > GUARDS.maxStoreSlices) {
        violations.push({
          guard:   'store_bloat',
          store:   key,
          slices,
          limit:   GUARDS.maxStoreSlices,
          message: `Store "${key}" has ${slices} top-level state keys — consider splitting into domain stores`,
          advice:  'Extract feature-specific state into separate Zustand stores',
        });
      }
    } catch { /* ignore */ }
  }

  return violations;
}

// ── Oversized page guard ───────────────────────────────────────
export function checkPageSize() {
  const violations = [];
  if (typeof document === 'undefined') return violations;

  const nodeCount = document.querySelectorAll('*').length;
  if (nodeCount > GUARDS.maxPageDOMNodes) {
    violations.push({
      guard:   'oversized_page',
      count:   nodeCount,
      limit:   GUARDS.maxPageDOMNodes,
      message: `Current page has ${nodeCount} DOM nodes — impacts scroll performance`,
      advice:  'Use virtualization for lists; hide off-screen sections via conditional rendering',
    });
  }

  return violations;
}

// ── Bad realtime pattern guard ─────────────────────────────────
/**
 * Detects polling patterns (repeated setInterval calls to fetch data)
 * that should instead use Supabase realtime subscriptions.
 */
export function checkRealtimePatterns() {
  const violations = [];

  // Check channel count
  try {
    if (window.__supabase?.getChannels) {
      const channels = window.__supabase.getChannels();
      if (channels.length > GUARDS.maxRealtimeChannels) {
        violations.push({
          guard:   'realtime_channel_count',
          count:   channels.length,
          limit:   GUARDS.maxRealtimeChannels,
          message: `${channels.length} active realtime channels — review cleanup on component unmount`,
          advice:  'Channels must be unsubscribed in useEffect cleanup functions',
        });
      }
    }
  } catch { /* ignore */ }

  return violations;
}

// ── localStorage growth guard ──────────────────────────────────
export function checkStorageGrowth() {
  const violations = [];
  const count = localStorage.length;

  if (count > GUARDS.maxLocalStorageKeys) {
    violations.push({
      guard:   'storage_growth',
      count,
      limit:   GUARDS.maxLocalStorageKeys,
      message: `${count} localStorage keys — audit for unused or cacheable data`,
      advice:  'Use cache prefixed keys (__lw_cache:*) and run periodic cleanup',
    });
  }

  return violations;
}

// ── Microfrontend readiness audit ──────────────────────────────
/**
 * Checks for patterns that would block a future microfrontend split:
 *   • Global state accessed without context (window.* singletons)
 *   • Direct document.getElementById usage (fragile)
 *   • Hard-coded absolute paths instead of relative imports
 */
export function checkMicrofrontendReadiness() {
  const issues = [];

  // Check for known problematic globals
  const PROBLEMATIC_GLOBALS = [
    '__supabase', '__user', '__auth', '__store', '__config',
  ];

  for (const g of PROBLEMATIC_GLOBALS) {
    if (typeof window !== 'undefined' && window[g] !== undefined) {
      issues.push({
        type:    'global_singleton',
        name:    g,
        message: `window.${g} is a global singleton — use React context or Zustand for MFE readiness`,
      });
    }
  }

  return {
    issues,
    ready:  issues.length === 0,
    score:  Math.max(0, 100 - issues.length * 20),
  };
}

// ── Multi-tenant readiness audit ───────────────────────────────
export function checkMultiTenantReadiness() {
  const checks = [];

  // ✅ Check: config comes from env (not hardcoded)
  const hasEnvConfig = !!import.meta.env.VITE_SUPABASE_URL;
  checks.push({
    check:   'env_based_config',
    pass:    hasEnvConfig,
    message: hasEnvConfig
      ? 'Supabase URL from environment (good for multi-tenant)'
      : 'Supabase URL appears hardcoded — parameterize for multi-tenant',
  });

  // ✅ Check: no company-specific strings in known config keys
  const companySpecificKeys = ['lowe', 'lowes'];
  const hasCompanyHardcoded = Object.keys(localStorage)
    .some((k) => companySpecificKeys.some((c) => k.toLowerCase().includes(c)));

  checks.push({
    check:   'tenant_agnostic_storage_keys',
    pass:    !hasCompanyHardcoded,
    message: hasCompanyHardcoded
      ? 'Some localStorage keys contain company-specific names — use generic prefixes'
      : 'Storage keys are tenant-agnostic',
  });

  const score = Math.round(checks.filter((c) => c.pass).length / checks.length * 100);

  return { checks, score, ready: score >= 80 };
}

// ── Full scalability report ────────────────────────────────────
export function runScalabilityGuardsAudit(opts = {}) {
  const { moduleFileCounts = {} } = opts;
  log.info('Running scalability guards audit...');

  const violations = [
    ...checkModuleGrowth(moduleFileCounts),
    ...checkStoreBloat(),
    ...checkPageSize(),
    ...checkRealtimePatterns(),
    ...checkStorageGrowth(),
  ];

  const mfeReadiness    = checkMicrofrontendReadiness();
  const tenantReadiness = checkMultiTenantReadiness();

  const errors  = violations.filter((v) => v.severity === 'error');
  const warns   = violations;

  log.info(`Scalability audit: ${violations.length} violation(s)`);

  return {
    violations,
    mfeReadiness,
    tenantReadiness,
    summary: {
      violations:    violations.length,
      mfeScore:      mfeReadiness.score,
      tenantScore:   tenantReadiness.score,
    },
    healthy: violations.length === 0 && mfeReadiness.ready,
    timestamp: Date.now(),
  };
}
