// =============================================================
// Notifications Module — useNotificationTriggers
//
// Domain-specific helpers that other modules import to send
// contextually-correct notifications.
//
// Each function is fire-and-forget: never throws into the caller.
//
// Usage:
//   const { notifyTaskAssigned } = useNotificationTriggers();
//   notifyTaskAssigned({ taskId, taskTitle, assigneeId, assignerName });
// =============================================================
import { useCallback }           from 'react';
import { useAuthStore }          from '@stores/authStore';
import {
  sendNotification,
  sendBulkNotifications,
}                                from '../services/notificationService';
import { NOTIFICATION_TYPE }     from '../types/notification.types';
import { ENTITY_TYPE }           from '@modules/audit/types/audit.types';

export function useNotificationTriggers() {
  const session    = useAuthStore((s) => s.session);
  const senderName = session?.name ?? 'النظام';

  // ── Tasks ────────────────────────────────────────────────────

  const notifyTaskAssigned = useCallback(
    ({ taskId, taskTitle, assigneeId }) => {
      if (!assigneeId) return;
      sendNotification({
        userId:     assigneeId,
        type:       NOTIFICATION_TYPE.TASK_ASSIGNED,
        title:      'تم تعيين مهمة جديدة لك',
        message:    `"${taskTitle}" — تم التعيين بواسطة ${senderName}`,
        entityType: ENTITY_TYPE.TASK,
        entityId:   taskId,
      }).catch(() => {});
    },
    [senderName],
  );

  const notifyTaskOverdue = useCallback(
    ({ taskId, taskTitle, assigneeId }) => {
      if (!assigneeId) return;
      sendNotification({
        userId:     assigneeId,
        type:       NOTIFICATION_TYPE.TASK_OVERDUE,
        title:      'مهمة متأخرة',
        message:    `"${taskTitle}" تجاوزت الموعد النهائي`,
        entityType: ENTITY_TYPE.TASK,
        entityId:   taskId,
        severity:   'warning',
      }).catch(() => {});
    },
    [],
  );

  const notifyTaskCompleted = useCallback(
    ({ taskId, taskTitle, managerIds = [] }) => {
      sendBulkNotifications(managerIds, {
        type:       NOTIFICATION_TYPE.TASK_COMPLETED,
        title:      'مهمة مكتملة',
        message:    `"${taskTitle}" تم إنجازها`,
        entityType: ENTITY_TYPE.TASK,
        entityId:   taskId,
      }).catch(() => {});
    },
    [],
  );

  const notifyTaskCommented = useCallback(
    ({ taskId, taskTitle, recipientIds = [] }) => {
      sendBulkNotifications(recipientIds, {
        type:       NOTIFICATION_TYPE.TASK_COMMENTED,
        title:      'تعليق جديد على مهمة',
        message:    `"${taskTitle}" — ${senderName} علّق على المهمة`,
        entityType: ENTITY_TYPE.TASK,
        entityId:   taskId,
      }).catch(() => {});
    },
    [senderName],
  );

  // ── Attendance ───────────────────────────────────────────────

  const notifyAbsence = useCallback(
    ({ employeeId, employeeName, managerIds = [] }) => {
      sendBulkNotifications(managerIds, {
        type:       NOTIFICATION_TYPE.ABSENCE_ALERT,
        title:      'غياب موظف',
        message:    `${employeeName} غائب اليوم بدون مبرر`,
        entityType: ENTITY_TYPE.ATTENDANCE,
        entityId:   employeeId,
        severity:   'warning',
      }).catch(() => {});
    },
    [],
  );

  const notifyVacationApproved = useCallback(
    ({ employeeId, period }) => {
      sendNotification({
        userId:     employeeId,
        type:       NOTIFICATION_TYPE.VACATION_APPROVED,
        title:      'تمت الموافقة على إجازتك',
        message:    period ? `الفترة: ${period}` : null,
        entityType: ENTITY_TYPE.ATTENDANCE,
      }).catch(() => {});
    },
    [],
  );

  // ── Payroll / Accounting ─────────────────────────────────────

  const notifyPayrollAlert = useCallback(
    ({ recipientId, details }) => {
      sendNotification({
        userId:     recipientId,
        type:       NOTIFICATION_TYPE.PAYROLL_ALERT,
        title:      'تنبيه كشف الرواتب',
        message:    details,
        entityType: ENTITY_TYPE.ACCOUNTING,
        severity:   'warning',
      }).catch(() => {});
    },
    [],
  );

  // ── Security / Audit ─────────────────────────────────────────

  /** Notify all admins when an audit CRITICAL event occurs. */
  const notifyAuditCritical = useCallback(
    ({ adminIds = [], auditLabel, entityLabel }) => {
      sendBulkNotifications(adminIds, {
        type:     NOTIFICATION_TYPE.AUDIT_CRITICAL,
        title:    'حدث حرج في سجل النشاط',
        message:  auditLabel || entityLabel || 'حدث حرج يستوجب المراجعة',
        severity: 'critical',
        skipDedup: true, // critical events always go through
      }).catch(() => {});
    },
    [],
  );

  const notifyLoginFailed = useCallback(
    ({ adminIds = [], userName, attempts }) => {
      sendBulkNotifications(adminIds, {
        type:     NOTIFICATION_TYPE.LOGIN_FAILED_ALERT,
        title:    'محاولات دخول فاشلة متكررة',
        message:  `${userName} — ${attempts} محاولات فاشلة`,
        severity: 'critical',
      }).catch(() => {});
    },
    [],
  );

  const notifyRoleChanged = useCallback(
    ({ adminIds = [], targetUser, fromRole, toRole }) => {
      sendBulkNotifications(adminIds, {
        type:     NOTIFICATION_TYPE.ROLE_CHANGED,
        title:    'تغيير صلاحية مستخدم',
        message:  `${targetUser}: ${fromRole} ← ${toRole}`,
        severity: 'critical',
      }).catch(() => {});
    },
    [],
  );

  return {
    notifyTaskAssigned,
    notifyTaskOverdue,
    notifyTaskCompleted,
    notifyTaskCommented,
    notifyAbsence,
    notifyVacationApproved,
    notifyPayrollAlert,
    notifyAuditCritical,
    notifyLoginFailed,
    notifyRoleChanged,
  };
}
