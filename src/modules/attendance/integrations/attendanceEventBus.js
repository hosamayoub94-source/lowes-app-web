// =============================================================
// Attendance Module — Event Bus + Queue + Notification Integration
//
// Bridges the attendance service with the rest of the platform:
//
//   1. EVENT BUS — emits attendance events after service calls.
//   2. QUEUE — enqueues background jobs (late detection, reminders,
//              daily summaries, absent flagging).
//   3. NOTIFICATIONS — sends targeted alerts via the notification service.
//
// This file is loaded once via bootAttendanceIntegration().
// Rule: NEVER import directly from other feature modules; always
//       use the Event Bus or lazy imports to avoid circular deps.
// =============================================================
import { emit, on } from '@/core/events';
import { EVENTS, EVENT_SOURCES } from '@/core/events/eventTypes';

const JOB_DELAY_LATE_CHECK_MS    =  5 * 60_000;  // 5 min after shift start grace
const JOB_DELAY_ABSENT_CHECK_MS  = 90 * 60_000;  // 90 min — just before absent mark
const JOB_DELAY_SHIFT_REMINDER_MS = 30 * 60_000; // 30 min before shift starts

let _unsubs = [];
let _booted = false;

// ── Boot ─────────────────────────────────────────────────────

/**
 * Wire all attendance → event bus / queue / notification bridges.
 * Safe to call multiple times (idempotent).
 */
export function bootAttendanceIntegration() {
  if (_booted) return;
  _booted = true;

  _wireCheckInEvents();
  _wireCheckOutEvents();
  _wireLateEvents();
  _wireAbsentEvents();
}

/**
 * Tear down all listeners (used in tests / hot-reload).
 */
export function teardownAttendanceIntegration() {
  _unsubs.forEach((unsub) => unsub());
  _unsubs = [];
  _booted = false;
}

// ── Check-in bridge ───────────────────────────────────────────

function _wireCheckInEvents() {
  // After attendanceService.checkIn completes the UI calls:
  //   emit(EVENTS.ATTENDANCE_CHECK_IN, payload)
  // We listen here and fan out to queue + notifications.

  _unsubs.push(
    on(EVENTS.ATTENDANCE_CHECK_IN, async (payload) => {
      const { userId, employeeId = userId, employeeName, lateByMinutes = 0 } = payload;
      if (!employeeId) return;

      // If late — also emit the late event so automation rules pick it up
      if (lateByMinutes > 0) {
        emit(
          EVENTS.ATTENDANCE_LATE,
          { employeeId, employeeName, lateByMinutes },
          { source: EVENT_SOURCES.ATTENDANCE },
        );
        return; // _wireLateEvents handles the rest
      }

      // On-time check-in — send a welcome notification
      await _notify({
        userId:   employeeId,
        title:    'تم تسجيل الحضور ✓',
        message:  employeeName
          ? `أهلاً ${employeeName}، تم تسجيل حضورك بنجاح.`
          : 'تم تسجيل حضورك بنجاح.',
        type:     'attendance_alert',
      });
    }),
  );
}

// ── Check-out bridge ──────────────────────────────────────────

function _wireCheckOutEvents() {
  _unsubs.push(
    on(EVENTS.ATTENDANCE_CHECK_OUT, async (payload) => {
      const {
        userId,
        employeeId = userId,
        employeeName,
        workedMinutes   = 0,
        overtimeMinutes = 0,
      } = payload;
      if (!employeeId) return;

      const h = Math.floor(workedMinutes / 60);
      const m = workedMinutes % 60;
      const workedLabel = `${h}:${String(m).padStart(2, '0')}`;

      let body = `تم تسجيل انصرافك. ساعات العمل: ${workedLabel}`;
      if (overtimeMinutes > 0) body += ` (إضافي: ${overtimeMinutes} د)`;

      await _notify({
        userId:   employeeId,
        title:    'تم تسجيل الانصراف',
        message:  body,
        type:     'attendance_alert',
      });

      // Enqueue daily summary job
      await _enqueue('DAILY_SUMMARY', {
        userId:         employeeId,
        workedMinutes,
        overtimeMinutes,
        date:           new Date().toISOString().slice(0, 10),
      });
    }),
  );
}

// ── Late bridge ───────────────────────────────────────────────

