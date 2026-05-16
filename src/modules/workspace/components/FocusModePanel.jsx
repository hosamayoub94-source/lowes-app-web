// =============================================================
// FocusModePanel — shows ONLY urgent/overdue items
// =============================================================
import { useFocusMode }  from '../hooks/useFocusMode';
import useWorkspaceStore from '../store/useWorkspaceStore';

function PriorityBadge({ label, color }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
      {label}
    </span>
  );
}

export function FocusModePanel() {
  const { overdueTasks, dueTodayTasks, urgentNotifs, totalUrgent } = useFocusMode();
  const toggleFocusMode = useWorkspaceStore((s) => s.toggleFocusMode);

  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎯</span>
          <span className="font-semibold text-red-800">وضع التركيز</span>
          {totalUrgent > 0 && (
            <span className="bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
              {totalUrgent}
            </span>
          )}
        </div>
        <button
          onClick={toggleFocusMode}
          className="text-xs text-red-500 hover:text-red-700 underline"
        >
          إغلاق
        </button>
      </div>

      {totalUrgent === 0 && (
        <div className="text-center py-6 text-green-600">
          <p className="text-2xl mb-1">✅</p>
          <p className="text-sm font-medium">لا توجد مهام متأخرة أو عاجلة</p>
          <p className="text-xs text-gray-500 mt-1">أنت على المسار الصحيح!</p>
        </div>
      )}

      {/* Overdue tasks */}
      {overdueTasks.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-1">
            <span>⚠️</span> مهام متأخرة ({overdueTasks.length})
          </h3>
          <ul className="space-y-1.5">
            {overdueTasks.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 text-sm shadow-sm">
                <span className="text-red-400">●</span>
                <span className="flex-1 truncate">{t.title}</span>
                <PriorityBadge
                  label={t.priority === 'high' ? 'عالي' : t.priority === 'medium' ? 'متوسط' : 'منخفض'}
                  color={t.priority === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Due today */}
      {dueTodayTasks.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1">
            <span>📅</span> مستحقة اليوم ({dueTodayTasks.length})
          </h3>
          <ul className="space-y-1.5">
            {dueTodayTasks.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 text-sm shadow-sm">
                <span className="text-amber-400">●</span>
                <span className="flex-1 truncate">{t.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Urgent notifications */}
      {urgentNotifs.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1">
            <span>🔔</span> إشعارات غير مقروءة ({urgentNotifs.length})
          </h3>
          <ul className="space-y-1.5">
            {urgentNotifs.map((n) => (
              <li key={n.id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 text-sm shadow-sm">
                <span className="text-blue-400">●</span>
                <span className="flex-1 truncate">{n.title ?? n.message ?? 'إشعار'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default FocusModePanel;
