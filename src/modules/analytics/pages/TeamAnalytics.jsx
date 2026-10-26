// =============================================================
// Analytics — Team performance tab
// Per-employee table (attendance + tasks), active users, recent activity.
// =============================================================
import { memo } from 'react';
import { KPI } from '../types/analytics.types';
import StatCard       from '../components/StatCard';
import BreakdownTable from '../components/BreakdownTable';
import ActivityFeed   from '../components/ActivityFeed';
import TrendChart     from '../components/TrendChart';

function TeamAnalytics() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <StatCard metric={KPI.ACTIVE_USERS} title="موظفون لديهم سجل حضور" />
        <StatCard metric={KPI.ATTENDANCE_RATE} />
        <StatCard metric={KPI.TASK_COMPLETION_RATE} />
        <StatCard metric={KPI.NOTIFICATION_ENGAGEMENT} />
        <StatCard metric={KPI.FILES_UPLOADED} />
      </div>

      <BreakdownTable />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TrendChart metric={KPI.ACTIVE_USERS} title="الموظفون الحاضرون يومياً" />
        <ActivityFeed title="آخر نشاط في النظام" limit={10} />
      </div>
    </div>
  );
}

export default memo(TeamAnalytics);
