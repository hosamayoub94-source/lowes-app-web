// =============================================================
// Automation Engine — Types, Constants, Configuration
// Single source of truth. Zero imports — constants only.
// =============================================================

// ── Rule States ───────────────────────────────────────────────
export const RULE_STATE = Object.freeze({
  ACTIVE:   'active',
  PAUSED:   'paused',
  DISABLED: 'disabled',
});

// ── Trigger Types (map to Event Bus EVENTS) ───────────────────
export const TRIGGER_TYPE = Object.freeze({
  TASK_ASSIGNED:        'TASK_ASSIGNED',
  TASK_COMPLETED:       'TASK_COMPLETED',
  TASK_OVERDUE:         'TASK_OVERDUE',
  TASK_STATUS_CHANGED:  'TASK_STATUS_CHANGED',
  USER_LOGGED_IN:       'USER_LOGGED_IN',
  USER_LOGGED_OUT:      'USER_LOGGED_OUT',
  ATTENDANCE_LATE:      'ATTENDANCE_LATE',
  ATTENDANCE_ABSENT:    'ATTENDANCE_ABSENT',
  PAYROLL_APPROVED:     'PAYROLL_APPROVED',
  AUDIT_CRITICAL_EVENT: 'AUDIT_CRITICAL_EVENT',
  NOTIFICATION_CREATED: 'NOTIFICATION_CREATED',
  SYSTEM_ERROR:         'SYSTEM_ERROR',
});

// ── Condition Types ───────────────────────────────────────────
export const CONDITION_TYPE = Object.freeze({
  // Value comparisons (field path in payload)
  EQUALS:          'equals',
  NOT_EQUALS:      'not_equals',
  GREATER_THAN:    'greater_than',
  LESS_THAN:       'less_than',
  GREATER_OR_EQ:   'greater_or_eq',
  LESS_OR_EQ:      'less_or_eq',
  CONTAINS:        'contains',
  NOT_CONTAINS:    'not_contains',
  STARTS_WITH:     'starts_with',
  ENDS_WITH:       'ends_with',
  IS_EMPTY:        'is_empty',
  IS_NOT_EMPTY:    'is_not_empty',
  IN_LIST:         'in_list',
  NOT_IN_LIST:     'not_in_list',

  // Context / Role checks
  ROLE_IS:         'role_is',
  ROLE_IS_NOT:     'role_is_not',

  // Time-based
  TIME_BETWEEN:    'time_between',   // { startHour: 9, endHour: 17 }
  DAY_OF_WEEK:     'day_of_week',    // { days: [1,2,3,4,5] } (0=Sun)
  IS_WEEKEND:      'is_weekend',
  IS_WEEKDAY:      'is_weekday',

  // Always true / false (useful for unconditional rules)
  ALWAYS:          'always',
  NEVER:           'never',
});

// ── Condition Operator ────────────────────────────────────────
export const CONDITION_OPERATOR = Object.freeze({
  AND: 'AND',
  OR:  'OR',
});

// ── Action Types ──────────────────────────────────────────────
export const ACTION_TYPE = Object.freeze({
  SEND_NOTIFICATION: 'SEND_NOTIFICATION',
  SEND_REMINDER:     'SEND_REMINDER',
  CREATE_AUDIT_LOG:  'CREATE_AUDIT_LOG',
  ENQUEUE_JOB:       'ENQUEUE_JOB',
  ESCALATE_TASK:     'ESCALATE_TASK',
  TRIGGER_WEBHOOK:   'TRIGGER_WEBHOOK',
  EMIT_EVENT:        'EMIT_EVENT',     // emit any event bus event
  LOG_CONSOLE:       'LOG_CONSOLE',   // dev/debug action
});

// ── Execution Status ──────────────────────────────────────────
export const EXEC_STATUS = Object.freeze({
  SUCCESS:  'success',
  PARTIAL:  'partial',    // some actions failed
  FAILED:   'failed',     // all actions failed
  SKIPPED:  'skipped',    // conditions not met
  DEBOUNCED:'debounced',  // skipped due to debounce
  ERROR:    'error',      // engine-level error
});

// ── Per-action defaults ───────────────────────────────────────
export const ACTION_CONFIG = {
  [ACTION_TYPE.SEND_NOTIFICATION]: { timeoutMs: 10_000, maxRetries: 2 },
  [ACTION_TYPE.SEND_REMINDER]:     { timeoutMs: 10_000, maxRetries: 2 },
  [ACTION_TYPE.CREATE_AUDIT_LOG]:  { timeoutMs: 5_000,  maxRetries: 1 },
  [ACTION_TYPE.ENQUEUE_JOB]:       { timeoutMs: 2_000,  maxRetries: 0 },
  [ACTION_TYPE.ESCALATE_TASK]:     { timeoutMs: 5_000,  maxRetries: 2 },
  [ACTION_TYPE.TRIGGER_WEBHOOK]:   { timeoutMs: 15_000, maxRetries: 3 },
  [ACTION_TYPE.EMIT_EVENT]:        { timeoutMs: 1_000,  maxRetries: 0 },
  [ACTION_TYPE.LOG_CONSOLE]:       { timeoutMs: 100,    maxRetries: 0 },
};

