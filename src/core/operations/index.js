// =============================================================
// operations — Barrel export for the entire live-operations layer
//
// Subsystems:
//   1. usageTracker         — page/action/session tracking
//   2. frictionTracker      — rage-clicks, abandons, UX friction
//   3. workflowMetrics      — start/complete/fail workflow timings
//   4. productivityMetrics  — DAE, power-users, engagement tiers
//   5. liveFeedback         — reactions + friction-type feedback
//   6. operationalReplay    — sequence recording & replay
//   7. usageReports         — daily/adoption/health digest reports
//   8. workspaceHeatmap     — zone/module/hourly heat model
//   9. uxSuggestions        — data-driven UX improvement suggestions
//  10. continuousImprovement — improvement lifecycle tracking
// =============================================================

// ── 1. Usage Tracker ──────────────────────────────────────────
export {
  initUsageTracker,
  trackPageEnter,
  trackPageLeave,
  startActionTimer,
  trackError,
  getPageStats,
  getTopPages,
  getActionStats,
  getTopActions,
  getErrorStats,
  getTopErrors,
  getSlowWorkflows,
  getSessionSummary,
  resetUsageData,
} from './tracking/usageTracker';

// ── 2. Friction Tracker ───────────────────────────────────────
export {
  initFrictionTracker,
  trackFrictionAction,
  startPendingAction,
  completePendingAction,
  cancelPendingAction,
  trackFormOpen,
  trackFormAbandoned,
  getFrictionSummary,
  getFrictionByPage,
  getFrictionEvents,
  clearFrictionData,
} from './tracking/frictionTracker';

// ── 3. Workflow Metrics ───────────────────────────────────────
export {
  startWorkflow,
  completeWorkflow,
  failWorkflow,
  workflowStep,
  getAllWorkflowTypes,
  getWorkflowStats,
  getFailureAnalysis,
  getProductivityPatterns,
  wireWorkflowMetricsToEventBus,
  loadPersistedMetrics,
} from './metrics/workflowMetrics';

// ── 4. Productivity Metrics ───────────────────────────────────
export {
  recordUserActivity,
  recordWorkflowCompletion,
  getProductivitySummary,
  getDailyActiveEmployees,
  getFeatureAdoption,
  getUserEngagementTiers,
  getStuckUsers,
  loadPersistedProductivityMetrics,
} from './metrics/productivityMetrics';

// ── 5. Live Feedback ──────────────────────────────────────────
export {
  submitReaction,
  reportFriction,
  submitSuggestion,
  reportWorkflowComplaint,
  getFeedbackSummary,
  getFeedbackByPage,
  getAllFeedback,
  clearFeedback,
  REACTIONS,
} from './feedback/liveFeedback';

// ── 6. Operational Replay ─────────────────────────────────────
export {
  startRecording,
  stopRecording,
  getReplayableQueueItems,
  replaySequence,
  replayQueueItem,
  replayDisconnectSequence,
  getReplayLog,
} from './replay/operationalReplay';

// ── 7. Usage Reports ──────────────────────────────────────────
export {
  buildDailyReport,
  buildHealthDigest,
  buildAdoptionReport,
  formatDailyReportText,
  exportReportJSON,
} from './reports/usageReports';

// ── 8. Workspace Heatmap ──────────────────────────────────────
export {
  heatClick,
  heatDwell,
  heatModule,
  getZoneHeatmap,
  getModuleHeatmap,
  getHourlyHeatmap,
  getNeglectedZones,
  getBottlenecks,
  getHeatmapSummary,
  loadPersistedHeatmap,
  ZONES,
} from './heatmap/workspaceHeatmap';

// ── 9. UX Suggestions ─────────────────────────────────────────
export {
  generateSuggestions,
  getQuickWins,
} from './suggestions/uxSuggestions';

// ── 10. Continuous Improvement ────────────────────────────────
export {
  logImprovement,
  updateImprovementStatus,
  importSuggestions,
  getOpenImprovements,
  getResolvedImprovements,
  getImprovementsByCategory,
  getImprovementVelocity,
  recordImpactMeasurement,
  getImprovementSummary,
  getAllImprovements,
  clearImprovements,
} from './improvement/continuousImprovement';

// ── Dashboard components ───────────────────────────────────────
export {
  OperationalInsightsDashboard,
  OperationalInsightsModal,
} from './dashboard/OperationalInsightsDashboard';
