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
    { widget_type: WIDGET_TYPE.STAT_CARD,     title: 'معدل الحضور',        config: { metric: KPI.ATTENDANCE_RATE },  position_x: 0, position_y: 0, width: 1, height: 1 },
    { widget_type: WIDGET_TYPE.STAT_CARD,     title: 'المهام المنجزة',      config: { metric: KPI.COMPLETED_TASKS },  position_x: 1, position_y: 0, width: 1, height: 1 },
    { widget_type: WIDGET_TYPE.STAT_CARD,     title: 'المهام المتأخرة',     config: { metric: KPI.OVERDUE_TASKS },    position_x: 2, position_y: 0, width: 1, height: 1 },
    { widget_type: WIDGET_TYPE.STAT_CARD,     title: 'المستخدمون النشطون',  config: { metric: KPI.ACTIVE_USERS },     position_x: 3, position_y: 0, width: 1, height: 1 },
    { widget_type: WIDGET_TYPE.TREND_CHART,   title: 'اتجاه معدل الحضور',   config: { metric: KPI.ATTENDANCE_RATE },  position_x: 0, position_y: 1, width: 2, height: 2 },
    { widget_type: WIDGET_TYPE.BAR_CHART,     title: 'المهام المنجزة يومياً', config: { metric: KPI.COMPLETED_TASKS },  position_x: 2, position_y: 1, width: 2, height: 2 },
    { widget_type: WIDGET_TYPE.ACTIVITY_FEED, title: 'آخر النشاطات',        config: { limit: 8 },                     position_x: 0, position_y: 3, width: 4, height: 2 },
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

/**
 * Resolve a DATE_RANGE_PRESET to { from, to } as LOCAL calendar days ('YYYY-MM-DD').
 * Never uses toISOString(): it converts to UTC and shifts the day/month
 * for any timezone ahead of UTC (e.g. 1st of month 00:30 in Dubai → previous month).
 */
