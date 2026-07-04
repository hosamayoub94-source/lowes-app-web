// =============================================================
// Analytics — Executive Dashboard
// Top-level overview: attendance, productivity, tasks, alerts.
// =============================================================
import { memo } from 'react';
import { useAnalyticsBootstrap, useLastUpdated, useIsAnalyticsLoading, useExportPanel } from '../hooks/useAnalytics';
import { DASHBOARD_ID, EXPORT_FORMAT } from '../types/analytics.types';
import DashboardBuilder from '../components/DashboardBuilder';
import FilterBar        from '../components/FilterBar';
import KPIAlertCard     from '../components/KPIAlertCard';
import useAnalyticsStore from '../store/useAnalyticsStore';
import { useAuth } from '@hooks/useAuth';

const BTN = ({ label, onClick, color = '#3b82f6', disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={disabled ? 'bg-surface-alt text-muted' : ''}
    style={{
      padding: '6px 14px', borderRadius: 8, border: 'none',
      background: disabled ? undefined : color, color: disabled ? undefined : '#fff',
      fontSize: 12, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.7 : 1,
    }}
  >{label}</button>
);

function ExecutiveDashboard({ userId: userIdProp }) {
  const { id: authId } = useAuth();
  const userId = userIdProp ?? authId;
  useAnalyticsBootstrap(userId);
  const lastUpdated  = useLastUpdated();
  const isLoading    = useIsAnalyticsLoading();
  const { download, isExporting } = useExportPanel();
  const loadDashboard = useAnalyticsStore((s) => s.loadDashboard);

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh', direction: 'rtl' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="text-text" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>📊 لوحة القيادة التنفيذية</h1>
          {lastUpdated && (
            <p className="text-muted" style={{ fontSize: 11, margin: '4px 0 0' }}>
              آخر تحديث: {new Date(lastUpdated).toLocaleTimeString('ar-SA')}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <BTN label="⟳ تحديث" onClick={loadDashboard} color="#334155" disabled={isLoading} />
          <BTN label="CSV" onClick={() => download(EXPORT_FORMAT.CSV)} color="#22c55e" disabled={isExporting} />
          <BTN label="XLSX" onClick={() => download(EXPORT_FORMAT.XLSX)} color="#3b82f6" disabled={isExporting} />
          <BTN label="PDF" onClick={() => download(EXPORT_FORMAT.PDF)} color="#ef4444" disabled={isExporting} />
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar style={{ marginBottom: 20 }} />

      {/* Loading skeleton */}
      {isLoading && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          {[1,2,3,4].map((i) => (
            <div key={i} className="bg-surface-alt" style={{ flex: 1, height: 120, borderRadius: 12, animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      )}

      {/* Dashboard widgets */}
      <DashboardBuilder editable style={{ marginBottom: 20 }} />
    </div>
  );
}

export default memo(ExecutiveDashboard);
