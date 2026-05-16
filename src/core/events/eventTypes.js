// =============================================================
// Core Events — typed event names + payload contracts.
//
// Single source of truth for every cross-module event name in the
// system. Modules import ONLY from here — never from each other —
// to prevent circular dependencies.
//
// Naming convention:
//   DOMAIN_VERB   →   tasks:assigned, audit:critical
//
// Payload contracts are documented inline (JSDoc) so the bus stays
// JS-only but consumers still get autocomplete + safety.
// =============================================================

// ── Event names ───────────────────────────────────────────────
// Use these constants — never raw strings — so renames stay safe.
export const EVENTS = Object.freeze({
  // Tasks
  TASK_ASSIGNED:        'tasks:assigned',
  TASK_COMPLETED:       'tasks:completed',
  TASK_OVERDUE:         'tasks:overdue',
  TASK_STATUS_CHANGED:  'tasks:status_changed',
  TASK_COMMENTED:       'tasks:commented',
  TASK_DELETED:         'tasks:deleted',

  // Auth / Session
  USER_LOGGED_IN:       'auth:logged_in',
  USER_LOGGED_OUT:      'auth:logged_out',
  USER_LOGIN_FAILED:    'auth:login_failed',
  USER_ROLE_CHANGED:    'auth:role_changed',

  // Attendance
  ATTENDANCE_LATE:      'attendance:late',
  ATTENDANCE_ABSENT:    'attendance:absent',
  ATTENDANCE_CHECK_IN:  'attendance:check_in',
  ATTENDANCE_CHECK_OUT: 'attendance:check_out',

  // Payroll / Accounting
  PAYROLL_APPROVED:     'payroll:approved',
  PAYROLL_EDITED:       'payroll:edited',
  EXPENSE_ADDED:        'expense:added',

  // Notifications
  NOTIFICATION_CREATED: 'notifications:created',
  NOTIFICATION_READ:    'notifications:read',

  // Audit
  AUDIT_CRITICAL_EVENT: 'audit:critical',
  AUDIT_LOG_CREATED:    'audit:log_created',

  // CRM & Sales Pipeline
  LEAD_CREATED:           'crm:lead_created',
  LEAD_UPDATED:           'crm:lead_updated',
  LEAD_CONVERTED:         'crm:lead_converted',
  LEAD_LOST:              'crm:lead_lost',
  DEAL_CREATED:           'crm:deal_created',
  DEAL_STAGE_CHANGED:     'crm:deal_stage_changed',
  DEAL_WON:               'crm:deal_won',
  DEAL_LOST:              'crm:deal_lost',
  CUSTOMER_CREATED:       'crm:customer_created',
  CUSTOMER_UPDATED:       'crm:customer_updated',
  FOLLOWUP_SCHEDULED:     'crm:followup_scheduled',
  FOLLOWUP_DUE:           'crm:followup_due',
  FOLLOWUP_OVERDUE:       'crm:followup_overdue',
  FOLLOWUP_COMPLETED:     'crm:followup_completed',
  CRM_AGENT_ASSIGNED:     'crm:agent_assigned',
  CRM_CONTACT_CREATED:    'crm:contact_created',
  CRM_DEAL_UPDATED:       'crm:deal_updated',

  // System-level
  SYSTEM_ERROR:         'system:error',
  SYSTEM_BOOT:          'system:boot',

  // Queue system
  QUEUE_JOB_ENQUEUED:      'queue:job_enqueued',
  QUEUE_JOB_COMPLETED:     'queue:job_completed',
  QUEUE_JOB_FAILED:        'queue:job_failed',
  QUEUE_JOB_DEAD_LETTERED: 'queue:job_dead_lettered',
  QUEUE_PAUSED:            'queue:paused',
  QUEUE_RESUMED:           'queue:resumed',

  // Automation engine
  AUTOMATION_RULE_FIRED:    'automation:rule_fired',
  AUTOMATION_RULE_FAILED:   'automation:rule_failed',
  AUTOMATION_RULE_SKIPPED:  'automation:rule_skipped',
  AUTOMATION_ENGINE_PAUSED: 'automation:engine_paused',

  // File & Media Management
  FILE_UPLOADED:            'files:uploaded',
  FILE_UPLOAD_FAILED:       'files:upload_failed',
  FILE_DELETED:             'files:deleted',
  FILE_TRASHED:             'files:trashed',
  FILE_RESTORED:            'files:restored',
  FILE_RENAMED:             'files:renamed',
  FILE_MOVED:               'files:moved',
  FILE_SHARED:              'files:shared',
  FILE_DOWNLOADED:          'files:downloaded',
  FILE_PREVIEWED:           'files:previewed',
  FOLDER_CREATED:           'files:folder_created',
  FOLDER_DELETED:           'files:folder_deleted',
  STORAGE_QUOTA_WARNING:    'files:storage_quota_warning',

  // Collaboration
  COMMENT_ADDED:            'collab:comment_added',
  COMMENT_REPLIED:          'collab:comment_replied',
  COMMENT_DELETED:          'collab:comment_deleted',
  MENTION_SENT:             'collab:mention_sent',
  CHANNEL_MESSAGE:          'collab:channel_message',
  CHANNEL_CREATED:          'collab:channel_created',
  THREAD_READ:              'collab:thread_read',
  PRESENCE_CHANGED:         'collab:presence_changed',
  ANNOUNCEMENT_POSTED:      'collab:announcement_posted',

  // Analytics & Executive Dashboard
  ANALYTICS_KPI_REFRESHED:  'analytics:kpi_refreshed',
  ANALYTICS_SNAPSHOT_SAVED: 'analytics:snapshot_saved',
  ANALYTICS_REPORT_EXPORTED:'analytics:report_exported',
  ANALYTICS_ALERT_TRIGGERED:'analytics:alert_triggered',
  ANALYTICS_WIDGET_SAVED:   'analytics:widget_saved',
  ANALYTICS_REPORT_CREATED: 'analytics:report_created',
});

