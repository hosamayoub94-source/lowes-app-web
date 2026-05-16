// =============================================================
// Analytics Module — Zustand Store
//
// Single source of truth for all analytics state.
// Never import directly from other module stores — all cross-
// module data comes via lazy service imports.
//
// State shape:
//   kpis            — current KPI snapshot
//   trends          — delta/direction vs previous period
//   alerts          — threshold violations
//   series          — time-series per metric
//   activity        — recent activity feed
//   widgets         — current dashboard widget configs
//   savedReports    — user's saved report definitions
//   filters         — active AnalyticsFilters
//   dashboardId     — which dashboard is shown
//   loading         — granular loading flags
//   error           — last error message
//   lastUpdated     — ISO string of last full refresh
//   _realtimeTimer  — setInterval handle for polling
// =============================================================
import { create }               from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  DASHBOARD_ID,
  DATE_RANGE_PRESET,
  KPI_REFRESH_INTERVAL_MS,
  resolveDateRange,
} from '../types/analytics.types';

// ── Initial state factory ─────────────────────────────────────
function _initState() {
  return {
    kpis:        {},
    trends:      {},
    alerts:      [],
    series:      {},
    activity:    [],
    widgets:     [],
    savedReports:[],

    // Filters
    filters: {
      preset:       DATE_RANGE_PRESET.LAST_7_DAYS,
      ...resolveDateRange(DATE_RANGE_PRESET.LAST_7_DAYS),
      departmentId: null,
      roleId:       null,
      shiftId:      null,
      employeeIds:  [],
    },

    dashboardId: DASHBOARD_ID.EXECUTIVE,

    loading: {
      kpis:     false,
      series:   false,
      widgets:  false,
      reports:  false,
      export:   false,
    },

    error:        null,
    lastUpdated:  null,

    // Internal
    _userId:        null,
    _realtimeTimer: null,
  };
}

