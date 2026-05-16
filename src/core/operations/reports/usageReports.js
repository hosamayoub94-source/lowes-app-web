// =============================================================
// usageReports — Daily/Weekly production usage summaries
//
// Generates structured reports from live usage data:
//   • Daily operations snapshot
//   • Employee adoption report
//   • Feature usage breakdown
//   • Operational health digest
//   • Exportable JSON/text format
// =============================================================
import { createLogger }           from '@/core/production/productionLogger';
import { getPageStats, getActionStats, getErrorStats, getSlowWorkflows, getSessionSummary } from '../tracking/usageTracker';
import { getFrictionSummary }     from '../tracking/frictionTracker';
import { getAllWorkflowTypes, getFailureAnalysis } from '../metrics/workflowMetrics';
import { getProductivitySummary, getDailyActiveEmployees, getFeatureAdoption } from '../metrics/productivityMetrics';
import { getFeedbackSummary }     from '../feedback/liveFeedback';

const log = createLogger('UsageReports');

// ── Report formats ─────────────────────────────────────────────
export function buildDailyReport() {
  log.info('Building daily operations report...');

  const pages      = getPageStats();
  const actions    = getActionStats();
  const errors     = getErrorStats();
  const slows      = getSlowWorkflows();
  const session    = getSessionSummary();
  const friction   = getFrictionSummary();
  const workflows  = getAllWorkflowTypes();
  const dae        = getDailyActiveEmployees();
  const features   = getFeatureAdoption();
  const feedback   = getFeedbackSummary();
  const failures   = getFailureAnalysis();
  const productivity = getProductivitySummary();

  const report = {
    generatedAt: new Date().toISOString(),
    period:      'daily',
    date:        new Date().toISOString().split('T')[0],

    // ── Operations summary ──────────────────────────────────
    operations: {
      activeEmployees: dae.today,
      totalActions:    actions.reduce((s, a) => s + a.count, 0),
      workflowsRun:    workflows.reduce((s, w) => s + w.count, 0),
      errorsRecorded:  errors.reduce((s, e) => s + e.count, 0),
      slowWorkflows:   slows.length,
    },

    // ── Top activity ─────────────────────────────────────────
    topPages:    pages.slice(0, 5),
    topActions:  actions.slice(0, 10),
    topErrors:   errors.slice(0, 5),

    // ── Workflow health ───────────────────────────────────────
    workflows: {
      all:          workflows,
      failures:     failures.slice(0, 5),
      avgSuccessRate: workflows.length > 0
        ? Math.round(workflows.reduce((s, w) => s + w.successRate, 0) / workflows.length)
        : null,
    },

    // ── Employee metrics ──────────────────────────────────────
    employees: {
      daily:          dae.today,
      weeklyTrend:    dae.last7Days,
      features:       features.slice(0, 8),
      powerUsers:     productivity.powerUsers,
      regular:        productivity.regularUsers,
    },

    // ── Friction + UX ────────────────────────────────────────
    ux: {
      frictionScore:  friction.healthScore,
      rageClicks:     friction.rageClickCount,
      abandoned:      friction.abandonedCount,
      topFrictions:   friction.topFrictions,
    },

    // ── Feedback ──────────────────────────────────────────────
    feedback: {
      sentiment:      feedback.sentiment,
      total:          feedback.total,
      suggestions:    feedback.suggestionCount,
      complaints:     feedback.complaintCount,
    },

    // ── Slow + blockers ───────────────────────────────────────
    blockers: slows.map((s) => ({
      workflow: s.workflow,
      avgMs:    s.avgDurationMs,
      count:    s.count,
    })),
  };

  return report;
}

// ── Operational health digest ──────────────────────────────────
export function buildHealthDigest() {
  const report = buildDailyReport();
  const issues = [];

  if (report.operations.errorsRecorded > 10) {
    issues.push({ severity: 'error', message: `${report.operations.errorsRecorded} errors recorded today` });
  }
  if (report.operations.slowWorkflows > 5) {
    issues.push({ severity: 'warn', message: `${report.operations.slowWorkflows} slow workflow(s) detected` });
  }
  if (report.ux.frictionScore < 70) {
    issues.push({ severity: 'warn', message: `UX friction score low: ${report.ux.frictionScore}/100` });
  }
  if (report.ux.abandoned > 5) {
    issues.push({ severity: 'warn', message: `${report.ux.abandoned} abandoned action(s) today` });
  }
  if (report.feedback.sentiment !== null && report.feedback.sentiment < 50) {
    issues.push({ severity: 'warn', message: `Employee sentiment low: ${report.feedback.sentiment}%` });
  }

  const overall = issues.some((i) => i.severity === 'error') ? 'degraded'
    : issues.length > 2 ? 'attention'
    : 'healthy';

  return { overall, issues, summary: report.operations, generatedAt: report.generatedAt };
}

// ── Adoption report ────────────────────────────────────────────
export function buildAdoptionReport() {
  const features   = getFeatureAdoption();
  const dae        = getDailyActiveEmployees();
  const workflows  = getAllWorkflowTypes();

  return {
    generatedAt:    new Date().toISOString(),
    activeToday:    dae.today,
    weeklyActive:   dae.last7Days,
    features:       features.map((f) => ({
      ...f,
      status: f.userCount === 0 ? 'unused' : f.userCount < 3 ? 'low' : 'adopted',
    })),
    workflows:      workflows.map((w) => ({
      type:         w.workflowType,
      count:        w.count,
      avgMs:        w.avgMs,
      successRate:  w.successRate,
    })),
    unusedFeatures: features.filter((f) => f.userCount === 0).map((f) => f.feature),
  };
}

// ── Text export ────────────────────────────────────────────────
export function formatDailyReportText(report) {
  const r = report ?? buildDailyReport();
  const lines = [
    `📊 Daily Operations Report — ${r.date}`,
    `Generated: ${r.generatedAt}`,
    ``,
    `OPERATIONS`,
    `  Active employees: ${r.operations.activeEmployees}`,
    `  Total actions:    ${r.operations.totalActions}`,
    `  Workflows run:    ${r.operations.workflowsRun}`,
    `  Errors:           ${r.operations.errorsRecorded}`,
    `  Slow workflows:   ${r.operations.slowWorkflows}`,
    ``,
    `TOP PAGES`,
    ...r.topPages.slice(0, 5).map((p) => `  ${p.page}: ${p.visits} visits, avg ${p.avgDwellMs}ms`),
    ``,
    `TOP ACTIONS`,
    ...r.topActions.slice(0, 5).map((a) => `  ${a.action}: ${a.count}x`),
    ``,
    `UX HEALTH`,
    `  Friction score:   ${r.ux.frictionScore}/100`,
    `  Rage clicks:      ${r.ux.rageClicks}`,
    `  Abandoned:        ${r.ux.abandoned}`,
    ``,
    `FEEDBACK`,
    `  Sentiment:        ${r.feedback.sentiment ?? 'N/A'}%`,
    `  Suggestions:      ${r.feedback.suggestions}`,
    `  Complaints:       ${r.feedback.complaints}`,
  ];

  return lines.join('\n');
}

export function exportReportJSON(report) {
  return JSON.stringify(report ?? buildDailyReport(), null, 2);
}
