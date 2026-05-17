// =============================================================
// Automation Engine — Action Executor
//
// Executes a single automation action asynchronously.
// Each action is isolated — failure of one won't stop others.
// Services are lazy-imported to prevent circular dependencies.
//
// executeAction(action, payload, context) → ActionResult
//   ActionResult: { type, success, error, durationMs }
// =============================================================
import { ACTION_TYPE, ACTION_CONFIG, DEFAULT_ACTION_CONFIG } from './automationTypes';

// ── Execute single action ─────────────────────────────────────

/**
 * Execute one action derived from a triggered rule.
 *
 * @param {object} action  — { type, params }
 * @param {object} payload — original event bus payload (trigger context)
 * @param {object} context — { ruleId, ruleName, triggerType, currentUser? }
 * @returns {Promise<{ type, success, error, durationMs }>}
 */
export async function executeAction(action, payload, context = {}) {
  const { type, params = {} } = action;
  const cfg = ACTION_CONFIG[type] ?? DEFAULT_ACTION_CONFIG;
  const start = Date.now();

  try {
    await Promise.race([
      _dispatch(type, params, payload, context),
      _timeout(cfg.timeoutMs, type),
    ]);

    return { type, success: true, error: null, durationMs: Date.now() - start };
  } catch (err) {
    return {
      type,
      success:   false,
      error:     err?.message ?? String(err),
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Execute all actions for a rule in parallel.
 * Returns results for all, even if some failed.
 *
 * @param {object[]} actions
 * @param {object}   payload
 * @param {object}   context
 * @returns {Promise<Array<{ type, success, error, durationMs }>>}
 */
export async function executeActions(actions, payload, context = {}) {
  if (!actions?.length) return [];
  return Promise.all(actions.map((a) => executeAction(a, payload, context)));
}

// ── Action dispatcher ─────────────────────────────────────────

async function _dispatch(type, params, payload, context) {
  switch (type) {

    // ── SEND_NOTIFICATION ─────────────────────────────────────
    case ACTION_TYPE.SEND_NOTIFICATION: {
      const { sendNotification } = await import(
        '@modules/notifications/services/notificationService'
      );
      // params: { userId?, userIds?, type, title, message, entityType?, entityId? }
      const recipients = params.userIds
        ?? (params.userId ? [params.userId] : [])
        ?? _extractRecipients(payload, params);

      if (!recipients.length && params.userId) {
        await sendNotification({
          userId:     params.userId,
          type:       params.notifType ?? 'system',
          title:      _interpolate(params.title ?? 'إشعار تلقائي', payload),
          message:    _interpolate(params.message ?? '', payload),
          entityType: params.entityType ?? null,
          entityId:   params.entityId   ?? null,
          metadata:   { automationRule: context.ruleId, ...params.metadata },
        });
      } else if (recipients.length) {
        const { sendBulkNotifications } = await import(
          '@modules/notifications/services/notificationService'
        );
        await sendBulkNotifications(recipients, {
          type:       params.notifType ?? 'system',
          title:      _interpolate(params.title ?? 'إشعار تلقائي', payload),
          message:    _interpolate(params.message ?? '', payload),
          entityType: params.entityType ?? null,
          entityId:   params.entityId   ?? null,
          metadata:   { automationRule: context.ruleId, ...params.metadata },
        });
      }
      break;
    }

    // ── SEND_REMINDER ─────────────────────────────────────────
    case ACTION_TYPE.SEND_REMINDER: {
      const { sendNotification } = await import(
        '@modules/notifications/services/notificationService'
      );
      await sendNotification({
        userId:   params.userId ?? payload?.assigneeId ?? payload?.userId,
        type:     'reminder',
        title:    _interpolate(params.title ?? 'تذكير تلقائي', payload),
        message:  _interpolate(params.message ?? '', payload),
        metadata: { automationRule: context.ruleId, isReminder: true },
        skipDedup: params.skipDedup ?? false,
      });
      break;
    }

    // ── CREATE_AUDIT_LOG ──────────────────────────────────────
    case ACTION_TYPE.CREATE_AUDIT_LOG: {
      // Lazy import audit service — may not be in all builds
      try {
        const { logActivity } = await import('@modules/audit/services/auditService');
        await logActivity({
          actionType:  params.actionType ?? 'automation_triggered',
          entityType:  params.entityType ?? context.triggerType ?? 'automation',
          entityId:    params.entityId   ?? context.ruleId,
          entityLabel: params.entityLabel ?? context.ruleName,
          metadata:    { triggerPayload: payload, ruleId: context.ruleId },
        });
      } catch (_) {
        // Audit service might not exist — silently skip
      }
      break;
    }

    // ── ENQUEUE_JOB ───────────────────────────────────────────
    case ACTION_TYPE.ENQUEUE_JOB: {
      const { useQueueStore } = await import('@/core/queue/queueStore');
      useQueueStore.getState().enqueue(
        params.jobType,
        { ...params.jobPayload, _trigger: payload },
        {
          priority:        params.priority,
          idempotencyKey:  params.idempotencyKey ?? null,
        },
      );
      break;
    }

    // ── ESCALATE_TASK ─────────────────────────────────────────
    case ACTION_TYPE.ESCALATE_TASK: {
      const { emit, EVENTS } = await import('@/core/events');
      emit(EVENTS.AUDIT_CRITICAL_EVENT, {
        actionType:  'task_escalated',
        entityType:  'task',
        entityId:    params.taskId ?? payload?.taskId,
        entityLabel: params.taskTitle ?? payload?.taskTitle ?? 'مهمة',
        adminIds:    params.adminIds ?? [],
        escalatedBy: 'automation',
        ruleId:      context.ruleId,
        severity:    'critical',
      });
      break;
    }

    // ── TRIGGER_WEBHOOK ───────────────────────────────────────
    case ACTION_TYPE.TRIGGER_WEBHOOK: {
      if (!params.url) throw new Error('TRIGGER_WEBHOOK: missing params.url');

      const body = {
        event:    context.triggerType,
        ruleId:   context.ruleId,
        ruleName: context.ruleName,
        payload,
        timestamp: new Date().toISOString(),
        ...params.body,
      };

      const res = await fetch(params.url, {
        method:  params.method ?? 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(params.headers ?? {}),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`Webhook ${params.url} returned HTTP ${res.status}`);
      }
      break;
    }

    // ── EMIT_EVENT ────────────────────────────────────────────
    case ACTION_TYPE.EMIT_EVENT: {
      if (!params.eventName) throw new Error('EMIT_EVENT: missing params.eventName');
      const { emit } = await import('@/core/events');
      emit(params.eventName, {
        ...(params.eventPayload ?? {}),
        _source:  'automation',
        _ruleId:  context.ruleId,
        _trigger: payload,
      });
      break;
    }

    // ── LOG_CONSOLE ───────────────────────────────────────────
    case ACTION_TYPE.LOG_CONSOLE: {
      // eslint-disable-next-line no-console
      console.log(
        `[Automation] Rule "${context.ruleName}" (${context.ruleId}) fired:`,
        params.message ?? '',
        { payload, context },
      );
      break;
    }

    default:
      throw new Error(`Unknown action type: "${type}"`);
  }
}

// ── Helpers ───────────────────────────────────────────────────

function _timeout(ms, type) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Action "${type}" timed out after ${ms}ms`)), ms),
  );
}

/**
 * Basic string interpolation: replace {{field}} tokens with payload values.
 * e.g. "مهمة {{taskTitle}} متأخرة" + { taskTitle: 'Setup' } → "مهمة Setup متأخرة"
 */
function _interpolate(template, payload) {
  if (!template || !payload) return template ?? '';
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
    const val = path.split('.').reduce((o, k) => o?.[k], payload);
    return val !== undefined ? String(val) : '';
  });
}

/**
 * Try to extract recipient IDs from the event payload using common field names.
 */
function _extractRecipients(payload, params) {
  if (params.recipientFields) {
    return params.recipientFields.flatMap((f) => {
      const v = payload?.[f];
      return Array.isArray(v) ? v : v ? [v] : [];
    });
  }
  // Common fields
  const candidates = [
    payload?.assigneeId,
    payload?.userId,
    ...(payload?.managerIds ?? []),
    ...(payload?.adminIds ?? []),
    ...(payload?.recipientIds ?? []),
  ];
  return [...new Set(candidates.filter(Boolean))];
}
