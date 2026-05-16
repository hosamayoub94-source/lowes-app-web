// =============================================================
// Automation Engine — Rule Builder
//
// Fluent, chainable API for building automation rules in code.
// Returns a plain rule object — does NOT write to the store.
// Pass the result to useAutomationStore.getState().addRule(rule).
//
// Usage:
//   const rule = createRule('Late attendance alert')
//     .onTrigger(TRIGGER_TYPE.ATTENDANCE_LATE)
//     .when(CONDITION_TYPE.GREATER_THAN, 'lateByMinutes', 15)
//     .andWhen(CONDITION_TYPE.IS_WEEKDAY)
//     .thenNotify({ userId: '{{employeeId}}', title: 'تأخر في الحضور' })
//     .withDebounce(5 * 60_000)   // 5 min
//     .withRetries(2)
//     .build();
// =============================================================
import {
  TRIGGER_TYPE,
  CONDITION_TYPE,
  ACTION_TYPE,
  RULE_STATE,
  CONDITION_OPERATOR,
} from './automationTypes';

// ── Factory ───────────────────────────────────────────────────

/**
 * Start building an automation rule.
 * @param {string} name
 * @returns {RuleBuilder}
 */
export function createRule(name) {
  return new RuleBuilder(name);
}

// ── Builder class ─────────────────────────────────────────────

class RuleBuilder {
  constructor(name) {
    this._rule = {
      name,
      description:       '',
      state:             RULE_STATE.ACTIVE,
      trigger:           { type: null },
      conditions:        [],
      conditionOperator: CONDITION_OPERATOR.AND,
      actions:           [],
      debounceMs:        0,
      delayMs:           0,
      maxRetries:        0,
      tags:              [],
      aiGenerated:       false,
    };
  }

  // ── Metadata ────────────────────────────────────────────────

  describe(description) {
    this._rule.description = description;
    return this;
  }

  tag(...tags) {
    this._rule.tags = [...this._rule.tags, ...tags];
    return this;
  }

  /** Start rule as paused (won't fire until manually activated). */
  asPaused() {
    this._rule.state = RULE_STATE.PAUSED;
    return this;
  }

  /** Mark as AI-generated (for future visual editor). */
  markAsAiGenerated() {
    this._rule.aiGenerated = true;
    return this;
  }

  // ── Trigger ─────────────────────────────────────────────────

  /**
   * Set the event trigger type.
   * @param {string} triggerType — TRIGGER_TYPE value
   * @param {object} [filter]   — optional payload filter hint (future use)
   */
  onTrigger(triggerType, filter = {}) {
    this._rule.trigger = { type: triggerType, filter };
    return this;
  }

  // ── Conditions ──────────────────────────────────────────────

  /**
   * Add a condition (AND by default).
   * @param {string} type    — CONDITION_TYPE value
   * @param {string} [field] — dot-notation field path in payload
   * @param {any}    [value] — comparison value
   * @param {object} [params]— extra params (e.g. { startHour, endHour })
   */
  when(type, field = null, value = null, params = {}) {
    this._rule.conditions.push({ type, field, value, params });
    return this;
  }

  /** Alias for when() — reads more naturally in chains. */
  andWhen(type, field = null, value = null, params = {}) {
    return this.when(type, field, value, params);
  }

  /** Add an OR condition (switches operator to OR for ALL conditions). */
  orWhen(type, field = null, value = null, params = {}) {
    this._rule.conditionOperator = CONDITION_OPERATOR.OR;
    return this.when(type, field, value, params);
  }

  /** Use OR logic for the full condition set. */
  useOrLogic() {
    this._rule.conditionOperator = CONDITION_OPERATOR.OR;
    return this;
  }

  // ── Condition shortcuts ──────────────────────────────────────

  whenRole(role)        { return this.when(CONDITION_TYPE.ROLE_IS, null, role); }
  whenWeekday()         { return this.when(CONDITION_TYPE.IS_WEEKDAY); }
  whenWeekend()         { return this.when(CONDITION_TYPE.IS_WEEKEND); }
  whenTimeBetween(s, e) { return this.when(CONDITION_TYPE.TIME_BETWEEN, null, null, { startHour: s, endHour: e }); }
  whenDays(days)        { return this.when(CONDITION_TYPE.DAY_OF_WEEK, null, null, { days }); }

  // ── Actions ─────────────────────────────────────────────────

  /**
   * Generic action adder.
   * @param {string} type   — ACTION_TYPE value
   * @param {object} params — action-specific parameters
   */
  then(type, params = {}) {
    this._rule.actions.push({ type, params });
    return this;
  }

