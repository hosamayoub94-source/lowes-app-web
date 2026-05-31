// =============================================================
// useTaskDueSoonAlerts
// Fires once per session (not per render). Queries tasks due
// in 1–3 days and pushes in-app notifications:
//   • Employees   → one notification per their assigned task
//   • Managers/Admins → one summary notification (all tasks)
// Dedup is handled by notificationService (same task/day = skip).
// =============================================================
import { useEffect, useRef } from 'react';
import { supabase }          from '@services/supabase';
import { useAuthStore }      from '@stores/authStore';
import { sendNotification }  from '@modules/notifications/services/notificationService';
import { NOTIFICATION_TYPE } from '@modules/notifications/types/notification.types';
import { ROLES }             from '@data/teams';

const DAY_MS       = 86_400_000;
const MGMT_ROLES   = new Set([ROLES.MANAGER, ROLES.ADMIN, ROLES.SALES_MANAGER]);
const FINISHED     = ['completed', 'done', 'cancelled'];

function dateStr(offsetDays) {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

function daysUntil(dueDateStr) {
  const due   = new Date(dueDateStr + 'T00:00:00');
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
  return Math.round((due - today) / DAY_MS);
}

function formatArabicDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
  } catch {
    return dateStr;
  }
}

async function runDueSoonCheck(session) {
  try {
    let q = supabase
      .from('tasks')
      .select('id, title, due_date, assignee_id, status')
      .gte('due_date', dateStr(1))
      .lte('due_date', dateStr(3))
      .neq('status', 'completed')
      .neq('status', 'done')
      .neq('status', 'cancelled');

    const { data: tasks, error } = await q;
    if (error || !tasks?.length) return;

    const isManager = MGMT_ROLES.has(session.role);

    if (isManager) {
      // One summary notification for managers
      const lines = tasks
        .slice(0, 6)
        .map((t) => `• ${t.title} — ${formatArabicDate(t.due_date)}`)
        .join('\n');
      const extra = tasks.length > 6 ? `\n… و${tasks.length - 6} مهام أخرى` : '';

      await sendNotification({
        userId:   session.id,
        type:     NOTIFICATION_TYPE.TASK_DUE_SOON,
        title:    `📅 ${tasks.length} مهام موعدها خلال 3 أيام`,
        message:  lines + extra,
        severity: 'warning',
        metadata: { count: tasks.length },
        // dedup: one per manager per day (entityId = 'summary')
        entityId: 'summary',
      });
    } else {
      // Individual notifications for the employee's own tasks
      const mine = tasks.filter((t) => t.assignee_id === session.id);
      for (const task of mine) {
        const days = daysUntil(task.due_date);
        const title =
          days <= 1
            ? '⚡ مهمة تنتهي غداً!'
            : `⏰ مهمة تنتهي خلال ${days} أيام`;

        await sendNotification({
          userId:     session.id,
          type:       NOTIFICATION_TYPE.TASK_DUE_SOON,
          title,
          message:    `"${task.title}"`,
          entityType: 'task',
          entityId:   task.id,
          severity:   days <= 1 ? 'warning' : 'info',
        });
      }
    }
  } catch {
    // silent — never crash the app for alerts
  }
}

export function useTaskDueSoonAlerts() {
  const session = useAuthStore((s) => s.session);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!session?.id || firedRef.current) return;
    firedRef.current = true;
    // Small delay so auth completes and layout is ready
    const t = setTimeout(() => runDueSoonCheck(session), 3000);
    return () => clearTimeout(t);
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}
