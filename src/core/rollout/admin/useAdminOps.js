// =============================================================
// useAdminOps — Admin operations center data hook
//
// Aggregates: system health, online employees, failed jobs,
// realtime status, pending approvals, daily activity summary.
// Refreshes every 30s automatically.
// =============================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSystemHealth }          from '@/core/production/useSystemHealth';
import { getOfflineQueueStats }     from '@/core/production/offlineRecovery';
import { inspectRealtime }          from '@/core/production/realtimeRecovery';
import { getErrors, getErrorStats } from '@/core/production/errorReporter';
import { on }                       from '@/core/events/eventBus';

const REFRESH_INTERVAL = 30_000;

// ── Mock daily activity (replace with real service calls) ──────
function _mockDailyActivity() {
  const now     = new Date();
  const dayName = now.toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { weekday: 'long' });
  return {
    date:             now.toLocaleDateString('ar-SA-u-nu-latn-ca-gregory'),
    dayName,
    checkedIn:        Math.floor(Math.random() * 8) + 10,
    totalEmployees:   18,
    tasksDone:        Math.floor(Math.random() * 15) + 5,
    tasksOverdue:     Math.floor(Math.random() * 4),
    crmLeadsToday:    Math.floor(Math.random() * 6) + 2,
    notificationsSent: Math.floor(Math.random() * 30) + 10,
  };
}

function _mockPendingApprovals() {
  return [
    { id: 'va1', type: 'vacation', label: 'طلب إجازة — أحمد محمد', submittedAt: Date.now() - 3600_000, priority: 'normal' },
    { id: 'va2', type: 'overtime', label: 'طلب إضافي — سارة علي',  submittedAt: Date.now() - 7200_000, priority: 'normal' },
    { id: 'va3', type: 'task',     label: 'مهمة طارئة — تيم المبيعات', submittedAt: Date.now() - 900_000, priority: 'high' },
  ];
}

function _mockOnlineEmployees() {
  const names  = ['أحمد محمد', 'سارة علي', 'محمد حسن', 'فاطمة أحمد', 'علي محمود', 'نورا خالد'];
  const roles  = ['موظف', 'مدير', 'ميديا باير', 'موظف مبيعات', 'موظف'];
  return names.slice(0, 4 + Math.floor(Math.random() * 3)).map((name, i) => ({
    id:       `emp_${i}`,
    name,
    role:     roles[i % roles.length],
    section:  ['الرئيسية', 'المهام', 'CRM', 'الحضور'][i % 4],
    online:   true,
  }));
}

// ── Hook ───────────────────────────────────────────────────────
export function useAdminOps() {
  const { status: healthStatus, signals, isHealthy } = useSystemHealth();
  const [data, setData] = useState({
    loading:          true,
    onlineEmployees:  [],
    pendingApprovals: [],
    dailyActivity:    null,
    failedJobs:       [],
    errorStats:       { fatal: 0, error: 0, warning: 0, info: 0 },
    recentErrors:     [],
    realtimeSnap:     null,
    queueStats:       null,
    lastRefreshed:    null,
  });

  const refresh = useCallback(() => {
    setData({
      loading:          false,
      onlineEmployees:  _mockOnlineEmployees(),
      pendingApprovals: _mockPendingApprovals(),
      dailyActivity:    _mockDailyActivity(),
      failedJobs:       getOfflineQueueStats().queue ?? [],
      errorStats:       getErrorStats(),
      recentErrors:     getErrors(10),
      realtimeSnap:     inspectRealtime(),
      queueStats:       getOfflineQueueStats(),
      lastRefreshed:    Date.now(),
    });
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_INTERVAL);

    // Also refresh on health changes
    const unsub = on('system:health_changed', refresh);

    return () => {
      clearInterval(timer);
      unsub?.();
    };
  }, [refresh]);

  return {
    ...data,
    healthStatus,
    healthSignals: signals,
    isHealthy,
    refresh,
    approvalsCount: data.pendingApprovals.length,
    criticalIssues: data.errorStats.fatal + data.errorStats.error,
  };
}

export default useAdminOps;
