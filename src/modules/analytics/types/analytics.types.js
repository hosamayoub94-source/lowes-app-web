// =============================================================
// Analytics Module — Types, Constants, Configuration
// Single source of truth. Zero runtime imports.
// =============================================================

// ── Snapshot periods ──────────────────────────────────────────
export const SNAPSHOT_PERIOD = Object.freeze({
  HOURLY:  'hourly',
  DAILY:   'daily',
  WEEKLY:  'weekly',
  MONTHLY: 'monthly',
});

// ── Dashboard IDs ─────────────────────────────────────────────
export const DASHBOARD_ID = Object.freeze({
  EXECUTIVE:    'executive',
  TEAM:         'team',
  ATTENDANCE:   'attendance',
  PRODUCTIVITY: 'productivity',
  SYSTEM:       'system',
});

// ── Widget types ──────────────────────────────────────────────
export const WIDGET_TYPE = Object.freeze({
  STAT_CARD:      'stat_card',
  TREND_CHART:    'trend_chart',
  BAR_CHART:      'bar_chart',
  DONUT_CHART:    'donut_chart',
  ACTIVITY_FEED:  'activity_feed',
  HEATMAP:        'heatmap',
  PROGRESS:       'progress',
  KPI_ALERT:      'kpi_alert',
});

// ── Report types ──────────────────────────────────────────────
export const REPORT_TYPE = Object.freeze({
  ATTENDANCE:    'attendance',
  PRODUCTIVITY:  'productivity',
  TASKS:         'tasks',
  NOTIFICATIONS: 'notifications',
  FILES:         'files',
  SYSTEM:        'system',
  CUSTOM:        'custom',
});

// ── Export formats ────────────────────────────────────────────
export const EXPORT_FORMAT = Object.freeze({
  CSV:  'csv',
  XLSX: 'xlsx',
  PDF:  'pdf',
});

// ── Export status ─────────────────────────────────────────────
export const EXPORT_STATUS = Object.freeze({
  PENDING:    'pending',
  PROCESSING: 'processing',
  DONE:       'done',
  FAILED:     'failed',
});

// ── KPI metric keys ───────────────────────────────────────────
export const KPI = Object.freeze({
  ATTENDANCE_RATE:          'attendance_rate',
  LATE_EMPLOYEES:           'late_employees',
  ABSENT_EMPLOYEES:         'absent_employees',
  PRODUCTIVITY_SCORE:       'productivity_score',
  COMPLETED_TASKS:          'completed_tasks',
  OVERDUE_TASKS:            'overdue_tasks',
  TASK_COMPLETION_RATE:     'task_completion_rate',
  ACTIVE_USERS:             'active_users',
  AVG_RESPONSE_TIME_MS:     'avg_response_time_ms',
  NOTIFICATION_ENGAGEMENT:  'notification_engagement',
  FILES_UPLOADED:           'files_uploaded',
  STORAGE_USED_BYTES:       'storage_used_bytes',
  QUEUE_JOB_SUCCESS_RATE:   'queue_job_success_rate',
  SYSTEM_ERROR_COUNT:       'system_error_count',
  WORKED_HOURS_TOTAL:       'worked_hours_total',
  OVERTIME_HOURS_TOTAL:     'overtime_hours_total',
});

