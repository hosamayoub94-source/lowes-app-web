// =============================================================
// Automation Engine — Event Bus Integration
//
// Subscribes to every event bus event that has a corresponding
// TRIGGER_TYPE, then calls automationEngine.evaluate().
//
// The mapping is explicit and one-directional:
//   EVENTS.X  →  TRIGGER_TYPE.Y  →  evaluate(Y, payload)
// =============================================================
import { on, EVENTS }   from '@/core/events';
import { TRIGGER_TYPE } from './automationTypes';
import { evaluate }     from './automationEngine';

// Map: event bus event name → TRIGGER_TYPE constant
const EVENT_TO_TRIGGER = {
  [EVENTS.TASK_ASSIGNED]:        TRIGGER_TYPE.TASK_ASSIGNED,
  [EVENTS.TASK_COMPLETED]:       TRIGGER_TYPE.TASK_COMPLETED,
  [EVENTS.TASK_OVERDUE]:         TRIGGER_TYPE.TASK_OVERDUE,
  [EVENTS.TASK_STATUS_CHANGED]:  TRIGGER_TYPE.TASK_STATUS_CHANGED,
  [EVENTS.USER_LOGGED_IN]:       TRIGGER_TYPE.USER_LOGGED_IN,
  [EVENTS.USER_LOGGED_OUT]:      TRIGGER_TYPE.USER_LOGGED_OUT,
  [EVENTS.ATTENDANCE_LATE]:      TRIGGER_TYPE.ATTENDANCE_LATE,
  [EVENTS.ATTENDANCE_ABSENT]:    TRIGGER_TYPE.ATTENDANCE_ABSENT,
  [EVENTS.PAYROLL_APPROVED]:     TRIGGER_TYPE.PAYROLL_APPROVED,
  [EVENTS.AUDIT_CRITICAL_EVENT]: TRIGGER_TYPE.AUDIT_CRITICAL_EVENT,
  [EVENTS.NOTIFICATION_CREATED]: TRIGGER_TYPE.NOTIFICATION_CREATED,
  [EVENTS.SYSTEM_ERROR]:         TRIGGER_TYPE.SYSTEM_ERROR,
};

// Unsubscribe functions returned by on()
let _unsubs = [];

/**
 * Subscribe to all mapped event bus events.
 * Called once at boot from bootstrap.js.
 */
export function registerAutomationBridge() {
  for (const [eventName, triggerType] of Object.entries(EVENT_TO_TRIGGER)) {
    _unsubs.push(
      on(eventName, (payload) => {
        // Fire-and-forget — engine handles its own errors
        evaluate(triggerType, payload ?? {}).catch((err) => {
          if (import.meta.env.DEV) {
            console.error(`[Automation] evaluate(${triggerType}) threw:`, err);
          }
        });
      }),
    );
  }
}

/**
 * Remove all subscriptions created by the bridge.
 * Called at shutdown from bootstrap.js.
 */
export function unregisterAutomationBridge() {
  _unsubs.forEach((unsub) => { try { unsub(); } catch (_) {} });
  _unsubs = [];
}
