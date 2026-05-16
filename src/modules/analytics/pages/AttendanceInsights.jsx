// =============================================================
// Analytics — Attendance Insights
// Deep-dive: attendance rate, late, absent, worked hours.
// =============================================================
import { memo } from 'react';
import { useAnalyticsBootstrap, useKPI, useTrend, useIsAnalyticsLoading } from '../hooks/useAnalytics';
import { DASHBOARD_ID, KPI, formatKPI } from '../types/analytics.types';
import FilterBar      from '../components/FilterBar';
import TrendChart     from '../components/TrendChart';
import HeatmapWidget  from '../components/HeatmapWidget';
import StatCard       from '../components/StatCard';
import useAnalyticsStore from '../store/useAnalyticsStore';
import { useEffect } from 'react';

function AttendanceInsights({ userId }) {
  useAnalyticsBootstrap(userId);
  const setDashboard = useAnalyticsStore((s) => s.setDashboard);

  useEffect(() => {
    setDashboard(DASHBOARD_ID.ATTENDANCE);
  }, [setDashboard]);

  const isLoading = useIsAnalyticsLoading();

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh', background: 'var(--bg, #0f172a)', direction: 'rtl' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>تحليلات الحضور</h1>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
        نظرة شاملة على معدلات الحضور والتأخير والغياب
      </p>

      <FilterBar style={{ marginBottom: 20 }} />

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard metric={KPI.ATTENDANCE_RATE}    title="معدل الحضور" />
        <StatCard metric={KPI.LATE_EMPLOYEES}     title="المتأخرون" />
        <StatCard metric={KPI.ABSENT_EMPLOYEES}   title="الغائبون" />
        <StatCard metric={KPI.WORKED_HOURS_TOTAL} title="ساعات العمل" />
        <StatCard metric={KPI.OVERTIME_HOURS_TOTAL} title="الوقت الإضافي" />
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <TrendChart metric={KPI.ATTENDANCE_RATE}  title="اتجاه معدل الحضور" />
        <TrendChart metric={KPI.LATE_EMPLOYEES}   title="اتجاه التأخير" />
      </div>

      {/* Heatmap */}
      <HeatmapWidget metric={KPI.ATTENDANCE_RATE} title="خريطة حرارة الحضور الشهري" />
    </div>
  );
}

export default memo(AttendanceInsights);
