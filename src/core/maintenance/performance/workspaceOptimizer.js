// =============================================================
// workspaceOptimizer — Widget + rendering performance helpers
//
// Provides hooks and utilities to improve:
//   • Widget render performance (memoization hints)
//   • Lazy loading enforcement
//   • Mobile rendering optimizations
//   • Heavy list virtualization hints
//   • Command palette search performance
//   • Realtime event batching
//
// Nothing here modifies existing components —
// it provides analyzers + opt-in helpers.
// =============================================================
import { createLogger } from '@/core/production/productionLogger';

const log = createLogger('WorkspaceOptimizer');

// ── Render frequency tracker ───────────────────────────────────
const _renderLog = new Map(); // componentId → [timestamps]
const RENDER_WINDOW_MS = 5000;
const RENDER_HOT_THRESHOLD = 10; // renders in window = hot

export function logRender(componentId) {
  const now  = Date.now();
  const log_ = _renderLog.get(componentId) ?? [];
  const recent = log_.filter((ts) => now - ts < RENDER_WINDOW_MS);
  recent.push(now);
  _renderLog.set(componentId, recent);
}

export function getHotComponents() {
  const hot = [];
  for (const [id, timestamps] of _renderLog.entries()) {
    if (timestamps.length >= RENDER_HOT_THRESHOLD) {
      hot.push({ id, renderCount: timestamps.length, windowMs: RENDER_WINDOW_MS });
    }
  }
  return hot.sort((a, b) => b.renderCount - a.renderCount);
}

export function clearRenderLog() { _renderLog.clear(); }

// ── Lazy loading enforcement checker ──────────────────────────
const MUST_BE_LAZY = [
  'AuditDashboard', 'AdminReportsScreen', 'AdminSettingsScreen',
  'AccountingScreen', 'OperationalDashboard', 'MaintenanceDashboard',
  'RolloutInspector', 'ProductionInspector',
];

/**
 * Pass in array of { name, isLazy } module descriptors.
 * Returns violations for modules that should be lazy but aren't.
 */
export function auditLazyLoading(modules = []) {
  const violations = [];
  for (const mod of modules) {
    if (MUST_BE_LAZY.includes(mod.name) && !mod.isLazy) {
      violations.push({
        module:  mod.name,
        issue:   'Should be lazy-loaded but is eagerly imported',
        impact:  'Increases initial bundle size and TTI',
      });
    }
  }
  return { violations, healthy: violations.length === 0 };
}

// ── Mobile rendering hints ────────────────────────────────────
/**
 * Returns mobile-specific recommendations based on current
 * DOM state and viewport.
 */
export function getMobileRenderingHints() {
  const hints = [];

  if (typeof window === 'undefined') return hints;

  const isMobile = window.innerWidth < 768;
  if (!isMobile) return hints;

  // Check for oversized images not using srcset
  const imgs = [...document.querySelectorAll('img:not([srcset])')];
  if (imgs.length > 5) {
    hints.push({
      type:    'images_no_srcset',
      message: `${imgs.length} image(s) missing srcset — serve smaller images on mobile`,
      impact:  'Bandwidth + LCP',
    });
  }

  // Check for non-lazy images below the fold
  const lazyImgs = [...document.querySelectorAll('img:not([loading="lazy"])')];
  if (lazyImgs.length > 3) {
    hints.push({
      type:    'images_no_lazy',
      message: `${lazyImgs.length} image(s) missing loading="lazy"`,
      impact:  'Initial load time',
    });
  }

  // Check for large DOM trees on mobile
  const nodeCount = document.querySelectorAll('*').length;
  if (nodeCount > 1500) {
    hints.push({
      type:    'dom_too_large',
      message: `DOM has ${nodeCount} nodes — consider virtual scrolling for lists`,
      impact:  'Scroll performance, memory',
    });
  }

  return hints;
}

// ── Heavy list virtualization advisor ─────────────────────────
/**
 * Scans lists (ul, [role="list"]) and flags those with many items.
 */
export function getVirtualizationAdvisory() {
  const advisory = [];

  if (typeof document === 'undefined') return advisory;

  const lists = [...document.querySelectorAll('ul, ol, [role="list"]')];
  for (const list of lists) {
    const childCount = list.children.length;
    if (childCount > 50) {
      advisory.push({
        element:   list.tagName,
        className: list.className?.slice(0, 60),
        children:  childCount,
        recommend: childCount > 200 ? 'Virtualize with react-window/tanstack-virtual' : 'Consider pagination',
      });
    }
  }
  return advisory.sort((a, b) => b.children - a.children);
}