// ── Module / source identifiers ───────────────────────────────
// `source` is required on every emit() — used by the dev monitor,
// audit trail, and future analytics pipelines.
export const EVENT_SOURCES = Object.freeze({
  TASKS:         'tasks',
  AUTH:          'auth',
  ATTENDANCE:    'attendance',
  PAYROLL:       'payroll',
  NOTIFICATIONS: 'notifications',
  AUDIT:         'audit',
  CRM:           'crm',
  FILES:         'files',
  ANALYTICS:     'analytics',
  COLLABORATION: 'collaboration',
  SYSTEM:        'system',
  UI:            'ui',
  UNKNOWN:       'unknown',
});

// ── Severity hint ─────────────────────────────────────────────
// Helps downstream listeners (notifications, audit) decide how to
// surface the event without re-deriving severity per module.
export const EVENT_SEVERITY = Object.freeze({
  INFO:     'info',
  WARNING:  'warning',
  CRITICAL: 'critical',
});

/**
 * Default severity per event name. Listeners can still override.
 * Keep this list small — only critical/warning events that the
 * audit + notification layers care about by default.
 */
export const EVENT_SEVERITY_MAP = Object.freeze({
  [EVENTS.TASK_OVERDUE]:            EVENT_SEVERITY.WARNING,
  [EVENTS.USER_LOGIN_FAILED]:       EVENT_SEVERITY.WARNING,
  [EVENTS.USER_ROLE_CHANGED]:       EVENT_SEVERITY.CRITICAL,
  [EVENTS.ATTENDANCE_LATE]:         EVENT_SEVERITY.WARNING,
  [EVENTS.ATTENDANCE_ABSENT]:       EVENT_SEVERITY.WARNING,
  [EVENTS.PAYROLL_APPROVED]:        EVENT_SEVERITY.WARNING,
  [EVENTS.AUDIT_CRITICAL_EVENT]:    EVENT_SEVERITY.CRITICAL,
  [EVENTS.SYSTEM_ERROR]:            EVENT_SEVERITY.CRITICAL,
  [EVENTS.FILE_UPLOAD_FAILED]:      EVENT_SEVERITY.WARNING,
  [EVENTS.FILE_DELETED]:            EVENT_SEVERITY.WARNING,
  [EVENTS.STORAGE_QUOTA_WARNING]:   EVENT_SEVERITY.WARNING,
  [EVENTS.ANALYTICS_ALERT_TRIGGERED]: EVENT_SEVERITY.WARNING,

  // CRM
  [EVENTS.DEAL_WON]:            EVENT_SEVERITY.INFO,
  [EVENTS.DEAL_LOST]:           EVENT_SEVERITY.WARNING,
  [EVENTS.FOLLOWUP_OVERDUE]:    EVENT_SEVERITY.WARNING,
  [EVENTS.FOLLOWUP_DUE]:        EVENT_SEVERITY.INFO,
});

/** Returns the default severity for an event (defaults to INFO). */
export function resolveEventSeverity(eventName) {
  return EVENT_SEVERITY_MAP[eventName] ?? EVENT_SEVERITY.INFO;
}

