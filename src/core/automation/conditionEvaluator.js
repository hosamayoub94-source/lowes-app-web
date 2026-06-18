// =============================================================
// Automation Engine — Condition Evaluator
//
// Pure, synchronous, side-effect-free.
// evaluateConditions(conditions, payload, operator) → boolean
//
// Each condition shape:
//   { type, field?, value?, params? }
//
// "field" supports dot-notation: "user.role", "task.priority"
// =============================================================
import { CONDITION_TYPE, CONDITION_OPERATOR } from './automationTypes';

// ── Field resolver (dot-notation) ────────────────────────────

/**
 * Safely read a nested field from an object using dot notation.
 * Returns undefined if the path doesn't exist.
 *
 * @param {object} obj
 * @param {string} path — e.g. "user.role", "task.lateByMinutes"
 * @returns {any}
 */
function getField(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((cur, key) => {
    if (cur === null || cur === undefined) return undefined;
    return cur[key];
  }, obj);
}

// ── Single condition evaluator ────────────────────────────────

/**
 * Evaluate a single condition against the event payload.
 *
 * @param {object} condition — { type, field, value, params }
 * @param {object} payload   — event bus payload
 * @param {object} [context] — extra context (e.g. { currentUser })
 * @returns {boolean}
 */
export function evaluateCondition(condition, payload, context = {}) {
  const { type, field, value, params = {} } = condition;
  const fieldVal = field ? getField(payload, field) : undefined;

  switch (type) {
    // ── Always / Never ────────────────────────────────────────
    case CONDITION_TYPE.ALWAYS:
      return true;
    case CONDITION_TYPE.NEVER:
      return false;

    // ── Equality ──────────────────────────────────────────────
    case CONDITION_TYPE.EQUALS:
       
      return fieldVal == value; // intentional loose equality (string '3' == 3)
    case CONDITION_TYPE.NOT_EQUALS:
       
      return fieldVal != value;

    // ── Numeric comparisons ───────────────────────────────────
    case CONDITION_TYPE.GREATER_THAN:
      return Number(fieldVal) > Number(value);
    case CONDITION_TYPE.LESS_THAN:
      return Number(fieldVal) < Number(value);
    case CONDITION_TYPE.GREATER_OR_EQ:
      return Number(fieldVal) >= Number(value);
    case CONDITION_TYPE.LESS_OR_EQ:
      return Number(fieldVal) <= Number(value);

    // ── String / array checks ─────────────────────────────────
    case CONDITION_TYPE.CONTAINS: {
      if (Array.isArray(fieldVal)) return fieldVal.includes(value);
      return String(fieldVal ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
    }
    case CONDITION_TYPE.NOT_CONTAINS: {
      if (Array.isArray(fieldVal)) return !fieldVal.includes(value);
      return !String(fieldVal ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
    }
    case CONDITION_TYPE.STARTS_WITH:
      return String(fieldVal ?? '').toLowerCase().startsWith(String(value ?? '').toLowerCase());
    case CONDITION_TYPE.ENDS_WITH:
      return String(fieldVal ?? '').toLowerCase().endsWith(String(value ?? '').toLowerCase());
    case CONDITION_TYPE.IS_EMPTY:
      return fieldVal === null || fieldVal === undefined || fieldVal === '' ||
             (Array.isArray(fieldVal) && fieldVal.length === 0);
    case CONDITION_TYPE.IS_NOT_EMPTY:
      return !(fieldVal === null || fieldVal === undefined || fieldVal === '' ||
               (Array.isArray(fieldVal) && fieldVal.length === 0));
    case CONDITION_TYPE.IN_LIST: {
      const list = Array.isArray(value) ? value : [value];
      return list.some((v) => {
         
        return v == fieldVal;
      });
    }
    case CONDITION_TYPE.NOT_IN_LIST: {
      const list = Array.isArray(value) ? value : [value];
       
      return !list.some((v) => v == fieldVal);
    }

    // ── Role checks ───────────────────────────────────────────
    case CONDITION_TYPE.ROLE_IS: {
      // Check payload.role OR context.currentUser.role
      const role = getField(payload, 'role')
                ?? getField(payload, 'user.role')
                ?? context?.currentUser?.role;
      if (Array.isArray(value)) return value.includes(role);
      return role === value;
    }
    case CONDITION_TYPE.ROLE_IS_NOT: {
      const role = getField(payload, 'role')
                ?? getField(payload, 'user.role')
                ?? context?.currentUser?.role;
      if (Array.isArray(value)) return !value.includes(role);
      return role !== value;
    }

    // ── Time-based ────────────────────────────────────────────
    case CONDITION_TYPE.TIME_BETWEEN: {
      const now   = new Date();
      const hour  = now.getHours();
      const { startHour = 0, endHour = 23 } = params;
      return hour >= startHour && hour < endHour;
    }
    case CONDITION_TYPE.DAY_OF_WEEK: {
      const now     = new Date();
      const day     = now.getDay(); // 0=Sun, 6=Sat
      const { days = [] } = params;
      return days.includes(day);
    }
    case CONDITION_TYPE.IS_WEEKEND: {
      const day = new Date().getDay();
      return day === 0 || day === 6;
    }
    case CONDITION_TYPE.IS_WEEKDAY: {
      const day = new Date().getDay();
      return day >= 1 && day <= 5;
    }

    default:
      // Unknown condition type → treat as false (safe default)
      console.warn(`[Automation] Unknown condition type: "${type}"`);
      return false;
  }
}

// ── Multi-condition evaluator ─────────────────────────────────

/**
 * Evaluate an array of conditions against a payload.
 *
 * @param {object[]} conditions — array of condition objects
 * @param {object}   payload    — event bus payload
 * @param {string}   operator   — CONDITION_OPERATOR.AND | OR
 * @param {object}  [context]   — extra context
 * @returns {boolean}
 */
export function evaluateConditions(
  conditions,
  payload,
  operator = CONDITION_OPERATOR.AND,
  context  = {},
) {
  if (!conditions || conditions.length === 0) return true; // no conditions → always run

  if (operator === CONDITION_OPERATOR.OR) {
    return conditions.some((c) => evaluateCondition(c, payload, context));
  }

  // AND (default)
  return conditions.every((c) => evaluateCondition(c, payload, context));
}
