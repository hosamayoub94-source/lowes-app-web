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
  KPI_DRILLDOWN,
  LOWER_IS_BETTER_KPIS,
  DASHBOARD_ID,
  DASHBOARD_METRICS,
  DEVICE_KPIS,
  ANALYTICS_TAB,
  ANALYTICS_TABS,
  WIDGET_TYPE,
  REPORT_TYPE,
  EXPORT_FORMAT,
  EXPORT_STATUS,
  SNAPSHOT_PERIOD,
  DATE_RANGE_PRESET,
  DATE_RANGE_LABELS,
  DEFAULT_WIDGETS,
  ACTIVITY_ICONS,
  ANALYTICS_CACHE_TTL_MS,
  CHART_MAX_DATA_POINTS,
  EXPORT_MAX_ROWS,
  KPI_REFRESH_INTERVAL_MS,
  resolveDateRange,
  formatKPI,
  getKPIStatus,
} from './types/analytics.types';

// ── Pure report logic (dates, scope, aggregation, alerts, CSV) ──
export * as reportMath from './services/reportMath';

// ── Services ──────────────────────────────────────────────────
export {
  aggregateMetrics,
  getDefaultMetricsForDashboard,
  saveSnapshot,
  fetchWidgets,
  saveWidgetLayout,
  fetchSavedReports,
  createSavedReport,
  createExportJob,
  invalidateAnalyticsCache,
  incrementCounter,
  getRealtimeStats,
} from './services/analyticsService';

export {
  computeKPIs,
  computeTimeSeries,
  fetchDirectory,
  fetchRecentActivity,
  clearKPICache,
} from './services/kpiEngine';

export { exportReport } from './services/exportService';

// ── Store ─────────────────────────────────────────────────────
export { default as useAnalyticsStore } from './store/useAnalyticsStore';

// ── Hooks ─────────────────────────────────────────────────────
export {
  useKPIs,
  useKpiMetaMap,
  useTrends,
  useAlerts,
  useBreakdown,
  useActivity,
  useActivityMeta,
  useWidgets,
  useFilters,
  useDirectory,
  useDashboardId,
  useLastUpdated,
  useRange,
  usePreviousRange,
  useAnalyticsStatus,
  useAnalyticsError,
  useKPI,
  useKpiMeta,
  useTrend,
  usePrevKPI,
  useSeriesFor,
  useSeriesMeta,
  useIsAnalyticsLoading,
  useKPIsLoading,
  useAnalyticsAccess,
  useAnalyticsBootstrap,
  useSetDashboard,
  useRefresh,
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
export { default as BreakdownTable }   from './components/BreakdownTable';
export { default as StateBox }         from './components/StateBox';

// ── Pages ─────────────────────────────────────────────────────
export { default as AnalyticsHub }          from './pages/AnalyticsHub';
export { default as ExecutiveDashboard }    from './pages/ExecutiveDashboard';
export { default as AttendanceInsights }    from './pages/AttendanceInsights';
export { default as ProductivityReport }    from './pages/ProductivityReport';
export { default as TeamAnalytics }         from './pages/TeamAnalytics';
export { default as SystemHealthDashboard } from './pages/SystemHealthDashboard';

// ── Dev Monitor ───────────────────────────────────────────────
export { default as DevAnalyticsMonitor } from './monitor/DevAnalyticsMonitor';
