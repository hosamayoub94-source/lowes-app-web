// =============================================================
// src/core/testing — QA, Testing & Deployment Readiness layer
//
// Public API for the entire testing subsystem.
// All imports are explicit — tree-shaking safe.
// DEV-only utilities are guarded internally; importing them in
// production is safe (they become no-ops or export null).
// =============================================================

// ── QA Guards ─────────────────────────────────────────────────
export {
  validate,
  guard,
  assertValid,
  validateArray,
  safeGet,
  SCHEMAS,
} from './qa/runtimeValidations';

// ── Health Checks ──────────────────────────────────────────────
export {
  runAllHealthChecks,
  runCheck_byName,
  getCheckNames,
} from './health/healthChecks';

// ── Environment Validation ─────────────────────────────────────
export {
  validateEnvironment,
  validateFeatureFlags,
} from './environment/envValidation';

export {
  runDeploymentReadiness,
} from './environment/deploymentReadiness';

// ── Mock Factories ─────────────────────────────────────────────
export {
  makeTask,
  makeUser,
  makeNotification,
  makeQueueJob,
  makeAttendanceRecord,
  makeLead,
  makeComment,
  makeSession,
} from './mocks/mockFactories';

// ── Mock Realtime ──────────────────────────────────────────────
export {
  fireNotification,
  fireTaskUpdate,
  fireTaskCreated,
  fireTaskCompleted,
  fireCommentAdded,
  firePresenceChange,
  simulateActiveWorkday,
  burst,
} from './mocks/mockRealtime';

// ── Network Simulation ─────────────────────────────────────────
export {
  simulateOffline,
  isSimulatingOffline,
  withSlow3G,
  withSlow2G,
  withFlakiness,
  sleep,
} from './mocks/networkSimulation';

// ── Mock Auth Sessions ─────────────────────────────────────────
export {
  makeMockSession,
  makeMockUser,
  injectMockSession,
} from './mocks/mockAuthSession';

// ── Debug Toolkit ──────────────────────────────────────────────
export {
  startEventTrace,
  stopEventTrace,
  getTraceEvents,
  clearTrace,
  replayTrace,
  recordAction,
  getActionHistory,
  replayLastActions,
  startRenderTracing,
  stopRenderTracing,
  getRenderCounts,
  getHotspots,
  traceWorkflow,
  getDebugSummary,
} from './debug/debugToolkit';

// ── Performance Benchmarks ─────────────────────────────────────
export {
  time,
  createTimer,
  getStats,
  getSlowOperations,
  clearBenchmarks,
  markAppStart,
  markAppReady,
  markRouteStart,
  markRouteReady,
  measureRender,
  recordRealtimeLatency,
  recordActionCompletion,
} from './performance/benchmarkLayer';

// ── Dev Toolbar (React component, DEV only) ────────────────────
export { DevToolbar }           from './debug/DevToolbar';

// ── Operational Dashboard (React components) ──────────────────
export { OperationalDashboard, QADashboardModal } from './dashboard/OperationalDashboard.jsx';
export { buildSystemSnapshot, getQuickStatus }    from './dashboard/operationalDashboard.js';

// ── Stress Testing ─────────────────────────────────────────────
export {
  stressRealtime,
  stressQueue,
  stressNotifications,
  stressConcurrentActions,
  stressMemory,
  stopAllStressTests,
  getActiveStressTests,
} from './stress/stressTestUtils';

// ── E2E Workflow Helpers ───────────────────────────────────────
export {
  runLoginFlow,
  runAttendanceFlow,
  runTaskLifecycleFlow,
  runNotificationsFlow,
  runCRMFlow,
  runAllWorkflows,
} from './e2e/workflowHelpers';

// ── Safe Migration Runner ──────────────────────────────────────
export {
  registerMigration,
  runPendingMigrations,
  getMigrationStatus,
  clearMigrationHistory,
} from './migration/safeMigrationRunner';

// ── Backup & Restore ───────────────────────────────────────────
export {
  createBackup,
  saveBackup,
  downloadBackup,
  copyBackupToClipboard,
  restoreFromBackup,
  loadSavedBackup,
  restoreSavedBackup,
  emergencyReset,
  recoverQueueFromBackup,
} from './backup/backupRestore';

// ── Release Checklist ──────────────────────────────────────────
export {
  runReleaseChecklist,
  formatChecklistMarkdown,
} from './release/releaseChecklist';
