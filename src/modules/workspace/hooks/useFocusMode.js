// =============================================================
// useFocusMode — filters urgent/overdue items across modules
// =============================================================
import { useMemo }        from 'react';
import { useTaskStore }   from '@modules/tasks/store/useTaskStore';
import { useNotificationStore } from '@modules/notifications/store/useNotificationStore';

export function useFocusMode() {
  const tasks         = useTaskStore((s) => s.tasks);
  const notifications = useNotificationStore((s) => s.notifications);

  const now = new Date();

  const overdueTasks = useMemo(
    () => tasks.filter((t) =>
      t?.due_date && new Date(t.due_date) < now && t?.status !== 'done' && t?.status !== 'completed'
    ),
    [tasks] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const dueTodayTasks = useMemo(
    () => tasks.filter((t) => {
      if (!t?.due_date || t?.status === 'done' || t?.status === 'completed') return false;
      const d = new Date(t.due_date);
      return d >= now && d.toDateString() === now.toDateString();
    }),
    [tasks] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const urgentNotifs = useMemo(
    () => notifications.filter((n) => !n.is_read).slice(0, 5),
    [notifications]
  );

  const totalUrgent = overdueTasks.length + dueTodayTasks.length + urgentNotifs.length;

  return {
    overdueTasks,
    dueTodayTasks,
    urgentNotifs,
    totalUrgent,
    hasUrgent: totalUrgent > 0,
  };
}

export default useFocusMode;
