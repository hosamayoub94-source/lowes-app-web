// =============================================================
// Analytics — System health tab (admin only)
// State of the background-operations queue ON THIS DEVICE. Not a server-wide
// monitor: response time and storage have no measurement source yet.
// =============================================================
import { memo } from 'react';
import { KPI } from '../types/analytics.types';
import StatCard   from '../components/StatCard';
import TrendChart from '../components/TrendChart';

function SystemHealthDashboard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
        يعرض قائمة العمليات الخلفية على هذا الجهاز فقط (المزامنة والطابور). لا يمثل حالة الخادم كاملاً.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard metric={KPI.QUEUE_JOB_SUCCESS_RATE} />
        <StatCard metric={KPI.SYSTEM_ERROR_COUNT} />
        <StatCard metric={KPI.AVG_RESPONSE_TIME_MS} />
        <StatCard metric={KPI.STORAGE_USED_BYTES} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TrendChart metric={KPI.QUEUE_JOB_SUCCESS_RATE} title="نجاح الطابور (من اللقطات اليومية)" />
        <TrendChart metric={KPI.SYSTEM_ERROR_COUNT} title="الأخطاء (من اللقطات اليومية)" />
      </div>
    </div>
  );
}

export default memo(SystemHealthDashboard);
