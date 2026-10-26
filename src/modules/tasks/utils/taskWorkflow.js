// =============================================================
// Tasks — workflow model for the daily Ops Center (pure, no aliases).
//
// Status vocabulary (v3):
//   draft · ready · in_progress · waiting_reply · blocked · review ·
//   completed · archived · cancelled
// Legacy values still found in the DB and in old clients:
//   pending → ready · in_review → review · done → completed
//   (overdue is DERIVED from the due date, never a stored state.)
//
// Until the DB check constraint is widened (supabase/tasks_ops_center_v1.sql)
// only the legacy-safe subset may be WRITTEN — see toDbStatus().
// =============================================================
import { dueKey, daysOverdue, diffDays, instantKey, todayKey } from './taskDates';

export const STATUS = {
  DRAFT: 'draft',
  READY: 'ready',
  IN_PROGRESS: 'in_progress',
  WAITING_REPLY: 'waiting_reply',
  BLOCKED: 'blocked',
  REVIEW: 'review',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
  CANCELLED: 'cancelled',
};

const LEGACY_TO_V3 = { pending: 'ready', in_review: 'review', done: 'completed', overdue: 'ready', open: 'ready' };
const V3_VALUES = new Set(Object.values(STATUS));

/** Any stored/legacy status → v3 vocabulary (unknown → ready). */
export function normalizeStatus(raw) {
  if (!raw) return STATUS.READY;
  if (V3_VALUES.has(raw)) return raw;
  return LEGACY_TO_V3[raw] || STATUS.READY;
}

/**
 * v3 status → value that the CURRENT database accepts.
 * v3Enabled=false (migration not applied): ready→pending, review→in_review,
 * and states the DB cannot hold are refused (returns null).
 */
export function toDbStatus(status, v3Enabled = false) {
  const s = normalizeStatus(status);
  if (v3Enabled) return s;
  switch (s) {
    case STATUS.READY: return 'pending';
    case STATUS.REVIEW: return 'in_review';
    case STATUS.IN_PROGRESS:
    case STATUS.COMPLETED:
    case STATUS.CANCELLED: return s;
    default: return null; // draft / waiting_reply / blocked / archived need the migration
  }
}

export const STATUS_META_V3 = {
  draft:         { label: 'مسودة',        tone: 'neutral', icon: '📝' },
  ready:         { label: 'جاهزة',        tone: 'neutral', icon: '⏳' },
  in_progress:   { label: 'قيد التنفيذ',  tone: 'blue',    icon: '🔄' },
  waiting_reply: { label: 'بانتظار رد',   tone: 'amber',   icon: '💬' },
  blocked:       { label: 'عالقة',        tone: 'red',     icon: '⛔' },
  review:        { label: 'بانتظار مراجعة', tone: 'purple', icon: '👀' },
  completed:     { label: 'مكتملة',       tone: 'green',   icon: '✅' },
  archived:      { label: 'مؤرشفة',       tone: 'neutral', icon: '🗄️' },
  cancelled:     { label: 'ملغاة',        tone: 'neutral', icon: '🚫' },
};

/** Statuses the UI may offer for selection. */
export function selectableStatuses(v3Enabled = false) {
  const all = [STATUS.READY, STATUS.IN_PROGRESS, STATUS.WAITING_REPLY, STATUS.BLOCKED, STATUS.REVIEW, STATUS.COMPLETED, STATUS.CANCELLED];
  return all.filter((s) => toDbStatus(s, v3Enabled) !== null);
}

export const isClosed = (task) => ['completed', 'archived', 'cancelled'].includes(normalizeStatus(task?.status));
export const isDraft = (task) => normalizeStatus(task?.status) === STATUS.DRAFT;
/** Active = actionable work (not closed, not a draft). */
export const isActive = (task) => !!task && !isClosed(task) && !isDraft(task);

/** Derived: active and its due DAY is before today. Never mutates status. */
export function isOverdue(task, today = todayKey()) {
  if (!isActive(task)) return false;
  const k = dueKey(task.due_date);
  return !!k && k < today;
}

/** Owner profile id from a raw row or a mapped task. */
export function ownerId(task) {
  if (!task) return null;
  if (task.assignee_id) return task.assignee_id;
  const a = task.assigned_to;
  if (a && typeof a === 'object') return a.id || null;
  return a || null;
}

