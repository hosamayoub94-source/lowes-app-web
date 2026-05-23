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

// ── Platform metadata ─────────────────────────────────────────
export const PLATFORM_META = {
  instagram: { label: 'Instagram', icon: '📸' },
  tiktok:    { label: 'TikTok',    icon: '🎵' },
  facebook:  { label: 'Facebook',  icon: '👥' },
  youtube:   { label: 'YouTube',   icon: '▶️' },
  snapchat:  { label: 'Snapchat',  icon: '👻' },
  other:     { label: 'أخرى',      icon: '🌐' },
};

// ── Task type metadata ────────────────────────────────────────
export const TASK_TYPE_META = {
  graphic_design:     { label: 'تصميم جرافيك',    icon: '🎨' },
  post_story_design:  { label: 'بوست / ستوري',    icon: '🖼️' },
  video_editing:      { label: 'مونتاج فيديو',    icon: '🎬' },
  content_writing:    { label: 'كتابة محتوى',     icon: '✍️' },
  photo_editing:      { label: 'تعديل صور',        icon: '📷' },
  content_scheduling: { label: 'جدولة محتوى',     icon: '📅' },
  performance_report: { label: 'تقرير أداء',       icon: '📊' },
  design_revision:    { label: 'تعديل تصميم',     icon: '✏️' },
  ad_campaign:        { label: 'حملة إعلانية',    icon: '📢' },
  page_management:    { label: 'إدارة صفحة',      icon: '📱' },
  other:              { label: 'أخرى',             icon: '📌' },
};

// ── Employee level system ─────────────────────────────────────
export const EMPLOYEE_LEVELS = [
  { min: 0,   max: 49,       label: 'مبتدئ',   icon: '🌱', tone: 'neutral' },
  { min: 50,  max: 149,      label: 'نجم',      icon: '⭐', tone: 'blue'   },
  { min: 150, max: 299,      label: 'محترف',    icon: '🔥', tone: 'amber'  },
  { min: 300, max: 499,      label: 'خبير',     icon: '💎', tone: 'teal'   },
  { min: 500, max: Infinity, label: 'أسطورة',   icon: '🏆', tone: 'green'  },
];

export function getEmployeeLevel(points = 0) {
  return EMPLOYEE_LEVELS.find((l) => points >= l.min && points <= l.max) || EMPLOYEE_LEVELS[0];
}

/** Preview how many points a task would earn if completed now. */
export function calcTaskPointsPreview(task) {
  if (!task) return 15;
  const base = (() => {
    if (!task.due_date) return 15;
    const due = new Date(task.due_date + 'T23:59:59');
    const hoursLeft = (due - new Date()) / 3_600_000;
    if (hoursLeft >= 24) return 20;
    if (hoursLeft >= 0)  return 15;
    return 5;
  })();
  const bonus = { urgent: 5, high: 3, medium: 1, low: 0 };
  return base + (bonus[task.priority] || 0);
}
