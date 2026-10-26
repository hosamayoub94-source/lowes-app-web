// =============================================================
// Analytics Module — Hooks
//
// Thin selectors and action wrappers over useAnalyticsStore.
// Components import ONLY from here — never the store directly.
// =============================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import useAnalyticsStore from '../store/useAnalyticsStore';
import { usePermissions } from '@hooks/usePermissions';
import { PERMISSIONS } from '@data/permissions';
import { ROLES } from '@data/teams';
import { DASHBOARD_METRICS, EXPORT_FORMAT, ANALYTICS_TAB, DASHBOARD_ID } from '../types/analytics.types';
import { buildDailyRows, buildKpiExportRows, exportFilename } from '../services/reportMath';

// ── State selectors ───────────────────────────────────────────

export const useKPIs         = () => useAnalyticsStore((s) => s.kpis);
export const useKpiMetaMap   = () => useAnalyticsStore((s) => s.kpiMeta);
export const useTrends       = () => useAnalyticsStore((s) => s.trends);
export const useAlerts       = () => useAnalyticsStore((s) => s.alerts);
export const useBreakdown    = () => useAnalyticsStore((s) => s.breakdown);
export const useActivity     = () => useAnalyticsStore((s) => s.activity);
export const useActivityMeta = () => useAnalyticsStore((s) => s.activityMeta);
export const useWidgets      = () => useAnalyticsStore((s) => s.widgets);
export const useFilters      = () => useAnalyticsStore((s) => s.filters);
export const useDirectory    = () => useAnalyticsStore((s) => s.directory);
export const useDashboardId  = () => useAnalyticsStore((s) => s.dashboardId);
export const useLastUpdated  = () => useAnalyticsStore((s) => s.lastUpdated);
export const useRange        = () => useAnalyticsStore((s) => s.range);
export const usePreviousRange= () => useAnalyticsStore((s) => s.previousRange);
export const useAnalyticsStatus = () => useAnalyticsStore((s) => s.status);
export const useAnalyticsError  = () => useAnalyticsStore((s) => s.error);

/** Single KPI value (null = unavailable — see useKpiMeta for why) */
export function useKPI(metric) {
  return useAnalyticsStore((s) => s.kpis[metric] ?? null);
}

/** { status:'ok'|'empty'|'error'|'unavailable', reason, source } for one KPI */
export function useKpiMeta(metric) {
  return useAnalyticsStore((s) => s.kpiMeta[metric]) ?? null;
}

/** Previous-period comparison { available, delta, pct, direction, improving } */
export function useTrend(metric) {
  return useAnalyticsStore((s) => s.trends[metric]) ?? NO_TREND;
}
const NO_TREND = Object.freeze({ available: false });

export function usePrevKPI(metric) {
  return useAnalyticsStore((s) => s.prevKpis[metric] ?? null);
}

/** Daily points for a metric (array, maybe empty) */
export function useSeriesFor(metric) {
  return useAnalyticsStore((s) => s.series[metric]) ?? EMPTY;
}
const EMPTY = Object.freeze([]);

/** { status, reason, source } of a metric's series */
export function useSeriesMeta(metric) {
  return useAnalyticsStore((s) => s.seriesMeta[metric]) ?? null;
}

export function useIsAnalyticsLoading() {
  return useAnalyticsStore((s) => s.status === 'loading');
}

export const useKPIsLoading = useIsAnalyticsLoading;

// ── Access ────────────────────────────────────────────────────

export const ANALYTICS_ROLES = Object.freeze([ROLES.MANAGER, ROLES.ADMIN, ROLES.SALES_MANAGER]);

/**
 * Who may see/export analytics: the same rule as the /analytics route
 * (management roles + VIEW_ANALYTICS). System health is admin-only.
 */
export function useAnalyticsAccess() {
  const { can, role } = usePermissions();
  const canView = ANALYTICS_ROLES.includes(role) && can(PERMISSIONS.VIEW_ANALYTICS);
  return { canView, canExport: canView, isAdmin: role === ROLES.ADMIN, role };
}

// ── Actions ───────────────────────────────────────────────────

