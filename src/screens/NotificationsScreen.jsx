// =============================================================
// NotificationsScreen — full-page notification centre.
//
// Sections:
//   1. Page header — title, unread badge, mark-all CTA
//   2. Filter tabs — All / Unread
//   3. Date-grouped list (Today / Yesterday / This week / Earlier)
//   4. Load-more footer
//   5. Empty state
// =============================================================
import { useState, useMemo } from 'react';
import { cn }                  from '@utils/classNames';
import { useNotifications }    from '@modules/notifications/hooks/useNotifications';
import { NotificationItem }    from '@modules/notifications/components/NotificationItem';

// ── Date grouping ─────────────────────────────────────────────
function getDateGroup(dateStr) {
  const d     = new Date(dateStr);
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff  = Math.floor((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86_400_000);
  if (diff === 0)  return 'اليوم';
  if (diff === 1)  return 'أمس';
  if (diff < 7)    return 'هذا الأسبوع';
  if (diff < 30)   return 'هذا الشهر';
  return 'سابقاً';
}

const GROUP_ORDER = ['اليوم', 'أمس', 'هذا الأسبوع', 'هذا الشهر', 'سابقاً'];

// ── Filter tabs ───────────────────────────────────────────────
function FilterTabs({ active, onChange, unreadCount }) {
  const tabs = [
    { key: 'all',    label: 'الكل' },
    { key: 'unread', label: `غير مقروء (${unreadCount})` },
  ];
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map(t => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={cn(
            'px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors',
            active === t.key
              ? 'text-teal border-teal'
              : 'text-muted border-transparent hover:text-text',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Group header ─────────────────────────────────────────────
function GroupHeader({ label }) {
  return (
    <div className="px-4 pt-4 pb-1.5 flex items-center gap-3">
      <span className="text-xs font-semibold text-muted uppercase tracking-wide">
        {label}
      </span>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────
function EmptyState({ filter }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted">
      <span className="text-5xl" aria-hidden>
        {filter === 'unread' ? '✅' : '🔔'}
      </span>
      <p className="text-base font-semibold text-text">
        {filter === 'unread' ? 'لا توجد إشعارات غير مقروءة' : 'لا توجد إشعارات'}
      </p>
      <p className="text-sm text-center max-w-xs">
        {filter === 'unread'
          ? 'جميع إشعاراتك مقروءة — عمل ممتاز!'
          : 'ستظهر هنا الإشعارات الجديدة عند وصولها'}
      </p>
    </div>
  );
}

// ── Skeleton loader ───────────────────────────────────────────
function SkeletonList() {
  return (
    <div className="divide-y divide-border/40">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3 animate-pulse">
          <div className="w-9 h-9 rounded-xl bg-border/40 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 bg-border/40 rounded w-3/4" />
            <div className="h-3 bg-border/30 rounded w-1/2" />
            <div className="h-2.5 bg-border/20 rounded w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function NotificationsScreen() {
  const [filter, setFilter] = useState('all'); // 'all' | 'unread'

  const {
    notifications,
    unreadCount,
    loading,
    hasMore,
    markAsRead,
    markAllAsRead,
    loadMore,
  } = useNotifications({ realtime: true, autoLoad: true, autoToast: false });

  // Apply filter
  const visible = useMemo(() => {
    if (filter === 'unread') return notifications.filter(n => !n.is_read);
    return notifications;
  }, [notifications, filter]);

  // Group by date
  const groups = useMemo(() => {
    const map = {};
    visible.forEach(n => {
      const g = getDateGroup(n.created_at);
      if (!map[g]) map[g] = [];
      map[g].push(n);
    });
    // Return in canonical order
    return GROUP_ORDER.filter(g => map[g]).map(g => ({ label: g, items: map[g] }));
  }, [visible]);

  return (
    <div className="max-w-2xl mx-auto pb-24 sm:pb-8">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between gap-3 px-1 pt-1 pb-4 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <h1 className="text-xl sm:text-2xl font-extrabold text-text">
            🔔 الإشعارات
          </h1>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full bg-red text-white text-xs font-bold">
              {Math.min(unreadCount, 99)}
            </span>
          )}
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllAsRead}
            className="shrink-0 text-sm font-medium text-teal hover:text-teal/70 transition-colors"
          >
            تحديد الكل كمقروء
          </button>
        )}
      </div>

      {/* ── Card container ── */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">

        {/* Filter tabs */}
        <div className="px-4 pt-3">
          <FilterTabs active={filter} onChange={setFilter} unreadCount={unreadCount} />
        </div>

        {/* Content */}
        {loading && notifications.length === 0 ? (
          <SkeletonList />
        ) : groups.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <>
            {groups.map(({ label, items }) => (
              <div key={label}>
                <GroupHeader label={label} />
                <div className="divide-y divide-border/40">
                  {items.map(n => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      onRead={markAsRead}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Load more */}
            {hasMore && (
              <div className="border-t border-border px-4 py-3">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loading}
                  className="w-full text-sm text-teal hover:text-teal/70 disabled:opacity-50 transition-colors py-1"
                >
                  {loading ? 'جارٍ التحميل…' : 'تحميل المزيد'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
