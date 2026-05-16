// =============================================================
// Audit Module — all type constants, metadata maps, severity logic.
// Single source of truth — NO label/color decisions in components.
// =============================================================

// ── Severity ──────────────────────────────────────────────────
export const SEVERITY = {
  INFO:     'info',
  WARNING:  'warning',
  CRITICAL: 'critical',
};

export const SEVERITY_META = {
  info:     { label: 'معلومات',  tone: 'blue',   icon: 'ℹ',  weight: 1, bgClass: 'bg-blue-bg   text-blue-fg',   dotClass: 'bg-blue'   },
  warning:  { label: 'تحذير',    tone: 'amber',  icon: '⚠',  weight: 2, bgClass: 'bg-amber-bg  text-amber-fg',  dotClass: 'bg-amber'  },
  critical: { label: 'حرج',      tone: 'red',    icon: '🔴', weight: 3, bgClass: 'bg-red-bg    text-red-fg',    dotClass: 'bg-red'    },
};

// ── Entity types ──────────────────────────────────────────────
export const ENTITY_TYPE = {
  AUTH:       'auth',
  TASK:       'task',
  ATTENDANCE: 'attendance',
  ACCOUNTING: 'accounting',
  PROFILE:    'profile',
  ADMIN:      'admin',
  SYSTEM:     'system',
};

export const ENTITY_META = {
  auth:       { label: 'المصادقة',    icon: '🔐' },
  task:       { label: 'المهام',       icon: '📋' },
  attendance: { label: 'الحضور',       icon: '📅' },
  accounting: { label: 'المحاسبة',    icon: '💰' },
  profile:    { label: 'الملف الشخصي', icon: '👤' },
  admin:      { label: 'الإدارة',      icon: '⚙️'  },
  system:     { label: 'النظام',       icon: '🖥️'  },
};

// ── Action types ──────────────────────────────────────────────
export const ACTION_TYPE = {
  // Auth
  LOGIN:               'login',
  LOGOUT:              'logout',
  LOGIN_FAILED:        'login_failed',
  PASSWORD_CHANGED:    'password_changed',
  SESSION_EXPIRED:     'session_expired',
  // Tasks
  TASK_CREATED:        'task_created',
  TASK_UPDATED:        'task_updated',
  TASK_STATUS_CHANGED: 'task_status_changed',
  TASK_DELETED:        'task_deleted',
  TASK_ASSIGNED:       'task_assigned',
  TASK_COMMENTED:      'task_commented',
  TASK_PROGRESS:       'task_progress',
  // Attendance
  CHECKED_IN:          'checked_in',
  CHECKED_OUT:         'checked_out',
  ABSENCE_MARKED:      'absence_marked',
  VACATION_APPROVED:   'vacation_approved',
  // Accounting
  PAYROLL_EDITED:      'payroll_edited',
  EXPENSE_ADDED:       'expense_added',
  REPORT_EXPORTED:     'report_exported',
  // Admin / Profile
  ROLE_CHANGED:        'role_changed',
  USER_CREATED:        'user_created',
  USER_DEACTIVATED:    'user_deactivated',
  SETTINGS_CHANGED:    'settings_changed',
  DATA_EXPORTED:       'data_exported',
  // System
  SYSTEM_BOOT:         'system_boot',
  BULK_OPERATION:      'bulk_operation',
};

/** Arabic labels for each action type */
export const ACTION_LABELS = {
  login:               'تسجيل دخول',
  logout:              'تسجيل خروج',
  login_failed:        'محاولة دخول فاشلة',
  password_changed:    'تغيير كلمة المرور',
  session_expired:     'انتهت الجلسة',
  task_created:        'إنشاء مهمة',
  task_updated:        'تحديث مهمة',
  task_status_changed: 'تغيير حالة مهمة',
  task_deleted:        'حذف مهمة',
  task_assigned:       'تعيين مهمة',
  task_commented:      'تعليق على مهمة',
  task_progress:       'تحديث تقدم مهمة',
  checked_in:          'تسجيل حضور',
  checked_out:         'تسجيل انصراف',
  absence_marked:      'تسجيل غياب',
  vacation_approved:   'اعتماد إجازة',
  payroll_edited:      'تعديل كشف رواتب',
  expense_added:       'إضافة مصروف',
  report_exported:     'تصدير تقرير',
  role_changed:        'تغيير صلاحية',
  user_created:        'إنشاء مستخدم',
  user_deactivated:    'تعطيل مستخدم',
  settings_changed:    'تغيير إعدادات',
  data_exported:       'تصدير بيانات',
  system_boot:         'بدء تشغيل النظام',
  bulk_operation:      'عملية مجمّعة',
};

/** Default severity per action type */
export const ACTION_SEVERITY = {
  login:               SEVERITY.INFO,
  logout:              SEVERITY.INFO,
  login_failed:        SEVERITY.WARNING,
  password_changed:    SEVERITY.WARNING,
  session_expired:     SEVERITY.INFO,
  task_created:        SEVERITY.INFO,
  task_updated:        SEVERITY.INFO,
  task_status_changed: SEVERITY.INFO,
  task_deleted:        SEVERITY.WARNING,
  task_assigned:       SEVERITY.INFO,
  task_commented:      SEVERITY.INFO,
  task_progress:       SEVERITY.INFO,
  checked_in:          SEVERITY.INFO,
  checked_out:         SEVERITY.INFO,
  absence_marked:      SEVERITY.INFO,
  vacation_approved:   SEVERITY.INFO,
  payroll_edited:      SEVERITY.WARNING,
  expense_added:       SEVERITY.INFO,
  report_exported:     SEVERITY.WARNING,
  role_changed:        SEVERITY.CRITICAL,
  user_created:        SEVERITY.WARNING,
  user_deactivated:    SEVERITY.CRITICAL,
  settings_changed:    SEVERITY.WARNING,
  data_exported:       SEVERITY.CRITICAL,
  system_boot:         SEVERITY.INFO,
  bulk_operation:      SEVERITY.WARNING,
};

/** Returns the appropriate severity for an action.
 *  Callers can override (e.g. multiple consecutive login_failed → critical). */
export function resolveSeverity(actionType, overrides = {}) {
  return overrides[actionType] ?? ACTION_SEVERITY[actionType] ?? SEVERITY.INFO;
}

// ── Filter options ────────────────────────────────────────────
export const SEVERITY_OPTIONS = Object.entries(SEVERITY_META).map(([v, m]) => ({
  value: v, label: `${m.icon} ${m.label}`,
}));

export const ENTITY_OPTIONS = Object.entries(ENTITY_META).map(([v, m]) => ({
  value: v, label: `${m.icon} ${m.label}`,
}));
