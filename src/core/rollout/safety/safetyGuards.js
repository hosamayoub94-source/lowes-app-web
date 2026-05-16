// =============================================================
// safetyGuards — Operational Safety Layer
//
// Prevents:
//   • Accidental deletes (requires explicit confirmation)
//   • Duplicate action submission (debounce + lock)
//   • Invalid workflow state transitions
//   • Missing required fields before action
//   • Destructive batch operations without approval
//
// All guards are event-bus integrated: emit before + after events
// so audit logging picks them up automatically.
//
// Usage:
//   import { guardDelete, guardBatch, validateRequired } from './safetyGuards';
//   await guardDelete('task', taskId, () => taskService.delete(taskId));
// =============================================================
import { createLogger } from '@/core/production/productionLogger';
import { captureError }  from '@/core/production/errorReporter';
import { isLocked, acquireLock, releaseLock } from '@/core/production/actionLock';
import { emit }          from '@/core/events/eventBus';

const log = createLogger('SafetyGuards');

// ── Confirmation callback registry ────────────────────────────
// UI mounts a confirm handler; guards call it imperatively
let _confirmHandler = null;

/**
 * Register the UI confirm dialog handler.
 * The handler receives { title, message, danger } and returns Promise<boolean>.
 * @param {function} handler
 */
export function registerConfirmHandler(handler) {
  _confirmHandler = handler;
}

async function _confirm(options) {
  if (!_confirmHandler) {
    // Fallback to native confirm (should not happen in production)
    log.warn('No confirm handler registered — falling back to window.confirm');
    return window.confirm(options.message ?? 'هل أنت متأكد؟');
  }
  return _confirmHandler(options);
}

// ── Guard: Delete ──────────────────────────────────────────────
/**
 * Wrap a delete operation with a confirmation gate.
 *
 * @param {string}   entityType  — e.g. 'task', 'employee', 'deal'
 * @param {string}   entityId
 * @param {function(): Promise} action
 * @param {object}  [opts]
 * @param {string}  [opts.label]    — human-readable entity name
 * @param {boolean} [opts.danger]   — red danger mode
 */
export async function guardDelete(entityType, entityId, action, opts = {}) {
  const { label = entityType, danger = true } = opts;
  const lockKey = `delete:${entityType}:${entityId}`;

  if (isLocked(lockKey)) {
    log.warn(`delete already in progress: ${lockKey}`);
    return false;
  }

  const confirmed = await _confirm({
    title:   `حذف ${label}`,
    message: `هل أنت متأكد من حذف هذا العنصر؟ لا يمكن التراجع عن هذا الإجراء.`,
    danger,
    confirmLabel: 'نعم، احذف',
    cancelLabel:  'إلغاء',
  });

  if (!confirmed) {
    log.debug(`delete cancelled by user: ${lockKey}`);
    emit('safety:delete_cancelled', { entityType, entityId });
    return false;
  }

  acquireLock(lockKey, 10_000);
  try {
    emit('safety:delete_started', { entityType, entityId });
    await action();
    emit('safety:delete_completed', { entityType, entityId });
    log.info(`delete completed: ${lockKey}`);
    return true;
  } catch (err) {
    captureError(err, { context: `safetyGuard:delete:${entityType}` });
    emit('safety:delete_failed', { entityType, entityId, error: err?.message });
    throw err;
  } finally {
    releaseLock(lockKey);
  }
}

// ── Guard: Batch operation ─────────────────────────────────────
/**
 * Require confirmation before a bulk/batch destructive action.
 * @param {string}   operationType
 * @param {number}   count          — number of items affected
 * @param {function(): Promise} action
 * @param {object}  [opts]
 */
export async function guardBatch(operationType, count, action, opts = {}) {
  const { label = operationType } = opts;
  const lockKey = `batch:${operationType}`;

  if (isLocked(lockKey)) {
    log.warn(`batch already in progress: ${operationType}`);
    return false;
  }

  const confirmed = await _confirm({
    title:   `تأكيد العملية الجماعية`,
    message: `ستؤثر هذه العملية (${label}) على ${count} عنصر. هل أنت متأكد؟`,
    danger:  count > 10,
    confirmLabel: `تأكيد (${count} عنصر)`,
    cancelLabel:  'إلغاء',
  });

  if (!confirmed) return false;

  acquireLock(lockKey, 30_000);
  try {
    emit('safety:batch_started', { operationType, count });
    await action();
    emit('safety:batch_completed', { operationType, count });
    return true;
  } catch (err) {
    captureError(err, { context: `safetyGuard:batch:${operationType}` });
    throw err;
  } finally {
    releaseLock(lockKey);
  }
}

// ── Guard: Required fields ─────────────────────────────────────
/**
 * Validate that all required fields are filled.
 *
 * @param {object}   data         — form data object
 * @param {string[]} required     — required field keys
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateRequired(data, required = []) {
  const missing = required.filter((key) => {
    const v = data[key];
    return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
  });
  if (missing.length > 0) {
    log.warn('validation failed — missing fields', { missing });
    emit('safety:validation_failed', { missing });
  }
  return { valid: missing.length === 0, missing };
}

// ── Guard: Workflow state transition ───────────────────────────
/**
 * Validate that a workflow state transition is legal.
 *
 * @param {string}   current    — current state
 * @param {string}   next       — desired state
 * @param {object}   allowedMap — { fromState: [allowedNextStates] }
 * @returns {boolean}
 */
export function validateTransition(current, next, allowedMap) {
  const allowed = allowedMap[current] ?? [];
  const valid   = allowed.includes(next);
  if (!valid) {
    log.warn(`invalid transition: "${current}" → "${next}"`, { allowed });
    emit('safety:invalid_transition', { current, next, allowed });
  }
  return valid;
}

// ── Guard: Duplicate submission ────────────────────────────────
/**
 * Debounced submission guard — prevents double-click issues.
 * Returns true if the action should proceed, false if blocked.
 *
 * @param {string}  key     — unique action key
 * @param {number}  [ttlMs] — lock duration (default 3s)
 */
export function guardDuplicate(key, ttlMs = 3_000) {
  if (isLocked(`dup:${key}`)) {
    log.warn(`duplicate action blocked: "${key}"`);
    emit('safety:duplicate_blocked', { key });
    return false;
  }
  acquireLock(`dup:${key}`, ttlMs);
  return true;
}

// ── Guard: Unsaved changes warning ────────────────────────────
/**
 * Warn user before navigating away with unsaved changes.
 * Use as beforeunload handler or in useEffect cleanup.
 *
 * @param {boolean} hasChanges
 * @returns {function} cleanup — call to remove listener
 */
export function guardUnsavedChanges(hasChanges) {
  const handler = (e) => {
    if (!hasChanges) return;
    e.preventDefault();
    e.returnValue = 'لديك تغييرات غير محفوظة. هل تريد المغادرة؟';
    return e.returnValue;
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}

// ── Guard: Required action before proceeding ──────────────────
/**
 * Block proceeding until a required action has been taken.
 * E.g., check-in before accessing tasks.
 *
 * @param {boolean}  conditionMet  — true = OK to proceed
 * @param {string}   message       — shown to user if blocked
 * @returns {boolean}
 */
export function guardRequiredAction(conditionMet, message) {
  if (!conditionMet) {
    log.warn(`required action not completed: ${message}`);
    emit('safety:required_action_missing', { message });
    return false;
  }
  return true;
}