// ── KPI labels (Arabic) ───────────────────────────────────────
export const KPI_LABELS = {
  [KPI.ATTENDANCE_RATE]:         'معدل الحضور',
  [KPI.LATE_EMPLOYEES]:          'المتأخرون',
  [KPI.ABSENT_EMPLOYEES]:        'الغائبون',
  [KPI.PRODUCTIVITY_SCORE]:      'نقاط الإنتاجية',
  [KPI.COMPLETED_TASKS]:         'المهام المنجزة',
  [KPI.OVERDUE_TASKS]:           'المهام المتأخرة',
  [KPI.TASK_COMPLETION_RATE]:    'معدل إنجاز المهام',
  [KPI.ACTIVE_USERS]:            'المستخدمون النشطون',
  [KPI.AVG_RESPONSE_TIME_MS]:    'متوسط وقت الاستجابة',
  [KPI.NOTIFICATION_ENGAGEMENT]: 'تفاعل الإشعارات',
  [KPI.FILES_UPLOADED]:          'الملفات المرفوعة',
  [KPI.STORAGE_USED_BYTES]:      'التخزين المستخدم',
  [KPI.QUEUE_JOB_SUCCESS_RATE]:  'نجاح مهام الطابور',
  [KPI.SYSTEM_ERROR_COUNT]:      'أخطاء النظام',
  [KPI.WORKED_HOURS_TOTAL]:      'إجمالي ساعات العمل',
  [KPI.OVERTIME_HOURS_TOTAL]:    'ساعات العمل الإضافي',
};

// ── KPI units ─────────────────────────────────────────────────
export const KPI_UNIT = {
  [KPI.ATTENDANCE_RATE]:         '%',
  [KPI.LATE_EMPLOYEES]:          '',
  [KPI.ABSENT_EMPLOYEES]:        '',
  [KPI.PRODUCTIVITY_SCORE]:      'pts',
  [KPI.COMPLETED_TASKS]:         '',
  [KPI.OVERDUE_TASKS]:           '',
  [KPI.TASK_COMPLETION_RATE]:    '%',
  [KPI.ACTIVE_USERS]:            '',
  [KPI.AVG_RESPONSE_TIME_MS]:    'ms',
  [KPI.NOTIFICATION_ENGAGEMENT]: '%',
  [KPI.FILES_UPLOADED]:          '',
  [KPI.STORAGE_USED_BYTES]:      'bytes',
  [KPI.QUEUE_JOB_SUCCESS_RATE]:  '%',
  [KPI.SYSTEM_ERROR_COUNT]:      '',
  [KPI.WORKED_HOURS_TOTAL]:      'h',
  [KPI.OVERTIME_HOURS_TOTAL]:    'h',
};

// ── KPI thresholds (warn / critical) ─────────────────────────
// lower_is_better: true means low value = bad (e.g., attendance_rate)
export const KPI_THRESHOLDS = {
  [KPI.ATTENDANCE_RATE]:        { warn: 80, critical: 60, lower_is_better: false },
  [KPI.LATE_EMPLOYEES]:         { warn: 3,  critical: 8,  lower_is_better: true  },
  [KPI.TASK_COMPLETION_RATE]:   { warn: 70, critical: 50, lower_is_better: false },
  [KPI.PRODUCTIVITY_SCORE]:     { warn: 60, critical: 40, lower_is_better: false },
  [KPI.SYSTEM_ERROR_COUNT]:     { warn: 5,  critical: 20, lower_is_better: true  },
  [KPI.QUEUE_JOB_SUCCESS_RATE]: { warn: 90, critical: 70, lower_is_better: false },
};

// ── KPI colors ────────────────────────────────────────────────
export const KPI_COLORS = {
  [KPI.ATTENDANCE_RATE]:         '#22c55e',
  [KPI.LATE_EMPLOYEES]:          '#f59e0b',
  [KPI.ABSENT_EMPLOYEES]:        '#ef4444',
  [KPI.PRODUCTIVITY_SCORE]:      '#3b82f6',
  [KPI.COMPLETED_TASKS]:         '#22c55e',
  [KPI.OVERDUE_TASKS]:           '#ef4444',
  [KPI.TASK_COMPLETION_RATE]:    '#3b82f6',
  [KPI.ACTIVE_USERS]:            '#a855f7',
  [KPI.AVG_RESPONSE_TIME_MS]:    '#06b6d4',
  [KPI.NOTIFICATION_ENGAGEMENT]: '#f59e0b',
  [KPI.FILES_UPLOADED]:          '#ec4899',
  [KPI.STORAGE_USED_BYTES]:      '#94a3b8',
  [KPI.QUEUE_JOB_SUCCESS_RATE]:  '#22c55e',
  [KPI.SYSTEM_ERROR_COUNT]:      '#ef4444',
  [KPI.WORKED_HOURS_TOTAL]:      '#3b82f6',
  [KPI.OVERTIME_HOURS_TOTAL]:    '#f59e0b',
};

