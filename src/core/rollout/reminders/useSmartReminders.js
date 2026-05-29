// =============================================================
// useSmartReminders — Contextual reminder engine
//
// Detects and surfaces:
//   • Missing attendance (no check-in by 9:30am)
//   • Overdue tasks (priority: high first)
//   • Pending CRM followups
//   • Inactive workflows (tasks stuck in progress 48h+)
//   • End-of-day checkout reminder (after 4:30pm)
//
// Returns an array of reminder objects sorted by severity.
// Integrates with notification store if configured.
// =============================================================
import { useMemo } from 'react';
import { useTaskStore }  from '@modules/tasks/store/useTaskStore';
import useNotificationStore from '@modules/notifications/store/useNotificationStore';

const SEVERITY = { critical: 0, high: 1, medium: 2, low: 3 };

function _now()        { return Date.now(); }
function _hour()       { return new Date().getHours(); }
function _minute()     { return new Date().getMinutes(); }
function _timeMinutes(){ return _hour() * 60 + _minute(); }

export function useSmartReminders({ attendanceStatus = null } = {}) {
  const tasks         = useTaskStore((s) => s.tasks ?? []);
  const notifications = useNotificationStore((s) => s.notifications ?? []);

  const reminders = useMemo(() => {
    const now        = _now();
    const timeMin    = _timeMinutes();
    const results    = [];

    // ── Missing check-in ──────────────────────────────────────
    const CHECK_IN_DEADLINE = 9 * 60 + 30; // 09:30
    const isWorkHours = timeMin >= 8 * 60 && timeMin <= 18 * 60;

    if (
      isWorkHours &&
      timeMin >= CHECK_IN_DEADLINE &&
      (!attendanceStatus || attendanceStatus === 'out' || attendanceStatus === null)
    ) {
      results.push({
        id:       'missing_checkin',
        type:     'attendance',
        severity: 'critical',
        icon:     '⏰',
        title:    'لم تسجّل حضورك بعد',
        message:  `تجاوزت الساعة ${Math.floor(CHECK_IN_DEADLINE / 60)}:${String(CHECK_IN_DEADLINE % 60).padStart(2,'0')} — سجّل حضورك الآن`,
        action:   { label: 'سجّل الحضور', path: '/attendance' },
      });
    }

    // ── End-of-day checkout ────────────────────────────────────
    const CHECKOUT_START = 16 * 60 + 30; // 16:30
    if (
      timeMin >= CHECKOUT_START &&
      attendanceStatus === 'in'
    ) {
      results.push({
        id:       'checkout_reminder',
        type:     'attendance',
        severity: 'medium',
        icon:     '🏁',
        title:    'لا تنسَ تسجيل الانصراف',
        message:  'تجاوزت ساعة الرابعة والنصف — هل انتهيت من يومك؟',
        action:   { label: 'سجّل الانصراف', path: '/attendance' },
      });
    }

    // ── Overdue tasks ──────────────────────────────────────────
    const overdue = tasks.filter((t) => {
      if (t.status === 'done' || t.status === 'completed' || t.status === 'cancelled') return false;
      if (!t.due_date) return false;
      return new Date(t.due_date).getTime() < now;
    });

    if (overdue.length > 0) {
      const highPriority = overdue.filter((t) => t.priority === 'high' || t.priority === 'urgent');
      results.push({
        id:       'overdue_tasks',
        type:     'task',
        severity: highPriority.length > 0 ? 'high' : 'medium',
        icon:     '🔴',
        title:    `${overdue.length} مهمة متأخرة`,
        message:  highPriority.length > 0
          ? `${highPriority.length} منها ذات أولوية عالية`
          : 'راجع مهامك المتأخرة',
        action:   { label: 'عرض المهام', path: '/tasks' },
        count:    overdue.length,
      });
    }

    // ── Stuck in-progress tasks (48h+) ────────────────────────
    const STUCK_THRESHOLD_MS = 48 * 3600_000;
    const stuck = tasks.filter((t) => {
      if (t.status !== 'in_progress') return false;
      const updated = t.updated_at ? new Date(t.updated_at).getTime() : 0;
      return now - updated > STUCK_THRESHOLD_MS;
    });

    if (stuck.length > 0) {
      results.push({
        id:       'stuck_tasks',
        type:     'workflow',
        severity: 'medium',
        icon:     '🔄',
        title:    `${stuck.length} مهمة متوقفة`,
        message:  'مهام لم يُحدَّث عليها منذ أكثر من 48 ساعة',
        action:   { label: 'راجع المهام', path: '/tasks' },
        count:    stuck.length,
      });
    }

    // ── Unread notifications overload ─────────────────────────
    const unread = notifications.filter((n) => !n.read).length;
    if (unread >= 10) {
      results.push({
        id:       'unread_overflow',
        type:     'notification',
        severity: 'low',
        icon:     '🔔',
        title:    `${unread} إشعار غير مقروء`,
        message:  'لديك إشعارات متراكمة — راجعها عند الفرصة',
        action:   { label: 'الإشعارات', path: '/notifications' },
        count:    unread,
      });
    }

    // Sort by severity
    return results.sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity]);
  }, [tasks, notifications, attendanceStatus]);

  return {
    reminders,
    hasReminders:  reminders.length > 0,
    criticalCount: reminders.filter((r) => r.severity === 'critical').length,
    highCount:     reminders.filter((r) => r.severity === 'high').length,
    total:         reminders.length,
  };
}

export default useSmartReminders;
