// =============================================================
// eventValidation — Safe event bus payload validation
//
// Wraps emit/on with validation so bad payloads never corrupt
// downstream handlers. Validation is additive — existing bus
// is unchanged. Just use safeEmit / safeOn instead.
// =============================================================
import { emit, on }     from '@/core/events/eventBus';
import { validate }      from './runtimeValidations';
import { createLogger }  from '@/core/production/productionLogger';

const log = createLogger('EventValidation');

// ── Event payload schemas ──────────────────────────────────────
// Register shapes for any event type you want validated.
const EVENT_SCHEMAS = {
  'task:created':             { id: { type: 'string', required: true }, title: { type: 'nonEmpty', required: true } },
  'task:updated':             { id: { type: 'string', required: true } },
  'task:deleted':             { id: { type: 'string', required: true } },
  'attendance:check_in':      { user_id: { type: 'string', required: true } },
  'attendance:check_out':     { user_id: { type: 'string', required: true } },
  'notifications:send':       { type: { type: 'string', required: true }, user_id: { type: 'string', required: true } },
  'collab:comment_added':     { id: { type: 'string', required: true }, content: { type: 'nonEmpty', required: true } },
  'collab:mention_sent':      { mention_user_id: { type: 'string', required: true } },
  'offline:action_queued':    { actionType: { type: 'string', required: true } },
  'safety:delete_started':    { entityType: { type: 'string', required: true }, entityId: { type: 'string', required: true } },
};

// ── safeEmit ───────────────────────────────────────────────────
/**
 * Validated emit — checks payload against registered schema
 * before emitting. Blocks emission if invalid in DEV, logs in prod.
 *
 * @param {string} eventType
 * @param {object} payload
 * @returns {boolean} — false if blocked
 */
export function safeEmit(eventType, payload = {}) {
  const schema = EVENT_SCHEMAS[eventType];

  if (schema) {
    const { valid, errors } = validate(payload, schema, `event:${eventType}`);
    if (!valid) {
      log.error(`safeEmit blocked: "${eventType}"`, { errors });
      if (import.meta.env.DEV) {
        console.error(`[EventValidation] Blocked emit "${eventType}":`, errors);
        return false; // block in dev
      }
      // In prod: log but still emit (don't break UX)
    }
  }

  emit(eventType, payload);
  return true;
}

// ── safeOn ─────────────────────────────────────────────────────
/**
 * Validated listener — validates incoming payload before calling handler.
 * If validation fails, logs and skips the handler (doesn't throw).
 *
 * @param {string}   eventType
 * @param {function} handler
 * @returns {function} unsubscribe
 */
export function safeOn(eventType, handler) {
  return on(eventType, (payload) => {
    const schema = EVENT_SCHEMAS[eventType];

    if (schema && payload) {
      const { valid, errors } = validate(payload, schema, `event:${eventType}`);
      if (!valid) {
        log.warn(`safeOn: invalid payload for "${eventType}" — handler skipped`, { errors });
        return; // don't call handler with bad data
      }
    }

    try {
      handler(payload);
    } catch (err) {
      log.error(`safeOn: handler threw for "${eventType}"`, { error: err?.message });
    }
  });
}

// ── Register custom event schema ───────────────────────────────
/**
 * Register a payload schema for an event type.
 * Call at module init time to protect custom events.
 */
export function registerEventSchema(eventType, schema) {
  EVENT_SCHEMAS[eventType] = schema;
}

// ── Get registered schemas (for inspector) ─────────────────────
export function getEventSchemas() {
  return { ...EVENT_SCHEMAS };
}
