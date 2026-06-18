// =============================================================
// AdminOperationsCenter — Admin-only dashboard panel
//
// Shows: system health, online employees, failed jobs,
// realtime status, pending approvals, daily activity.
// Route: /admin/ops (mounted via AppRoutes for admin/manager roles)
// =============================================================
import { memo, useState } from 'react';
import { useAdminOps }    from './useAdminOps';
import { useSystemHealth } from '@/core/production/useSystemHealth';
import { SafeActionButton } from '../safety/SafeActionButton';

// ── Sub-components ─────────────────────────────────────────────
const STATUS_COLOR = {
  healthy:      { bg: 'bg-green-100 dark:bg-green-900/30',  text: 'text-green-700 dark:text-green-400',  dot: 'bg-green-500' },
  degraded:     { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-500' },
  offline:      { bg: 'bg-red-100 dark:bg-red-900/30',      text: 'text-red-700 dark:text-red-400',      dot: 'bg-red-500' },
  reconnecting: { bg: 'bg-amber-100 dark:bg-amber-900/30',  text: 'text-amber-700 dark:text-amber-400',  dot: 'bg-amber-500 animate-pulse' },
};

const STATUS_LABELS = {
  healthy: 'يعمل بشكل طبيعي',
  degraded: 'أداء متأثر',
  offline: 'غير متصل',
  reconnecting: 'جارٍ الاتصال',
};

function StatBox({ icon, value, label, color = 'blue', alert = false }) {
  const colors = {
    blue:   'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green:  'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    amber:  'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    red:    'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
  };
  return (
    <div className={`rounded-2xl p-4 ${colors[color]} relative overflow-hidden`}>
      {alert && <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs opacity-70 mt-0.5">{label}</div>
    </div>
  );
}

const EmployeeRow = memo(({ emp }) => (
  <div className="flex items-center justify-between py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
    <div className="flex items-center gap-2.5">
      <div className="relative">
        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-sm font-bold text-blue-700 dark:text-blue-400">
          {emp.name[0]}
        </div>
        <div className="absolute -bottom-0.5 -left-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white dark:border-gray-900" />
      </div>
      <div>
        <div className="text-sm font-medium text-gray-900 dark:text-white">{emp.name}</div>
        <div className="text-xs text-gray-400">{emp.role}</div>
      </div>
    </div>
    <div className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">
      {emp.section}
    </div>
  </div>
));
EmployeeRow.displayName = 'EmployeeRow';

const ApprovalRow = memo(({ item, onApprove, onReject }) => {
  const typeIcons = { vacation: '🏖️', overtime: '⏰', task: '✅' };
  const isPriority = item.priority === 'high';
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${
      isPriority
        ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10'
        : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50'
    }`}>
      <span className="text-lg flex-shrink-0">{typeIcons[item.type] ?? '📋'}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.label}</div>
        <div className="text-xs text-gray-400">
          منذ {Math.round((Date.now() - item.submittedAt) / 60_000)} دقيقة
          {isPriority && <span className="mr-2 text-amber-600 dark:text-amber-400 font-medium">• طارئ</span>}
        </div>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        <button
          onClick={() => onApprove(item.id)}
          className="px-2.5 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg text-xs font-medium hover:bg-green-200 dark:hover:bg-green-800/40 transition-colors"
        >
          اعتماد
        </button>
        <button
          onClick={() => onReject(item.id)}
          className="px-2.5 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-xs font-medium hover:bg-red-200 dark:hover:bg-red-800/40 transition-colors"
        >
          رفض
        </button>
      </div>
    </div>
  );
});
ApprovalRow.displayName = 'ApprovalRow';

// ── Main panel ─────────────────────────────────────────────────
export function AdminOperationsCenter() {
  const {
    loading, onlineEmployees, pendingApprovals, dailyActivity,
    errorStats, recentErrors, realtimeSnap, queueStats,
    healthStatus, isHealthy, refresh, lastRefreshed,
    approvalsCount, criticalIssues,
  } = useAdminOps();

  const [approvals, setApprovals] = useState(null);
  const displayApprovals = approvals ?? pendingApprovals;

  const handleApprove = (id) => setApprovals((prev) => (prev ?? pendingApprovals).filter((a) => a.id !== id));
  const handleReject  = (id) => setApprovals((prev) => (prev ?? pendingApprovals).filter((a) => a.id !== id));

  const statusCfg = STATUS_COLOR[healthStatus] ?? STATUS_COLOR.healthy;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 pb-24" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">مركز العمليات</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            آخر تحديث: {lastRefreshed ? new Date(lastRefreshed).toLocaleTimeString('ar') : '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Health badge */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
            {STATUS_LABELS[healthStatus] ?? healthStatus}
          </div>
          <button
            onClick={refresh}
            className="p-2 rounded-xl bg-white dark:bg-gray-800 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Stat grid */}
      {dailyActivity && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <StatBox icon="✅" value={`${dailyActivity.checkedIn}/${dailyActivity.totalEmployees}`} label="حضروا اليوم" color="green" />
          <StatBox icon="📋" value={dailyActivity.tasksDone}   label="مهام منجزة" color="blue" />
          <StatBox icon="⚠️" value={dailyActivity.tasksOverdue} label="مهام متأخرة" color="amber" alert={dailyActivity.tasksOverdue > 0} />
          <StatBox icon="🔴" value={criticalIssues}             label="أخطاء حرجة" color="red" alert={criticalIssues > 0} />
        </div>
      )}

      {/* Pending approvals */}
      {displayApprovals.length > 0 && (
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              الموافقات المعلقة
            </h2>
            <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full">
              {displayApprovals.length}
            </span>
          </div>
          <div className="space-y-2">
            {displayApprovals.map((item) => (
              <ApprovalRow key={item.id} item={item} onApprove={handleApprove} onReject={handleReject} />
            ))}
          </div>
        </section>
      )}

      {/* Online employees */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900 dark:text-white">المتصلون الآن</h2>
          <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            {onlineEmployees.length} موظف
          </span>
        </div>
        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map((i) => (
              <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : onlineEmployees.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">لا يوجد موظفون متصلون</p>
        ) : (
          <div>{onlineEmployees.map((e) => <EmployeeRow key={e.id} emp={e} />)}</div>
        )}
      </section>

      {/* Realtime & Queue status */}
      <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 mb-4">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-3">حالة الأنظمة</h2>
        <div className="space-y-2.5">
          {[
            { label: 'البث الفوري (Realtime)', value: realtimeSnap?.status === 'connected' ? 'متصل' : realtimeSnap?.status ?? '—', ok: realtimeSnap?.status === 'connected' },
            { label: 'قائمة الانتظار', value: `${queueStats?.queueSize ?? 0} معلّق`, ok: (queueStats?.queueSize ?? 0) === 0 },
            { label: 'أخطاء منذ التشغيل', value: `${errorStats.fatal + errorStats.error} خطأ`, ok: errorStats.fatal + errorStats.error === 0 },
            { label: 'رسائل تعذّر إرسالها', value: `${queueStats?.deadLetterSize ?? 0}`, ok: (queueStats?.deadLetterSize ?? 0) === 0 },
          ].map(({ label, value, ok }) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">{label}</span>
              <span className={`font-medium ${ok ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                {ok ? '✓ ' : '✗ '}{value}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Recent errors */}
      {recentErrors.length > 0 && (
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 mb-4">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">آخر الأخطاء</h2>
          <div className="space-y-2">
            {recentErrors.slice(0, 5).map((e) => (
              <div key={e.id} className="p-2.5 rounded-xl bg-red-50 dark:bg-red-900/10 text-xs">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-bold text-red-600 dark:text-red-400">[{e.severity.toUpperCase()}]</span>
                  <span className="text-gray-500 dark:text-gray-400">{e.context}</span>
                </div>
                <div className="text-gray-700 dark:text-gray-300 truncate">{e.message}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default AdminOperationsCenter;
