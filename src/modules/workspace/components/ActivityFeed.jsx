// =============================================================
// ActivityFeed — recent activity across all modules
// =============================================================
import useWorkspaceStore from '../store/useWorkspaceStore';

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60_000)  return 'الآن';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} د`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} س`;
  return new Date(ts).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
}

const TYPE_COLORS = {
  task:       'bg-indigo-100 text-indigo-600',
  attendance: 'bg-teal-100 text-teal-600',
  notif:      'bg-blue-100 text-blue-600',
  crm:        'bg-purple-100 text-purple-600',
  file:       'bg-amber-100 text-amber-600',
};

export function ActivityFeed({ maxItems = 10 }) {
  const activity      = useWorkspaceStore((s) => s.recentActivity);
  const clearActivity = useWorkspaceStore((s) => s.clearActivity);

  const items = activity.slice(0, maxItems);

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">{items.length} نشاط حديث</span>
        {items.length > 0 && (
          <button onClick={clearActivity} className="text-xs text-gray-400 hover:text-gray-600">
            مسح
          </button>
        )}
      </div>

      {items.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">
          <p className="text-2xl mb-1">📭</p>
          <p>لا يوجد نشاط بعد</p>
        </div>
      )}

      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-gray-50 transition-colors"
        >
          <span
            className={`w-7 h-7 rounded-full flex items-center justify-center text-sm flex-none ${TYPE_COLORS[item.type] ?? 'bg-gray-100 text-gray-600'}`}
          >
            {item.icon}
          </span>
          <span className="flex-1 text-sm text-gray-700 truncate">{item.label}</span>
          <span className="text-xs text-gray-400 flex-none">{timeAgo(item.time)}</span>
        </div>
      ))}
    </div>
  );
}

export default ActivityFeed;
