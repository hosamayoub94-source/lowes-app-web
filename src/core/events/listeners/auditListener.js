// =============================================================
// Audit Listener — bridges the Event Bus → audit log.
//
// Every meaningful business event flows through here and gets
// persisted via the existing auditService (batch + offline-safe).
//
// Wire-up:
//   import { bindAuditListener } from '@/core/events/listeners/auditListener';
//   bindAuditListener();   // call once at app boot
// =============================================================
import { on, onAny, emit } from '../eventBus';
import { EVENTS }          from '../eventTypes';
import { logActivity }     from '@modules/audit/services/auditService';
import {
  ACTION_TYPE,
  ENTITY_TYPE,
  SEVERITY,
}                          from '@modules/audit/types/audit.types';

const safe = (fn) => async (...args) => {
  try { await fn(...args); }
  catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[auditListener]', err?.message || err);
  }
};

// Map bus events → audit (actionType, entityType, label-builder)
const AUDIT_MAP = {
  [EVENTS.TASK_ASSIGNED]: {
    actionType: ACTION_TYPE.TASK_ASSIGNED,
    entityType: ENTITY_TYPE.TASK,
    label:      (p) => p?.taskTitle || null,
  },
  [EVENTS.TASK_COMPLETED]: {
    actionType: ACTION_TYPE.TASK_STATUS_CHANGED,
    entityType: ENTITY_TYPE.TASK,
    label:      (p) => p?.taskTitle || null,
  },
  [EVENTS.TASK_OVERDUE]: {
    actionType: ACTION_TYPE.TASK_PROGRESS,
    entityType: ENTITY_TYPE.TASK,
    label:      (p) => p?.taskTitle || null,
    severity:   SEVERITY.WARNING,
  },
  [EVENTS.TASK_STATUS_CHANGED]: {
    actionType: ACTION_TYPE.TASK_STATUS_CHANGED,
    entityType: ENTITY_TYPE.TASK,
    label:      (p) => p?.taskTitle || null,
  },
  [EVENTS.TASK_COMMENTED]: {
    actionType: ACTION_TYPE.TASK_COMMENTED,
    entityType: ENTITY_TYPE.TASK,
    label:      (p) => p?.taskTitle || null,
  },
  [EVENTS.TASK_DELETED]: {
    actionType: ACTION_TYPE.TASK_DELETED,
    entityType: ENTITY_TYPE.TASK,
    label:      (p) => p?.taskTitle || null,
    severity:   SEVERITY.WARNING,
  },

  [EVENTS.USER_LOGGED_IN]: {
    actionType: ACTION_TYPE.LOGIN,
    entityType: ENTITY_TYPE.AUTH,
    label:      (p) => p?.userName || null,
  },
  [EVENTS.USER_LOGGED_OUT]: {
    actionType: ACTION_TYPE.LOGOUT,
    entityType: ENTITY_TYPE.AUTH,
    label:      (p) => p?.userName || null,
  },
  [EVENTS.USER_LOGIN_FAILED]: {
    actionType: ACTION_TYPE.LOGIN_FAILED,
    entityType: ENTITY_TYPE.AUTH,
    label:      (p) => p?.userName || null,
    severity:   SEVERITY.WARNING,
  },
  [EVENTS.USER_ROLE_CHANGED]: {
    actionType: ACTION_TYPE.ROLE_CHANGED,
    entityType: ENTITY_TYPE.ADMIN,
    label:      (p) => p?.targetUser || null,
    severity:   SEVERITY.CRITICAL,
  },

  [EVENTS.ATTENDANCE_CHECK_IN]: {
    actionType: ACTION_TYPE.CHECKED_IN,
    entityType: ENTITY_TYPE.ATTENDANCE,
    label:      (p) => p?.employeeName || null,
  },
  [EVENTS.ATTENDANCE_CHECK_OUT]: {
    actionType: ACTION_TYPE.CHECKED_OUT,
    entityType: ENTITY_TYPE.ATTENDANCE,
    label:      (p) => p?.employeeName || null,
  },
  [EVENTS.ATTENDANCE_LATE]: {
    actionType: ACTION_TYPE.CHECKED_IN,
    entityType: ENTITY_TYPE.ATTENDANCE,
    label:      (p) => p?.employeeName ? `تأخير: ${p.employeeName}` : null,
    severity:   SEVERITY.WARNING,
  },
  [EVENTS.ATTENDANCE_ABSENT]: {
    actionType: ACTION_TYPE.ABSENCE_MARKED,
    entityType: ENTITY_TYPE.ATTENDANCE,
    label:      (p) => p?.employeeName || null,
    severity:   SEVERITY.WARNING,
  },

  [EVENTS.PAYROLL_APPROVED]: {
    actionType: ACTION_TYPE.PAYROLL_EDITED,
    entityType: ENTITY_TYPE.ACCOUNTING,
    label:      (p) => p?.period ? `اعتماد كشف الرواتب — ${p.period}` : 'اعتماد كشف الرواتب',
    severity:   SEVERITY.WARNING,
  },
  [EVENTS.PAYROLL_EDITED]: {
    actionType: ACTION_TYPE.PAYROLL_EDITED,
    entityType: ENTITY_TYPE.ACCOUNTING,
    label:      (p) => p?.period || null,
    severity:   SEVERITY.WARNING,
  },
  [EVENTS.EXPENSE_ADDED]: {
    actionType: ACTION_TYPE.EXPENSE_ADDED,
    entityType: ENTITY_TYPE.ACCOUNTING,
    label:      (p) => p?.label || null,
  },
};

export function bindAuditListener() {
  const offs = [];

  // Direct bus → audit mapping
  for (const [eventName, cfg] of Object.entries(AUDIT_MAP)) {
    offs.push(on(eventName, safe(async (payload, envelope) => {
      await logActivity({
        actionType:  cfg.actionType,
        entityType:  cfg.entityType,
        entityId:    payload?.taskId
                     || payload?.employeeId
                     || payload?.payrollId
                     || payload?.userId
                     || null,
        entityLabel: typeof cfg.label === 'function' ? cfg.label(payload) : cfg.label,
        userId:      payload?.userId    || payload?.actorId || null,
        userName:    payload?.userName  || payload?.actorName || null,
        severity:    cfg.severity || envelope?.severity || null,
        metadata: {
          eventId:     envelope?.id,
          eventName:   envelope?.name,
          eventSource: envelope?.source,
          ...(payload || {}),
        },
      });
    })));
  }

  // Critical-event rebroadcast — anything emitted with severity=critical
  // bubbles back out as AUDIT_CRITICAL_EVENT so admins get notified.
  offs.push(onAny(async (envelope) => {
    if (envelope.name === EVENTS.AUDIT_CRITICAL_EVENT) return; // avoid loop
    if (envelope.severity !== 'critical') return;
    try {
      await emit(EVENTS.AUDIT_CRITICAL_EVENT, {
        auditLabel:  envelope.name,
        entityLabel: envelope.payload?.entityLabel || envelope.payload?.taskTitle || null,
        userName:    envelope.payload?.userName    || null,
        originalEvent: envelope.name,
        adminIds:    envelope.payload?.adminIds   || [],
      }, { source: 'audit', severity: 'critical' });
    } catch { /* noop */ }
  }));

  return () => offs.forEach((fn) => fn());
}

export default bindAuditListener;
