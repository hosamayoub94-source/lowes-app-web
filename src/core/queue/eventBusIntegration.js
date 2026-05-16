// =============================================================
// Queue System — Event Bus Integration
//
// Bridges the enterprise event bus → queue jobs.
// Certain bus events automatically spawn background jobs.
//
// Subscriptions:
//   NOTIFICATION_CREATED  → SEND_NOTIFICATION job
//   AUDIT_CRITICAL_EVENT  → RETRY_FAILED_EVENT job (when payload marks it failed)
// =============================================================
import { on, EVENTS }   from '@/core/events';
import { useQueueStore } from './queueStore';
import { JOB_TYPE }      from './jobTypes';

// Unsubscribe functions returned by on()
let _unsubs = [];

/**
 * Register all event-bus → queue subscriptions.
 * Called once at boot (from bootstrap.js).
 */
export function registerEventBusQueueBridge() {
  // ── New notification → deliver via queue ──────────────────
  _unsubs.push(
    on(EVENTS.NOTIFICATION_CREATED, (payload) => {
      useQueueStore.getState().enqueue(
        JOB_TYPE.SEND_NOTIFICATION,
        payload ?? {},
        { idempotencyKey: payload?.dedup_key ?? null },
      );
    }),
  );

  // ── Critical audit event marked as failed → retry ────────
  _unsubs.push(
    on(EVENTS.AUDIT_CRITICAL_EVENT, (payload) => {
      if (!payload?.failed || !payload?.eventName) return;
      useQueueStore.getState().enqueue(
        JOB_TYPE.RETRY_FAILED_EVENT,
        { eventName: payload.eventName, eventPayload: payload.eventPayload },
        {
          idempotencyKey:
            `retry_${payload.eventName}_${payload.entityId ?? Date.now()}`,
        },
      );
    }),
  );
}

/**
 * Remove all event-bus subscriptions created by the bridge.
 * Called at shutdown.
 */
export function unregisterEventBusQueueBridge() {
  _unsubs.forEach((unsub) => { try { unsub(); } catch (_) {} });
  _unsubs = [];
}