// ── Date range presets ────────────────────────────────────────
export const DATE_RANGE_PRESET = Object.freeze({
  TODAY:        'today',
  YESTERDAY:    'yesterday',
  LAST_7_DAYS:  'last_7_days',
  LAST_30_DAYS: 'last_30_days',
  THIS_MONTH:   'this_month',
  LAST_MONTH:   'last_month',
  THIS_QUARTER: 'this_quarter',
  CUSTOM:       'custom',
});

export const DATE_RANGE_LABELS = {
  [DATE_RANGE_PRESET.TODAY]:        'اليوم',
  [DATE_RANGE_PRESET.YESTERDAY]:    'أمس',
  [DATE_RANGE_PRESET.LAST_7_DAYS]:  'آخر 7 أيام',
  [DATE_RANGE_PRESET.LAST_30_DAYS]: 'آخر 30 يوماً',
  [DATE_RANGE_PRESET.THIS_MONTH]:   'هذا الشهر',
  [DATE_RANGE_PRESET.LAST_MONTH]:   'الشهر الماضي',
  [DATE_RANGE_PRESET.THIS_QUARTER]: 'هذا الربع',
  [DATE_RANGE_PRESET.CUSTOM]:       'مخصص',
};

// ── Dashboard preset layouts ─────────────────────────────────
// Default widget configs per dashboard (fallback for first load)
export const DEFAULT_WIDGETS = {
  [DASHBOARD_ID.EXECUTIVE]: [
    { widget_type: WIDGET_TYPE.STAT_CARD,     title: 'معدل الحضور',      config: { metric: KPI.ATTENDANCE_RATE },      position_x: 0, position_y: 0, width: 1, height: 1 },
    { widget_type: WIDGET_TYPE.STAT_CARD,     title: 'نقاط الإنتاجية',   config: { metric: KPI.PRODUCTIVITY_SCORE },   position_x: 1, position_y: 0, width: 1, height: 1 },
    { widget_type: WIDGET_TYPE.STAT_CARD,     title: 'المهام المنجزة',    config: { metric: KPI.COMPLETED_TASKS },      position_x: 2, position_y: 0, width: 1, height: 1 },
    { widget_type: WIDGET_TYPE.STAT_CARD,     title: 'المستخدمون النشطون', config: { metric: KPI.ACTIVE_USERS },        position_x: 3, position_y: 0, width: 1, height: 1 },
    { widget_type: WIDGET_TYPE.TREND_CHART,   title: 'اتجاه الحضور',     config: { metric: KPI.ATTENDANCE_RATE, period: 'weekly' }, position_x: 0, position_y: 1, width: 2, height: 2 },
    { widget_type: WIDGET_TYPE.BAR_CHART,     title: 'إنجاز المهام اليومي', config: { metric: KPI.COMPLETED_TASKS, period: 'daily' }, position_x: 2, position_y: 1, width: 2, height: 2 },
    { widget_type: WIDGET_TYPE.ACTIVITY_FEED, title: 'النشاط الأخير',    config: { limit: 8 },                         position_x: 0, position_y: 3, width: 2, height: 2 },
    { widget_type: WIDGET_TYPE.KPI_ALERT,     title: 'تنبيهات KPI',      config: {},                                   position_x: 2, position_y: 3, width: 2, height: 2 },
  ],
  [DASHBOARD_ID.ATTENDANCE]: [
    { widget_type: WIDGET_TYPE.STAT_CARD,   title: 'معدل الحضور',    config: { metric: KPI.ATTENDANCE_RATE },     position_x: 0, position_y: 0, width: 1, height: 1 },
    { widget_type: WIDGET_TYPE.STAT_CARD,   title: 'المتأخرون',      config: { metric: KPI.LATE_EMPLOYEES },      position_x: 1, position_y: 0, width: 1, height: 1 },
    { widget_type: WIDGET_TYPE.STAT_CARD,   title: 'الغائبون',       config: { metric: KPI.ABSENT_EMPLOYEES },    position_x: 2, position_y: 0, width: 1, height: 1 },
    { widget_type: WIDGET_TYPE.STAT_CARD,   title: 'ساعات العمل',    config: { metric: KPI.WORKED_HOURS_TOTAL },  position_x: 3, position_y: 0, width: 1, height: 1 },
    { widget_type: WIDGET_TYPE.TREND_CHART, title: 'اتجاه الحضور الأسبوعي', config: { metric: KPI.ATTENDANCE_RATE, period: 'daily' }, position_x: 0, position_y: 1, width: 4, height: 2 },
    { widget_type: WIDGET_TYPE.HEATMAP,     title: 'خريطة حرارة الحضور',   config: { metric: KPI.ATTENDANCE_RATE },       position_x: 0, position_y: 3, width: 4, height: 2 },
  ],
};