export const DEFAULT_ACTION_CONFIG = { timeoutMs: 10_000, maxRetries: 1 };

// ── Arabic Labels ─────────────────────────────────────────────
export const RULE_STATE_LABELS = {
  [RULE_STATE.ACTIVE]:   'نشط',
  [RULE_STATE.PAUSED]:   'متوقف',
  [RULE_STATE.DISABLED]: 'معطل',
};

export const TRIGGER_TYPE_LABELS = {
  [TRIGGER_TYPE.TASK_ASSIGNED]:        'تعيين مهمة',
  [TRIGGER_TYPE.TASK_COMPLETED]:       'إكمال مهمة',
  [TRIGGER_TYPE.TASK_OVERDUE]:         'مهمة متأخرة',
  [TRIGGER_TYPE.TASK_STATUS_CHANGED]:  'تغيير حالة مهمة',
  [TRIGGER_TYPE.USER_LOGGED_IN]:       'تسجيل دخول',
  [TRIGGER_TYPE.USER_LOGGED_OUT]:      'تسجيل خروج',
  [TRIGGER_TYPE.ATTENDANCE_LATE]:      'تأخر في الحضور',
  [TRIGGER_TYPE.ATTENDANCE_ABSENT]:    'غياب',
  [TRIGGER_TYPE.PAYROLL_APPROVED]:     'اعتماد الراتب',
  [TRIGGER_TYPE.AUDIT_CRITICAL_EVENT]: 'حدث حرج',
  [TRIGGER_TYPE.NOTIFICATION_CREATED]: 'إشعار جديد',
  [TRIGGER_TYPE.SYSTEM_ERROR]:         'خطأ في النظام',
};

export const ACTION_TYPE_LABELS = {
  [ACTION_TYPE.SEND_NOTIFICATION]: 'إرسال إشعار',
  [ACTION_TYPE.SEND_REMINDER]:     'إرسال تذكير',
  [ACTION_TYPE.CREATE_AUDIT_LOG]:  'تسجيل مراجعة',
  [ACTION_TYPE.ENQUEUE_JOB]:       'إضافة مهمة للطابور',
  [ACTION_TYPE.ESCALATE_TASK]:     'تصعيد المهمة',
  [ACTION_TYPE.TRIGGER_WEBHOOK]:   'تشغيل Webhook',
  [ACTION_TYPE.EMIT_EVENT]:        'إطلاق حدث',
  [ACTION_TYPE.LOG_CONSOLE]:       'طباعة في Console',
};

export const CONDITION_TYPE_LABELS = {
  [CONDITION_TYPE.EQUALS]:        'يساوي',
  [CONDITION_TYPE.NOT_EQUALS]:    'لا يساوي',
  [CONDITION_TYPE.GREATER_THAN]:  'أكبر من',
  [CONDITION_TYPE.LESS_THAN]:     'أصغر من',
  [CONDITION_TYPE.CONTAINS]:      'يحتوي على',
  [CONDITION_TYPE.IN_LIST]:       'ضمن القائمة',
  [CONDITION_TYPE.ROLE_IS]:       'الدور هو',
  [CONDITION_TYPE.TIME_BETWEEN]:  'الوقت بين',
  [CONDITION_TYPE.DAY_OF_WEEK]:   'يوم الأسبوع',
  [CONDITION_TYPE.ALWAYS]:        'دائماً',
  [CONDITION_TYPE.IS_WEEKEND]:    'عطلة نهاية الأسبوع',
  [CONDITION_TYPE.IS_WEEKDAY]:    'يوم عمل',
};

// ── Rule State Colors ──────────────────────────────────────────
export const RULE_STATE_COLORS = {
  [RULE_STATE.ACTIVE]:   '#22c55e',
  [RULE_STATE.PAUSED]:   '#f59e0b',
  [RULE_STATE.DISABLED]: '#6b7280',
};

export const EXEC_STATUS_COLORS = {
  [EXEC_STATUS.SUCCESS]:   '#22c55e',
  [EXEC_STATUS.PARTIAL]:   '#f59e0b',
  [EXEC_STATUS.FAILED]:    '#ef4444',
  [EXEC_STATUS.SKIPPED]:   '#64748b',
  [EXEC_STATUS.DEBOUNCED]: '#94a3b8',
  [EXEC_STATUS.ERROR]:     '#dc2626',
};
