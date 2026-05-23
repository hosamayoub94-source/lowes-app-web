// =============================================================
// NotificationsScreen 2.0
// • tabs: الكل / مهام / حضور / النظام / إعلانات
// • action link per notification type
// • announcements tab (from announcements table)
// • mark all read · delete · swipe-feel hover
// =============================================================
import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link }              from 'react-router-dom';
import { useNotifications }  from '@modules/notifications/hooks/useNotifications';
import { getTypeMeta }       from '@modules/notifications/types/notification.types';
import { supabase }          from '@services/supabase';

// ── Type → route map ───────────────────────────────────────────
const TYPE_ROUTE = {
  task_assigned:      '/tasks',
  task_overdue:       '/tasks',
  task_completed:     '/tasks',
  task_commented:     '/tasks',
  task_status_change: '/tasks',
  attendance_alert:   '/attendance',
  absence_alert:      '/attendance',
  vacation_approved:  '/requests',
  payroll_alert:      '/ledger',
  expense_alert:      '/ledger',
  audit_critical:     '/admin',
  login_failed_alert: '/admin',
  role_changed:       '/admin',
  system_alert:       '/',
  user_mention:       '/chat',
};

// ── Tab config ─────────────────────────────────────────────────
const TABS = [
  { key: 'all',           label: 'الكل',     icon: '🔔' },
  { key: 'tasks',         label: 'مهام',     icon: '📋' },
  { key: 'attendance',    label: 'حضور',     icon: '📅' },
  { key: 'system',        label: 'النظام',   icon: '⚙️' },
  { key: 'announcements', label: 'إعلانات',  icon: '📢' },
];

const TASK_TYPES  = new Set(['task_assigned','task_overdue','task_completed','task_commented','task_status_change']);
const ATT_TYPES   = new Set(['attendance_alert','absence_alert','vacation_approved']);
const SYS_TYPES   = new Set(['payroll_alert','expense_alert','audit_critical','login_failed_alert','role_changed','system_alert','user_mention']);

function matchTab(notif, tab) {
  if (tab === 'all')        return true;
  if (tab === 'tasks')      return TASK_TYPES.has(notif.type);
  if (tab === 'attendance') return ATT_TYPES.has(notif.type);
  if (tab === 'system')     return SYS_TYPES.has(notif.type);
  return false;
}

// ── Helpers ────────────────────────────────────────────────────
function timeAgo(dateStr) {
  try {
    const s = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (s < 60)  return 'الآن';
    const m = Math.floor(s / 60);
    if (m < 60)  return `منذ ${m}د`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `منذ ${h}س`;
    const d = Math.floor(h / 24);
    if (d === 1) return 'أمس';
    if (d < 7)   return `منذ ${d} أيام`;
    return new Date(dateStr).toLocaleDateString('ar-SA', { month:'short', day:'numeric' });
  } catch { return ''; }
}
function getDateGroup(dateStr) {
  const diff = Math.floor((new Date().setHours(0,0,0,0) - new Date(new Date(dateStr).toDateString())) / 86400000);
  if (diff === 0) return 'اليوم';
  if (diff === 1) return 'أمس';
  if (diff < 7)   return 'هذا الأسبوع';
  if (diff < 30)  return 'هذا الشهر';
  return 'سابقاً';
}
const GROUP_ORDER = ['اليوم','أمس','هذا الأسبوع','هذا الشهر','سابقاً'];

