// =============================================================
// Analytics — Hub (the /analytics route)
// One page, five report tabs, shared filters, "needs your attention",
// data status/source, export. Filters + tab live in the URL so a link or
// a refresh keeps the same view.
// =============================================================
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
import { NAV_ITEMS } from '@data/navigation';
import { usePermissions } from '@hooks/usePermissions';
import {
  useAnalyticsBootstrap, useAnalyticsAccess, useAnalyticsStatus, useAnalyticsError, useExportPanel,
  useFilters, useKpiMetaMap, useLastUpdated, usePreviousRange, useRange, useRefresh, useSetDashboard,
} from '../hooks/useAnalytics';
import useAnalyticsStore from '../store/useAnalyticsStore';
import { ANALYTICS_TAB, ANALYTICS_TABS, DASHBOARD_METRICS, EXPORT_FORMAT, KPI_DRILLDOWN } from '../types/analytics.types';
import { diffDays, filtersFromSearch, filtersToSearch } from '../services/reportMath';
import { AnalyticsNavContext } from '../components/AnalyticsNavContext';
import FilterBar from '../components/FilterBar';
import KPIAlertCard from '../components/KPIAlertCard';
import StateBox from '../components/StateBox';
import ExecutiveDashboard from './ExecutiveDashboard';
import AttendanceInsights from './AttendanceInsights';
import ProductivityReport from './ProductivityReport';
import TeamAnalytics from './TeamAnalytics';
import SystemHealthDashboard from './SystemHealthDashboard';

const BODIES = {
  [ANALYTICS_TAB.EXECUTIVE]:    ExecutiveDashboard,
  [ANALYTICS_TAB.ATTENDANCE]:   AttendanceInsights,
  [ANALYTICS_TAB.PRODUCTIVITY]: ProductivityReport,
  [ANALYTICS_TAB.TEAM]:         TeamAnalytics,
  [ANALYTICS_TAB.SYSTEM]:       SystemHealthDashboard,
};

const fmtDay = (k) => { const [y, m, d] = String(k).split('-'); return `${d}/${m}/${y}`; };
const Day = ({ k }) => <bdi dir="ltr">{fmtDay(k)}</bdi>;
const fmtTime = (iso) => new Date(iso).toLocaleString('ar-SA-u-nu-latn-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' });
const btn = { padding: '8px 14px', minHeight: 40, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };

function ExportBar({ tab, noData }) {
  const { canExport, isExporting, notice, download } = useExportPanel();
  const status = useAnalyticsStatus();
  const cfg = DASHBOARD_METRICS[tab.dashboard];
  const disabled = !canExport || isExporting || status !== 'ok' || noData;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div role="group" aria-label="تصدير التقرير" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="text-muted" style={{ fontSize: 12 }}>تصدير البيانات المعروضة:</span>
        <button type="button" disabled={disabled} onClick={() => download(EXPORT_FORMAT.CSV, 'kpi')} style={{ ...btn, background: disabled ? undefined : '#16a34a', color: disabled ? undefined : '#fff', border: 'none' }} className={disabled ? 'bg-surface-alt text-muted' : ''}>CSV (المؤشرات)</button>
        {cfg.series.length > 0 && (
          <button type="button" disabled={disabled} onClick={() => download(EXPORT_FORMAT.CSV, 'daily')} style={btn} className="border border-border text-text">CSV (يومي)</button>
        )}
        {tab.id === ANALYTICS_TAB.TEAM && (
          <button type="button" disabled={disabled} onClick={() => download(EXPORT_FORMAT.CSV, 'team')} style={btn} className="border border-border text-text">CSV (لكل موظف)</button>
        )}
        <button type="button" disabled={disabled} onClick={() => download(EXPORT_FORMAT.XLSX, tab.id === ANALYTICS_TAB.TEAM ? 'team' : 'kpi')} style={btn} className="border border-border text-text">Excel</button>
        <button type="button" disabled={disabled} onClick={() => download(EXPORT_FORMAT.PDF, tab.id === ANALYTICS_TAB.TEAM ? 'team' : 'kpi')} style={btn} className="border border-border text-text">PDF / طباعة</button>
      </div>
      <div aria-live="polite" style={{ fontSize: 12, minHeight: 16, color: notice?.ok === false ? '#dc2626' : '#16a34a' }}>{notice?.text}</div>
    </div>
  );
}

