// =============================================================
// continuousImprovement — Iterative UX + operational improvement
//
// Tracks improvement cycles:
//   • Logs an issue → assigns priority → marks resolved
//   • Tracks which suggestions were acted on
//   • Measures improvement impact (before/after metrics)
//   • Generates improvement velocity reports
// =============================================================
import { createLogger } from '@/core/production/productionLogger';
import { emit }         from '@/core/events/eventBus';

const log = createLogger('ContinuousImprovement');

// ── Improvement item store ─────────────────────────────────────
const IMPROVEMENT_KEY = '__lw_improvements';
let _improvements = _loadImprovements();

// ── Item shape ─────────────────────────────────────────────────
// { id, title, category, priority, status, source, createdAt, resolvedAt, impact }

export function logImprovement(title, opts = {}) {
  const {
    category = 'ux',     // ux | workflow | reliability | performance | adoption
    priority = 'medium', // critical | high | medium | low
    source   = 'manual', // 'manual' | 'suggestion_engine' | 'friction_report' | 'feedback'
    detail   = '',
    metric   = null,     // { name, baseline, unit } — optional metric to track
  } = opts;

  const item = {
    id:        `imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title,
    category,
    priority,
    source,
    detail,
    metric,
    status:    'open',   // open | in_progress | resolved | wont_fix
    createdAt: Date.now(),
    resolvedAt: null,
    impact:    null,     // measured after resolution
  };

  _improvements.push(item);
  _saveImprovements();
  emit('ops:improvement_logged', { id: item.id, title, priority });
  log.info(`Improvement logged: "${title}" [${priority}]`);
  return item.id;
}

export function updateImprovementStatus(id, status, opts = {}) {
  const item = _improvements.find((i) => i.id === id);
  if (!item) return false;

  item.status     = status;
  item.updatedAt  = Date.now();

  if (status === 'resolved') {
    item.resolvedAt = Date.now();
    item.impact     = opts.impact ?? null;
    item.resolution = opts.resolution ?? null;
    emit('ops:improvement_resolved', { id, title: item.title });
    log.info(`Improvement resolved: "${item.title}"`);
  }

  _saveImprovements();
  return true;
}

// ── Import from suggestions engine ────────────────────────────
export function importSuggestions(suggestions = []) {
  let imported = 0;
  for (const s of suggestions) {
    const exists = _improvements.some((i) => i.source === 'suggestion_engine' && i.title.includes(s.title));
    if (!exists) {
      logImprovement(s.title, {
        category: s.category,
        priority: s.priority,
        source:   'suggestion_engine',
        detail:   s.detail,
      });
      imported++;
    }
  }
  return imported;
}

// ── Queries ────────────────────────────────────────────────────
export function getOpenImprovements() {
  return _improvements
    .filter((i) => i.status === 'open' || i.status === 'in_progress')
    .sort((a, b) => _priorityWeight(b.priority) - _priorityWeight(a.priority));
}

export function getResolvedImprovements() {
  return _improvements
    .filter((i) => i.status === 'resolved')
    .sort((a, b) => b.resolvedAt - a.resolvedAt);
}

export function getImprovementsByCategory() {
  const byCategory = {};
  for (const item of _improvements) {
    byCategory[item.category] = byCategory[item.category] ?? [];
    byCategory[item.category].push(item);
  }
  return byCategory;
}

// ── Velocity metrics ───────────────────────────────────────────
export function getImprovementVelocity() {
  const now        = Date.now();
  const last7Days  = _improvements.filter((i) => now - i.createdAt < 7 * 86_400_000);
  const resolved7  = last7Days.filter((i) => i.status === 'resolved');

  const avgResolutionMs = resolved7.length > 0
    ? resolved7.reduce((s, i) => s + (i.resolvedAt - i.createdAt), 0) / resolved7.length
    : null;

  return {
    openCount:         _improvements.filter((i) => i.status === 'open').length,
    inProgressCount:   _improvements.filter((i) => i.status === 'in_progress').length,
    resolvedTotal:     _improvements.filter((i) => i.status === 'resolved').length,
    resolvedLast7Days: resolved7.length,
    loggedLast7Days:   last7Days.length,
    avgResolutionDays: avgResolutionMs ? Math.round(avgResolutionMs / 86_400_000 * 10) / 10 : null,
    velocity:          last7Days.length > 0 ? Math.round(resolved7.length / last7Days.length * 100) : 0,
  };
}

// ── Impact tracking ────────────────────────────────────────────
export function recordImpactMeasurement(id, afterValue) {
  const item = _improvements.find((i) => i.id === id);
  if (!item?.metric) return false;

  item.impact = {
    metric:    item.metric.name,
    baseline:  item.metric.baseline,
    after:     afterValue,
    unit:      item.metric.unit,
    change:    afterValue - item.metric.baseline,
    pctChange: item.metric.baseline
      ? Math.round((afterValue - item.metric.baseline) / item.metric.baseline * 100)
      : null,
    measuredAt: Date.now(),
  };

  _saveImprovements();
  return true;
}

// ── Summary ────────────────────────────────────────────────────
export function getImprovementSummary() {
  const velocity = getImprovementVelocity();
  const open     = getOpenImprovements();
  const resolved = getResolvedImprovements();

  return {
    velocity,
    topPriority:     open.slice(0, 5),
    recentResolved:  resolved.slice(0, 5),
    totalLogged:     _improvements.length,
    byCategory:      Object.entries(getImprovementsByCategory())
      .map(([cat, items]) => ({
        category: cat,
        open:     items.filter((i) => i.status !== 'resolved').length,
        resolved: items.filter((i) => i.status === 'resolved').length,
      })),
  };
}

// ── Persistence ────────────────────────────────────────────────
function _priorityWeight(p) {
  return { critical: 4, high: 3, medium: 2, low: 1 }[p] ?? 0;
}

function _saveImprovements() {
  try {
    localStorage.setItem(IMPROVEMENT_KEY, JSON.stringify(_improvements.slice(-500)));
  } catch { /* quota */ }
}

function _loadImprovements() {
  try {
    return JSON.parse(localStorage.getItem(IMPROVEMENT_KEY) ?? '[]');
  } catch { return []; }
}

export function getAllImprovements()   { return [..._improvements]; }
export function clearImprovements()   { _improvements = []; _saveImprovements(); }
