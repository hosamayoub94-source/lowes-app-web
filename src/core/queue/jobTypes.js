// =============================================================
// Queue System — Job Types, States, Priorities, Configuration.
// Single source of truth. Zero imports — constants only.
// =============================================================

// ── Job Types ─────────────────────────────────────────────────
export const JOB_TYPE = Object.freeze({
  SEND_NOTIFICATION:  'send_notification',
  SEND_REMINDER:      'send_reminder',
  CLEANUP_LOGS:       'cleanup_logs',
  DAILY_SUMMARY:      'daily_summary',
  RETRY_FAILED_EVENT: 'retry_failed_event',
  SYNC_OFFLINE_DATA:  'sync_offline_data',
});

// ── Job States ────────────────────────────────────────────────
export const JOB_STATE = Object.freeze({
  PENDING:    'pending',
  PROCESSING: 'processing',
  COMPLETED:  'completed',
  FAILED:     'failed',
  CANCELLED:  'cancelled',
  RETRYING:   'retrying',
});

// ── Priority (lower = higher priority) ───────────────────────
export const JOB_PRIORITY = Object.freeze({
  CRITICAL: 0,
  HIGH:     1,
  NORMAL:   2,
  LOW:      3,
  IDLE:     4,
});

// ── Per-type defaults ─────────────────────────────────────────
export const JOB_CONFIG = {
  [JOB_TYPE.SEND_NOTIFICATION]: {
    priority:    JOB_PRIORITY.HIGH,
    maxRetries:  3,
    timeoutMs:   10_000,
    backoffBase: 1_000,
  },
  [JOB_TYPE.SEND_REMINDER]: {
    priority:    JOB_PRIORITY.NORMAL,
    maxRetries:  2,
    timeoutMs:   15_000,
    backoffBase: 2_000,
  },
  [JOB_TYPE.CLEANUP_LOGS]: {
    priority:    JOB_PRIORITY.IDLE,
    maxRetries:  1,
    timeoutMs:   30_000,
    backoffBase: 5_000,
  },
  [JOB_TYPE.DAILY_SUMMARY]: {
    priority:    JOB_PRIORITY.LOW,
    maxRetries:  2,
    timeoutMs:   60_000,
    backoffBase: 10_000,
  },
  [JOB_TYPE.RETRY_FAILED_EVENT]: {
    priority:    JOB_PRIORITY.HIGH,
    maxRetries:  5,
    timeoutMs:   10_000,
    backoffBase: 1_000,
  },
  [JOB_TYPE.SYNC_OFFLINE_DATA]: {
    priority:    JOB_PRIORITY.NORMAL,
    maxRetries:  3,
    timeoutMs:   20_000,
    backoffBase: 2_000,
  },
};

export const DEFAULT_JOB_CONFIG = {
  priority:    JOB_PRIORITY.NORMAL,
  maxRetries:  3,
  timeoutMs:   15_000,
  backoffBase: 1_000,
};

// ── Arabic labels ─────────────────────────────────────────────
export const JOB_TYPE_LABELS = {
  [JOB_TYPE.SEND_NOTIFICATION]:  'إرسال إشعار',
  [JOB_TYPE.SEND_REMINDER]:      'إرسال تذكير',
  [JOB_TYPE.CLEANUP_LOGS]:       'تنظيف السجلات',
  [JOB_TYPE.DAILY_SUMMARY]:      'ملخص يومي',
  [JOB_TYPE.RETRY_FAILED_EVENT]: 'إعادة محاولة حدث',
  [JOB_TYPE.SYNC_OFFLINE_DATA]:  'مزامنة البيانات',
};

export const JOB_STATE_LABELS = {
  [JOB_STATE.PENDING]:    'انتظار',
  [JOB_STATE.PROCESSING]: 'جاري',
  [JOB_STATE.COMPLETED]:  'مكتمل',
  [JOB_STATE.FAILED]:     'فاشل',
  [JOB_STATE.CANCELLED]:  'ملغى',
  [JOB_STATE.RETRYING]:   'إعادة محاولة',
};

export const JOB_PRIORITY_LABELS = {
  [JOB_PRIORITY.CRITICAL]: 'حرج',
  [JOB_PRIORITY.HIGH]:     'عالي',
  [JOB_PRIORITY.NORMAL]:   'عادي',
  [JOB_PRIORITY.LOW]:      'منخفض',
  [JOB_PRIORITY.IDLE]:     'خامل',
};

export const JOB_STATE_COLORS = {
  [JOB_STATE.PENDING]:    '#94a3b8',
  [JOB_STATE.PROCESSING]: '#0ea5e9',
  [JOB_STATE.COMPLETED]:  '#22c55e',
  [JOB_STATE.FAILED]:     '#ef4444',
  [JOB_STATE.CANCELLED]:  '#6b7280',
  [JOB_STATE.RETRYING]:   '#f59e0b',
};
