// =============================================================
// Analytics — Productivity Report
// Task completion, overdue, productivity score, team breakdown.
// =============================================================
import { memo, useEffect } from 'react';
import { useAnalyticsBootstrap, useIsAnalyticsLoading, useExportPanel } from '../hooks/useAnalytics';
import { DASHBOARD_ID, KPI, EXPORT_FORMAT } from '../types/analytics.types';
import FilterBar      from '../components/FilterBar';
import StatCard       from '../components/StatCard';
import BarChartWidget from '../components/BarChartWidget';
import TrendChart     from '../components/TrendChart';
import ProgressWidget from '../components/ProgressWidget';
import useAnalyticsStore from '../store/useAnalyticsStore';

function ProductivityReport({ userId }) {
  useAnalyticsBootstrap(userId);
  const setDashboard = useAnalyticsStore((s) => s.setDashboard);

  useEffect(() => {
    setDashboard(DASHBOARD_ID.PRODUCTIVITY);
  }, [setDashboard]);

  const { download, isExporting } = useExportPanel();

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh', background: 'var(--bg, #0f172a)', direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>تقرير الإنتاجية</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {[EXPORT_FORMAT.CSV, EXPORT_FORMAT.XLSX, EXPORT_FORMAT.PDF].map((fmt) => (
            <button
              key={fmt}
              onClick={() => download(fmt)}
              disabled={isExporting}
              style={{
                padding: '5px 12px', borderRadius: 6, border: '1px solid #334155',
                background: 'transparent', color: '#94a3b8', fontSize: 12, cursor: 'pointer',
              }}
            >
              {fmt.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
        أداء الفريق ومعدلات إنجاز المهام
      </p>

      <FilterBar style={{ marginBottom: 20 }} />

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard metric={KPI.PRODUCTIVITY_SCORE}   title="نقاط الإنتاجية" />
        <StatCard metric={KPI.COMPLETED_TASKS}      title="المهام المنجزة" />
        <StatCard metric={KPI.OVERDUE_TASKS}        title="المهام المتأخرة" />
        <StatCard metric={KPI.TASK_COMPLETION_RATE} title="معدل الإنجاز" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20 }}>
        <BarChartWidget metric={KPI.COMPLETED_TASKS}  title="المهام اليومية المنجزة" />
        <ProgressWidget
          metrics={[KPI.TASK_COMPLETION_RATE, KPI.PRODUCTIVITY_SCORE, KPI.ATTENDANCE_RATE]}
          title="تقدم المؤشرات الرئيسية"
        />
      </div>

      <TrendChart metric={KPI.PRODUCTIVITY_SCORE} title="اتجاه الإنتاجية الأسبوعي" />
    </div>
  );
}

export default memo(ProductivityReport);
