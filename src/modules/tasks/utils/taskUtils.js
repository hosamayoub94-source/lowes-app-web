// =============================================================
// Tasks Module — pure utility functions.
// No side-effects, no imports from React/store/services.
// All business logic that doesn't require async lives here.
// =============================================================

import { TASK_STATUS } from '../types/task.types';
import { dueKey, diffDays, todayKey } from './taskDates';

// ── Date helpers ──────────────────────────────────────────────

/** Closed work can never be "late": completed (or legacy done), cancelled, archived. */
const CLOSED_STATUSES = new Set([TASK_STATUS.COMPLETED, 'done', TASK_STATUS.CANCELLED, 'archived']);
export const isClosedStatus = (s) => CLOSED_STATUSES.has(s);

/** Returns true if task is ACTIVE and past its due day (closed tasks are never overdue) */
export function isOverdue(task) {
  if (!task.due_date) return false;
  if (isClosedStatus(task.status)) return false;
  // مقارنة بالتقويم المحلي (لا بلحظة UTC): موعد اليوم ليس متأخراً حتى ينتهي اليوم.
  const k = dueKey(task.due_date);
  return !!k && k < todayKey();
}

/** Compute effective status — auto-promotes to overdue when past due */
export function effectiveStatus(task) {
  if (isOverdue(task)) {
    // عالقة / بانتظار رد تبقيان بحالتهما (الشارة)، والتأخر يظهر في نص الموعد والإحصاء — لا تُبتلعان بـ«متأخرة».
    if (task.status === 'blocked' || task.status === 'waiting_reply') return task.status;
    return TASK_STATUS.OVERDUE;
  }
  // Normalise legacy 'done' → 'completed' so the rest of the tasks module sees one value
  if (task.status === 'done') return TASK_STATUS.COMPLETED;
  return task.status;
}

/** Days remaining until due_date. Negative = overdue. */
export function daysUntilDue(due_date) {
  if (!due_date) return null;
  return diffDays(todayKey(), dueKey(due_date));
}

/**
 * Human-readable countdown label (Arabic).
 * ROOT CAUSE of «ملغاة — متأخر بـ113 يوماً»: this used to ignore the task status, so every task with an
 * old due date got a "متأخر بـ N" text. Closed statuses now return null (the card falls back to the plain date).
 */
export function countdownLabel(due_date, status) {
  if (!due_date || isClosedStatus(status)) return null;
  const days = daysUntilDue(due_date);
  if (days === null) return null;
  if (days < 0)  return `متأخر بـ ${Math.abs(days)} ${Math.abs(days) === 1 ? 'يوم' : 'أيام'}`;
  if (days === 0) return 'اليوم آخر موعد';
  if (days === 1) return 'يتبقى يوم واحد';
  if (days <= 7)  return `يتبقى ${days} أيام`;
  if (days <= 30) return `يتبقى ${Math.ceil(days / 7)} أسابيع`;
  return `يتبقى ${Math.ceil(days / 30)} شهر`;
}

/** Tailwind text-color class for due date label */
export function dueDateColorClass(due_date, status) {
  if (!due_date || isClosedStatus(status)) {
    return 'text-muted';
  }
  const days = daysUntilDue(due_date);
  if (days < 0)  return 'text-red-fg font-bold';
  if (days <= 1) return 'text-red-fg';
  if (days <= 3) return 'text-amber-fg';
  return 'text-muted';
}

/** Short date label (Arabic locale) */
export function shortDate(isoDate) {
  if (!isoDate) return '';
  return new Date(isoDate).toLocaleDateString('ar-EG', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** Time ago label (Arabic) */
export function timeAgo(isoDate) {
  if (!isoDate) return '';
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60)    return 'منذ لحظات';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)    return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)      return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 7)        return `منذ ${days} يوم`;
  return shortDate(isoDate);
}

// ── Filter logic ─────────────────────────────────────────────

/**
 * Applies all active filters to a task list.
 * @param {Array} tasks
 * @param {{ search, status, priority, assignedTo, overdueOnly, completedOnly }} filters
 * @returns {Array}
 */
