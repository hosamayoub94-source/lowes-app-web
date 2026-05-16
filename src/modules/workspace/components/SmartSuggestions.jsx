// =============================================================
// SmartSuggestions — contextual action suggestions
// Shows: missing attendance · overdue tasks · unread notifs
//         pending approvals · inactive CRM followups
// =============================================================
import { useMemo } from 'react';
import { useNavigate }          from 'react-router-dom';
import { useTaskStore }         from '@modules/tasks/store/useTaskStore';
import { useNotificationStore } from '@modules/notifications/store/useNotificationStore';
import useAttendanceStore       from '@modules/attendance/store/useAttendanceStore';
import useCRMStore              from '@modules/crm/store/useCRMStore';
import { ROUTES }               from '@routes/paths';

// ── Suggestion card ────────────────────────────────────────────
function SuggestionCard({ icon, title, subtitle, color, onClick, actionLabel = 'عرض' }) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-3 w-full text-right
        px-3 py-2.5 rounded-xl border transition-all duration-150
        hover:shadow-sm active:scale-98 group
        ${color}
      `}
    >
      <span className="text-xl flex-none">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        {subtitle && <p className="text-xs opacity-70 truncate mt-0.5">{subtitle}</p>}
      </div>
      <span className="text-xs opacity-60 group-hover:opacity-100 flex-none transition-opacity">
        {actionLabel} →
      </span>
    </button>
  );
}

export function SmartSuggestions() {
  const navigate = useNavigate();

  const tasks         = useTaskStore((s) => s.tasks);
  const unreadCount   = useNotificationStore((s) => s.unreadCount);
  const myRecord      = useAttendanceStore((s) => s.myRecord);
  const followups     = useCRMStore((s) => s.followups ?? []);

  const now = new Date();

  const suggestions = useMemo(() => {
    const list = [];

    // ── 1. Missing attendance ──────────────────────────────────
    const isCheckedIn  = Boolean(myRecord?.check_in_time);
    const isCheckedOut = myRecord?.status === 'checked_out';
    const hour         = now.getHours();

    if (!isCheckedIn && hour >= 8 && hour < 17) {
      list.push({
        id:          'missing-attendance',
        icon:        '🕒',
        title:       'لم تسجل حضورك بعد',
        subtitle:    `الساعة ${now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}`,
        color:       'bg-amber-50 border-amber-200 text-amber-800',
        path:        ROUTES.ATTENDANCE,
        actionLabel: 'تسجيل',
        priority:    10,
      });
    }

    // ── 2. Overdue tasks ───────────────────────────────────────
    const overdue = tasks.filter(
      (t) => t?.due_date && new Date(t.due_date) < now && t?.status !== 'done'
    );
    if (overdue.length > 0) {
      list.push({
        id:          'overdue-tasks',
        icon:        '⚠️',
        title:       `${overdue.length} مهمة متأخرة`,
        subtitle:    overdue.slice(0, 2).map((t) => t.title).join(' · '),
        color:       'bg-red-50 border-red-200 text-red-800',
        path:        ROUTES.TASKS,
        actionLabel: 'معالجة',
        priority:    9,
      });
    }

    // ── 3. Tasks due today (not done) ──────────────────────────
    const dueToday = tasks.filter((t) => {
      if (!t?.due_date || t?.status === 'done') return false;
      return new Date(t.due_date).toDateString() === now.toDateString();
    });
    if (dueToday.length > 0) {
      list.push({
        id:          'due-today',
        icon:        '📅',
        title:       `${dueToday.length} مهمة تستحق اليوم`,
        subtitle:    dueToday.slice(0, 2).map((t) => t.title).join(' · '),
        color:       'bg-indigo-50 border-indigo-200 text-indigo-800',
        path:        ROUTES.TASKS,
        actionLabel: 'عرض',
        priority:    8,
      });
    }

    // ── 4. Unread notifications ────────────────────────────────
    if (unreadCount >= 3) {
      list.push({
        id:          'unread-notifs',
        icon:        '🔔',
        title:       `${unreadCount} إشعار غير مقروء`,
        subtitle:    'لديك إشعارات تنتظر مراجعتك',
        color:       'bg-blue-50 border-blue-200 text-blue-800',
        path:        null,
        actionLabel: 'مراجعة',
        priority:    5,
      });
    }

    // ── 5. Overdue CRM followups ──────────────────────────────
    const overdueFollowups = followups.filter(
      (f) => f?.due_date && new Date(f.due_date) < now && f?.status !== 'done'
    );
    if (overdueFollowups.length > 0) {
      list.push({
        id:          'overdue-followups',
        icon:        '📞',
        title:       `${overdueFollowups.length} متابعة CRM متأخرة`,
        subtitle:    overdueFollowups.slice(0, 1).map((f) => f.title ?? f.notes ?? 'متابعة').join(''),
        color:       'bg-purple-50 border-purple-200 text-purple-800',
        path:        null,
        actionLabel: 'متابعة',
        priority:    7,
      });
    }

    // ── 6. End of day reminder ─────────────────────────────────
    if (isCheckedIn && !isCheckedOut && hour >= 17) {
      list.push({
        id:          'end-of-day',
        icon:        '🏠',
        title:       'لا تنسَ تسجيل الانصراف',
        subtitle:    `وقت العمل: ${myRecord?.worked_minutes ? `${Math.floor(myRecord.worked_minutes / 60)}س ${myRecord.worked_minutes % 60}د` : '–'}`,
        color:       'bg-gray-50 border-gray-200 text-gray-700',
        path:        ROUTES.ATTENDANCE,
        actionLabel: 'تسجيل',
        priority:    9,
      });
    }

    // Sort by priority desc, take top 4
    return list.sort((a, b) => b.priority - a.priority).slice(0, 4);
  }, [tasks, unreadCount, myRecord, followups]); // eslint-disable-line react-hooks/exhaustive-deps

  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      {suggestions.map((s) => (
        <SuggestionCard
          key={s.id}
          icon={s.icon}
          title={s.title}
          subtitle={s.subtitle}
          color={s.color}
          actionLabel={s.actionLabel}
          onClick={() => s.path && navigate(s.path)}
        />
      ))}
    </div>
  );
}

export default SmartSuggestions;
