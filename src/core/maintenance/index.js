// =============================================================
// src/core/maintenance — Final Optimization & Maintainability
//
// Public API for the entire maintenance subsystem.
// Safe to import in production — DEV-only tools are guarded.
// =============================================================

// ── Architecture Integrity ─────────────────────────────────────
export {
  runArchitectureIntegrityCheck,
  checkForbiddenImports,
  checkModuleBoundaries,
  checkCircularDependencies,
  checkOversizedComponents,
  checkUnstableSubscriptions,
  checkDuplicatedUtilities,
} from './architecture/architectureIntegrity';

// ── Code Consistency ───────────────────────────────────────────
export {
  runConsistencyAudit,
  checkHookNaming,
  checkStoreNaming,
  checkEventNaming,
  checkServiceLayerStandards,
  checkStoreConsistency,
  checkFileStructure,
  isValidHookName,
  isValidStoreName,
  isValidEventName,
  isValidServiceName,
  isValidComponentName,
  isValidConstantName,
  NAMING_RULES,
  KNOWN_EVENT_NAMESPACES,
} from './architecture/codeConsistency';

// ── Performance Cleanup ────────────────────────────────────────
export {
  runPerformanceCleanupAudit,
  patchTimerTracking,
  getTimerStats,
  getOrphanListenerStats,
  getMemoryStats,
  logRequest,
  getDuplicateRequests,
  findStaleStorageEntries,
} from './performance/performanceCleanup';

// ── Workspace Optimizer ────────────────────────────────────────
export {
  runWorkspaceOptimizationAudit,
  initWorkspaceOptimizer,
  logRender,
  getHotComponents,
  clearRenderLog,
  auditLazyLoading,
  getMobileRenderingHints,
  getVirtualizationAdvisory,
  auditCommandPalettePerformance,
  logRealtimeEvent,
  getRealtimeBatchingAdvisory,
  getCLS,
} from './performance/workspaceOptimizer';

// ── Cache Strategy ─────────────────────────────────────────────
export {
  cache,
  get,
  set,
  invalidate,
  invalidatePrefix,
  optimisticSet,
  hydrateFromStorage,
  recoverStaleEntries,
  evictExpired,
  getCacheStats,
  listCachedKeys,
  peek,
  has,
  clearCache,
} from './cache/cacheStrategy';

// ── Store Optimizer ────────────────────────────────────────────
export {
  runStoreOptimizationAudit,
  createSelector,
  shallowEqual,
  shallowArrayEqual,
  selectSlice,
  batchActions,
  debouncedSetter,
  auditStoreSizes,
  detectStoreAntiPatterns,
} from './store/storeOptimizer';

// ── Bundle Optimizer ───────────────────────────────────────────
export {
  runBundleOptimizationAudit,
  getChunkLoadMetrics,
  getOversizedChunks,
  auditLazyImports,
  getDynamicImportAudit,
  getStartupResourceAudit,
  recordDynamicImport,
} from './bundle/bundleOptimizer';

// ── Workspace State Optimizer ──────────────────────────────────
export {
  runWorkspaceStateAudit,
  validatePersistedState,
  repairCorruptedState,
  cleanupStaleSessions,
  trimOversizedArrays,
  validateMigrationSafePersistence,
} from './state/workspaceStateOptimizer';

// ── Operational Cleanup ────────────────────────────────────────
export {
  runAllCleanupJobs,
  scheduleMaintenanceCleanup,
  cleanupOldNotifications,
  cleanupStaleDrafts,
  cleanupFailedQueue,
  cleanupOrphanActivity,
  cleanupExpiredCache,
} from './cleanup/operationalCleanup';

// ── Maintenance Toolkit ────────────────────────────────────────
export {
  runMaintenanceToolkitAudit,
  findOrphanEmits,
  findDeadSubscriptions,
  findUnusedStorageKeys,
  findStaleQueueItems,
  inspectDeadLetterQueue,
  findOrphanNotifications,
  findSuspectGlobals,
  recordEmittedEvent,
  recordSubscribedEvent,
} from './devtools/maintenanceToolkit';

// ── Logging Strategy ───────────────────────────────────────────
export {
  writeLog,
  getLogs,
  getPersistedLogs,
  getErrorLogs,
  getWarnLogs,
  getModuleLogs,
  getGroupedDiagnostics,
  cleanupOldLogs,
  clearLogHistory,
  exportLogs,
  getLogHealthReport,
  validateLogEntry,
} from './logging/loggingStrategy';

// ── Scalability Guards ─────────────────────────────────────────
export {
  runScalabilityGuardsAudit,
  checkModuleGrowth,
  checkStoreBloat,
  checkPageSize,
  checkRealtimePatterns,
  checkStorageGrowth,
  checkMicrofrontendReadiness,
  checkMultiTenantReadiness,
} from './guards/scalabilityGuards';

// ── Documentation Generator ────────────────────────────────────
export {
  generateDocumentation,
  exportDocumentationJSON,
  populateFromAppStructure,
  registerModule,
  registerEvent,
  registerQueueHandler,
  registerWorkflow,
  getModuleMap,
  getEventMap,
  getQueueMap,
  getWorkflowMap,
  getDependencyMap,
} from './docs/documentationGenerator';

// ── Dashboard (React components) ──────────────────────────────
export { MaintenanceDashboard, MaintenanceDashboardModal } from './dashboard/MaintenanceDashboard';