function AnalyticsHub() {
  const { id: userId } = useAuth();
  const { canView, isAdmin, role } = useAnalyticsAccess();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const tabs = useMemo(() => ANALYTICS_TABS.filter((t) => !t.adminOnly || isAdmin), [isAdmin]);
  const tab = tabs.find((t) => t.id === params.get('tab')) ?? tabs[0];

  // first render only: URL → initial store state
  const [initial] = useState(() => ({ dashboardId: tab.dashboard, filters: filtersFromSearch(params) }));
  useAnalyticsBootstrap(canView ? userId : null, initial);

  const setDashboard = useSetDashboard();
  useEffect(() => { setDashboard(tab.dashboard); }, [tab.dashboard, setDashboard]);

  // filters → URL (replace; keeps the tab)
  const filters = useFilters();
  const paramsRef = useRef(params);
  paramsRef.current = params;
  useEffect(() => {
    const prev = paramsRef.current;
    // only this page's own keys are rewritten; any other query param is preserved
    const next = new URLSearchParams(prev);
    for (const k of ['preset', 'from', 'to', 'team', 'emp']) next.delete(k);
    for (const [k, v] of Object.entries(filtersToSearch(filters))) next.set(k, v);
    if (next.toString() !== prev.toString()) setParams(next, { replace: true });
    // setParams identity changes with the URL; only a filter change should write it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const goTab = useCallback((id) => {
    setParams((prev) => { const n = new URLSearchParams(prev); n.set('tab', id); return n; });
  }, [setParams]);

  const nav = useMemo(() => ({
    open: (metric) => {
      const d = KPI_DRILLDOWN[metric];
      if (!d) return;
      if (d.tab && tabs.some((t) => t.id === d.tab)) goTab(d.tab);
      else if (d.path) navigate(d.path);
    },
  }), [goTab, navigate, tabs]);

  const status = useAnalyticsStatus();
  const error = useAnalyticsError();
  const lastUpdated = useLastUpdated();
  const range = useRange();
  const prevRange = usePreviousRange();
  const meta = useKpiMetaMap();
  const refresh = useRefresh();
  const resetFilters = useAnalyticsStore((s) => s.resetFilters);

  const cfg = DASHBOARD_METRICS[tab.dashboard];
  const sources = useMemo(
    () => [...new Set(cfg.kpis.map((m) => meta[m]?.source).filter(Boolean))],
    [cfg, meta],
  );
  const noOk = status === 'ok' && cfg.kpis.every((m) => meta[m]?.status !== 'ok');
  const firstReason = cfg.kpis.map((m) => meta[m]?.reason).find(Boolean);

  const related = useMemo(
    () => NAV_ITEMS.filter((i) => (i.group === 'reports' || i.id === 'profitability') && i.id !== 'analytics'
      && i.roles?.includes(role) && (!i.perm || can(i.perm))),
    [role, can],
  );

  if (!canView) {
    return (
      <div style={{ padding: 24 }}>
        <StateBox kind="error" title="لا تملك صلاحية عرض التحليلات والتقارير" reason="هذه الصفحة للإدارة فقط." />
      </div>
    );
  }

  const Body = BODIES[tab.id];

  return (
    <AnalyticsNavContext.Provider value={nav}>
      <div dir="rtl" className="px-4 sm:px-6 py-5" style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <header>
          <h1 className="text-text" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>📊 التحليلات والتقارير</h1>
          <p className="text-muted" style={{ fontSize: 13, margin: '4px 0 0', lineHeight: 1.7 }}>
            أرقام الحضور والمهام والفريق من بيانات النظام الفعلية، مع مقارنة بالفترة السابقة وتنبيهات تحتاج متابعتك. اختر التقرير ثم الفترة والفلاتر.
          </p>
        </header>

        <nav aria-label="أنواع التقارير">
          <div role="tablist" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {tabs.map((t) => {
              const active = t.id === tab.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={active}
                  aria-controls="analytics-panel"
                  tabIndex={active ? 0 : -1}
                  onClick={() => goTab(t.id)}
                  onKeyDown={(e) => {
                    const i = tabs.findIndex((x) => x.id === t.id);
                    const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0; // RTL: ← = next
                    if (step) { e.preventDefault(); const nx = tabs[(i + step + tabs.length) % tabs.length]; goTab(nx.id); document.getElementById(`tab-${nx.id}`)?.focus(); }
                  }}
                  style={{
                    ...btn, whiteSpace: 'nowrap',
                    border: active ? '1.5px solid #3b82f6' : '1.5px solid rgb(var(--color-border) / 0.25)',
                    background: active ? '#3b82f622' : 'transparent',
                    color: active ? '#2563eb' : 'rgb(var(--color-text))',
                  }}
                >
                  <span aria-hidden="true">{t.icon} </span>{t.label}
                </button>
              );
            })}
          </div>
          <p className="text-muted" style={{ fontSize: 12, margin: '6px 0 0' }}>{tab.hint}</p>
        </nav>

        <FilterBar />

        <div className="bg-surface-alt" style={{ borderRadius: 10, padding: '10px 14px', fontSize: 12, lineHeight: 1.8, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="text-muted" style={{ minWidth: 0 }}>
            {range && (
              <div>
                الفترة المعروضة: <strong className="text-text"><Day k={range.from} /> ← <Day k={range.to} /></strong> ({diffDays(range.from, range.to) + 1} يوم)
                {prevRange && <> · المقارنة مع: <Day k={prevRange.from} /> ← <Day k={prevRange.to} /></>}
              </div>
            )}
            <div>
              {lastUpdated ? <>آخر تحديث: {fmtTime(lastUpdated)}</> : 'لم تُحمَّل البيانات بعد'}
              {sources.length > 0 && <> · المصدر: {sources.join('، ')}</>}
            </div>
          </div>
          <button type="button" onClick={() => refresh()} disabled={status === 'loading'} className="border border-border text-text" style={btn}>
            {status === 'loading' ? 'جارٍ التحديث…' : '⟳ تحديث'}
          </button>
        </div>

        {status === 'error' && (
          <StateBox
            kind="error"
            title="تعذّر تحميل التقرير"
            reason={error}
            action={<button type="button" onClick={() => refresh()} style={{ ...btn, background: '#2563eb', color: '#fff', border: 'none' }}>إعادة المحاولة</button>}
          />
        )}

        {noOk && (
          <StateBox
            kind="empty"
            title="لا توجد بيانات لهذا التقرير ضمن الفلاتر الحالية"
            reason={`${firstReason ?? 'لم يُعثر على سجلات.'} جرّب فترة أوسع أو أزل فلتر الفريق/الموظف.`}
            action={<button type="button" onClick={() => resetFilters()} className="border border-border text-text" style={btn}>إعادة ضبط الفلاتر</button>}
          />
        )}

        <KPIAlertCard />

        <div id="analytics-panel" role="tabpanel" aria-labelledby={`tab-${tab.id}`}>
          <Body />
        </div>

        <ExportBar tab={tab} noData={noOk} />

        {related.length > 0 && (
          <section aria-label="تقارير أخرى مرتبطة">
            <h2 className="text-text" style={{ fontSize: 14, fontWeight: 700, margin: '4px 0 8px' }}>تقارير أخرى</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {related.map((i) => (
                <Link key={i.id} to={i.path} className="bg-surface border border-border text-text" style={{ ...btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span aria-hidden="true">{i.icon}</span>{i.label}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </AnalyticsNavContext.Provider>
  );
}

export default memo(AnalyticsHub);
