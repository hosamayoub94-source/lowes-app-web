// =============================================================
// Analytics Module — Analytics Service
//
// Top-level orchestrator for analytics data:
//   aggregateMetrics(filters)   → full KPI + series bundle
//   generateReport(config)      → report data ready for export
//   saveSnapshot(period, data)  → persist to analytics_snapshots
//   loadSnapshot(type, date)    → load a saved snapshot
//   fetchWidgets(userId, dashId)→ load widget configs
//   saveWidgetLayout(widgets)   → persist widget positions
//   fetchSavedReports(userId)   → list saved report configs
//   createSavedReport(config)   → save a new report
//   getRealtimeStats()          → very-fast in-memory counters
// =============================================================
import {
  USE_MOCK,
  computeKPIs,
  computeTimeSeries,
  evaluateAlerts,
  compareKPIs,
  clearKPICache,
} from './kpiEngine';
import {
  KPI,
  DASHBOARD_ID,
  DEFAULT_WIDGETS,
  MOCK_ACTIVITY,
  generateMockTimeSeries,
  resolveDateRange,
  DATE_RANGE_PRESET,
  CHART_MAX_DATA_POINTS,
} from '../types/analytics.types';

export { USE_MOCK };

// ── Realtime counters (in-process, reset on reload) ──────────
const _counters = {
  checkInsToday:    0,
  tasksCompleted:   0,
  filesUploaded:    0,
  errorsTotal:      0,
  notificationsSent:0,
};

export function incrementCounter(key) {
  if (key in _counters) _counters[key]++;
}

export function getRealtimeStats() {
  return { ..._counters };
}

// ── Mock widget store ─────────────────────────────────────────
const _mockWidgets = new Map(); // dashId → widgets[]

// ── Aggregate metrics — main consumer API ─────────────────────

/**
 * Full metrics bundle for a dashboard.
 * Returns current KPIs + trends + time series + alerts + activity.
 *
 * @param {object} opts
 * @param {string} [opts.dashboardId]
 * @param {object} [opts.filters]   AnalyticsFilters
 * @param {string[]} [opts.metrics]  explicit metrics subset
 * @returns {Promise<AnalyticsBundleResult>}
 */
export async function aggregateMetrics({ dashboardId = DASHBOARD_ID.EXECUTIVE, filters = {}, metrics } = {}) {
  const [currentKPIs, previousKPIs] = await Promise.all([
    computeKPIs(filters),
    computeKPIs({ ..._shiftPeriodBack(filters) }),
  ]);

  const trends = compareKPIs(currentKPIs, previousKPIs);
  const alerts = evaluateAlerts(currentKPIs);

  // Load time series for key metrics (lazily)
  const seriesMetrics = metrics ?? _defaultSeriesMetrics(dashboardId);
  const seriesArr = await Promise.all(
    seriesMetrics.map(async (m) => ({
      metric: m,
      data:   await computeTimeSeries(m, filters),
    })),
  );
  const series = Object.fromEntries(seriesArr.map((s) => [s.metric, s.data]));

  const activity = USE_MOCK
    ? MOCK_ACTIVITY
    : await _fetchRecentActivity(filters);

  return { kpis: currentKPIs, trends, alerts, series, activity, generatedAt: new Date().toISOString() };
}

// ── Generate report data ──────────────────────────────────────

/**
 * Build report rows ready for export.
 *
 * @param {object} config
 * @param {string}   config.reportType
 * @param {object}   config.filters
 * @param {string[]} config.metrics
 * @param {string}   config.grouping  'day'|'week'|'month'
 * @returns {Promise<{columns: string[], rows: object[]}>}
 */
export async function generateReport({ reportType, filters = {}, metrics = [], grouping = 'day' }) {
  if (USE_MOCK) return _mockReportData(reportType, filters, metrics, grouping);

  try {
    const { from, to } = resolveDateRange(DATE_RANGE_PRESET.CUSTOM, filters);
    const { supabase }  = await import('@services/supabase');

    const { data } = await supabase
      .from('analytics_snapshots')
      .select('period_start, metrics')
      .eq('snapshot_type', grouping === 'day' ? 'daily' : grouping === 'week' ? 'weekly' : 'monthly')
      .gte('period_start', from + 'T00:00:00Z')
      .lte('period_start', to   + 'T23:59:59Z')
      .order('period_start', { ascending: true });

    const rows = (data ?? []).map((row) => ({
      date: row.period_start.slice(0, 10),
      ...Object.fromEntries(metrics.map((m) => [m, row.metrics?.[m] ?? null])),
    }));

    return { columns: ['date', ...metrics], rows };
  } catch {
    return _mockReportData(reportType, filters, metrics, grouping);
  }
}

// ── Snapshots ─────────────────────────────────────────────────

export async function saveSnapshot(snapshotType, metrics, opts = {}) {
  if (USE_MOCK) {
    console.info('[Analytics] Mock snapshot saved:', snapshotType);
    return { id: `mock_${Date.now()}`, snapshotType, metrics };
  }
  const { supabase } = await import('@services/supabase');
  const now = new Date();
  const { data, error } = await supabase.from('analytics_snapshots').insert({
    snapshot_type: snapshotType,
    period_start:  opts.periodStart ?? now.toISOString(),
    period_end:    opts.periodEnd   ?? now.toISOString(),
    metrics,
    department_id: opts.departmentId ?? null,
    role_id:       opts.roleId       ?? null,
    shift_id:      opts.shiftId      ?? null,
    is_published:  true,
  }).select().single();
  if (error) throw error;
  return data;
}

// ── Widget layout CRUD ────────────────────────────────────────

