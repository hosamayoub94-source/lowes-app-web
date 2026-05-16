// =============================================================
// Audit Module — public API.
// Import from here, never from internal paths directly.
// =============================================================

// Page
export { default as AuditDashboard } from './pages/AuditDashboard';

// Components
export { SeverityBadge }  from './components/SeverityBadge';
export { AuditLogRow }    from './components/AuditLogRow';
export { AuditStatsBar }  from './components/AuditStatsBar';
export { AuditFilters }   from './components/AuditFilters';
export { AuditFeed }      from './components/AuditFeed';
export { AuditExporter }  from './components/AuditExporter';

// Store + selectors
export {
  useAuditStore,
  selectActiveFilterCount,
  selectTotalPages,
  selectAlerts,
} from './store/useAuditStore';

// Hooks
export { useAudit }        from './hooks/useAudit';
export { useAuditLogger }  from './hooks/useAuditLogger';

// Service (for manual logging outside React — e.g. authService)
export {
  logActivity,
  logActivityImmediate,
  fetchLogs,
  fetchAuditStats,
  subscribeToAuditLogs,
  exportLogsCSV,
  retryOfflineQueue,
  startBatchTimer,
  stopBatchTimer,
  USE_MOCK_AUDIT,
} from './services/auditService';

// Types / constants
export {
  SEVERITY,
  SEVERITY_META,
  SEVERITY_OPTIONS,
  ENTITY_TYPE,
  ENTITY_META,
  ENTITY_OPTIONS,
  ACTION_TYPE,
  ACTION_LABELS,
  ACTION_SEVERITY,
  resolveSeverity,
} from './types/audit.types';
