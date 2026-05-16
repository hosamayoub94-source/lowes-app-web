// =============================================================
// mockRealtime — Fake Supabase realtime event injection
//
// Lets you inject realtime events into the running app during
// development to test how the UI reacts to live updates.
//
// Usage:
//   import { fireTaskUpdate, fireNotification } from './mockRealtime';
//   fireTaskUpdate({ id: 'task_001', status: 'done' });
//   fireNotification({ type: 'mention', title: '@أحمد提到تك' });
// =============================================================
import { emit }         from '@/core/events/eventBus';
import { createLogger } from '@/core/production/productionLogger';
import { makeTask, makeNotification, makeComment, makeAttendanceRecord } from './mockFactories';

const log = createLogger('MockRealtime');

function _log(event, payload) {
  log.info(`🎭 Mock realtime: ${event}`, payload);
}

// ── Task events ────────────────────────────────────────────────
export function fireTaskUpdate(overrides = {}) {
  const task = makeTask({ status: 'in_progress', ...overrides });
  _log('task:updated', task);
  emit('task:updated', task);
  return task;
}

export function fireTaskCreated(overrides = {}) {
  const task = makeTask(overrides);
  _log('task:created', task);
  emit('task:created', task);
  return task;
}

export function fireTaskCompleted(overrides = {}) {
  const task = makeTask({ status: 'done', ...overrides });
  _log('task:updated', task);
  emit('task:updated', task);
  return task;
}

// ── Notification events ────────────────────────────────────────
export function fireNotification(overrides = {}) {
  const notif = makeNotification(overrides);
  _log('notifications:new', notif);
  emit('notifications:new', notif);
  return notif;
}

export function fireMentionNotification(mentionedUserId, commentId) {
  return fireNotification({
    type:    'mention',
    title:   'تم الإشارة إليك',
    message: 'أشار إليك أحد زملائك في تعليق',
    metadata: { comment_id: commentId, user_id: mentionedUserId },
  });
}

// ── Attendance events ──────────────────────────────────────────
export function fireAttendanceCheckIn(overrides = {}) {
  const record = makeAttendanceRecord({ status: 'in', ...overrides });
  _log('attendance:check_in', record);
  emit('attendance:check_in', record);
  return record;
}

export function fireAttendanceCheckOut(overrides = {}) {
  const record = makeAttendanceRecord({ status: 'out', check_out: new Date().toTimeString().slice(0,8), ...overrides });
  _log('attendance:check_out', record);
  emit('attendance:check_out', record);
  return record;
}

// ── Collaboration events ───────────────────────────────────────
export function fireCommentAdded(overrides = {}) {
  const comment = makeComment(overrides);
  _log('collab:comment_added', comment);
  emit('collab:comment_added', comment);
  return comment;
}

export function firePresenceChange(userId, status = 'online', section = 'الرئيسية') {
  const payload = { userId, status, section, timestamp: Date.now() };
  _log('collab:presence_changed', payload);
  emit('collab:presence_changed', payload);
  return payload;
}

// ── Burst simulation (stress) ──────────────────────────────────
/**
 * Fire multiple events rapidly to stress test the UI.
 * @param {function} factory — event fire function
 * @param {number}   count
 * @param {number}   intervalMs
 * @returns {function} stop
 */
export function burst(factory, count = 20, intervalMs = 200) {
  let fired = 0;
  log.warn(`[MockRealtime] Starting burst: ${count} events every ${intervalMs}ms`);
  const timer = setInterval(() => {
    factory();
    fired++;
    if (fired >= count) { clearInterval(timer); log.info('[MockRealtime] Burst complete'); }
  }, intervalMs);
  return () => clearInterval(timer);
}

// ── Scenario: simulate active workday ─────────────────────────
export function simulateActiveWorkday() {
  const events = [
    () => fireAttendanceCheckIn(),
    () => fireTaskCreated(),
    () => fireNotification({ type: 'task_assigned', title: 'مهمة جديدة مسندة إليك' }),
    () => fireCommentAdded(),
    () => fireMentionNotification('usr_current', 'cmt_001'),
    () => fireTaskCompleted(),
    () => fireNotification({ type: 'system', title: 'تحديث النظام' }),
    () => firePresenceChange('usr_002', 'online', 'المهام'),
  ];

  log.info('[MockRealtime] Simulating active workday scenario...');
  events.forEach((fn, i) => setTimeout(fn, i * 1500));
}

// ── Expose on window in DEV ────────────────────────────────────
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__mockRealtime = {
    fireTaskUpdate, fireTaskCreated, fireTaskCompleted,
    fireNotification, fireMentionNotification,
    fireAttendanceCheckIn, fireAttendanceCheckOut,
    fireCommentAdded, firePresenceChange,
    burst, simulateActiveWorkday,
  };
}