// ── Command palette performance ────────────────────────────────
// Measures search index size and recommends caching strategy.
export function auditCommandPalettePerformance(items = []) {
  const recommendations = [];

  if (items.length > 500) {
    recommendations.push({
      issue:   'large_index',
      message: `Command palette has ${items.length} items — consider fuzzy search with debounce`,
      fix:     'Add 150ms debounce + limit results to 10 visible items',
    });
  }

  // Check if items have pre-computed search keys
  const missingKeys = items.filter((item) => !item.searchKey && !item.keywords);
  if (missingKeys.length > 0) {
    recommendations.push({
      issue:   'no_search_keys',
      message: `${missingKeys.length} command palette items missing searchKey/keywords`,
      fix:     'Pre-compute lowercase search tokens at index build time',
    });
  }

  return { recommendations, itemCount: items.length, healthy: recommendations.length === 0 };
}

// ── Realtime event batching advisor ───────────────────────────
const _realtimeEventLog = [];
const REALTIME_BATCH_THRESHOLD = 5; // events/second = time to batch

export function logRealtimeEvent(type) {
  _realtimeEventLog.push({ type, ts: Date.now() });
  if (_realtimeEventLog.length > 500) _realtimeEventLog.shift();
}

export function getRealtimeBatchingAdvisory() {
  const now    = Date.now();
  const recent = _realtimeEventLog.filter((e) => now - e.ts < 1000);

  if (recent.length >= REALTIME_BATCH_THRESHOLD) {
    const byType = {};
    for (const e of recent) byType[e.type] = (byType[e.type] ?? 0) + 1;

    return {
      shouldBatch:  true,
      eventsPerSec: recent.length,
      breakdown:    byType,
      recommendation: 'Batch realtime updates with a 200ms debounce before triggering re-renders',
    };
  }

  return { shouldBatch: false, eventsPerSec: recent.length };
}

// ── Layout shift detector ─────────────────────────────────────
let _cumulativeLayoutShift = 0;
let _clsObserver = null;

export function startCLSTracking() {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;

  try {
    _clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) _cumulativeLayoutShift += entry.value;
      }
    });
    _clsObserver.observe({ type: 'layout-shift', buffered: true });
  } catch { /* not supported */ }
}

export function getCLS() {
  return { value: Math.round(_cumulativeLayoutShift * 1000) / 1000, rating: _cumulativeLayoutShift < 0.1 ? 'good' : _cumulativeLayoutShift < 0.25 ? 'needs-improvement' : 'poor' };
}

export function stopCLSTracking() { _clsObserver?.disconnect(); }

// ── Full workspace optimization report ────────────────────────
export function runWorkspaceOptimizationAudit() {
  log.info('Running workspace optimization audit...');

  const hotComponents   = getHotComponents();
  const mobileHints     = getMobileRenderingHints();
  const listAdvisory    = getVirtualizationAdvisory();
  const realtimeAdvisory = getRealtimeBatchingAdvisory();
  const cls             = getCLS();

  const issues = [];

  if (hotComponents.length > 0) {
    issues.push({ category: 'render', severity: 'warn', items: hotComponents });
  }
  if (mobileHints.length > 0) {
    issues.push({ category: 'mobile', severity: 'warn', items: mobileHints });
  }
  if (listAdvisory.length > 0) {
    issues.push({ category: 'lists', severity: 'warn', items: listAdvisory });
  }
  if (realtimeAdvisory.shouldBatch) {
    issues.push({ category: 'realtime', severity: 'warn', detail: realtimeAdvisory });
  }
  if (cls.rating === 'poor') {
    issues.push({ category: 'cls', severity: 'error', detail: cls });
  }

  log.info(`Workspace audit: ${issues.length} issue(s) found`);

  return {
    issues,
    details: { hotComponents, mobileHints, listAdvisory, realtimeAdvisory, cls },
    healthy: issues.filter((i) => i.severity === 'error').length === 0,
    timestamp: Date.now(),
  };
}

// ── Init ───────────────────────────────────────────────────────
export function initWorkspaceOptimizer() {
  startCLSTracking();
  log.info('Workspace optimizer initialized');
}
