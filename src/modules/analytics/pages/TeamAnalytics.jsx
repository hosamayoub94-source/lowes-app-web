// =============================================================
// Analytics — Team Analytics
// Active users, engagement, cross-module team metrics.
// =============================================================
import { memo, useEffect } from 'react';
import { useAnalyticsBootstrap, useKPIs, useActivity, useIsAnalyticsLoading } from '../hooks/useAnalytics';
import { DASHBOARD_ID, KPI, formatKPI, KPI_LABELS, KPI_COLORS } from '../types/analytics.types';
import FilterBar     from '../components/FilterBar';
import StatCard      from '../components/StatCard';
import TrendChart    from '../components/TrendChart';
import ActivityFeed  from '../components/ActivityFeed';
import DonutChart    from '../components/DonutChart';
import useAnalyticsStore from '../store/useAnalyticsStore';

function TeamAnalytics({ userId }) {
  useAnalyticsBootstrap(userId);
  const setDashboard = useAnalyticsStore((s) => s.setDashboard);

  useEffect(() => {
    setDashboard(DASHBOARD_ID.TEAM);
  }, [setDashboard]);

  const kpis = useKPIs();

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh', background: 'var(--bg, #0f172a)', direction: 'rtl' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>تحليلات الفريق</h1>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
        النشاط، التفاعل، والمستخدمون النشطون
      </p>

      <FilterBar style={{ marginBottom: 20 }} />

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard metric={KPI.ACTIVE_USERS}             title="المستخدمون النشطون" />
        <StatCard metric={KPI.ATTENDANCE_RATE}          title="معدل الحضور" />
        <StatCard metric={KPI.NOTIFICATION_ENGAGEMENT}  title="تفاعل الإشعارات" />
        <StatCard metric={KPI.FILES_UPLOADED}           title="الملفات المرفوعة" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <TrendChart metric={KPI.ACTIVE_USERS} title="المستخدمون النشطون يومياً" />
        <DonutChart
          metrics={[KPI.ATTENDANCE_RATE, KPI.TASK_COMPLETION_RATE, KPI.NOTIFICATION_ENGAGEMENT]}
          title="توزيع أداء الفريق"
        />
      </div>

      {/* Activity feed — full width */}
      <ActivityFeed title="نشاط الفريق الأخير" limit={12} />
    </div>
  );
}

export default memo(TeamAnalytics);
