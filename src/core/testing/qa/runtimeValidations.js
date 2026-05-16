// =============================================================
// runtimeValidations — Schema guards + payload validation
//
// Provides lightweight runtime type checking without a library.
// Used to validate: API responses, event payloads, queue items,
// form data, and inter-module contracts.
//
// NOT a test framework — runs in production to catch bad data
// before it corrupts state. All failures are non-throwing:
// they log + emit + return { valid, errors } so callers decide.
// =============================================================
import { createLogger } from '@/core/production/productionLogger';
import { captureError }  from '@/core/production/errorReporter';
import { emit }          from '@/core/events/eventBus';

const log = createLogger('RuntimeValidation');

// ── Type checkers ──────────────────────────────────────────────
const is = {
  string:   (v) => typeof v === 'string',
  number:   (v) => typeof v === 'number' && !Number.isNaN(v),
  boolean:  (v) => typeof v === 'boolean',
  array:    (v) => Array.isArray(v),
  object:   (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  func:     (v) => typeof v === 'function',
  defined:  (v) => v !== undefined && v !== null,
  uuid:     (v) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v),
  email:    (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  nonEmpty: (v) => (typeof v === 'string' && v.trim().length > 0) || (Array.isArray(v) && v.length > 0),
  positive: (v) => typeof v === 'number' && v > 0,
  date:     (v) => v instanceof Date ? !Number.isNaN(v.getTime()) : (typeof v === 'string' && !Number.isNaN(Date.parse(v))),
};

// ── Schema definition DSL ──────────────────────────────────────
// Schema: { fieldName: { type, required?, validator?, message? } }
// type can be a string key from `is` or a custom function.

/**
 * Validate a data object against a schema definition.
 *
 * @param {object} data
 * @param {object} schema  — { field: { type, required?, validator?, message? } }
 * @param {string} [label] — for logging context
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validate(data, schema, label = 'payload') {
  const errors = [];

  if (!is.object(data)) {
    errors.push(`${label}: expected object, got ${typeof data}`);
    return { valid: false, errors };
  }

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    const { type, required = true, validator, message } = rules;

    // Missing check
    if (!is.defined(value)) {
      if (required) errors.push(`${label}.${field}: required but missing`);
      continue;
    }

    // Type check
    if (type) {
      const checker = typeof type === 'function' ? type : is[type];
      if (checker && !checker(value)) {
        errors.push(message ?? `${label}.${field}: expected ${type}, got ${typeof value} (${JSON.stringify(value)?.slice(0, 40)})`);
      }
    }

    // Custom validator
    if (validator) {
      const result = validator(value, data);
      if (result !== true) {
        errors.push(result || `${label}.${field}: custom validation failed`);
      }
    }
  }

  const valid = errors.length === 0;
  if (!valid) {
    log.warn(`Validation failed [${label}]`, { errors });
    emit('qa:validation_failed', { label, errors });
  }
  return { valid, errors };
}

// ── Pre-built schemas for core entities ───────────────────────

export const SCHEMAS = {
  // Auth session
  session: {
    id:   { type: 'string',  required: true },
    role: { type: 'string',  required: true },
    name: { type: 'string',  required: false },
  },

  // Task
  task: {
    id:       { type: 'string',  required: true },
    title:    { type: 'nonEmpty', required: true },
    status:   { type: 'string',  required: true, validator: (v) => ['pending','in_progress','done','cancelled'].includes(v) || `invalid status: ${v}` },
    priority: { type: 'string',  required: false },
  },

  // Attendance check-in
  checkIn: {
    user_id:    { type: 'string',  required: true },
    check_in:   { type: 'string',  required: true },
    date:       { type: 'string',  required: true },
  },

  // Notification
  notification: {
    id:      { type: 'string',  required: true },
    type:    { type: 'string',  required: true },
    title:   { type: 'nonEmpty', required: true },
    user_id: { type: 'string',  required: true },
  },

  // CRM Lead
  lead: {
    id:     { type: 'string',  required: true },
    name:   { type: 'nonEmpty', required: true },
    status: { type: 'string',  required: true },
  },

  // Queue job
  queueJob: {
    id:      { type: 'string',  required: true },
    type:    { type: 'string',  required: true },
    payload: { type: 'object',  required: true },
  },

  // Comment
  comment: {
    id:          { type: 'string',  required: true },
    content:     { type: 'nonEmpty', required: true },
    author_id:   { type: 'string',  required: true },
    entity_type: { type: 'string',  required: true },
    entity_id:   { type: 'string',  required: true },
  },
};

// ── Convenience validators ─────────────────────────────────────

/** Validate and log; returns true if valid, false if not. */
export function guard(data, schemaKey, label) {
  const schema = SCHEMAS[schemaKey];
  if (!schema) {
    log.warn(`Unknown schema key: "${schemaKey}"`);
    return false;
  }
  const { valid } = validate(data, schema, label ?? schemaKey);
  return valid;
}

/** Throws a detailed error in dev, logs in prod. */
export function assertValid(data, schemaKey, label) {
  const { valid, errors } = validate(data, SCHEMAS[schemaKey] ?? {}, label ?? schemaKey);
  if (!valid) {
    const msg = `Validation failed [${label ?? schemaKey}]: ${errors.join('; ')}`;
    if (import.meta.env.DEV) throw new Error(msg);
    captureError(new Error(msg), { context: 'runtimeValidation', extra: { errors } });
  }
  return valid;
}

/** Validate an array of items against a schema. */
export function validateArray(items, schemaKey, label = 'array') {
  if (!Array.isArray(items)) return { valid: false, errors: [`${label}: expected array`] };
  const allErrors = [];
  items.forEach((item, i) => {
    const { errors } = validate(item, SCHEMAS[schemaKey] ?? {}, `${label}[${i}]`);
    allErrors.push(...errors);
  });
  return { valid: allErrors.length === 0, errors: allErrors };
}

// ── Null-safe field accessor ───────────────────────────────────
/**
 * Safely access a nested field with a fallback.
 * Guards against undefined property chains.
 */
export function safeGet(obj, path, fallback = null) {
  try {
    return path.split('.').reduce((acc, key) => acc?.[key], obj) ?? fallback;
  } catch {
    return fallback;
  }
}
