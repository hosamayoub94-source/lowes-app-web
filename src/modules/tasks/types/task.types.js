// =============================================================
// Tasks Module — type constants, metadata maps, helpers.
// Single source of truth: all label/color/icon decisions live here,
// NOT scattered in UI components.
// =============================================================

// ── Status ────────────────────────────────────────────────────
export const TASK_STATUS = {
  PENDING:     'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED:   'completed',
  CANCELLED:   'cancelled',
  OVERDUE:     'overdue',
};

// ── Priority ──────────────────────────────────────────────────
export const TASK_PRIORITY = {
  LOW:    'low',
  MEDIUM: 'medium',
  HIGH:   'high',
  URGENT: 'urgent',
};

// ── Activity ──────────────────────────────────────────────────
export const ACTIVITY_TYPE = {
  CREATED:          'created',
  STATUS_CHANGED:   'status_changed',
  PROGRESS_UPDATED: 'progress_updated',
  COMMENT:          'comment',
  ASSIGNED:         'assigned',
};

// ── Status metadata — tone maps to Badge component tones ──────
/** @type {Record<string, { label: string, tone: string, icon: string }>} */
export const STATUS_META = {
  pending:     { label: 'قيد الانتظار', tone: 'neutral', icon: '⏳', colorClass: 'text-muted'    },
  in_progress: { label: 'قيد التنفيذ',  tone: 'blue',    icon: '🔄', colorClass: 'text-blue-fg'  },
  completed:   { label: 'مكتملة',        tone: 'green',   icon: '✅', colorClass: 'text-green-fg' },
  cancelled:   { label: 'ملغاة',         tone: 'neutral', icon: '⛔', colorClass: 'text-muted'    },
  overdue:     { label: 'متأخرة',        tone: 'red',     icon: '🔥', colorClass: 'text-red-fg'   },
};

// ── Priority metadata ─────────────────────────────────────────
/** @type {Record<string, { label: string, tone: string, icon: string, weight: number }>} */
export const PRIORITY_META = {
  low:    { label: 'منخفضة', tone: 'neutral', icon: '▽', weight: 1 },
  medium: { label: 'متوسطة', tone: 'blue',    icon: '△', weight: 2 },
  high:   { label: 'مرتفعة', tone: 'amber',   icon: '▲', weight: 3 },
  urgent: { label: 'عاجلة',  tone: 'red',     icon: '⚡', weight: 4 },
};

// ── Activity type metadata ────────────────────────────────────
export const ACTIVITY_META = {
  created:          { label: 'إنشاء',          icon: '✦',  colorClass: 'bg-teal/20 text-teal'       },
  status_changed:   { label: 'تغيير الحالة',   icon: '↻',  colorClass: 'bg-blue-bg text-blue-fg'   },
  progress_updated: { label: 'تحديث التقدم',   icon: '▶',  colorClass: 'bg-amber-bg text-amber-fg' },
  comment:          { label: 'تعليق',           icon: '💬', colorClass: 'bg-purple-bg text-purple-fg'},
  assigned:         { label: 'تعيين',           icon: '👤', colorClass: 'bg-green-bg text-green-fg' },
};

// ── Progress tone thresholds ──────────────────────────────────
/** Returns ProgressBar tone based on completion % */
export function progressTone(pct) {
  if (pct >= 100) return 'green';
  if (pct >= 60)  return 'teal';
  if (pct >= 30)  return 'amber';
  return 'red';
}

// ── Status options for select UI ─────────────────────────────
export const STATUS_OPTIONS = Object.entries(STATUS_META).map(([value, meta]) => ({
  value,
  label: `${meta.icon} ${meta.label}`,
}));

// ── Priority options for select UI ───────────────────────────
export const PRIORITY_OPTIONS = Object.entries(PRIORITY_META).map(([value, meta]) => ({
  value,
  label: `${meta.icon} ${meta.label}`,
}));
