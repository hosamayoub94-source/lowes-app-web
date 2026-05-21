// =============================================================
// Notifications Module — NotificationPanel
// Dropdown panel: list + mark-all + load more.
// =============================================================
import { Link }              from 'react-router-dom';
import { useNotifications }  from '../hooks/useNotifications';
import { NotificationItem }  from './NotificationItem';
import { cn }                from '@utils/classNames';
import { ROUTES }            from '@routes/paths';

export function NotificationPanel({ onClose }) {
  const {
    notifications,
    unreadCount,
    loading,
    hasMore,
    markAsRead,
    markAllAsRead,
    loadMore,
  } = useNotifications({ realtime: false, autoLoad: false });
  // Note: parent (Bell) controls loading. Panel only renders.

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted text-sm">
        جارٍ التحميل…
      </div>
    );
  }

  const unread  = notifications.filter((n) => !n.is_read);
  const read    = notifications.filter((n) =>  n.is_read);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-text">
          الإشعارات
          {unreadCount > 0 && (
            <span className="mr-2 text-xs bg-navy text-white rounded-full px-1.5 py-0.5">
              {unreadCount}
            </span>
          )}
        </span>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="text-xs text-teal hover:text-teal/70 transition-colors"
          >
            تحديد الكل كمقروء
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted">
            <span className="text-2xl">🔔</span>
            <p className="text-sm">لا توجد إشعارات</p>
          </div>
        ) : (
          <>
            {/* Unread group */}
            {unread.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1 text-xs font-semibold text-muted uppercase tracking-wide">
                  غير مقروء
                </p>
                <div className="divide-y divide-border/50">
                  {unread.map((n) => (
                    <NotificationItem key={n.id} notification={n} onRead={markAsRead} />
                  ))}
                </div>
              </div>
            )}

            {/* Read group */}
            {read.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1 text-xs font-semibold text-muted uppercase tracking-wide">
                  سابقة
                </p>
                <div className="divide-y divide-border/50">
                  {read.map((n) => (
                    <NotificationItem key={n.id} notification={n} onRead={markAsRead} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="px-4 pt-2 pb-1">
          <button
            onClick={loadMore}
            className="w-full text-sm text-teal hover:text-teal/70 transition-colors text-center"
          >
            تحميل المزيد
          </button>
        </div>
      )}

      {/* View all link */}
      <div className="border-t border-border px-4 py-2.5">
        <Link
          to={ROUTES.NOTIFICATIONS}
          onClick={onClose}
          className="flex items-center justify-center gap-1.5 w-full text-sm text-muted hover:text-teal transition-colors"
        >
          عرض كل الإشعارات
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="rtl:rotate-180">
            <path d="M7 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
      </div>
    </div>
  );
}