// ── Event groups (for bulk subscription) ──────────────────────
export const EVENT_GROUPS = Object.freeze({
  TASKS: [
    EVENTS.TASK_ASSIGNED,
    EVENTS.TASK_COMPLETED,
    EVENTS.TASK_OVERDUE,
    EVENTS.TASK_STATUS_CHANGED,
    EVENTS.TASK_COMMENTED,
    EVENTS.TASK_DELETED,
  ],
  AUTH: [
    EVENTS.USER_LOGGED_IN,
    EVENTS.USER_LOGGED_OUT,
    EVENTS.USER_LOGIN_FAILED,
    EVENTS.USER_ROLE_CHANGED,
  ],
  ATTENDANCE: [
    EVENTS.ATTENDANCE_LATE,
    EVENTS.ATTENDANCE_ABSENT,
    EVENTS.ATTENDANCE_CHECK_IN,
    EVENTS.ATTENDANCE_CHECK_OUT,
  ],
  PAYROLL: [
    EVENTS.PAYROLL_APPROVED,
    EVENTS.PAYROLL_EDITED,
    EVENTS.EXPENSE_ADDED,
  ],
  CRITICAL: [
    EVENTS.USER_ROLE_CHANGED,
    EVENTS.AUDIT_CRITICAL_EVENT,
    EVENTS.SYSTEM_ERROR,
  ],
  FILES: [
    EVENTS.FILE_UPLOADED,
    EVENTS.FILE_UPLOAD_FAILED,
    EVENTS.FILE_DELETED,
    EVENTS.FILE_TRASHED,
    EVENTS.FILE_RESTORED,
    EVENTS.FILE_RENAMED,
    EVENTS.FILE_MOVED,
    EVENTS.FILE_SHARED,
    EVENTS.FILE_DOWNLOADED,
    EVENTS.FOLDER_CREATED,
    EVENTS.FOLDER_DELETED,
    EVENTS.STORAGE_QUOTA_WARNING,
  ],
  ANALYTICS: [
    EVENTS.ANALYTICS_KPI_REFRESHED,
    EVENTS.ANALYTICS_SNAPSHOT_SAVED,
    EVENTS.ANALYTICS_REPORT_EXPORTED,
    EVENTS.ANALYTICS_ALERT_TRIGGERED,
    EVENTS.ANALYTICS_WIDGET_SAVED,
    EVENTS.ANALYTICS_REPORT_CREATED,
  ],
  CRM: [
    EVENTS.LEAD_CREATED,
    EVENTS.LEAD_UPDATED,
    EVENTS.LEAD_CONVERTED,
    EVENTS.LEAD_LOST,
    EVENTS.DEAL_CREATED,
    EVENTS.DEAL_STAGE_CHANGED,
    EVENTS.DEAL_WON,
    EVENTS.DEAL_LOST,
    EVENTS.CUSTOMER_CREATED,
    EVENTS.CUSTOMER_UPDATED,
    EVENTS.FOLLOWUP_SCHEDULED,
    EVENTS.FOLLOWUP_DUE,
    EVENTS.FOLLOWUP_OVERDUE,
    EVENTS.FOLLOWUP_COMPLETED,
    EVENTS.CRM_AGENT_ASSIGNED,
    EVENTS.CRM_CONTACT_CREATED,
    EVENTS.CRM_DEAL_UPDATED,
  ],
});

// ── Payload contracts (docs only — runtime is duck-typed) ─────
/**
 * @typedef {Object} TaskAssignedPayload
 * @property {string} taskId
 * @property {string} taskTitle
 * @property {string} assigneeId
 * @property {string} [assignerId]
 * @property {string} [assignerName]
 *
 * @typedef {Object} TaskCompletedPayload
 * @property {string} taskId
 * @property {string} taskTitle
 * @property {string} [completedBy]
 * @property {string[]} [managerIds]
 *
 * @typedef {Object} UserLoggedInPayload
 * @property {string} userId
 * @property {string} userName
 * @property {string} [role]
 *
 * @typedef {Object} AttendanceLatePayload
 * @property {string} employeeId
 * @property {string} employeeName
 * @property {number} lateByMinutes
 * @property {string[]} [managerIds]
 *
 * @typedef {Object} PayrollApprovedPayload
 * @property {string} payrollId
 * @property {string} approvedBy
 * @property {string} period
 * @property {string[]} [recipientIds]
 *
 * @typedef {Object} AuditCriticalPayload
 * @property {string} actionType
 * @property {string} entityType
 * @property {string} [entityId]
 * @property {string} [entityLabel]
 * @property {string} [userName]
 * @property {string[]} [adminIds]
 */