// ── Business constants ─────────────────────────────────────────
export const ANALYTICS_CACHE_TTL_MS  = 5 * 60_000;   // 5 minutes
export const SNAPSHOT_BATCH_SIZE      = 50;
export const MAX_ACTIVITY_FEED_ITEMS  = 100;
export const CHART_MAX_DATA_POINTS    = 90;           // max x-axis points
export const EXPORT_MAX_ROWS          = 50_000;
export const KPI_REFRESH_INTERVAL_MS  = 30_000;       // 30 s realtime refresh

// ── Mock data helpers ─────────────────────────────────────────

/** Generate a sequence of daily data points for a metric */
export function generateMockTimeSeries(metric, days = 30) {
  const now    = new Date();
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const base = _mockBase(metric);
    result.push({
      date:  d.toISOString().slice(0, 10),
      value: Math.max(0, base + (Math.random() - 0.4) * base * 0.2),
    });
  }
  return result;
}

function _mockBase(metric) {
  const bases = {
    [KPI.ATTENDANCE_RATE]:        85,
    [KPI.LATE_EMPLOYEES]:         4,
    [KPI.ABSENT_EMPLOYEES]:       2,
    [KPI.PRODUCTIVITY_SCORE]:     72,
    [KPI.COMPLETED_TASKS]:        18,
    [KPI.OVERDUE_TASKS]:          3,
    [KPI.TASK_COMPLETION_RATE]:   78,
    [KPI.ACTIVE_USERS]:           12,
    [KPI.NOTIFICATION_ENGAGEMENT]:65,
    [KPI.QUEUE_JOB_SUCCESS_RATE]: 96,
    [KPI.SYSTEM_ERROR_COUNT]:     1,
    [KPI.WORKED_HOURS_TOTAL]:     96,
    [KPI.OVERTIME_HOURS_TOTAL]:   8,
  };
  return bases[metric] ?? 50;
}

/** Resolve a DATE_RANGE_PRESET to { from, to } ISO strings */
export function resolveDateRange(preset, custom = {}) {
  const now  = new Date();
  const iso  = (d) => d.toISOString().slice(0, 10);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  switch (preset) {
    case DATE_RANGE_PRESET.TODAY:
      return { from: iso(now), to: iso(now) };
    case DATE_RANGE_PRESET.YESTERDAY:
      return { from: iso(addDays(now, -1)), to: iso(addDays(now, -1)) };
    case DATE_RANGE_PRESET.LAST_7_DAYS:
      return { from: iso(addDays(now, -6)), to: iso(now) };
    case DATE_RANGE_PRESET.LAST_30_DAYS:
      return { from: iso(addDays(now, -29)), to: iso(now) };
    case DATE_RANGE_PRESET.THIS_MONTH: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: iso(start), to: iso(now) };
    }
    case DATE_RANGE_PRESET.LAST_MONTH: {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end   = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: iso(start), to: iso(end) };
    }
    case DATE_RANGE_PRESET.THIS_QUARTER: {
      const q     = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      return { from: iso(start), to: iso(now) };
    }
    case DATE_RANGE_PRESET.CUSTOM:
      return { from: custom.from ?? iso(addDays(now, -29)), to: custom.to ?? iso(now) };
    default:
      return { from: iso(addDays(now, -29)), to: iso(now) };
  }
}

