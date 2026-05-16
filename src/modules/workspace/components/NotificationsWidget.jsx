// =============================================================
// NotificationsWidget — unread notifications summary
// =============================================================
import { useNavigate }          from 'react-router-dom';
import { useNotificationStore } from '@modules/notifications/store/useNotificationStore';

export function NotificationsWidget() {
  const navigate      = useNavigate();
  const unreadCount   = useNotificationStore((s) => s.unreadCount);
  const notifications = useNotificationStore((s) => s.notifications);
  const markAllRead   = useNotificationStore((s) => s.markAllAsRead);

  const unread = notifications.filter((n) => !n.is_read).slice(0, 5);

  return (
    <div className="space-y-2">
      {/* Badge */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {unreadCount > 0 ? `${unreadCount} غير مقروء` : 'لا إشعارات جديدة'}
        </span>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllRead?.()}
            className="text-xs text-blue-500 hover:text-blue-700"
          >
            قراءة الكل
          </button>
        )}
      </div>

      {/* List */}
      {unread.length === 0 && (
        <div className="text-center py-4 text-gray-400 text-sm">
          <p className="text-xl mb-1">🔔</p>
          <p>لا إشعارات جديدة</p>
        </div>
      )}

      <ul className="space-y-1">
        {unread.map((n) => (
          <li
            key={n.id}
            className="flex items-start gap-2 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer"
          >
            <span className="text-blue-500 mt-0.5 text-xs">●</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{n.title ?? 'إشعار'}</p>
              {n.message && <p className="text-xs text-gray-500 truncate">{n.message}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default NotificationsWidget;
