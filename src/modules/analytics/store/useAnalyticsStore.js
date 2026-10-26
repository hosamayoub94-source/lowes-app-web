// =============================================================
// Analytics Module — Zustand Store
//
// Single source of truth for analytics state. Components read it ONLY
// through hooks/useAnalytics.js. All data comes from services (real data;
// each metric carries its own status/reason — see kpiEngine.js).
//
// State:
//   kpis / kpiMeta / prevKpis / trends   current values, per-metric status+source, previous period, comparison
//   alerts                               "needs attention" items
//   series / seriesMeta                  daily points per metric + status
//   breakdown                            per-employee table (team report)
//   activity / activityMeta              recent activity feed
//   filters                              { preset, from, to, team, employeeId }  (local dates)
//   directory                            { teams, employees } for the filter bar
//   status                               'idle' | 'loading' | 'ok' | 'error'
// =============================================================
import { create }               from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  DASHBOARD_ID,
  DATE_RANGE_PRESET,
  KPI_REFRESH_INTERVAL_MS,
  DEFAULT_WIDGETS,
  resolveDateRange,
} from '../types/analytics.types';

const DEFAULT_PRESET = DATE_RANGE_PRESET.LAST_7_DAYS;

function _defaultFilters() {
  return {
    preset: DEFAULT_PRESET,
    ...resolveDateRange(DEFAULT_PRESET),
    team: null,
    employeeId: null,
  };
}

function _initState() {
  return {
    kpis:        {},
    kpiMeta:     {},
    prevKpis:    {},
    trends:      {},
    alerts:      [],
    series:      {},
    seriesMeta:  {},
    breakdown:   [],
    activity:    [],
    activityMeta:null,
    scope:       null,
    range:       null,
    previousRange: null,
    widgets:     DEFAULT_WIDGETS[DASHBOARD_ID.EXECUTIVE] ?? [],
    savedReports:[],
    directory:   { teams: [], employees: [], status: 'idle', reason: null },

    filters: _defaultFilters(),
    dashboardId: DASHBOARD_ID.EXECUTIVE,

    status: 'idle',
    loading: { kpis: false, series: false, widgets: false, reports: false },

    error:        null,
    lastUpdated:  null,

    _userId:        null,
    _requestId:     0,
    _realtimeTimer: null,
  };
}

const useAnalyticsStore = create()(
  subscribeWithSelector((set, get) => ({
    ..._initState(),

    // ── Initialise for a user ─────────────────────────────
    async init(userId, initial = {}) {
      set((s) => ({
        _userId: userId,
        ...(initial.dashboardId ? { dashboardId: initial.dashboardId } : {}),
        ...(initial.filters ? { filters: { ...s.filters, ...initial.filters } } : {}),
      }));
      await Promise.all([get().loadDirectory(), get().loadDashboard(), get().loadWidgets(userId)]);
      get()._startPolling();
    },

    async loadDirectory() {
      try {
        const { fetchDirectory } = await import('../services/kpiEngine');
        const d = await fetchDirectory();
        set({ directory: { teams: d.teams, employees: d.employees, status: d.status, reason: d.reason } });
      } catch (err) {
        set({ directory: { teams: [], employees: [], status: 'error', reason: err?.message ?? 'تعذّر تحميل قائمة الفرق والموظفين' } });
      }
    },

    // ── Full dashboard refresh (stale responses are dropped) ──
    async loadDashboard({ silent = false } = {}) {
      const { filters, dashboardId } = get();
      const requestId = get()._requestId + 1;
      set((s) => ({
        _requestId: requestId,
        error: null,
        ...(silent ? {} : { status: 'loading', loading: { ...s.loading, kpis: true, series: true } }),
      }));
      try {
        const { aggregateMetrics } = await import('../services/analyticsService');
        const result = await aggregateMetrics({ dashboardId, filters });
        if (get()._requestId !== requestId) return;
        set((s) => ({
          kpis:         result.kpis,
          kpiMeta:      result.kpiMeta,
          prevKpis:     result.prevKpis,
          trends:       result.trends,
          alerts:       result.alerts,
          series:       result.series,
          seriesMeta:   result.seriesMeta,
          breakdown:    result.breakdown,
          activity:     result.activity,
          activityMeta: result.activityMeta,
          scope:        result.scope,
          range:        result.range,
          previousRange:result.previousRange,
          lastUpdated:  result.generatedAt,
          status:       'ok',
          loading:      { ...s.loading, kpis: false, series: false },
        }));
      } catch (err) {
        if (get()._requestId !== requestId) return;
        set((s) => ({
          status: 'error',
          loading: { ...s.loading, kpis: false, series: false },
          error:   err?.message ?? 'خطأ في تحميل البيانات',
        }));
      }
    },

    // ── Switch report tab ─────────────────────────────────
    async setDashboard(dashboardId) {
      if (get().dashboardId === dashboardId) return;
      set({ dashboardId });
      await get().loadDashboard();
    },

    // ── Filter management ─────────────────────────────────
    async setFilters(partial) {
      const current = get().filters;
      let next = { ...current, ...partial };

      if (partial.preset && partial.preset !== DATE_RANGE_PRESET.CUSTOM) {
        next = { ...next, ...resolveDateRange(partial.preset, next) };
      } else if (('from' in partial || 'to' in partial) && !partial.preset) {
        next = { ...next, preset: DATE_RANGE_PRESET.CUSTOM };
      }
      // changing team clears an employee that no longer belongs to it
      if ('team' in partial && partial.team && next.employeeId) {
        const emp = get().directory.employees.find((e) => e.id === next.employeeId);
        if (emp && emp.team !== partial.team) next = { ...next, employeeId: null };
      }

      set({ filters: next });
      await get().loadDashboard();
    },

    resetFilters() {
      set({ filters: _defaultFilters() });
      return get().loadDashboard();
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
      } catch {
        // a missing saved layout is not an error for the user — keep the default layout
        set((s) => ({ widgets: DEFAULT_WIDGETS[dashboardId] ?? DEFAULT_WIDGETS[DASHBOARD_ID.EXECUTIVE] ?? [], loading: { ...s.loading, widgets: false } }));
      }
    },

    async saveWidgets(widgets) {
      const userId      = get()._userId;
      const dashboardId = get().dashboardId;
      if (!userId) return { ok: false };
      set({ widgets });
      try {
        const { saveWidgetLayout } = await import('../services/analyticsService');
        await saveWidgetLayout(userId, dashboardId, widgets);
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: err?.message ?? 'تعذّر حفظ التخطيط' };
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
      const { createSavedReport } = await import('../services/analyticsService');
      const report = await createSavedReport(userId, config);
      set((s) => ({ savedReports: [report, ...s.savedReports] }));
      return report;
    },

    // ── Refresh (user button + polling) ───────────────────
    async refresh({ silent = false } = {}) {
      get().invalidateCache();
      await get().loadDashboard({ silent });
    },

    refreshKPIs() {
      return get().loadDashboard({ silent: true });
    },

    invalidateCache() {
      import('../services/analyticsService').then(({ invalidateAnalyticsCache }) => invalidateAnalyticsCache());
    },

    // ── Polling ───────────────────────────────────────────
    _startPolling() {
      get()._stopPolling();
      const handle = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        get().loadDashboard({ silent: true });
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
      set({ ..._initState(), _requestId: get()._requestId + 1 });
    },
  })),
);

export default useAnalyticsStore;
