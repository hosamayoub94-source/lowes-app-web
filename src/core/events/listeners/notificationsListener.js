// =============================================================
// Notifications Listener — bridges the Event Bus → notifications.
//
// The Notifications module no longer needs to be CALLED by Tasks /
// Audit / Attendance / Payroll. Those modules just `emit()` events
// and this listener translates them into sendNotification() calls.
//
// Wire-up:
//   import { bindNotificationsListener } from '@/core/events/listeners/notificationsListener';
//   bindNotificationsListener();   // call once at app boot
//
// Returns an `unbind()` function — useful for tests / HMR.
// =============================================================
import { on } from '../eventBus';
import { EVENTS } from '../eventTypes';
import {
  sendNotification,
  sendBulkNotifications,
}                                  from '@modules/notifications/services/notificationService';
import { NOTIFICATION_TYPE }       from '@modules/notifications/types/notification.types';
import { ENTITY_TYPE }             from '@modules/audit/types/audit.types';

// Tiny safety wrapper — listeners must never crash the bus.
const safe = (fn) => async (...args) => {
  try { await fn(...args); }
  catch (err) {
     
    console.warn('[notificationsListener]', err?.message || err);
  }
};

export function bindNotificationsListener() {
  const offs = [];

  // ── Tasks ────────────────────────────────────────────────────
  offs.push(on(EVENTS.TASK_ASSIGNED, safe(async (p) => {
    if (!p?.assigneeId) return;
    await sendNotification({
      userId:     p.assigneeId,
      type:       NOTIFICATION_TYPE.TASK_ASSIGNED,
      title:      'تم تعيين مهمة جديدة لك',
      message:    p.taskTitle
        ? `"${p.taskTitle}"${p.assignerName ? ` — بواسطة ${p.assignerName}` : ''}`
        : 'تم تعيين مهمة جديدة',
      entityType: ENTITY_TYPE.TASK,
      entityId:   p.taskId,
    });
  })));

  offs.push(on(EVENTS.TASK_OVERDUE, safe(async (p) => {
    if (!p?.assigneeId) return;
    await sendNotification({
      userId:     p.assigneeId,
      type:       NOTIFICATION_TYPE.TASK_OVERDUE,
      title:      'مهمة متأخرة',
      message:    p.taskTitle ? `"${p.taskTitle}" تجاوزت الموعد النهائي` : null,
      entityType: ENTITY_TYPE.TASK,
      entityId:   p.taskId,
      severity:   'warning',
    });
  })));

  offs.push(on(EVENTS.TASK_COMPLETED, safe(async (p) => {
    const ids = p?.managerIds || [];
    if (!ids.length) return;
    await sendBulkNotifications(ids, {
      type:       NOTIFICATION_TYPE.TASK_COMPLETED,
      title:      'مهمة مكتملة',
      message:    p.taskTitle ? `"${p.taskTitle}" تم إنجازها` : 'تم إنجاز المهمة',
      entityType: ENTITY_TYPE.TASK,
      entityId:   p.taskId,
    });
  })));

  offs.push(on(EVENTS.TASK_COMMENTED, safe(async (p) => {
    const ids = p?.recipientIds || [];
    if (!ids.length) return;
    await sendBulkNotifications(ids, {
      type:       NOTIFICATION_TYPE.TASK_COMMENTED,
      title:      'تعليق جديد على مهمة',
      message:    p.taskTitle
        ? `"${p.taskTitle}"${p.commenterName ? ` — ${p.commenterName} علّق` : ''}`
        : null,
      entityType: ENTITY_TYPE.TASK,
      entityId:   p.taskId,
    });
  })));

  // ── Attendance ───────────────────────────────────────────────
  offs.push(on(EVENTS.ATTENDANCE_ABSENT, safe(async (p) => {
    const ids = p?.managerIds || [];
    if (!ids.length) return;
    await sendBulkNotifications(ids, {
      type:       NOTIFICATION_TYPE.ABSENCE_ALERT,
      title:      'غياب موظف',
      message:    p.employeeName ? `${p.employeeName} غائب اليوم` : 'موظف غائب اليوم',
      entityType: ENTITY_TYPE.ATTENDANCE,
      entityId:   p.employeeId,
      severity:   'warning',
    });
  })));

  offs.push(on(EVENTS.ATTENDANCE_LATE, safe(async (p) => {
    const ids = p?.managerIds || [];
    if (!ids.length) return;
    await sendBulkNotifications(ids, {
      type:       NOTIFICATION_TYPE.ATTENDANCE_ALERT,
      title:      'تأخر موظف',
      message:    p.employeeName
        ? `${p.employeeName} متأخر${p.lateByMinutes ? ` (${p.lateByMinutes} د)` : ''}`
        : null,
      entityType: ENTITY_TYPE.ATTENDANCE,
      entityId:   p.employeeId,
      severity:   'warning',
    });
  })));

  // ── Payroll ──────────────────────────────────────────────────
  offs.push(on(EVENTS.PAYROLL_APPROVED, safe(async (p) => {
    const ids = p?.recipientIds || [];
    if (!ids.length) return;
    await sendBulkNotifications(ids, {
      type:       NOTIFICATION_TYPE.PAYROLL_ALERT,
      title:      'تم اعتماد كشف الرواتب',
      message:    p.period ? `الفترة: ${p.period}` : null,
      entityType: ENTITY_TYPE.ACCOUNTING,
      entityId:   p.payrollId,
      severity:   'warning',
    });
  })));

  // ── Auth ─────────────────────────────────────────────────────
  offs.push(on(EVENTS.USER_LOGIN_FAILED, safe(async (p) => {
    const ids = p?.adminIds || [];
    if (!ids.length) return;
    await sendBulkNotifications(ids, {
      type:     NOTIFICATION_TYPE.LOGIN_FAILED_ALERT,
      title:    'محاولات دخول فاشلة متكررة',
      message:  p.userName ? `${p.userName} — ${p.attempts || '?'} محاولات` : null,
      severity: 'critical',
    });
  })));

  offs.push(on(EVENTS.USER_ROLE_CHANGED, safe(async (p) => {
    const ids = p?.adminIds || [];
    if (!ids.length) return;
    await sendBulkNotifications(ids, {
      type:     NOTIFICATION_TYPE.ROLE_CHANGED,
      title:    'تغيير صلاحية مستخدم',
      message:  p.targetUser ? `${p.targetUser}: ${p.fromRole} ← ${p.toRole}` : null,
      severity: 'critical',
    });
  })));

  // ── Audit-critical → notify admins ──────────────────────────
  offs.push(on(EVENTS.AUDIT_CRITICAL_EVENT, safe(async (p) => {
    const ids = p?.adminIds || [];
    if (!ids.length) return;
    await sendBulkNotifications(ids, {
      type:      NOTIFICATION_TYPE.AUDIT_CRITICAL,
      title:     'حدث حرج في سجل النشاط',
      message:   p.auditLabel || p.entityLabel || 'حدث حرج يستوجب المراجعة',
      severity:  'critical',
      skipDedup: true, // critical always go through
    });
  })));

  // Unbind helper
  return () => offs.forEach((fn) => fn());
}

export default bindNotificationsListener;
