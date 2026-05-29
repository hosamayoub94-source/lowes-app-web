// =============================================================
// Tasks Module — pure utility functions.
// No side-effects, no imports from React/store/services.
// All business logic that doesn't require async lives here.
// =============================================================

import { TASK_STATUS } from '../types/task.types';

// ── Date helpers ──────────────────────────────────────────────

/** Returns true if a task status counts as finished (done OR completed) */
const isFinishedStatus = (s) => s === TASK_STATUS.COMPLETED || s === 'done';

/** Returns true if task is past its due_date and not completed/cancelled */
export function isOverdue(task) {
  if (!task.due_date) return false;
  if (isFinishedStatus(task.status) || task.status === TASK_STATUS.CANCELLED) return false;
  return new Date(task.due_date) < new Date();
}

/** Compute effective status — auto-promotes to overdue when past due */
export function effectiveStatus(task) {
  if (isOverdue(task)) return TASK_STATUS.OVERDUE;
  // Normalise legacy 'done' → 'completed' so the rest of the tasks module sees one value
  if (task.status === 'done') return TASK_STATUS.COMPLETED;
  return task.status;
}

/** Days remaining until due_date. Negative = overdue. */
export function daysUntilDue(due_date) {
  if (!due_date) return null;
  const diff = new Date(due_date).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/** Human-readable countdown label (Arabic) */
export function countdownLabel(due_date) {
  if (!due_date) return null;
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
  if (!due_date || isFinishedStatus(status) || status === TASK_STATUS.CANCELLED) {
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
    if (overdueOnly  && effStatus !== TASK_STATUS.OVERDUE)    return false;
    if (completedOnly && effStatus !== TASK_STATUS.COMPLETED)  return false;

    // Status filter
    if (status && effStatus !== status) return false;

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
    const aOver = effectiveStatus(a) === TASK_STATUS.OVERDUE ? 1 : 0;
    const bOver = effectiveStatus(b) === TASK_STATUS.OVERDUE ? 1 : 0;
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
    return { total: 0, pending: 0, inProgress: 0, completed: 0, cancelled: 0, overdue: 0, completionPct: 0 };
  }

  const counts = {
    total:      tasks.length,
    pending:    0,
    inProgress: 0,
    completed:  0,
    cancelled:  0,
    overdue:    0,
  };

  for (const task of tasks) {
    const eff = effectiveStatus(task);
    if (eff === TASK_STATUS.PENDING)     counts.pending++;
    else if (eff === TASK_STATUS.IN_PROGRESS) counts.inProgress++;
    else if (eff === TASK_STATUS.COMPLETED)   counts.completed++;
    else if (eff === TASK_STATUS.CANCELLED)   counts.cancelled++;
    else if (eff === TASK_STATUS.OVERDUE)     counts.overdue++;
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
