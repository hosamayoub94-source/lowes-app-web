// =============================================================
// codeConsistency — Naming + structural standards enforcement
//
// Validates naming conventions, file structure, hook patterns,
// store patterns, event naming, and service-layer standards
// without modifying any code.
//
// All checks return { rule, status, message, detail } objects.
// =============================================================
import { createLogger } from '@/core/production/productionLogger';

const log = createLogger('CodeConsistency');

// ── Naming conventions ─────────────────────────────────────────
const NAMING_RULES = {
  // React components — PascalCase
  component: { pattern: /^[A-Z][a-zA-Z0-9]+$/, label: 'PascalCase' },
  // Custom hooks — camelCase starting with "use"
  hook:      { pattern: /^use[A-Z][a-zA-Z0-9]+$/, label: 'useCamelCase' },
  // Zustand stores — camelCase ending with "Store"
  store:     { pattern: /^use[A-Z][a-zA-Z0-9]+Store$/, label: 'useXxxStore' },
  // Services — camelCase ending with "Service"
  service:   { pattern: /^[a-z][a-zA-Z0-9]+Service$/, label: 'xxxService' },
  // Events — dot.separated lowercase
  event:     { pattern: /^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)*$/, label: 'dot.separated' },
  // Constants — SCREAMING_SNAKE_CASE
  constant:  { pattern: /^[A-Z][A-Z0-9_]+$/, label: 'SCREAMING_SNAKE_CASE' },
};

// ── Known event names (from eventTypes.js) ────────────────────
const KNOWN_EVENT_NAMESPACES = [
  'auth', 'task', 'attendance', 'notification', 'realtime',
  'offline', 'health', 'collaboration', 'crm', 'qa', 'workflow',
  'ui', 'session', 'workspace',
];

// ── Known store names (should match this pattern) ─────────────
const KNOWN_STORES = [
  'useWorkspaceStore', 'useCollaborationStore', 'useTaskStore',
  'useAttendanceStore', 'useNotificationStore', 'usePersonalizationStore',
  'useSessionStore', 'useMetricsStore',
];

// ── Check: Hook naming ─────────────────────────────────────────
export function checkHookNaming(hookNames = []) {
  const violations = [];
  for (const name of hookNames) {
    if (!NAMING_RULES.hook.pattern.test(name)) {
      violations.push({
        rule:    'hook_naming',
        status:  'fail',
        message: `Hook "${name}" must follow ${NAMING_RULES.hook.label} convention`,
        detail:  `Expected: useXxxName, got: ${name}`,
      });
    }
  }
  return violations.length === 0
    ? [{ rule: 'hook_naming', status: 'pass', message: 'All hook names follow convention' }]
    : violations;
}

// ── Check: Store naming ────────────────────────────────────────
export function checkStoreNaming(storeNames = []) {
  const violations = [];
  for (const name of storeNames) {
    if (!NAMING_RULES.store.pattern.test(name)) {
      violations.push({
        rule:    'store_naming',
        status:  'warn',
        message: `Store "${name}" should follow ${NAMING_RULES.store.label} convention`,
        detail:  `Expected: useXxxStore, got: ${name}`,
      });
    }
  }
  return violations.length === 0
    ? [{ rule: 'store_naming', status: 'pass', message: 'All store names follow convention' }]
    : violations;
}

// ── Check: Event naming ────────────────────────────────────────
export function checkEventNaming(eventNames = []) {
  const violations = [];
  for (const name of eventNames) {
    if (!NAMING_RULES.event.pattern.test(name)) {
      violations.push({
        rule:    'event_naming',
        status:  'warn',
        message: `Event "${name}" must follow dot.separated.lowercase convention`,
        detail:  `Example: task.updated, auth.session_expired`,
      });
      continue;
    }
    const ns = name.split('.')[0];
    if (!KNOWN_EVENT_NAMESPACES.includes(ns)) {
      violations.push({
        rule:    'event_namespace',
        status:  'warn',
        message: `Event namespace "${ns}" is not in the approved list`,
        detail:  `Approved namespaces: ${KNOWN_EVENT_NAMESPACES.join(', ')}`,
      });
    }
  }
  return violations.length === 0
    ? [{ rule: 'event_naming', status: 'pass', message: 'All event names follow convention' }]
    : violations;
}