  // ── Action shortcuts ─────────────────────────────────────────

  thenNotify(params)       { return this.then(ACTION_TYPE.SEND_NOTIFICATION, params); }
  thenRemind(params)       { return this.then(ACTION_TYPE.SEND_REMINDER,     params); }
  thenAudit(params)        { return this.then(ACTION_TYPE.CREATE_AUDIT_LOG,  params); }
  thenEnqueue(jobType, jobPayload = {}, opts = {}) {
    return this.then(ACTION_TYPE.ENQUEUE_JOB, { jobType, jobPayload, ...opts });
  }
  thenEscalate(params)     { return this.then(ACTION_TYPE.ESCALATE_TASK,   params); }
  thenWebhook(url, params) { return this.then(ACTION_TYPE.TRIGGER_WEBHOOK, { url, ...params }); }
  thenEmit(eventName, eventPayload = {}) {
    return this.then(ACTION_TYPE.EMIT_EVENT, { eventName, eventPayload });
  }
  thenLog(message)         { return this.then(ACTION_TYPE.LOG_CONSOLE, { message }); }

  // ── Timing ──────────────────────────────────────────────────

  /**
   * Debounce: skip re-execution within this window (ms).
   * @param {number} ms
   */
  withDebounce(ms) {
    this._rule.debounceMs = ms;
    return this;
  }

  /**
   * Delay action execution by ms after conditions are met.
   * @param {number} ms
   */
  withDelay(ms) {
    this._rule.delayMs = ms;
    return this;
  }

  /**
   * Retry failed actions up to N times.
   * @param {number} n
   */
  withRetries(n) {
    this._rule.maxRetries = n;
    return this;
  }

  // ── Build ────────────────────────────────────────────────────

  /**
   * Finalise and return the plain rule object.
   * @returns {object}
   */
  build() {
    if (!this._rule.trigger.type) {
      throw new Error(`Rule "${this._rule.name}": trigger type is required`);
    }
    return { ...this._rule };
  }
}

// ── Preset rule factories ─────────────────────────────────────
// Ready-made rules you can drop straight into addRule().

/**
 * Notify assigned user when a task is assigned to them.
 */
export function ruleNotifyOnTaskAssigned() {
  return createRule('إشعار عند تعيين مهمة')
    .describe('يرسل إشعاراً للموظف عند تعيين مهمة جديدة له')
    .onTrigger(TRIGGER_TYPE.TASK_ASSIGNED)
    .thenNotify({
      userId:    '{{assigneeId}}',
      notifType: 'task_assigned',
      title:     'تم تعيين مهمة جديدة لك',
      message:   'المهمة: {{taskTitle}}',
      entityType:'task',
      entityId:  '{{taskId}}',
    })
    .withDebounce(0)
    .build();
}

/**
 * Audit log + escalate when a task becomes overdue.
 */
export function ruleEscalateOverdueTasks() {
  return createRule('تصعيد المهام المتأخرة')
    .describe('يسجّل في المراجعة ويصعّد المهام المتأخرة')
    .onTrigger(TRIGGER_TYPE.TASK_OVERDUE)
    .thenAudit({ actionType: 'task_overdue', entityType: 'task' })
    .thenEscalate({})
    .withDebounce(30 * 60_000) // max once per 30 min per rule
    .withRetries(1)
    .build();
}

/**
 * Notify on late attendance.
 */
export function ruleNotifyLateAttendance() {
  return createRule('إشعار التأخر في الحضور')
    .describe('يرسل إشعاراً عند تسجيل تأخر في الحضور')
    .onTrigger(TRIGGER_TYPE.ATTENDANCE_LATE)
    .thenNotify({
      userId:    '{{employeeId}}',
      notifType: 'attendance_late',
      title:     'تسجيل تأخر في الحضور',
      message:   'تم تسجيل تأخرك بمقدار {{lateByMinutes}} دقيقة',
      entityType:'attendance',
    })
    .withDebounce(60 * 60_000) // once per hour
    .build();
}

/**
 * Log all critical audit events.
 */
export function ruleLogCriticalAuditEvents() {
  return createRule('تسجيل الأحداث الحرجة')
    .describe('يسجل جميع الأحداث الحرجة في سجل المراجعة')
    .onTrigger(TRIGGER_TYPE.AUDIT_CRITICAL_EVENT)
    .thenAudit({ actionType: 'critical_event_captured' })
    .withRetries(2)
    .build();
}