const PRIO_W = { urgent: 4, high: 3, medium: 2, low: 1 };
const STALE_DAYS = 3;

/**
 * Where does this task live on the "Today" page?
 * Precedence: closed > draft > blocked > waiting > overdue > today > inprogress > upcoming
 * (a blocked task that is also late stays in «blocked» — the reason matters
 * more than the date; the card still shows its overdue age).
 */
export function bucketFor(task, ctx = {}) {
  const today = ctx.today || todayKey();
  if (isClosed(task)) return 'closed';
  if (isDraft(task)) return 'draft';
  const st = normalizeStatus(task.status);
  if (st === STATUS.BLOCKED) return 'blocked';
  if (st === STATUS.WAITING_REPLY) return 'waiting';
  if (isOverdue(task, today)) return 'overdue';
  const k = dueKey(task.due_date);
  if (k && k === today) return 'today';
  if (st === STATUS.REVIEW && ctx.userId && task.review_requested_by === ctx.userId) return 'today';
  const touched = instantKey(task.status_changed_at || task.updated_at);
  if (touched && (st === STATUS.READY || st === STATUS.IN_PROGRESS) && diffDays(touched, today) >= STALE_DAYS) return 'today';
  if (st === STATUS.IN_PROGRESS) return 'inprogress';
  return 'upcoming';
}

/** Items that need the FOUNDER's decision/approval — never execution work. */
export function needsFounder(task, userId) {
  if (!isActive(task)) return false;
  const st = normalizeStatus(task.status);
  if (st === STATUS.REVIEW && task.review_requested_by === userId) return true;
  if (st === STATUS.BLOCKED) return true;
  return !!task.decision_ref;
}

export function compareForWork(today) {
  return (a, b) => {
    const od = daysOverdue(b.due_date, today) - daysOverdue(a.due_date, today);
    if (od) return od;
    const pw = (PRIO_W[b.priority] || 0) - (PRIO_W[a.priority] || 0);
    if (pw) return pw;
    const ka = dueKey(a.due_date), kb = dueKey(b.due_date);
    if (ka && kb) return ka < kb ? -1 : ka > kb ? 1 : 0;
    return ka ? -1 : kb ? 1 : 0;
  };
}

/**
 * Group tasks for the Today page.
 * ctx: { today, userId, founderMode }
 * founderMode keeps only decisions/approvals (see needsFounder).
 */
export function groupForToday(tasks, ctx = {}) {
  const today = ctx.today || todayKey();
  const out = { today: [], overdue: [], waiting: [], blocked: [], inprogress: [] };
  for (const t of tasks || []) {
    if (ctx.founderMode && !needsFounder(t, ctx.userId)) continue;
    const b = bucketFor(t, { today, userId: ctx.userId });
    if (out[b]) out[b].push(t);
  }
  const s = compareForWork(today);
  Object.values(out).forEach((list) => list.sort(s));
  return out;
}

const blank = (v) => !v || !String(v).trim();

/**
 * Transition guard. `patch` carries the fields being saved together with the
 * status (blocker, next_step, evidence, review_requested_by).
 * opts.requireEvidence=true → completing without evidence is an error
 * (new-flow tasks); otherwise it is only a warning (legacy tasks).
 * opts.reviewerOptional=true → no reviewer column exists yet (pre-migration).
 */
export function validateTransition(task, toStatus, patch = {}, opts = {}) {
  const to = normalizeStatus(toStatus);
  const merged = { ...task, ...patch };
  const errors = [];
  const warnings = [];
  if (to === STATUS.BLOCKED && blank(merged.blocker)) errors.push('اكتب سبب العائق');
  if (to === STATUS.WAITING_REPLY && blank(merged.next_step)) errors.push('حدّد ممّن تنتظر الرد (الخطوة التالية)');
  if (to === STATUS.REVIEW) {
    if (blank(merged.evidence) && blank(merged.completion_note)) errors.push('أرفق دليل الإنجاز قبل طلب المراجعة');
    if (!opts.reviewerOptional && !merged.review_requested_by) errors.push('اختر من سيراجع المهمة');
  }
  if (to === STATUS.COMPLETED && blank(merged.evidence) && blank(merged.completion_note)) {
    (opts.requireEvidence ? errors : warnings).push('لا يوجد دليل إنجاز موثّق');
  }
  return { ok: errors.length === 0, errors, warnings };
}
