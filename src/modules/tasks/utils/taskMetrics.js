// =============================================================
// Tasks — outcome metrics for the report (pure, no aliases).
// Raw completion % is kept but is SECONDARY: the headline numbers are
// on-time rate, overdue age, stuck/ownerless/undated work and closures
// backed by documented evidence.
// =============================================================
import { dueKey, instantKey, daysOverdue, ageBucket, AGE_BUCKETS, todayKey } from './taskDates';
import { isActive, isClosed, isOverdue, normalizeStatus, ownerId } from './taskWorkflow';

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const hasText = (v) => !!(v && String(v).trim());

/** Sensitive tasks are admin-only everywhere, including reports. */
export const visibleForReport = (tasks, isAdmin) => (tasks || []).filter((t) => isAdmin || !t.is_sensitive);

/** Completed task closed within its due DAY (local calendar). null → no due date. */
export function closedOnTime(task) {
  if (normalizeStatus(task.status) !== 'completed') return null;
  const due = dueKey(task.due_date);
  if (!due) return null;
  const done = instantKey(task.completed_at || task.updated_at);
  if (!done) return null;
  return done <= due;
}

export const hasEvidence = (task) => hasText(task.evidence) || hasText(task.completion_note);

function bump(map, key, init) {
  if (!map.has(key)) map.set(key, init());
  return map.get(key);
}

/**
 * @param {Array} tasks raw rows or mapped tasks
 * @param {{today?:string, projectName?:(id)=>string, ownerTeam?:(task)=>string}} opts
 */
export function computeMetrics(tasks, opts = {}) {
  const today = opts.today || todayKey();
  const list = tasks || [];
  const projectName = opts.projectName || ((id) => id || 'بلا مشروع');
  const teamOf = opts.ownerTeam || ((t) => t.team || 'بلا فريق');

  const m = {
    total: list.length,
    completed: 0,
    cancelled: 0,
    rawCompletionPct: 0,
    onTime: { done: 0, ofWhich: 0, pct: 0 }, // closed on time / completed that had a due date
    overdueTotal: 0,
    overdueByAge: Object.fromEntries(AGE_BUCKETS.map((b) => [b, 0])),
    blocked: 0,
    waiting: 0,
    noOwner: 0,
    noDue: 0,
    documentedClosed: 0,
    byProject: [],
    byTeam: [],
  };

  const proj = new Map();
  const team = new Map();
  const slice = () => ({ total: 0, completed: 0, overdue: 0, onTimeDone: 0, onTimeOf: 0 });

  for (const t of list) {
    const st = normalizeStatus(t.status);
    const p = bump(proj, projectName(t.project_id), slice);
    const tm = bump(team, teamOf(t), slice);
    p.total++; tm.total++;

    if (st === 'completed') {
      m.completed++; p.completed++; tm.completed++;
      if (hasEvidence(t)) m.documentedClosed++;
      const ot = closedOnTime(t);
      if (ot !== null) {
        m.onTime.ofWhich++; p.onTimeOf++; tm.onTimeOf++;
        if (ot) { m.onTime.done++; p.onTimeDone++; tm.onTimeDone++; }
      }
    } else if (st === 'cancelled') {
      m.cancelled++;
    }

    if (!isActive(t)) continue;
    if (st === 'blocked') m.blocked++;
    if (st === 'waiting_reply') m.waiting++;
    if (!ownerId(t)) m.noOwner++;
    if (!dueKey(t.due_date)) m.noDue++;
    if (isOverdue(t, today)) {
      m.overdueTotal++; p.overdue++; tm.overdue++;
      const b = ageBucket(daysOverdue(t.due_date, today));
      if (b) m.overdueByAge[b]++;
    }
  }

  // Cancelled work is excluded from the completion denominator: it was never meant to finish.
  m.rawCompletionPct = pct(m.completed, m.total - m.cancelled);
  m.onTime.pct = pct(m.onTime.done, m.onTime.ofWhich);

  const fin = (map) =>
    [...map.entries()]
      .map(([name, s]) => ({ name, ...s, onTimePct: pct(s.onTimeDone, s.onTimeOf) }))
      .sort((a, b) => b.total - a.total);
  m.byProject = fin(proj);
  m.byTeam = fin(team);
  return m;
}

/** Per-owner rows for the report table (late/blocked first — not "best %"). */
export function ownerRows(tasks, nameOf, today = todayKey()) {
  const rows = new Map();
  for (const t of tasks || []) {
    if (isClosed(t) && normalizeStatus(t.status) === 'cancelled') continue;
    const id = ownerId(t) || 'none';
    const r = bump(rows, id, () => ({ id, name: id === 'none' ? 'بلا مالك' : nameOf(id), total: 0, completed: 0, active: 0, overdue: 0, blocked: 0 }));
    r.total++;
    if (normalizeStatus(t.status) === 'completed') r.completed++;
    else if (isActive(t)) {
      r.active++;
      if (isOverdue(t, today)) r.overdue++;
      if (normalizeStatus(t.status) === 'blocked') r.blocked++;
    }
  }
  return [...rows.values()].sort((a, b) => b.overdue + b.blocked - (a.overdue + a.blocked) || b.total - a.total);
}