// ── Store ─────────────────────────────────────────────────────
const useAnalyticsStore = create()(
  subscribeWithSelector((set, get) => ({
    ..._initState(),

    // ── Initialise for a user ─────────────────────────────
    async init(userId) {
      set({ _userId: userId });
      await get().loadDashboard();
      await get().loadWidgets(userId);
      await get().loadSavedReports(userId);
      get()._startPolling(userId);
    },

    // ── Full dashboard refresh ────────────────────────────
    async loadDashboard() {
      const { filters, dashboardId } = get();
      set((s) => ({ loading: { ...s.loading, kpis: true, series: true }, error: null }));
      try {
        const { aggregateMetrics } = await import('../services/analyticsService');
        const result = await aggregateMetrics({ dashboardId, filters });
        set({
          kpis:        result.kpis,
          trends:      result.trends,
          alerts:      result.alerts,
          series:      result.series,
          activity:    result.activity,
          lastUpdated: result.generatedAt,
          loading:     { ...get().loading, kpis: false, series: false },
        });
      } catch (err) {
        set((s) => ({
          loading: { ...s.loading, kpis: false, series: false },
          error:   err?.message ?? 'خطأ في تحميل البيانات',
        }));
      }
    },

    // ── Switch dashboard tab ──────────────────────────────
    async setDashboard(dashboardId) {
      set({ dashboardId });
      const userId = get()._userId;
      await Promise.all([
        get().loadDashboard(),
        get().loadWidgets(userId),
      ]);
    },

    // ── Filter management ─────────────────────────────────
    async setFilters(partial) {
      const current = get().filters;
      let next = { ...current, ...partial };

      // If preset changed, re-resolve from/to
      if (partial.preset && partial.preset !== current.preset) {
        const range = resolveDateRange(partial.preset, next);
        next = { ...next, ...range };
      }

      set({ filters: next });
      await get().loadDashboard();
    },

    resetFilters() {
      const preset = DATE_RANGE_PRESET.LAST_7_DAYS;
      set({
        filters: {
          preset,
          ...resolveDateRange(preset),
          departmentId: null,
          roleId:       null,
          shiftId:      null,
          employeeIds:  [],
        },
      });
      get().loadDashboard();
    },

    // ── Widget CRUD ───────────────────────────────────────
    async loadWidgets(userId) {
      const { dashboardId } = get();
      if (!userId) return;
      set((s) => ({ loading: { ...s.loading, widgets: true } }));
      try {
        const { fetchWidgets } = await import('../services/analyticsService');
        const widgets = await fetchWidgets(userId, dashboardId);
        set((s) => ({ widgets, loading: { ...s.loading, widgets: false } }));
      } catch (err) {
        set((s) => ({ loading: { ...s.loading, widgets: false }, error: err?.message }));
      }
    },

    async saveWidgets(widgets) {
      const userId      = get()._userId;
      const dashboardId = get().dashboardId;
      if (!userId) return;
      set({ widgets });
      try {
        const { saveWidgetLayout } = await import('../services/analyticsService');
        await saveWidgetLayout(userId, dashboardId, widgets);
      } catch (err) {
        console.warn('[Analytics] Widget save failed:', err?.message);
      }
    },

    // ── Saved reports ─────────────────────────────────────
    async loadSavedReports(userId) {
      if (!userId) return;
      set((s) => ({ loading: { ...s.loading, reports: true } }));
      try {
        const { fetchSavedReports } = await import('../services/analyticsService');
        const savedReports = await fetchSavedReports(userId);
        set((s) => ({ savedReports, loading: { ...s.loading, reports: false } }));
      } catch (err) {
        set((s) => ({ loading: { ...s.loading, reports: false }, error: err?.message }));
      }
    },

    async createReport(config) {
      const userId = get()._userId;
      if (!userId) return;
      try {
        const { createSavedReport } = await import('../services/analyticsService');
        const report = await createSavedReport(userId, config);
        set((s) => ({ savedReports: [report, ...s.savedReports] }));
        return report;
      } catch (err) {
        set({ error: err?.message });
        throw err;
      }
    },

    // ── Export ────────────────────────────────────────────
    async exportCurrent(format) {
      const { filters, dashboardId } = get();
      set((s) => ({ loading: { ...s.loading, export: true } }));
      try {
        const { generateReport } = await import('../services/analyticsService');
        const { exportReport }   = await import('../services/exportService');

        // Determine metrics for this dashboard
        const { _defaultMetricsForDashboard } = await import('../services/analyticsService');
        const metrics = _defaultMetricsForDashboard?.(dashboardId) ?? Object.keys(get().kpis);

        const { columns, rows } = await generateReport({
          reportType: dashboardId,
          filters,
          metrics,
          grouping: 'day',
        });

        await exportReport({
          format,
          columns,
          rows,
          title: `تقرير ${dashboardId}`,
          filename: `${dashboardId}_${new Date().toISOString().slice(0, 10)}`,
        });
      } catch (err) {
        set({ error: err?.message });
      } finally {
        set((s) => ({ loading: { ...s.loading, export: false } }));
      }
    },

    // ── Refresh KPIs (light — no series) ─────────────────
    async refreshKPIs() {
      const { filters } = get();
      try {
        const { computeKPIs, evaluateAlerts, compareKPIs } = await import('../services/kpiEngine');
        const [current, previous] = await Promise.all([
          computeKPIs(filters),
          computeKPIs({ ..._shiftPeriodBack(filters) }),
        ]);
        set({
          kpis:        current,
          trends:      compareKPIs(current, previous),
          alerts:      evaluateAlerts(current),
          lastUpdated: new Date().toISOString(),
        });
      } catch {
        // Silent — polling should not break the UI
      }
    },

    // ── Cache invalidation ────────────────────────────────
    invalidateCache() {
      import('../services/analyticsService').then(({ invalidateAnalyticsCache }) => {
        invalidateAnalyticsCache();
      });
    },

    // ── Realtime polling ──────────────────────────────────
    _startPolling(userId) {
      get()._stopPolling();
      const handle = setInterval(() => {
        get().refreshKPIs();
      }, KPI_REFRESH_INTERVAL_MS);
      set({ _realtimeTimer: handle });
    },

    _stopPolling() {
      const handle = get()._realtimeTimer;
      if (handle) {
        clearInterval(handle);
        set({ _realtimeTimer: null });
      }
    },

    // ── Teardown ──────────────────────────────────────────
    teardown() {
      get()._stopPolling();
      set(_initState());
    },
  })),
);

export default useAnalyticsStore;

// ── Private helpers ───────────────────────────────────────────

function _shiftPeriodBack(filters) {
  if (!filters.from || !filters.to) return {};
  const from = new Date(filters.from);
  const to   = new Date(filters.to);
  const diff = to - from;
  const prevTo   = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - diff);
  return { ...filters, from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
}
