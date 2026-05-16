// =============================================================
// Analytics Module — Hooks
//
// Thin selectors and action wrappers over useAnalyticsStore.
// Components import ONLY from here — never the store directly.
// =============================================================
import { useCallback } from 'react';
import useAnalyticsStore from '../store/useAnalyticsStore';

// ── State selectors ───────────────────────────────────────────

export const useKPIs        = () => useAnalyticsStore((s) => s.kpis);
export const useTrends      = () => useAnalyticsStore((s) => s.trends);
export const useAlerts      = () => useAnalyticsStore((s) => s.alerts);
export const useSeries      = () => useAnalyticsStore((s) => s.series);
export const useActivity    = () => useAnalyticsStore((s) => s.activity);
export const useWidgets     = () => useAnalyticsStore((s) => s.widgets);
export const useSavedReports= () => useAnalyticsStore((s) => s.savedReports);
export const useFilters     = () => useAnalyticsStore((s) => s.filters);
export const useDashboardId = () => useAnalyticsStore((s) => s.dashboardId);
export const useLastUpdated = () => useAnalyticsStore((s) => s.lastUpdated);

// Granular loading flags
export const useAnalyticsLoading = () => useAnalyticsStore((s) => s.loading);
export const useKPIsLoading      = () => useAnalyticsStore((s) => s.loading.kpis);
export const useSeriesLoading    = () => useAnalyticsStore((s) => s.loading.series);
export const useExportLoading    = () => useAnalyticsStore((s) => s.loading.export);
export const useAnalyticsError   = () => useAnalyticsStore((s) => s.error);

/** Single KPI value by key */
export function useKPI(metric) {
  return useAnalyticsStore((s) => s.kpis[metric] ?? null);
}

/** Single metric trend { delta, trendPct, direction } */
export function useTrend(metric) {
  return useAnalyticsStore((s) => s.trends[metric] ?? { delta: 0, trendPct: 0, direction: 'flat' });
}

/** Time series for a specific metric */
export function useSeriesFor(metric) {
  return useAnalyticsStore((s) => s.series[metric] ?? []);
}

/** Has any loading flag active */
export function useIsAnalyticsLoading() {
  return useAnalyticsStore((s) => Object.values(s.loading).some(Boolean));
}

/** Count of critical alerts */
export function useCriticalAlertCount() {
  return useAnalyticsStore((s) => s.alerts.filter((a) => a.status === 'critical').length);
}

// ── Action hooks ──────────────────────────────────────────────

export function useAnalyticsInit() {
  return useAnalyticsStore((s) => s.init);
}

export function useLoadDashboard() {
  return useAnalyticsStore((s) => s.loadDashboard);
}

export function useSetDashboard() {
  return useAnalyticsStore((s) => s.setDashboard);
}

export function useSetFilters() {
  return useAnalyticsStore((s) => s.setFilters);
}

export function useResetFilters() {
  return useAnalyticsStore((s) => s.resetFilters);
}

export function useSaveWidgets() {
  return useAnalyticsStore((s) => s.saveWidgets);
}

export function useCreateReport() {
  return useAnalyticsStore((s) => s.createReport);
}

export function useExportCurrent() {
  return useAnalyticsStore((s) => s.exportCurrent);
}

export function useRefreshKPIs() {
  return useAnalyticsStore((s) => s.refreshKPIs);
}

export function useAnalyticsTeardown() {
  return useAnalyticsStore((s) => s.teardown);
}

// ── Compound hooks ────────────────────────────────────────────

/**
 * Init hook — boots analytics on mount, tears down on unmount.
 * Usage: useAnalyticsInit in a top-level dashboard layout.
 */
import { useEffect } from 'react';

export function useAnalyticsBootstrap(userId) {
  const init     = useAnalyticsStore((s) => s.init);
  const teardown = useAnalyticsStore((s) => s.teardown);

  useEffect(() => {
    if (!userId) return;
    init(userId);
    return () => teardown();
  }, [userId, init, teardown]);
}

/**
 * Dashboard filter state + setters bundled for filter panels.
 */
export function useFilterPanel() {
  const filters    = useFilters();
  const setFilters = useSetFilters();
  const reset      = useResetFilters();

  const setPreset       = useCallback((preset)       => setFilters({ preset }), [setFilters]);
  const setDateRange    = useCallback((from, to)     => setFilters({ from, to }), [setFilters]);
  const setDepartment   = useCallback((departmentId) => setFilters({ departmentId }), [setFilters]);
  const setRole         = useCallback((roleId)       => setFilters({ roleId }), [setFilters]);
  const setShift        = useCallback((shiftId)      => setFilters({ shiftId }), [setFilters]);
  const setEmployees    = useCallback((ids)          => setFilters({ employeeIds: ids }), [setFilters]);

  return {
    filters,
    setPreset,
    setDateRange,
    setDepartment,
    setRole,
    setShift,
    setEmployees,
    reset,
  };
}

/**
 * Export panel hook — handles format selection + download trigger.
 */
export function useExportPanel() {
  const exportCurrent = useExportCurrent();
  const isExporting   = useExportLoading();

  const download = useCallback(
    (format) => exportCurrent(format),
    [exportCurrent],
  );

  return { download, isExporting };
}
