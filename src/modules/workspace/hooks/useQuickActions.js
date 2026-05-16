// =============================================================
// useQuickActions v2 — adaptive quick actions
// Adapts to: attendance status · time of day · user role · overdue
// =============================================================
import { useMemo }            from 'react';
import { useNavigate }        from 'react-router-dom';
import useAttendanceStore     from '@modules/attendance/store/useAttendanceStore';
import { useAuth }            from '@hooks/useAuth';
import { useTaskStore }       from '@modules/tasks/store/useTaskStore';
import { useNotificationStore } from '@modules/notifications/store/useNotificationStore';
import useWorkspaceStore      from '../store/useWorkspaceStore';
import { ROUTES }             from '@routes/paths';
import { ROLES }              from '@data/teams';

// ── Time-of-day helper ─────────────────────────────────────────
function getTimeBlock() {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return 'morning';   // 5am – 12pm
  if (h >= 12 && h < 17) return 'afternoon'; // 12pm – 5pm
  if (h >= 17 && h < 21) return 'evening';   // 5pm – 9pm
  return 'night';
}

export function useQuickActions() {
  const navigate = useNavigate();
  const auth     = useAuth();
  const role     = auth?.role;

  const myRecord   = useAttendanceStore((s) => s.myRecord);
  const checkIn    = useAttendanceStore((s) => s.checkIn);
  const checkOut   = useAttendanceStore((s) => s.checkOut);
  const startBreak = useAttendanceStore((s) => s.startBreak);
  const endBreak   = useAttendanceStore((s) => s.endBreak);

  const tasks      = useTaskStore((s) => s.tasks);
  const loadTasks  = useTaskStore((s) => s.loadTasks);

  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markAllRead = useNotificationStore((s) => s.markAllAsRead);

  const toggleFocusMode = useWorkspaceStore((s) => s.toggleFocusMode);
  const isFocusMode     = useWorkspaceStore((s) => s.isFocusMode);

  const isCheckedIn  = Boolean(myRecord?.check_in_time);
  const isCheckedOut = myRecord?.status === 'checked_out';
  const isOnBreak    = myRecord?.status === 'on_break';
  const timeBlock    = getTimeBlock();

  const overdueTasks = useMemo(
    () => tasks.filter((t) => t?.due_date && new Date(t.due_date) < new Date() && t?.status !== 'done'),
    [tasks]
  );

  const actions = useMemo(() => {
    const list = [];

    // ── 1. Attendance — always first, contextual ────────────────
    if (!isCheckedIn) {
      list.push({
        id:     'checkin',
        label:  timeBlock === 'morning' ? 'صباح الخير 🌅' : 'تسجيل حضور',
        icon:   '🟢',
        color:  'bg-green-100 text-green-700 ring-1 ring-green-200',
        action: () => checkIn(auth.id),
        badge:  null,
        pulse:  timeBlock === 'morning', // pulsing ring if morning
      });
    } else if (isOnBreak) {
      list.push({
        id:     'endbreak',
        label:  'إنهاء استراحة',
        icon:   '▶️',
        color:  'bg-blue-100 text-blue-700',
        action: () => endBreak(myRecord.id),
      });
    } else if (!isCheckedOut) {
      // Add break option
      list.push({
        id:     'break',
        label:  'استراحة',
        icon:   '☕',
        color:  'bg-amber-100 text-amber-700',
        action: () => startBreak(myRecord.id),
      });
      // Add checkout
      list.push({
        id:     'checkout',
        label:  'انصراف',
        icon:   '🔴',
        color:  'bg-red-100 text-red-700',
        action: () => checkOut(myRecord.id),
      });
    } else {
      list.push({
        id:      'checked',
        label:   'منصرف اليوم',
        icon:    '✅',
        color:   'bg-gray-100 text-gray-400',
        action:  null,
        disabled: true,
      });
    }

    // ── 2. Overdue tasks alert ──────────────────────────────────
    if (overdueTasks.length > 0) {
      list.push({
        id:     'overdue',
        label:  `متأخرة (${overdueTasks.length})`,
        icon:   '⚠️',
        color:  'bg-red-100 text-red-700 ring-1 ring-red-200',
        action: () => navigate(ROUTES.TASKS),
        badge:  overdueTasks.length,
        pulse:  true,
      });
    }

    // ── 3. Tasks shortcut ──────────────────────────────────────
    list.push({
      id:     'tasks',
      label:  'المهام',
      icon:   '📋',
      color:  'bg-indigo-100 text-indigo-700',
      action: () => navigate(ROUTES.TASKS),
    });

    // ── 4. Unread notifications ────────────────────────────────
    if (unreadCount > 0) {
      list.push({
        id:     'markread',
        label:  `إشعارات (${unreadCount})`,
        icon:   '🔔',
        color:  'bg-blue-100 text-blue-700',
        action: () => markAllRead?.(),
        badge:  unreadCount,
      });
    }

    // ── 5. Focus mode toggle ───────────────────────────────────
    list.push({
      id:    'focus',
      label: isFocusMode ? 'إيقاف التركيز' : 'وضع التركيز',
      icon:  '🎯',
      color: isFocusMode ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600',
      action: toggleFocusMode,
    });

    // ── 6. Time-based contextual ───────────────────────────────
    if (timeBlock === 'morning' && isCheckedIn) {
      list.push({
        id:     'plan',
        label:  'خطط يومك',
        icon:   '📅',
        color:  'bg-teal-100 text-teal-700',
        action: () => navigate(ROUTES.TASKS),
      });
    }

    if (timeBlock === 'afternoon') {
      list.push({
        id:     'refresh',
        label:  'تحديث',
        icon:   '🔄',
        color:  'bg-gray-100 text-gray-600',
        action: () => loadTasks(),
      });
    }

    // ── 7. Role-based actions ─────────────────────────────────
    if (role === ROLES.MANAGER || role === ROLES.ADMIN || role === ROLES.SALES_MANAGER) {
      list.push({
        id:     'team',
        label:  'الفريق',
        icon:   '👥',
        color:  'bg-purple-100 text-purple-700',
        action: () => navigate(ROUTES.TEAM),
      });
    }

    if (role === ROLES.MANAGER || role === ROLES.ADMIN) {
      list.push({
        id:     'accounting',
        label:  'الحسابات',
        icon:   '💰',
        color:  'bg-emerald-100 text-emerald-700',
        action: () => navigate(ROUTES.ACCOUNTING),
      });
    }

    return list.filter(Boolean);
  }, [
    isCheckedIn, isCheckedOut, isOnBreak, overdueTasks.length,
    unreadCount, isFocusMode, timeBlock, role,
    auth.id, myRecord?.id,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  return { actions, timeBlock, overdueTasks };
}

export default useQuickActions;
