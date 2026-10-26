// =============================================================
// Analytics Module — Analytics Service
//
// Orchestrator between the KPI engine (real data) and the store:
//   aggregateMetrics(opts)      → one bundle: KPIs + previous period + trends + alerts + series
//   saveSnapshot(type, metrics) → persist to analytics_snapshots
//   fetchWidgets / saveWidgetLayout, fetchSavedReports / createSavedReport, createExportJob
//   incrementCounter / getRealtimeStats → in-memory counters (dev monitor)
//
// No mock mode: see kpiEngine.js. Layout defaults (DEFAULT_WIDGETS) are UI layout, not data.
// =============================================================
import { supabase } from '@services/supabase';
import {
  computeKPIs,
  computeTimeSeries,
  fetchRecentActivity,
  clearKPICache,
} from './kpiEngine';
import {
  buildAlerts,
  compareAll,
  normalizeRange,
  previousPeriod,
} from './reportMath';
import {
  DASHBOARD_ID,
  DASHBOARD_METRICS,
  DEFAULT_WIDGETS,
  DEVICE_KPIS,
} from '../types/analytics.types';

// ── Realtime counters (in-process, reset on reload) ──────────
const _counters = {
  checkInsToday:    0,
  tasksCompleted:   0,
  filesUploaded:    0,
  errorsTotal:      0,
  notificationsSent:0,
  dealsWon:         0,
};

export function incrementCounter(key) {
  if (key in _counters) _counters[key]++;
}

export function getRealtimeStats() {
  return { ..._counters };
}

// ── Aggregate metrics — main consumer API ─────────────────────

/**
 * @param {object} opts
 * @param {string} [opts.dashboardId]
 * @param {{from:string,to:string,team?:string|null,employeeId?:string|null}} opts.filters
 */
export async function aggregateMetrics({ dashboardId = DASHBOARD_ID.EXECUTIVE, filters } = {}) {
  const range = normalizeRange(filters?.from, filters?.to);
  if (range.valid === false) throw new Error('نطاق التاريخ غير مكتمل أو غير صالح — اختر تاريخ بداية ونهاية صحيحين.');
  if (range.tooLong) throw new Error('نطاق التاريخ أطول من سنة — اختر فترة أقصر.');
  const f = { ...filters, from: range.from, to: range.to };
  const prevRange = previousPeriod(f.from, f.to);

  const cfg = DASHBOARD_METRICS[dashboardId] ?? DASHBOARD_METRICS[DASHBOARD_ID.EXECUTIVE];
  const wantsActivity = dashboardId === DASHBOARD_ID.EXECUTIVE || dashboardId === DASHBOARD_ID.TEAM;

  const [current, previous, activity, seriesArr] = await Promise.all([
    computeKPIs(f),
    computeKPIs({ ...f, ...prevRange }),
    wantsActivity ? fetchRecentActivity() : Promise.resolve(null),
    Promise.all(cfg.series.map(async (m) => [m, await computeTimeSeries(m, f)])),
  ]);

  const trends = compareAll(current.values, previous.values);
  for (const m of DEVICE_KPIS) trends[m] = { available: false };

  const relevant = new Set(cfg.kpis);
  const alerts = buildAlerts(current.values, current.meta, trends).filter((a) => relevant.has(a.metric));

  return {
    kpis: current.values,
    kpiMeta: current.meta,
    prevKpis: previous.values,
    trends,
    alerts,
    series: Object.fromEntries(seriesArr.map(([m, r]) => [m, r.points])),
    seriesMeta: Object.fromEntries(seriesArr.map(([m, r]) => [m, { status: r.status, reason: r.reason, source: r.source }])),
    breakdown: current.breakdown,
    scope: current.scope,
    activity: activity?.items ?? [],
    activityMeta: activity ? { status: activity.status, reason: activity.reason, source: activity.source } : null,
    range: { from: f.from, to: f.to },
    previousRange: prevRange,
    generatedAt: new Date().toISOString(),
  };
}

export function getDefaultMetricsForDashboard(dashboardId) {
  return (DASHBOARD_METRICS[dashboardId] ?? DASHBOARD_METRICS[DASHBOARD_ID.EXECUTIVE]).kpis;
}

// ── Snapshots ─────────────────────────────────────────────────

export async function saveSnapshot(snapshotType, metrics, opts = {}) {
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

export async function fetchWidgets(userId, dashboardId = DASHBOARD_ID.EXECUTIVE) {
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
  const { data, error } = await supabase
    .from('saved_reports')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createSavedReport(userId, config) {
  const { data, error } = await supabase
    .from('saved_reports')
    .insert({ owner_id: userId, ...config })
    .select().single();
  if (error) throw error;
  return data;
}

// ── Export job management ─────────────────────────────────────

export async function createExportJob(userId, format, reportConfig) {
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