/** Boots analytics on mount, tears down on unmount. `initial` = { dashboardId, filters } */
export function useAnalyticsBootstrap(userId, initial) {
  const init     = useAnalyticsStore((s) => s.init);
  const teardown = useAnalyticsStore((s) => s.teardown);

  useEffect(() => {
    if (!userId) return undefined;
    init(userId, initial);
    return () => teardown();
    // `initial` is read once at mount on purpose (URL → first state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, init, teardown]);
}

export const useSetDashboard = () => useAnalyticsStore((s) => s.setDashboard);
export const useRefresh      = () => useAnalyticsStore((s) => s.refresh);

/** Filter state + setters (period, team, employee, reset). */
export function useFilterPanel() {
  const filters    = useFilters();
  const setFilters = useAnalyticsStore((s) => s.setFilters);
  const reset      = useAnalyticsStore((s) => s.resetFilters);

  const setPreset   = useCallback((preset) => setFilters({ preset }), [setFilters]);
  const setDateRange= useCallback((from, to) => setFilters({ from, to }), [setFilters]);
  const setTeam     = useCallback((team) => setFilters({ team: team || null }), [setFilters]);
  const setEmployee = useCallback((employeeId) => setFilters({ employeeId: employeeId || null }), [setFilters]);

  return { filters, setPreset, setDateRange, setTeam, setEmployee, reset };
}

/**
 * Export what is on screen. Rebuilt from the store at click time so the file
 * matches the displayed numbers and the filters that produced them.
 * @returns {{ canExport:boolean, isExporting:boolean, notice:{ok:boolean,text:string}|null, download:(format:string, kind?:'kpi'|'daily'|'team')=>Promise<void> }}
 */
export function useExportPanel() {
  const { canExport } = useAnalyticsAccess();
  const [isExporting, setExporting] = useState(false);
  const [notice, setNotice] = useState(null);

  const download = useCallback(async (format = EXPORT_FORMAT.CSV, kind = 'kpi') => {
    if (!canExport) {
      setNotice({ ok: false, text: 'لا تملك صلاحية تصدير التقارير.' });
      return;
    }
    const s = useAnalyticsStore.getState();
    const cfg = DASHBOARD_METRICS[s.dashboardId] ?? DASHBOARD_METRICS[DASHBOARD_ID.EXECUTIVE];
    if (!s.range || s.status !== 'ok') {
      setNotice({ ok: false, text: 'لا توجد بيانات محمّلة للتصدير بعد.' });
      return;
    }

    let table;
    let name = cfg.name;
    if (kind === 'daily') {
      table = buildDailyRows(s.series, cfg.series);
      name = `${cfg.name} - يومي`;
    } else if (kind === 'team') {
      table = {
        columns: TEAM_COLUMNS,
        rows: s.breakdown.map((r) => ({ name: r.name, team: r.team, presentDays: r.presentDays, lateDays: r.lateDays, hours: r.hours, completed: r.completed, overdue: r.overdue })),
      };
      name = 'تقرير أداء الفريق - لكل موظف';
    } else {
      table = buildKpiExportRows({ metrics: cfg.kpis, kpis: s.kpis, prev: s.prevKpis, trends: s.trends, meta: s.kpiMeta });
    }

    const { from, to } = s.range;
    const filterNote = [
      `الفترة: ${from} → ${to}`,
      s.filters.team ? `الفريق: ${s.filters.team}` : null,
      s.filters.employeeId ? `الموظف: ${s.directory.employees.find((e) => e.id === s.filters.employeeId)?.name ?? ''}` : null,
    ].filter(Boolean);

    setExporting(true);
    try {
      const { exportReport } = await import('../services/exportService');
      const res = await exportReport({
        format, columns: table.columns, rows: table.rows,
        filename: exportFilename(name, from, to, format).replace(/\.[^.]+$/, ''),
        title: name, meta: filterNote,
      });
      setNotice(res.ok
        ? { ok: true, text: res.filename ? `تم التصدير: ${res.filename}` : 'فُتحت نافذة الطباعة — اختر «حفظ كـ PDF».' }
        : { ok: false, text: res.reason });
    } finally {
      setExporting(false);
    }
  }, [canExport]);

  return useMemo(() => ({ canExport, isExporting, notice, download, clearNotice: () => setNotice(null) }), [canExport, isExporting, notice, download]);
}

const TEAM_COLUMNS = [
  { key: 'name', label: 'الموظف' },
  { key: 'team', label: 'الفريق' },
  { key: 'presentDays', label: 'أيام الحضور' },
  { key: 'lateDays', label: 'أيام التأخير' },
  { key: 'hours', label: 'ساعات العمل' },
  { key: 'completed', label: 'مهام منجزة' },
  { key: 'overdue', label: 'مهام متأخرة' },
];

export { ANALYTICS_TAB };