// ── Notification Item ──────────────────────────────────────────
function NotifItem({ notif, onRead, onDelete }) {
  const { icon, label, colorClass } = getTypeMeta(notif.type);
  const isUnread  = !notif.is_read;
  const route     = TYPE_ROUTE[notif.type] ?? '/';
  const [gone, setGone] = useState(false);

  const handleRead = () => { if (isUnread) onRead?.(notif.id); };
  const handleDel  = async (e) => {
    e.stopPropagation();
    setGone(true);
    setTimeout(() => onDelete?.(notif.id), 250);
  };

  if (gone) return null;

  return (
    <div className={`group flex items-start gap-3 px-4 py-3 border-b border-border/40 last:border-0 transition-all duration-200 hover:bg-surface-alt/60 ${isUnread ? 'bg-teal/[0.03]' : 'opacity-80'}`}
         onClick={handleRead}>
      {/* Icon */}
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg shrink-0 ${colorClass}`}>
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm leading-snug text-text ${isUnread ? 'font-bold' : 'font-medium'}`}>
            {notif.title}
          </p>
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
            {isUnread && <span className="w-2 h-2 rounded-full bg-teal shrink-0" />}
            <button onClick={handleDel}
              className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-lg bg-surface border border-border text-muted hover:text-red-500 hover:border-red-200 flex items-center justify-center text-[10px] transition-all">
              ✕
            </button>
          </div>
        </div>
        {notif.message && (
          <p className="text-xs text-muted mt-0.5 line-clamp-2">{notif.message}</p>
        )}
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-[10px] text-muted/60">{timeAgo(notif.created_at)}</span>
          <span className="text-[10px] text-muted/50 px-1.5 py-0.5 bg-surface-alt rounded-full">{label}</span>
          <Link to={route} onClick={handleRead}
            className="text-[10px] text-teal font-semibold hover:underline ms-auto opacity-0 group-hover:opacity-100 transition-opacity">
            فتح ←
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Announcements Tab ──────────────────────────────────────────
function AnnouncementsTab() {
  const [anns, setAnns]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    supabase.from('announcements').select('id,title,body,is_pinned,created_by,created_at')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => { setAnns(data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-3 p-4">
      {[1,2,3].map(i => (
        <div key={i} className="h-20 rounded-2xl bg-surface-alt animate-pulse" />
      ))}
    </div>
  );

  if (!anns.length) return (
    <div className="flex flex-col items-center py-20 text-center">
      <p className="text-5xl mb-3 opacity-30">📢</p>
      <p className="text-base font-bold text-text">لا توجد إعلانات</p>
      <p className="text-sm text-muted mt-1">ستظهر هنا الإعلانات عند نشرها</p>
    </div>
  );

  return (
    <div className="p-3 space-y-2.5">
      {anns.map(ann => (
        <div key={ann.id}
          className={`rounded-2xl border transition-all ${ann.is_pinned ? 'border-teal/25 bg-teal/[0.03]' : 'border-border bg-surface'}`}>
          <button className="w-full text-start px-4 py-3.5 flex items-start gap-3"
            onClick={() => setExpanded(e => e === ann.id ? null : ann.id)}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${ann.is_pinned ? 'bg-teal/10 text-teal' : 'bg-surface-alt text-muted'}`}>
              {ann.is_pinned ? '📌' : '📢'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                {ann.is_pinned && <span className="text-[9px] font-bold text-teal bg-teal/10 px-1.5 py-0.5 rounded-full">مثبّت</span>}
                <span className="text-[10px] text-muted/60">{timeAgo(ann.created_at)}</span>
              </div>
              <p className="text-sm font-bold text-text leading-snug">{ann.title}</p>
              {ann.body && expanded !== ann.id && (
                <p className="text-xs text-muted mt-0.5 truncate">{ann.body}</p>
              )}
            </div>
            <span className={`text-muted shrink-0 text-sm transition-transform ${expanded === ann.id ? 'rotate-180' : ''}`}>⌄</span>
          </button>
          {expanded === ann.id && ann.body && (
            <div className="px-4 pb-4 animate-in slide-in-from-top-1 duration-150">
              <div className="bg-surface-alt rounded-xl px-3 py-2.5 text-sm text-text leading-relaxed whitespace-pre-wrap">
                {ann.body}
              </div>
              <p className="text-[10px] text-muted mt-2 px-1">نشر بواسطة: {ann.created_by}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────
function SkeletonList() {
  return (
    <div className="divide-y divide-border/40">
      {[1,2,3,4,5].map(i => (
        <div key={i} className="flex items-start gap-3 px-4 py-3 animate-pulse">
          <div className="w-10 h-10 rounded-2xl bg-border/40 shrink-0" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-3.5 bg-border/40 rounded-lg w-3/4" />
            <div className="h-3 bg-border/30 rounded-lg w-1/2" />
            <div className="h-2 bg-border/20 rounded-lg w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────
export default function NotificationsScreen() {
  const [tab, setTab] = useState('all');
  const [deleted, setDeleted] = useState(new Set());

  const { notifications, unreadCount, loading, hasMore, markAsRead, markAllAsRead, loadMore } =
    useNotifications({ realtime: true, autoLoad: true, autoToast: false });

  const handleDelete = useCallback((id) => {
    setDeleted(p => new Set([...p, id]));
    supabase.from('notifications').delete().eq('id', id).catch(() => {});
  }, []);

  // Filter by tab (excluding deleted)
  const visible = useMemo(() => {
    if (tab === 'announcements') return [];
    return notifications.filter(n => !deleted.has(n.id) && matchTab(n, tab));
  }, [notifications, tab, deleted]);

  // Group by date
  const groups = useMemo(() => {
    const map = {};
    visible.forEach(n => {
      const g = getDateGroup(n.created_at);
      if (!map[g]) map[g] = [];
      map[g].push(n);
    });
    return GROUP_ORDER.filter(g => map[g]).map(g => ({ label: g, items: map[g] }));
  }, [visible]);

  const totalUnread = notifications.filter(n => !n.is_read && !deleted.has(n.id)).length;

  return (
    <div className="max-w-2xl mx-auto pb-24 sm:pb-8 space-y-4" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-extrabold text-text">🔔 الإشعارات</h1>
          {totalUnread > 0 && (
            <span className="flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold shadow-sm">
              {Math.min(totalUnread, 99)}
            </span>
          )}
        </div>
        {totalUnread > 0 && (
          <button onClick={markAllAsRead}
            className="text-sm font-semibold text-teal hover:text-teal/70 px-3 py-1.5 rounded-xl hover:bg-teal/10 transition">
            ✓ تحديد الكل مقروء
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map(t => {
          const count = t.key === 'all' ? totalUnread
            : t.key === 'announcements' ? 0
            : notifications.filter(n => !n.is_read && !deleted.has(n.id) && matchTab(n, t.key)).length;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                tab === t.key
                  ? 'bg-teal text-white shadow-sm'
                  : 'bg-surface border border-border text-muted hover:text-text hover:border-teal/30'
              }`}>
              <span>{t.icon}</span>
              <span>{t.label}</span>
              {count > 0 && (
                <span className={`text-[10px] font-black px-1.5 rounded-full ${tab === t.key ? 'bg-white/20 text-white' : 'bg-teal/10 text-teal'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
        {tab === 'announcements' ? (
          <AnnouncementsTab />
        ) : loading && !notifications.length ? (
          <SkeletonList />
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <p className="text-5xl mb-3 opacity-30">{tab === 'all' ? '🔔' : '✅'}</p>
            <p className="text-base font-bold text-text">
              {tab === 'all' ? 'لا توجد إشعارات' : 'لا توجد إشعارات في هذا القسم'}
            </p>
            <p className="text-sm text-muted mt-1">
              {tab === 'all' ? 'ستظهر هنا الإشعارات الجديدة عند وصولها' : 'جميع الإشعارات في هذا القسم مقروءة 👍'}
            </p>
          </div>
        ) : (
          <>
            {groups.map(({ label, items }) => (
              <div key={label}>
                {/* Group header */}
                <div className="flex items-center gap-3 px-4 pt-4 pb-2">
                  <span className="text-[10px] font-bold text-muted uppercase tracking-widest">{label}</span>
                  <div className="flex-1 h-px bg-border/50" />
                </div>
                {items.map(n => (
                  <NotifItem key={n.id} notif={n} onRead={markAsRead} onDelete={handleDelete} />
                ))}
              </div>
            ))}
            {hasMore && (
              <div className="px-4 py-3 border-t border-border">
                <button onClick={loadMore} disabled={loading}
                  className="w-full text-sm text-teal hover:text-teal/70 disabled:opacity-50 transition py-1 font-semibold">
                  {loading ? 'جارٍ التحميل…' : '↓ تحميل المزيد'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