export function resolveDateRange(preset, custom = {}, now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

  switch (preset) {
    case DATE_RANGE_PRESET.TODAY:
      return { from: iso(now), to: iso(now) };
    case DATE_RANGE_PRESET.YESTERDAY:
      return { from: iso(addDays(now, -1)), to: iso(addDays(now, -1)) };
    case DATE_RANGE_PRESET.LAST_7_DAYS:
      return { from: iso(addDays(now, -6)), to: iso(now) };
    case DATE_RANGE_PRESET.LAST_30_DAYS:
      return { from: iso(addDays(now, -29)), to: iso(now) };
    case DATE_RANGE_PRESET.THIS_MONTH:
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
    case DATE_RANGE_PRESET.LAST_MONTH:
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to:   iso(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case DATE_RANGE_PRESET.THIS_QUARTER: {
      const q = Math.floor(now.getMonth() / 3);
      return { from: iso(new Date(now.getFullYear(), q * 3, 1)), to: iso(now) };
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

/** Evaluate KPI status: 'good' | 'warn' | 'critical' | 'unknown' (no value) */
export function getKPIStatus(metric, value) {
  const thresh = KPI_THRESHOLDS[metric];
  if (value === null || value === undefined) return 'unknown';
  if (!thresh) return 'good';
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
  unknown:  '#64748b',
  good:     '#22c55e',
  warn:     '#f59e0b',
  critical: '#ef4444',
};

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

// ── Report tabs (one hub page, tabs instead of extra menu items) ──
export const ANALYTICS_TAB = Object.freeze({
  EXECUTIVE:    'executive',
  ATTENDANCE:   'attendance',
  PRODUCTIVITY: 'productivity',
  TEAM:         'team',
  SYSTEM:       'system',
});

export const ANALYTICS_TABS = [
  { id: ANALYTICS_TAB.EXECUTIVE,    dashboard: DASHBOARD_ID.EXECUTIVE,    label: 'ملخص تنفيذي',        icon: '📊', hint: 'صورة سريعة للإدارة: الحضور والمهام والتنبيهات.' },
  { id: ANALYTICS_TAB.ATTENDANCE,   dashboard: DASHBOARD_ID.ATTENDANCE,   label: 'الحضور',              icon: '🕘', hint: 'معدل الحضور والتأخير والغياب وساعات العمل.' },
  { id: ANALYTICS_TAB.PRODUCTIVITY, dashboard: DASHBOARD_ID.PRODUCTIVITY, label: 'المهام والإنتاجية',   icon: '✅', hint: 'المهام المنجزة والمتأخرة ومعدل الإنجاز.' },
  { id: ANALYTICS_TAB.TEAM,         dashboard: DASHBOARD_ID.TEAM,         label: 'أداء الفريق',         icon: '👥', hint: 'جدول لكل موظف: حضور، تأخير، ساعات، مهام.' },
  { id: ANALYTICS_TAB.SYSTEM,       dashboard: DASHBOARD_ID.SYSTEM,       label: 'صحة النظام',          icon: '🩺', hint: 'حالة قائمة العمليات على هذا الجهاز (للمدير العام فقط).', adminOnly: true },
];

/** Where clicking a KPI card leads: another tab or an existing screen. */
export const KPI_DRILLDOWN = {
  [KPI.ATTENDANCE_RATE]:       { tab: ANALYTICS_TAB.ATTENDANCE },
  [KPI.LATE_EMPLOYEES]:        { tab: ANALYTICS_TAB.ATTENDANCE },
  [KPI.ABSENT_EMPLOYEES]:      { tab: ANALYTICS_TAB.ATTENDANCE },
  [KPI.WORKED_HOURS_TOTAL]:    { tab: ANALYTICS_TAB.ATTENDANCE },
  [KPI.ACTIVE_USERS]:          { tab: ANALYTICS_TAB.TEAM },
  [KPI.COMPLETED_TASKS]:       { tab: ANALYTICS_TAB.PRODUCTIVITY },
  [KPI.TASK_COMPLETION_RATE]:  { tab: ANALYTICS_TAB.PRODUCTIVITY },
  [KPI.PRODUCTIVITY_SCORE]:    { tab: ANALYTICS_TAB.PRODUCTIVITY },
  [KPI.OVERDUE_TASKS]:         { path: '/tasks-report' },
  [KPI.QUEUE_JOB_SUCCESS_RATE]:{ tab: ANALYTICS_TAB.SYSTEM },
  [KPI.SYSTEM_ERROR_COUNT]:    { tab: ANALYTICS_TAB.SYSTEM },
};

/** KPIs where a LOWER value is the good direction (trend colouring). */
export const LOWER_IS_BETTER_KPIS = Object.freeze([
  KPI.LATE_EMPLOYEES, KPI.ABSENT_EMPLOYEES, KPI.OVERDUE_TASKS, KPI.SYSTEM_ERROR_COUNT, KPI.AVG_RESPONSE_TIME_MS,
]);

/**
 * What each tab shows. `kpis` = cards (also the rows of the KPI export);
 * `series` = charts that need a daily series.
 */
export const DASHBOARD_METRICS = {
  [DASHBOARD_ID.EXECUTIVE]: {
    name: 'ملخص تنفيذي',
    kpis: [KPI.ATTENDANCE_RATE, KPI.PRODUCTIVITY_SCORE, KPI.COMPLETED_TASKS, KPI.OVERDUE_TASKS, KPI.ACTIVE_USERS, KPI.TASK_COMPLETION_RATE, KPI.LATE_EMPLOYEES],
    series: [KPI.ATTENDANCE_RATE, KPI.COMPLETED_TASKS],
  },
  [DASHBOARD_ID.ATTENDANCE]: {
    name: 'تقرير الحضور',
    kpis: [KPI.ATTENDANCE_RATE, KPI.LATE_EMPLOYEES, KPI.ABSENT_EMPLOYEES, KPI.WORKED_HOURS_TOTAL, KPI.OVERTIME_HOURS_TOTAL],
    series: [KPI.ATTENDANCE_RATE, KPI.LATE_EMPLOYEES],
  },
  [DASHBOARD_ID.PRODUCTIVITY]: {
    name: 'تقرير المهام والإنتاجية',
    kpis: [KPI.PRODUCTIVITY_SCORE, KPI.COMPLETED_TASKS, KPI.OVERDUE_TASKS, KPI.TASK_COMPLETION_RATE],
    series: [KPI.COMPLETED_TASKS, KPI.PRODUCTIVITY_SCORE],
  },
  [DASHBOARD_ID.TEAM]: {
    name: 'تقرير أداء الفريق',
    kpis: [KPI.ACTIVE_USERS, KPI.ATTENDANCE_RATE, KPI.TASK_COMPLETION_RATE, KPI.NOTIFICATION_ENGAGEMENT, KPI.FILES_UPLOADED],
    series: [KPI.ACTIVE_USERS],
  },
  [DASHBOARD_ID.SYSTEM]: {
    name: 'تقرير صحة النظام',
    kpis: [KPI.QUEUE_JOB_SUCCESS_RATE, KPI.SYSTEM_ERROR_COUNT, KPI.AVG_RESPONSE_TIME_MS, KPI.STORAGE_USED_BYTES],
    series: [KPI.QUEUE_JOB_SUCCESS_RATE, KPI.SYSTEM_ERROR_COUNT],
  },
};

/** Metrics that describe THIS device right now, not the selected period (no period comparison). */
export const DEVICE_KPIS = Object.freeze([KPI.QUEUE_JOB_SUCCESS_RATE, KPI.SYSTEM_ERROR_COUNT]);