export function filterTasks(tasks, filters) {
  if (!tasks?.length) return [];
  const { search, status, priority, assignedTo, overdueOnly, completedOnly } = filters;

  return tasks.filter((task) => {
    // Auto-compute effective status
    const effStatus = effectiveStatus(task);

    // Quick filters take priority
    if (overdueOnly  && !isOverdue(task))                      return false;
    if (completedOnly && effStatus !== TASK_STATUS.COMPLETED)  return false;

    // Status filter
    if (status === TASK_STATUS.OVERDUE) { if (!isOverdue(task)) return false; }
    else if (status && effStatus !== status) return false;

    // Priority filter
    if (priority && task.priority !== priority) return false;

    // Employee filter
    if (assignedTo && task.assigned_to?.id !== assignedTo) return false;

    // Search — title + description + assigned name
    if (search) {
      const q = search.toLowerCase();
      const haystack = [
        task.title,
        task.description,
        task.assigned_to?.name,
        ...(task.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

// ── Sorting ───────────────────────────────────────────────────

/**
 * Sort tasks: overdue first → by priority weight DESC → by due_date ASC
 */
export function sortTasks(tasks) {
  if (!tasks?.length) return [];
  return [...tasks].sort((a, b) => {
    // Overdue tasks always rise to top
    const aOver = isOverdue(a) ? 1 : 0;
    const bOver = isOverdue(b) ? 1 : 0;
    if (aOver !== bOver) return bOver - aOver;

    // Then by priority weight
    const aPrio = getPriorityWeight(a.priority);
    const bPrio = getPriorityWeight(b.priority);
    if (aPrio !== bPrio) return bPrio - aPrio;

    // Then by due_date soonest first
    if (a.due_date && b.due_date) {
      return new Date(a.due_date) - new Date(b.due_date);
    }
    if (a.due_date) return -1;
    if (b.due_date) return  1;
    return 0;
  });
}

function getPriorityWeight(priority) {
  const weights = { urgent: 4, high: 3, medium: 2, low: 1 };
  return weights[priority] || 0;
}

// ── Stats computation ─────────────────────────────────────────

/**
 * Compute dashboard KPIs from task list.
 * @param {Array} tasks
 * @returns {{ total, pending, inProgress, completed, cancelled, overdue, completionPct }}
 */
export function computeStats(tasks) {
  if (!tasks?.length) {
    return { total: 0, pending: 0, inProgress: 0, completed: 0, cancelled: 0, overdue: 0, blocked: 0, waiting: 0, completionPct: 0 };
  }

  const counts = {
    total:      tasks.length,
    pending:    0,
    inProgress: 0,
    completed:  0,
    cancelled:  0,
    overdue:    0,
    blocked:    0,
    waiting:    0,
  };

  for (const task of tasks) {
    const eff = effectiveStatus(task);
    if (isOverdue(task)) counts.overdue++; // نشطة فقط (تشمل عالقة/بانتظار رد المتأخرة)
    if (eff === TASK_STATUS.PENDING)     counts.pending++;
    else if (eff === TASK_STATUS.IN_PROGRESS) counts.inProgress++;
    else if (eff === TASK_STATUS.COMPLETED)   counts.completed++;
    else if (eff === TASK_STATUS.CANCELLED)   counts.cancelled++;
    else if (eff === 'blocked')               counts.blocked++;
    else if (eff === 'waiting_reply')         counts.waiting++;
  }

  const completionPct = counts.total > 0
    ? Math.round((counts.completed / counts.total) * 100)
    : 0;

  return { ...counts, completionPct };
}

// ── Misc helpers ──────────────────────────────────────────────

/** Extract unique employees list from tasks array */
export function extractEmployees(tasks) {
  if (!tasks?.length) return [];
  const map = new Map();
  for (const task of tasks) {
    if (task.assigned_to?.id) {
      map.set(task.assigned_to.id, task.assigned_to);
    }
  }
  return Array.from(map.values());
}

/** Count active filters (excluding empty/falsy ones) */
export function countActiveFilters(filters) {
  return Object.entries(filters).filter(([k, v]) => {
    if (k === 'overdueOnly' || k === 'completedOnly') return v === true;
    return Boolean(v);
  }).length;
}
