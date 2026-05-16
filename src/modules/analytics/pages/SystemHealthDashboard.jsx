// =============================================================
// Analytics — System Health Dashboard
// Queue success rate, error count, response time, storage.
// =============================================================
import { memo, useEffect } from 'react';
import { useAnalyticsBootstrap, useKPIs, useAlerts } from '../hooks/useAnalytics';
import { DASHBOARD_ID, KPI, formatKPI, KPI_LABELS, KPI_STATUS_COLORS, getKPIStatus } from '../types/analytics.types';
import FilterBar      from '../components/FilterBar';
import StatCard       from '../components/StatCard';
import TrendChart     from '../components/TrendChart';
import KPIAlertCard   from '../components/KPIAlertCard';
import ProgressWidget from '../components/ProgressWidget';
import useAnalyticsStore from '../store/useAnalyticsStore';

function SystemHealthDashboard({ userId }) {
  useAnalyticsBootstrap(userId);
  const setDashboard = useAnalyticsStore((s) => s.setDashboard);

  useEffect(() => {
    setDashboard(DASHBOARD_ID.SYSTEM);
  }, [setDashboard]);

  const kpis   = useKPIs();
  const alerts = useAlerts();

  const systemAlerts = alerts.filter((a) =>
    [KPI.QUEUE_JOB_SUCCESS_RATE, KPI.SYSTEM_ERROR_COUNT, KPI.AVG_RESPONSE_TIME_MS].includes(a.metric),
  );

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh', background: 'var(--bg, #0f172a)', direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>صحة النظام</h1>
        {/* Overall health badge */}
        <div style={{
          padding: '4px 14px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          background: systemAlerts.length === 0 ? '#22c55e22' : '#ef444422',
          color:       systemAlerts.length === 0 ? '#22c55e'   : '#ef4444',
          border: `1px solid ${systemAlerts.length === 0 ? '#22c55e55' : '#ef444455'}`,
        }}>
          {systemAlerts.length === 0 ? '✅ النظام يعمل بشكل طبيعي' : `⚠ ${systemAlerts.length} تحذير نشط`}
        </div>
      </div>

      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
        مراقبة أداء الطابور، الأخطاء، وأوقات الاستجابة
      </p>

      <FilterBar style={{ marginBottom: 20 }} />

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard metric={KPI.QUEUE_JOB_SUCCESS_RATE} title="نجاح مهام الطابور" />
        <StatCard metric={KPI.SYSTEM_ERROR_COUNT}     title="أخطاء النظام" />
        <StatCard metric={KPI.AVG_RESPONSE_TIME_MS}   title="متوسط وقت الاستجابة" />
        <StatCard metric={KPI.STORAGE_USED_BYTES}     title="التخزين المستخدم" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20 }}>
        <TrendChart metric={KPI.QUEUE_JOB_SUCCESS_RATE} title="اتجاه نجاح الطابور" />
        <KPIAlertCard title="تحذيرات النظام" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <TrendChart metric={KPI.SYSTEM_ERROR_COUNT}   title="اتجاه الأخطاء" />
        <ProgressWidget
          metrics={[KPI.QUEUE_JOB_SUCCESS_RATE]}
          title="معدل نجاح الطابور"
        />
      </div>
    </div>
  );
}

export default memo(SystemHealthDashboard);