// ── Check: Service layer standards ────────────────────────────
export function checkServiceLayerStandards(services = []) {
  const violations = [];
  for (const svc of services) {
    const { name, hasErrorHandling, hasLogging, hasMockFallback } = svc;

    if (!NAMING_RULES.service.pattern.test(name)) {
      violations.push({
        rule:    'service_naming',
        status:  'warn',
        message: `Service "${name}" should follow xxxService convention`,
      });
    }
    if (!hasErrorHandling) {
      violations.push({
        rule:    'service_error_handling',
        status:  'warn',
        message: `Service "${name}" is missing error handling`,
        detail:  'Wrap Supabase calls in try/catch and report to errorReporter',
      });
    }
    if (!hasLogging) {
      violations.push({
        rule:    'service_logging',
        status:  'warn',
        message: `Service "${name}" has no structured logging`,
        detail:  'Use createLogger from productionLogger',
      });
    }
    if (!hasMockFallback) {
      violations.push({
        rule:    'service_mock_fallback',
        status:  'info',
        message: `Service "${name}" lacks a mock fallback for offline/dev use`,
      });
    }
  }
  return violations.length === 0
    ? [{ rule: 'service_standards', status: 'pass', message: 'All services meet standards' }]
    : violations;
}

// ── Check: Store consistency ───────────────────────────────────
export function checkStoreConsistency() {
  const issues = [];

  // Validate all known stores exist and follow Zustand patterns
  // We check via localStorage keys since stores persist their state
  const STORE_PERSISTENCE_KEYS = [
    'lw-workspace-store',
    'lw-collaboration-store',
    '__lw_personalization',
    '__lw_session',
  ];

  for (const key of STORE_PERSISTENCE_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        // Zustand stores wrap state in { state: {}, version: N }
        if (!('state' in parsed) && !('version' in parsed)) {
          issues.push({
            rule:    'store_persistence_format',
            status:  'warn',
            message: `Persisted store "${key}" may not follow Zustand middleware format`,
            detail:  'Expected { state: {}, version: N }',
          });
        }
      } catch {
        issues.push({
          rule:    'store_corruption',
          status:  'fail',
          message: `Persisted store "${key}" contains invalid JSON — will be reset on next load`,
        });
      }
    }
  }

  return issues.length === 0
    ? [{ rule: 'store_consistency', status: 'pass', message: 'Store persistence format is consistent' }]
    : issues;
}

// ── Check: File structure heuristics ──────────────────────────
export function checkFileStructure() {
  const issues = [];

  // Validate localStorage keys follow __lw_ prefix convention
  const NON_STANDARD_KEYS = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    // App keys should start with __lw_ or lw- or __prod_ or __rc or __rollout
    const knownPrefixes = ['__lw_', 'lw-', '__prod_', '__rc', '__rollout', '__migrations'];
    const isKnown = knownPrefixes.some((p) => key.startsWith(p));
    if (!isKnown && !key.startsWith('__debug') && !key.startsWith('__backup')) {
      NON_STANDARD_KEYS.push(key);
    }
  }

  if (NON_STANDARD_KEYS.length > 0) {
    issues.push({
      rule:    'storage_key_convention',
      status:  'warn',
      message: `${NON_STANDARD_KEYS.length} localStorage key(s) don't follow the __lw_ / lw- convention`,
      detail:  NON_STANDARD_KEYS.slice(0, 5).join(', ') + (NON_STANDARD_KEYS.length > 5 ? '…' : ''),
    });
  }

  return issues.length === 0
    ? [{ rule: 'file_structure', status: 'pass', message: 'Storage key naming is consistent' }]
    : issues;
}

// ── Full consistency report ────────────────────────────────────
export function runConsistencyAudit(opts = {}) {
  const {
    hookNames   = [],
    storeNames  = [],
    eventNames  = [],
    services    = [],
  } = opts;

  log.info('Running code consistency audit...');

  const results = [
    ...checkHookNaming(hookNames),
    ...checkStoreNaming(storeNames),
    ...checkEventNaming(eventNames),
    ...checkServiceLayerStandards(services),
    ...checkStoreConsistency(),
    ...checkFileStructure(),
  ];

  const fails  = results.filter((r) => r.status === 'fail');
  const warns  = results.filter((r) => r.status === 'warn');
  const passes = results.filter((r) => r.status === 'pass');

  const overall = fails.length > 0 ? 'FAIL'
    : warns.length > 3 ? 'WARN'
    : 'PASS';

  log.info(`Consistency audit: ${overall} — ${fails.length} fail, ${warns.length} warn, ${passes.length} pass`);

  return {
    overall,
    results,
    summary: { total: results.length, fail: fails.length, warn: warns.length, pass: passes.length },
    timestamp: Date.now(),
  };
}

// ── Naming validation helpers (used by other modules) ──────────
export function isValidHookName(name)    { return NAMING_RULES.hook.pattern.test(name); }
export function isValidStoreName(name)   { return NAMING_RULES.store.pattern.test(name); }
export function isValidEventName(name)   { return NAMING_RULES.event.pattern.test(name); }
export function isValidServiceName(name) { return NAMING_RULES.service.pattern.test(name); }
export function isValidComponentName(n)  { return NAMING_RULES.component.pattern.test(n); }
export function isValidConstantName(n)   { return NAMING_RULES.constant.pattern.test(n); }

export { NAMING_RULES, KNOWN_EVENT_NAMESPACES, KNOWN_STORES };
