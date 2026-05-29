// =============================================================
// useWorkspace — aggregates data from all modules into one hook.
// =============================================================
import { useEffect } from 'react';
import { useAuth }              from '@hooks/useAuth';
import { useTaskStore }         from '@modules/tasks/store/useTaskStore';
import { useNotificationStore } from '@modules/notifications/store/useNotificationStore';
import { useMyAttendanceToday } from '@hooks/useMyAttendanceToday';
import useWorkspaceStore        from '../store/useWorkspaceStore';
import { on }                   from '@/core/events/eventBus.js';
import { EVENTS }               from '@/core/events/eventTypes.js';

export function useWorkspace() {
  const auth = useAuth();

  // ── Tasks ────────────────────────────────────────────────────
  const tasks        = useTaskStore((s) => s.tasks);
  const loadTasks    = useTaskStore((s) => s.loadTasks);
  const tasksLoading = useTaskStore((s) => s.loading);

  // ── Attendance (real table, no broken store) ─────────────────
  const { checkedIn: isCheckedIn, checkedOut: isCheckedOut, loading: attLoading } = useMyAttendanceToday();

  // ── Notifications ─────────────────────────────────────────────
  const unreadCount   = useNotificationStore((s) => s.unreadCount);
  const notifications = useNotificationStore((s) => s.notifications);
  const loadNotifs    = useNotificationStore((s) => s.loadNotifications);

  // ── Workspace state ───────────────────────────────────────────
  const isFocusMode         = useWorkspaceStore((s) => s.isFocusMode);
  const commandPaletteOpen  = useWorkspaceStore((s) => s.commandPaletteOpen);
  const recentActivity      = useWorkspaceStore((s) => s.recentActivity);
  const toggleFocusMode     = useWorkspaceStore((s) => s.toggleFocusMode);
  const pushActivity        = useWorkspaceStore((s) => s.pushActivity);
  const openCommandPalette  = useWorkspaceStore((s) => s.openCommandPalette);
  const closeCommandPalette = useWorkspaceStore((s) => s.closeCommandPalette);
  const markRefreshed       = useWorkspaceStore((s) => s.markRefreshed);

  // ── Load data on mount ────────────────────────────────────────
  useEffect(() => {
    if (!auth.id) return;
    if (tasks.length === 0) loadTasks();
    loadNotifs?.();
    markRefreshed();
  }, [auth.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard shortcut Ctrl+K ──────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openCommandPalette();
      }
      if (e.key === 'Escape') closeCommandPalette();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openCommandPalette, closeCommandPalette]);

  // ── Event Bus → activity feed ─────────────────────────────────
  useEffect(() => {
    const offs = [
      on(EVENTS.TASK_STATUS_CHANGED,  ({ task })  => pushActivity({ type: 'task',       label: `مهمة: ${task?.title ?? ''}`,         icon: '📋' })),
      on(EVENTS.TASK_COMPLETED,       ({ task })  => pushActivity({ type: 'task',       label: `✅ مهمة مكتملة: ${task?.title ?? ''}`, icon: '✅' })),
      on(EVENTS.ATTENDANCE_CHECK_IN,  ()          => pushActivity({ type: 'attendance', label: 'تم تسجيل الحضور',                    icon: '🕒' })),
      on(EVENTS.ATTENDANCE_CHECK_OUT, ()          => pushActivity({ type: 'attendance', label: 'تم تسجيل الانصراف',                  icon: '🏠' })),
      on(EVENTS.NOTIFICATION_CREATED, ({ notif }) => pushActivity({ type: 'notif',      label: notif?.title ?? 'إشعار جديد',         icon: '🔔' })),
      on(EVENTS.LEAD_CREATED,         ({ lead })  => pushActivity({ type: 'crm',        label: `عميل جديد: ${lead?.title ?? ''}`,    icon: '👤' })),
      on(EVENTS.DEAL_WON,             ({ deal })  => pushActivity({ type: 'crm',        label: `🎉 صفقة مكتملة: ${deal?.title ?? ''}`, icon: '🎉' })),
    ];
    return () => offs.forEach((off) => typeof off === 'function' && off());
  }, [pushActivity]);

  // ── Derived ───────────────────────────────────────────────────
  const today = new Date().toDateString();
  const todayTasks = tasks.filter((t) => {
    if (!t?.due_date) return false;
    return new Date(t.due_date).toDateString() === today;
  });

  const overdueTasks = tasks.filter((t) =>
    t?.due_date && new Date(t.due_date) < new Date() && t?.status !== 'done' && t?.status !== 'completed'
  );

  return {
    // Auth
    user: auth,

    // Tasks
    tasks, todayTasks, overdueTasks, tasksLoading,

    // Attendance (simplified — use AttendanceScreen for full control)
    isCheckedIn, isCheckedOut, attLoading,

    // Notifications
    unreadCount, notifications,

    // Workspace state
    isFocusMode, commandPaletteOpen, recentActivity,
    toggleFocusMode, openCommandPalette, closeCommandPalette,
  };
}

export default useWorkspace;
