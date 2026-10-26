// =============================================================
// Tasks — create-form → DB payload (pure, no aliases).
// Every new task needs an OWNER, an OUTCOME and a DUE DATE (ABOS: no
// orphan work). Fields that have no column yet (next_step) are only
// written when `v3` is on (migration applied).
// =============================================================
import { applyLinksToTags, isDecisionRef, normalizeDecisionRef, isProjectCode } from './taskLinks';
import { toDbStatus } from './taskWorkflow';

export const EMPTY_OPS_FORM = {
  title: '', outcome: '', owner: '', due_date: '', participants: [],
  team: '', project_id: '', project_code: '', decision_ref: '', kpi_key: '',
  priority: 'medium', next_step: '', link: '', is_sensitive: false,
};

const blank = (v) => !v || !String(v).trim();

export function validateNewTask(form) {
  const errors = {};
  if (blank(form.title)) errors.title = 'العنوان مطلوب';
  if (blank(form.outcome)) errors.outcome = 'اكتب النتيجة المطلوبة';
  if (blank(form.owner)) errors.owner = 'اختر مالكاً واحداً للمهمة';
  if (blank(form.due_date)) errors.due_date = 'حدّد الموعد';
  if (!blank(form.decision_ref) && !isDecisionRef(form.decision_ref)) errors.decision_ref = 'الصيغة D-123';
  if (!blank(form.project_code) && !isProjectCode(form.project_code)) errors.project_code = 'رمز مشروع غير صالح';
  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * @param {object} form  EMPTY_OPS_FORM shape
 * @param {{v3:boolean, creatorId?:string}} ctx
 */
export function toTaskPayload(form, ctx = {}) {
  const v3 = !!ctx.v3;
  const links = {
    project_code: form.project_code || null,
    decision_ref: blank(form.decision_ref) ? null : normalizeDecisionRef(form.decision_ref),
    kpi_key: form.kpi_key || null,
  };
  const base = {
    title: form.title.trim(),
    priority: form.priority || 'medium',
    due_date: form.due_date,
    status: toDbStatus('ready', v3),
    created_by: ctx.creatorId || null,
    assigned_to: form.owner,
    tagged_ids: (form.participants || []).filter((id) => id && id !== form.owner),
    team: form.team || null,
    project_id: form.project_id || null,
    link: blank(form.link) ? null : form.link.trim(),
    is_sensitive: !!form.is_sensitive,
  };
  if (v3) {
    return { ...base, status_changed_by: ctx.creatorId || null, description: null, outcome: form.outcome.trim(), next_step: blank(form.next_step) ? null : form.next_step.trim(), ...links, tags: [] };
  }
  // قبل الـmigration: النتيجة تُخزَّن في description، والروابط في tags.
  return { ...base, description: form.outcome.trim(), tags: applyLinksToTags([], links) };
}

/**
 * Extra columns saved together with a status change.
 * Pre-migration only columns that exist are used: evidence → completion_note,
 * and blocker / next_step / reviewer cannot be stored (statuses needing them
 * are not selectable before the migration anyway).
 */
export function toStatusExtra(status, vals = {}, v3 = false) {
  const t = (v) => (blank(v) ? null : String(v).trim());
  const extra = {};
  if (status === 'blocked') extra.blocker = t(vals.blocker);
  if (status === 'waiting_reply') extra.next_step = t(vals.next_step);
  if (status === 'review' || status === 'completed') {
    const ev = t(vals.evidence);
    if (ev) extra[v3 ? 'evidence' : 'completion_note'] = ev;
  }
  if (status === 'review' && v3 && vals.review_requested_by) extra.review_requested_by = vals.review_requested_by;
  if (!v3) {
    delete extra.blocker;
    delete extra.next_step;
  }
  return extra;
}
