// =============================================================
// Notifications Module — all type constants + metadata maps.
// Single source of truth. Never put labels/colors in components.
// =============================================================

// ── Notification types ────────────────────────────────────────
export const NOTIFICATION_TYPE = {
  // Tasks
  TASK_ASSIGNED:      'task_assigned',
  TASK_OVERDUE:       'task_overdue',
  TASK_DUE_SOON:      'task_due_soon',
  TASK_COMPLETED:     'task_completed',
  TASK_COMMENTED:     'task_commented',
  TASK_STATUS_CHANGE: 'task_status_change',
  // Attendance
  ATTENDANCE_ALERT:   'attendance_alert',
  ABSENCE_ALERT:      'absence_alert',
  VACATION_APPROVED:  'vacation_approved',
  // Accounting / Payroll
  PAYROLL_ALERT:      'payroll_alert',
  EXPENSE_ALERT:      'expense_alert',
  // Security / Audit
  AUDIT_CRITICAL:     'audit_critical',
  LOGIN_FAILED_ALERT: 'login_failed_alert',
  ROLE_CHANGED:       'role_changed',
  // System
  SYSTEM_ALERT:       'system_alert',
  USER_MENTION:       'user_mention',
};

// ── Display metadata per type ─────────────────────────────────
export const TYPE_META = {
  task_assigned:       { icon: '📋', label: 'مهمة جديدة',         colorClass: 'text-blue-fg    bg-blue-bg'   },
  task_overdue:        { icon: '⏰', label: 'مهمة متأخرة',        colorClass: 'text-amber-fg   bg-amber-bg'  },
  task_due_soon:       { icon: '📅', label: 'موعد قريب',          colorClass: 'text-amber-fg   bg-amber-bg'  },
  task_completed:      { icon: '✅', label: 'مهمة مكتملة',        colorClass: 'text-teal       bg-teal/10'   },
  task_commented:      { icon: '💬', label: 'تعليق جديد',         colorClass: 'text-blue-fg    bg-blue-bg'   },
  task_status_change:  { icon: '🔄', label: 'تغيير حالة مهمة',    colorClass: 'text-blue-fg    bg-blue-bg'   },
  attendance_alert:    { icon: '📅', label: 'تنبيه حضور',         colorClass: 'text-amber-fg   bg-amber-bg'  },
  absence_alert:       { icon: '🚫', label: 'غياب',               colorClass: 'text-red-fg     bg-red-bg'    },
  vacation_approved:   { icon: '🏖️', label: 'إجازة معتمدة',       colorClass: 'text-teal       bg-teal/10'   },
  payroll_alert:       { icon: '💰', label: 'تنبيه رواتب',        colorClass: 'text-amber-fg   bg-amber-bg'  },
  expense_alert:       { icon: '🧾', label: 'تنبيه مصروفات',      colorClass: 'text-amber-fg   bg-amber-bg'  },
  audit_critical:      { icon: '🔴', label: 'حدث حرج',            colorClass: 'text-red-fg     bg-red-bg'    },
  login_failed_alert:  { icon: '🔐', label: 'محاولة دخول فاشلة',  colorClass: 'text-red-fg     bg-red-bg'    },
  role_changed:        { icon: '⚙️', label: 'تغيير صلاحية',       colorClass: 'text-red-fg     bg-red-bg'    },
  system_alert:        { icon: '🖥️', label: 'تنبيه النظام',       colorClass: 'text-text       bg-surface'   },
  user_mention:        { icon: '👤', label: 'تم ذكرك',            colorClass: 'text-blue-fg    bg-blue-bg'   },
};

// ── Severity ──────────────────────────────────────────────────
export const NOTIFICATION_SEVERITY = {
  INFO:     'info',
  WARNING:  'warning',
  CRITICAL: 'critical',
};

/** Default severity per notification type */
export const TYPE_SEVERITY = {
  task_assigned:       'info',
  task_overdue:        'warning',
  task_due_soon:       'warning',
  task_completed:      'info',
  task_commented:      'info',
  task_status_change:  'info',
  attendance_alert:    'warning',
  absence_alert:       'warning',
  vacation_approved:   'info',
  payroll_alert:       'warning',
  expense_alert:       'warning',
  audit_critical:      'critical',
  login_failed_alert:  'critical',
  role_changed:        'critical',
  system_alert:        'info',
  user_mention:        'info',
};

/** Returns the severity for a given type (with optional override). */
export function resolveNotifSeverity(type, override = null) {
  return override ?? TYPE_SEVERITY[type] ?? 'info';
}

/** Returns display meta for a type, with safe fallback. */
export function getTypeMeta(type) {
  return TYPE_META[type] ?? { icon: '🔔', label: type, colorClass: 'text-text bg-surface' };
}