/** Format a KPI value for display */
export function formatKPI(metric, value) {
  if (value === null || value === undefined) return '—';
  const unit = KPI_UNIT[metric] ?? '';

  if (metric === KPI.STORAGE_USED_BYTES) {
    const gb = (value / 1e9).toFixed(1);
    return `${gb} GB`;
  }
  if (metric === KPI.AVG_RESPONSE_TIME_MS) {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
  }
  if (unit === '%') return `${Math.round(value)}%`;
  if (unit === 'h')  return `${(value).toFixed(1)}h`;
  return `${Math.round(value)}${unit ? ' ' + unit : ''}`;
}

/** Evaluate KPI status: 'good' | 'warn' | 'critical' */
export function getKPIStatus(metric, value) {
  const thresh = KPI_THRESHOLDS[metric];
  if (!thresh || value === null || value === undefined) return 'good';
  const { warn, critical, lower_is_better } = thresh;

  if (lower_is_better) {
    if (value >= critical) return 'critical';
    if (value >= warn)     return 'warn';
    return 'good';
  } else {
    if (value <= critical) return 'critical';
    if (value <= warn)     return 'warn';
    return 'good';
  }
}

export const KPI_STATUS_COLORS = {
  good:     '#22c55e',
  warn:     '#f59e0b',
  critical: '#ef4444',
};

// ── Mock activity feed ────────────────────────────────────────
export const MOCK_ACTIVITY = [
  { id: '1', type: 'check_in',       user: 'أحمد محمد',     message: 'سجّل حضوره',              time: new Date(Date.now() - 5  * 60_000).toISOString() },
  { id: '2', type: 'task_completed', user: 'سارة علي',      message: 'أنجزت مهمة: تقرير المبيعات', time: new Date(Date.now() - 12 * 60_000).toISOString() },
  { id: '3', type: 'file_upload',    user: 'محمد خالد',     message: 'رفع ملف: بيانات Q3.xlsx',  time: new Date(Date.now() - 22 * 60_000).toISOString() },
  { id: '4', type: 'check_late',     user: 'لينا حسن',      message: 'تأخرت 15 دقيقة',           time: new Date(Date.now() - 35 * 60_000).toISOString() },
  { id: '5', type: 'task_overdue',   user: 'النظام',        message: 'مهمة: مراجعة العقود — متأخرة', time: new Date(Date.now() - 60 * 60_000).toISOString() },
  { id: '6', type: 'check_out',      user: 'يوسف إبراهيم',  message: 'سجّل انصرافه (8.5 ساعة)',  time: new Date(Date.now() - 90 * 60_000).toISOString() },
  { id: '7', type: 'export',         user: 'المدير',        message: 'صدّر تقرير الحضور - PDF',   time: new Date(Date.now() - 120 * 60_000).toISOString() },
  { id: '8', type: 'check_in',       user: 'نورة السعد',    message: 'سجّلت حضورها',             time: new Date(Date.now() - 145 * 60_000).toISOString() },
];

export const ACTIVITY_ICONS = {
  check_in:       '✅',
  check_out:      '🚪',
  check_late:     '⏰',
  task_completed: '✓',
  task_overdue:   '❗',
  file_upload:    '📁',
  notification:   '🔔',
  export:         '📤',
  error:          '❌',
  default:        '•',
};
