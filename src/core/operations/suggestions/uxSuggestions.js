// =============================================================
// uxSuggestions — Data-driven UX improvement engine
//
// Analyzes live usage data and generates specific, actionable
// suggestions to:
//   • Shorten multi-step workflows
//   • Remove friction from confusing screens
//   • Improve slow interactions
//   • Optimize mobile usage patterns
//   • Prioritize by impact (users affected × frequency)
// =============================================================
import { createLogger }    from '@/core/production/productionLogger';
import { getPageStats, getSlowWorkflows } from '../tracking/usageTracker';
import { getFrictionByPage, getFrictionSummary } from '../tracking/frictionTracker';
import { getAllWorkflowTypes, getFailureAnalysis } from '../metrics/workflowMetrics';
import { getBottlenecks, getNeglectedZones } from '../heatmap/workspaceHeatmap';

const log = createLogger('UXSuggestions');

// ── Suggestion priorities ──────────────────────────────────────
const PRIORITY = { critical: 4, high: 3, medium: 2, low: 1 };

function suggestion(id, priority, category, title, detail, action = null) {
  return { id, priority, priorityLabel: priority, category, title, detail, action, ts: Date.now() };
}

// ── Suggestion generators ──────────────────────────────────────

// 1. Slow workflow shortcuts
function _slowWorkflowSuggestions() {
  const slow = getSlowWorkflows();
  return slow
    .filter((s) => s.avgDurationMs > 5000 && s.count > 2)
    .map((s) => suggestion(
      `slow_wf_${s.workflow}`,
      'high',
      'workflow',
      `Shorten "${s.workflow}" workflow`,
      `Average completion time is ${Math.round(s.avgDurationMs / 1000)}s over ${s.count} uses. Consider reducing required fields or adding smart defaults.`,
      { type: 'workflow_optimization', target: s.workflow }
    ));
}

// 2. Page friction fixes
function _frictionPageSuggestions() {
  const frictionByPage = getFrictionByPage();
  const suggestions    = [];

  for (const page of frictionByPage) {
    if (page.friction >= 3) {
      suggestions.push(suggestion(
        `friction_page_${page.page}`,
        page.friction >= 5 ? 'critical' : 'high',
        'ux',
        `Fix confusion on "${page.page}"`,
        `${page.friction} friction event(s) reported on this screen. Review layout, labels, and primary actions.`,
        { type: 'screen_review', target: page.page }
      ));
    }
    if (page.negative > page.positive && page.total >= 3) {
      suggestions.push(suggestion(
        `negative_page_${page.page}`,
        'medium',
        'ux',
        `Improve satisfaction on "${page.page}"`,
        `More negative reactions than positive (${page.negative} vs ${page.positive}). Review the user flow.`,
        { type: 'satisfaction_review', target: page.page }
      ));
    }
  }

  return suggestions;
}

// 3. Failed workflow fixes
function _failedWorkflowSuggestions() {
  const failures = getFailureAnalysis();
  return failures
    .filter((f) => f.count >= 2)
    .map((f) => suggestion(
      `fail_wf_${f.workflowType}`,
      'critical',
      'reliability',
      `Fix failures in "${f.workflowType}"`,
      `${f.count} failure(s). Top reason: "${f.topReasons[0]?.[0] ?? 'unknown'}". Add error recovery or clearer error messages.`,
      { type: 'workflow_fix', target: f.workflowType }
    ));
}

// 4. Bottleneck fixes
function _bottleneckSuggestions() {
  const bottlenecks = getBottlenecks();
  return bottlenecks.map((b) => suggestion(
    `bottleneck_${b.zone}`,
    'medium',
    'navigation',
    `Clarify "${b.zone}" — users leave immediately`,
    `${b.visits} visits but only ${b.avgDwell}ms average dwell. Users may not find what they expect.`,
    { type: 'navigation_clarify', target: b.zone }
  ));
}

// 5. Neglected feature promotions
function _neglectedFeatureSuggestions() {
  const neglected = getNeglectedZones();
  return neglected
    .filter((z) => z.reason === 'never_used')
    .slice(0, 3)
    .map((z) => suggestion(
      `neglected_${z.zone}`,
      'low',
      'adoption',
      `Promote unused feature: "${z.zone}"`,
      `This feature has never been used. Consider adding an onboarding hint or making it more discoverable.`,
      { type: 'feature_promotion', target: z.zone }
    ));
}

// 6. Mobile-specific optimizations
function _mobileSuggestions() {
  const suggestions = [];
  if (typeof window === 'undefined') return suggestions;

  const isMobile = window.innerWidth < 768;
  if (!isMobile) return suggestions;

  const friction = getFrictionSummary();
  if (friction.rageClickCount > 5) {
    suggestions.push(suggestion(
      'mobile_tap_targets',
      'high',
      'mobile',
      'Increase tap target sizes on mobile',
      `${friction.rageClickCount} rage clicks detected. Mobile tap targets should be at least 44×44px.`,
      { type: 'mobile_fix', target: 'tap_targets' }
    ));
  }

  return suggestions;
}

// 7. Workflow with too many steps
function _stepCountSuggestions() {
  const workflows = getAllWorkflowTypes();
  return workflows
    .filter((w) => {
      // Find workflows with high step counts via completed records
      return w.avgMs > 10_000 && w.count > 3;
    })
    .map((w) => suggestion(
      `steps_${w.workflowType}`,
      'medium',
      'workflow',
      `Reduce steps in "${w.workflowType}"`,
      `Takes ${Math.round(w.avgMs / 1000)}s on average. Look for steps that can be automated or defaulted.`,
      { type: 'step_reduction', target: w.workflowType }
    ));
}

// ── Full suggestions engine ────────────────────────────────────
export function generateSuggestions() {
  log.info('Generating UX improvement suggestions...');

  const all = [
    ..._slowWorkflowSuggestions(),
    ..._frictionPageSuggestions(),
    ..._failedWorkflowSuggestions(),
    ..._bottleneckSuggestions(),
    ..._neglectedFeatureSuggestions(),
    ..._mobileSuggestions(),
    ..._stepCountSuggestions(),
  ];

  // Deduplicate by id, sort by priority
  const unique = [...new Map(all.map((s) => [s.id, s])).values()];
  unique.sort((a, b) => PRIORITY[b.priority] - PRIORITY[a.priority]);

  const byCategory = {};
  for (const s of unique) {
    byCategory[s.category] = byCategory[s.category] ?? [];
    byCategory[s.category].push(s);
  }

  log.info(`Generated ${unique.length} UX suggestion(s)`);

  return {
    suggestions:  unique,
    byCategory,
    critical:     unique.filter((s) => s.priority === 'critical'),
    high:         unique.filter((s) => s.priority === 'high'),
    medium:       unique.filter((s) => s.priority === 'medium'),
    low:          unique.filter((s) => s.priority === 'low'),
    total:        unique.length,
    generatedAt:  Date.now(),
  };
}

// ── Quick wins (highest impact, fastest to fix) ────────────────
export function getQuickWins() {
  const result = generateSuggestions();
  return result.suggestions
    .filter((s) => s.priority === 'critical' || s.priority === 'high')
    .slice(0, 5);
}
