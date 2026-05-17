// =============================================================
// Queue System — Handler Registry
//
// Each job type maps to an async handler function:
//   handler(job) → Promise<any>
//
// Handlers must:
//   • Resolve with a result value on success
//   • Throw an Error on failure (worker will catch and retry)
//   • Complete within job.timeoutMs (worker enforces timeout)
// =============================================================
import { JOB_TYPE } from './jobTypes';

// ── Registry ──────────────────────────────────────────────────

/** @type {Map<string, (job: object) => Promise<any>>} */
const _registry = new Map();

/**
 * Register a handler function for a job type.
 * Overwriting is allowed (useful for testing).
 *
 * @param {string}   type    — JOB_TYPE value
 * @param {function} handler — async (job) => result
 */
export function registerHandler(type, handler) {
  if (typeof handler !== 'function') {
    throw new TypeError(`Handler for "${type}" must be a function`);
  }
  _registry.set(type, handler);
}

/**
 * Retrieve the handler for a job type.
 * @param {string} type
 * @returns {function|undefined}
 */
export function getHandler(type) {
  return _registry.get(type);
}

/**
 * Execute the registered handler for a job.
 * Throws if no handler is found.
 *
 * @param {object} job
 * @returns {Promise<any>}
 */
export async function executeHandler(job) {
  const handler = _registry.get(job.type);
  if (!handler) {
    throw new Error(`No handler registered for job type "${job.type}"`);
  }
  return handler(job);
}

// ── Default Handler Implementations ──────────────────────────
// These are lightweight stubs. Replace them with real logic by
// calling registerHandler() again from your feature modules.

/**
 * SEND_NOTIFICATION
 * Delegates to notificationService (lazy import to avoid circular deps).
 */
registerHandler(JOB_TYPE.SEND_NOTIFICATION, async (job) => {
  const { sendNotification } = await import(
    '@modules/notifications/services/notificationService'
  );
  const result = await sendNotification(job.payload);
  return { notificationId: result?.id ?? null };
});

/**
 * SEND_REMINDER
 * Same service, but marks as reminder type.
 */
registerHandler(JOB_TYPE.SEND_REMINDER, async (job) => {
  const { sendNotification } = await import(
    '@modules/notifications/services/notificationService'
  );
  const result = await sendNotification({
    ...job.payload,
    metadata: { ...(job.payload.metadata ?? {}), isReminder: true },
  });
  return { notificationId: result?.id ?? null };
});

/**
 * CLEANUP_LOGS
 * Removes old notifications and (optionally) old audit entries.
 */
registerHandler(JOB_TYPE.CLEANUP_LOGS, async (_job) => {
  const { cleanOldNotifications } = await import(
    '@modules/notifications/services/notificationService'
  );
  await cleanOldNotifications();
  return { cleaned: true };
});

/**
 * DAILY_SUMMARY
 * Placeholder — emit an event so the UI can react.
 */
registerHandler(JOB_TYPE.DAILY_SUMMARY, async (job) => {
  const { emit, EVENTS } = await import('@/core/events');
  emit(EVENTS.QUEUE_JOB_COMPLETED, {
    jobId:   job.id,
    jobType: job.type,
    payload: job.payload,
  });
  return { emitted: true };
});

/**
 * RETRY_FAILED_EVENT
 * Re-emits a previously failed event onto the event bus.
 */
registerHandler(JOB_TYPE.RETRY_FAILED_EVENT, async (job) => {
  const { emit } = await import('@/core/events');
  const { eventName, eventPayload } = job.payload ?? {};
  if (!eventName) throw new Error('RETRY_FAILED_EVENT: missing payload.eventName');
  emit(eventName, { ...(eventPayload ?? {}), _retried: true });
  return { retried: eventName };
});

/**
 * SYNC_OFFLINE_DATA
 * Stub — extend when offline sync is implemented.
 */
registerHandler(JOB_TYPE.SYNC_OFFLINE_DATA, async (job) => {
  // Real implementation will flush IndexedDB offline queue to Supabase.
  console.info('[Queue] SYNC_OFFLINE_DATA executed for', job.payload);
  return { synced: true };
});

/**
 * ABSENT_CHECK
 * Runs ~90 min after a late check-in to see if the employee
 * eventually checked in. If not, emits ATTENDANCE_ABSENT.
 */
registerHandler(JOB_TYPE.ABSENT_CHECK, async (job) => {
  const { employeeId, employeeName } = job.payload ?? {};
  if (!employeeId) return { skipped: true };

  try {
    // Dynamically check current attendance status
    const { getAttendanceStatus } = await import(
      '@modules/attendance/services/attendanceService'
    );
    const status = await getAttendanceStatus(employeeId);

    // If still not checked in — flag as absent
    if (!status?.checkedIn) {
      const { emit } = await import('@/core/events');
      const { EVENTS, EVENT_SOURCES } = await import('@/core/events/eventTypes');
      emit(
        EVENTS.ATTENDANCE_ABSENT,
        { employeeId, employeeName, managerIds: status?.managerIds ?? [] },
        { source: EVENT_SOURCES.ATTENDANCE },
      );
      return { absent: true, employeeId };
    }
  } catch {
    // Attendance service may be in mock mode or unavailable — safe to ignore
    console.warn('[Queue] ABSENT_CHECK: could not verify status for', employeeId);
  }

  return { absent: false, employeeId };
});

/**
 * THUMBNAIL_GENERATION
 * Placeholder — generates/queues thumbnail for uploaded files.
 * Extend with real storage/image processing when needed.
 */
registerHandler(JOB_TYPE.THUMBNAIL_GENERATION, async (job) => {
  const { fileId } = job.payload ?? {};
  if (!fileId) return { skipped: true };
  // Real implementation: call an edge function or storage transform.
  console.info('[Queue] THUMBNAIL_GENERATION for fileId:', fileId);
  return { thumbnailGenerated: false, fileId, note: 'stub' };
});
