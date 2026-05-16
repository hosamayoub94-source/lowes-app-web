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

const BTN = ({ label, onClick, color = '#3b82f6', disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      padding: '6px 14px', borderRadius: 8, border: 'none',
      background: disabled ? '#334155' : color, color: '#fff',
      fontSize: 12, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.7 : 1,
    }}
  >{label}</button>
);

function ExecutiveDashboard({ userId }) {
  useAnalyticsBootstrap(userId);
  const lastUpdated  = useLastUpdated();
  const isLoading    = useIsAnalyticsLoading();
  const { download, isExporting } = useExportPanel();
  const loadDashboard = useAnalyticsStore((s) => s.loadDashboard);

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh', background: 'var(--bg, #0f172a)', direction: 'rtl' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>لوحة القيادة التنفيذية</h1>
          {lastUpdated && (
            <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 0' }}>
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
            <div key={i} style={{ flex: 1, height: 120, borderRadius: 12, background: '#1e293b', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      )}

      {/* Dashboard widgets */}
      <DashboardBuilder editable style={{ marginBottom: 20 }} />
    </div>
  );
}

export default memo(ExecutiveDashboard);
