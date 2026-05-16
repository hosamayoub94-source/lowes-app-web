// =============================================================
// Analytics Module — Public API Barrel
// Import from here, never from internal paths.
// =============================================================

// ── Types & Constants ─────────────────────────────────────────
export {
  KPI,
  KPI_LABELS,
  KPI_COLORS,
  KPI_THRESHOLDS,
  KPI_UNIT,
  KPI_STATUS_COLORS,
  DASHBOARD_ID,
  WIDGET_TYPE,
  REPORT_TYPE,
  EXPORT_FORMAT,
  EXPORT_STATUS,
  SNAPSHOT_PERIOD,
  DATE_RANGE_PRESET,
  DATE_RANGE_LABELS,
  DEFAULT_WIDGETS,
  MOCK_ACTIVITY,
  ACTIVITY_ICONS,
  ANALYTICS_CACHE_TTL_MS,
  CHART_MAX_DATA_POINTS,
  EXPORT_MAX_ROWS,
  KPI_REFRESH_INTERVAL_MS,
  generateMockTimeSeries,
  resolveDateRange,
  formatKPI,
  getKPIStatus,
} from './types/analytics.types';

// ── Services ──────────────────────────────────────────────────
export {
  aggregateMetrics,
  generateReport,
  saveSnapshot,
  fetchWidgets,
  saveWidgetLayout,
  fetchSavedReports,
  createSavedReport,
  createExportJob,
  invalidateAnalyticsCache,
  incrementCounter,
  getRealtimeStats,
  USE_MOCK,
} from './services/analyticsService';

export {
  computeKPIs,
  computeTimeSeries,
  evaluateAlerts,
  compareKPIs,
  clearKPICache,
} from './services/kpiEngine';

export { exportReport, buildCSVString } from './services/exportService';

// ── Store ─────────────────────────────────────────────────────
export { default as useAnalyticsStore } from './store/useAnalyticsStore';

// ── Hooks ─────────────────────────────────────────────────────
export {
  useKPIs,
  useTrends,
  useAlerts,
  useSeries,
  useActivity,
  useWidgets,
  useSavedReports,
  useFilters,
  useDashboardId,
  useLastUpdated,
  useAnalyticsLoading,
  useKPIsLoading,
  useSeriesLoading,
  useExportLoading,
  useAnalyticsError,
  useKPI,
  useTrend,
  useSeriesFor,
  useIsAnalyticsLoading,
  useCriticalAlertCount,
  useAnalyticsInit,
  useLoadDashboard,
  useSetDashboard,
  useSetFilters,
  useResetFilters,
  useSaveWidgets,
  useCreateReport,
  useExportCurrent,
  useRefreshKPIs,
  useAnalyticsTeardown,
  useAnalyticsBootstrap,
  useFilterPanel,
  useExportPanel,
} from './hooks/useAnalytics';

// ── Integration ───────────────────────────────────────────────
export {
  bootAnalyticsIntegration,
  teardownAnalyticsIntegration,
  emitKPIRefreshed,
  emitSnapshotSaved,
  emitReportExported,
  emitAlertTriggered,
  emitWidgetSaved,
  emitReportCreated,
} from './integrations/analyticsEventBus';

// ── Components ────────────────────────────────────────────────
export { default as StatCard }         from './components/StatCard';
export { default as TrendChart }       from './components/TrendChart';
export { default as BarChartWidget }   from './components/BarChartWidget';
export { default as DonutChart }       from './components/DonutChart';
export { default as ActivityFeed }     from './components/ActivityFeed';
export { default as HeatmapWidget }    from './components/HeatmapWidget';
export { default as ProgressWidget }   from './components/ProgressWidget';
export { default as KPIAlertCard }     from './components/KPIAlertCard';
export { default as FilterBar }        from './components/FilterBar';
export { default as DashboardBuilder } from './components/DashboardBuilder';

// ── Pages ─────────────────────────────────────────────────────
export { default as ExecutiveDashboard }    from './pages/ExecutiveDashboard';
export { default as AttendanceInsights }    from './pages/AttendanceInsights';
export { default as ProductivityReport }    from './pages/ProductivityReport';
export { default as TeamAnalytics }         from './pages/TeamAnalytics';
export { default as SystemHealthDashboard } from './pages/SystemHealthDashboard';

// ── Dev Monitor ───────────────────────────────────────────────
export { default as DevAnalyticsMonitor } from './monitor/DevAnalyticsMonitor';