function _wireLateEvents() {
  _unsubs.push(
    on(EVENTS.ATTENDANCE_LATE, async (payload) => {
      const { employeeId, employeeName, lateByMinutes, managerIds = [] } = payload;
      if (!employeeId) return;

      // Notify the employee
      await _notify({
        userId:   employeeId,
        title:    'تسجيل حضور متأخر',
        message:  `تم تسجيل حضورك متأخراً بـ ${lateByMinutes} دقيقة.`,
        type:     'attendance_alert',
      });

      // Notify each manager
      for (const mgr of managerIds) {
        await _notify({
          userId:   mgr,
          title:    'موظف متأخر',
          message:  employeeName
            ? `${employeeName} تأخر ${lateByMinutes} دقيقة.`
            : `موظف تأخر ${lateByMinutes} دقيقة.`,
          type:     'attendance_alert',
        });
      }

      // Enqueue absent check — runs ~90 min from now
      await _enqueueDelayed(
        'ABSENT_CHECK',
        { employeeId, employeeName },
        JOB_DELAY_ABSENT_CHECK_MS,
      );
    }),
  );
}

// ── Absent bridge ─────────────────────────────────────────────

function _wireAbsentEvents() {
  _unsubs.push(
    on(EVENTS.ATTENDANCE_ABSENT, async (payload) => {
      const { employeeId, employeeName, managerIds = [] } = payload;
      if (!employeeId) return;

      // Notify employee
      await _notify({
        userId:   employeeId,
        title:    'تسجيل غياب',
        message:  'لم يتم تسجيل حضورك حتى الآن. يرجى التواصل مع المشرف.',
        type:     'absence_alert',
      });

      // Notify managers
      for (const mgr of managerIds) {
        await _notify({
          userId:   mgr,
          title:    'موظف غائب',
          message:  employeeName
            ? `${employeeName} غائب اليوم.`
            : 'موظف غائب اليوم.',
          type:     'absence_alert',
        });
      }
    }),
  );
}

// ── Emit helpers (called by UI / service layer) ───────────────

/**
 * Emit a check-in event from the UI after checkIn() resolves.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} [params.employeeName]
 * @param {number} [params.lateByMinutes]
 * @param {object} [params.shift]
 */
export function emitCheckIn({ userId, employeeName, lateByMinutes = 0, shift }) {
  emit(
    EVENTS.ATTENDANCE_CHECK_IN,
    { userId, employeeId: userId, employeeName, lateByMinutes, shift },
    { source: EVENT_SOURCES.ATTENDANCE },
  );
}

/**
 * Emit a check-out event from the UI after checkOut() resolves.
 */
export function emitCheckOut({ userId, employeeName, workedMinutes, overtimeMinutes }) {
  emit(
    EVENTS.ATTENDANCE_CHECK_OUT,
    { userId, employeeId: userId, employeeName, workedMinutes, overtimeMinutes },
    { source: EVENT_SOURCES.ATTENDANCE },
  );
}

/**
 * Emit an absent event (called by scheduled job or background scan).
 */
export function emitAbsent({ employeeId, employeeName, managerIds = [] }) {
  emit(
    EVENTS.ATTENDANCE_ABSENT,
    { employeeId, employeeName, managerIds },
    { source: EVENT_SOURCES.ATTENDANCE },
  );
}

// ── Internal helpers ──────────────────────────────────────────

async function _notify({ userId, title, message, type }) {
  try {
    const { sendNotification } = await import(
      '@modules/notifications/services/notificationService'
    );
    await sendNotification({ userId, title, message, type });
  } catch (err) {
    console.warn('[AttendanceIntegration] notification failed:', err.message);
  }
}

async function _enqueue(type, payload) {
  try {
    const { useQueueStore } = await import('@/core/queue/queueStore');
    useQueueStore.getState().enqueue(type, payload);
  } catch (err) {
    console.warn('[AttendanceIntegration] enqueue failed:', err.message);
  }
}

async function _enqueueDelayed(type, payload, delayMs) {
  try {
    const { useQueueStore } = await import('@/core/queue/queueStore');
    useQueueStore.getState().enqueue(type, payload, { runAt: new Date(Date.now() + delayMs) });
  } catch (err) {
    console.warn('[AttendanceIntegration] enqueue delayed failed:', err.message);
  }
}