export async function fetchWidgets(userId, dashboardId = DASHBOARD_ID.EXECUTIVE) {
  if (USE_MOCK) {
    if (!_mockWidgets.has(dashboardId)) {
      _mockWidgets.set(dashboardId, _seedDefaultWidgets(dashboardId, userId));
    }
    return _mockWidgets.get(dashboardId);
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase
    .from('dashboard_widgets')
    .select('*')
    .eq('user_id', userId)
    .eq('dashboard_id', dashboardId)
    .eq('is_visible', true)
    .order('sort_order');
  if (error) throw error;
  if (!data?.length) return _seedDefaultWidgets(dashboardId, userId);
  return data;
}

export async function saveWidgetLayout(userId, dashboardId, widgets) {
  if (USE_MOCK) {
    _mockWidgets.set(dashboardId, widgets);
    return widgets;
  }
  const { supabase } = await import('@services/supabase');
  // Upsert all widgets
  const upserts = widgets.map((w, i) => ({
    ...w,
    user_id:      userId,
    dashboard_id: dashboardId,
    sort_order:   i,
    updated_at:   new Date().toISOString(),
  }));
  const { data, error } = await supabase
    .from('dashboard_widgets')
    .upsert(upserts, { onConflict: 'id' })
    .select();
  if (error) throw error;
  return data;
}

// ── Saved reports ─────────────────────────────────────────────

export async function fetchSavedReports(userId) {
  if (USE_MOCK) return _mockSavedReports(userId);
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase
    .from('saved_reports')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createSavedReport(userId, config) {
  if (USE_MOCK) return { id: `mock_report_${Date.now()}`, owner_id: userId, ...config };
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase
    .from('saved_reports')
    .insert({ owner_id: userId, ...config })
    .select().single();
  if (error) throw error;
  return data;
}

// ── Export job management ─────────────────────────────────────

export async function createExportJob(userId, format, reportConfig) {
  if (USE_MOCK) {
    return {
      id:           `export_${Date.now()}`,
      requested_by: userId,
      format,
      status:       'pending',
      filters_used: reportConfig.filters ?? {},
    };
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase
    .from('report_exports')
    .insert({
      requested_by: userId,
      format,
      status:       'pending',
      filters_used: reportConfig.filters ?? {},
      metadata:     reportConfig,
    })
    .select().single();
  if (error) throw error;
  return data;
}

// ── Cache invalidation ────────────────────────────────────────

export function invalidateAnalyticsCache() {
  clearKPICache();
}

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

function _defaultSeriesMetrics(dashboardId) {
  const map = {
    [DASHBOARD_ID.EXECUTIVE]:    [KPI.ATTENDANCE_RATE, KPI.PRODUCTIVITY_SCORE, KPI.COMPLETED_TASKS],
    [DASHBOARD_ID.ATTENDANCE]:   [KPI.ATTENDANCE_RATE, KPI.LATE_EMPLOYEES, KPI.ABSENT_EMPLOYEES],
    [DASHBOARD_ID.PRODUCTIVITY]:  [KPI.PRODUCTIVITY_SCORE, KPI.COMPLETED_TASKS, KPI.OVERDUE_TASKS],
    [DASHBOARD_ID.TEAM]:         [KPI.ACTIVE_USERS, KPI.COMPLETED_TASKS, KPI.ATTENDANCE_RATE],
    [DASHBOARD_ID.SYSTEM]:       [KPI.SYSTEM_ERROR_COUNT, KPI.QUEUE_JOB_SUCCESS_RATE, KPI.AVG_RESPONSE_TIME_MS],
  };
  return map[dashboardId] ?? [KPI.ATTENDANCE_RATE];
}

async function _fetchRecentActivity() {
  return MOCK_ACTIVITY;
}

function _seedDefaultWidgets(dashboardId, userId) {
  const defaults = DEFAULT_WIDGETS[dashboardId] ?? DEFAULT_WIDGETS[DASHBOARD_ID.EXECUTIVE];
  return defaults.map((w, i) => ({
    id:           `default_${dashboardId}_${i}`,
    user_id:      userId,
    dashboard_id: dashboardId,
    sort_order:   i,
    is_visible:   true,
    ...w,
  }));
}

function _mockReportData(reportType, filters, metrics, grouping) {
  const days = 30;
  const series = metrics.map((m) => ({ metric: m, data: generateMockTimeSeries(m, days) }));
  const allDates = series[0]?.data.map((p) => p.date) ?? [];
  const rows = allDates.map((date) => ({
    date,
    ...Object.fromEntries(
      series.map(({ metric, data }) => {
        const point = data.find((p) => p.date === date);
        return [metric, point ? +point.value.toFixed(1) : null];
      }),
    ),
  }));
  return { columns: ['date', ...metrics], rows };
}

function _mockSavedReports(userId) {
  return [
    {
      id: 'report_01', owner_id: userId,
      name: 'تقرير الحضور الشهري', report_type: 'attendance',
      metrics: [KPI.ATTENDANCE_RATE, KPI.LATE_EMPLOYEES, KPI.ABSENT_EMPLOYEES],
      filters: { preset: DATE_RANGE_PRESET.THIS_MONTH }, grouping: 'day',
      created_at: new Date().toISOString(),
    },
    {
      id: 'report_02', owner_id: userId,
      name: 'تقرير إنتاجية الفريق', report_type: 'productivity',
      metrics: [KPI.PRODUCTIVITY_SCORE, KPI.COMPLETED_TASKS, KPI.TASK_COMPLETION_RATE],
      filters: { preset: DATE_RANGE_PRESET.LAST_30_DAYS }, grouping: 'week',
      created_at: new Date().toISOString(),
    },
  ];
}
