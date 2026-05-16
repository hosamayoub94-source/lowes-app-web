// =============================================================
// Automation Engine — Core Rule Evaluation & Execution
//
// evaluate(triggerType, payload) is the single entry point.
// It is called by the event bus integration for each event.
//
// Flow per event:
//   1. Filter rules by trigger type + ACTIVE state
//   2. Debounce check (skip if rule ran too recently)
//   3. Evaluate conditions (AND / OR)
//   4. Execute actions (parallel, isolated, with optional delay)
//   5. Retry failed actions up to rule.maxRetries
//   6. Record execution history via store callback
//
// Design principles:
//   • Engine is stateless — reads rules from store on each call
//   • All state mutations go through the store (injected at boot)
//   • No React imports — engine runs outside component tree
//   • Failure of one rule never crashes evaluation of others
// =============================================================
import { RULE_STATE, EXEC_STATUS } from './automationTypes';
import { evaluateConditions }       from './conditionEvaluator';
import { executeActions }           from './actionExecutor';

// ── Engine State ──────────────────────────────────────────────

let _store      = null;   // automationStore (Zustand) — injected at boot
let _context    = {};     // global context (currentUser etc.) — updated externally

// Per-rule debounce tracking: Map<ruleId, lastRunTimestamp>
const _debounceMap = new Map();

let _seq = 1;
const _execId = () => `exec_${Date.now()}_${String(_seq++).padStart(4, '0')}`;

// ── Injection ─────────────────────────────────────────────────

/**
 * Inject the Zustand automation store reference.
 * Must be called once at boot before any evaluate() calls.
 */
export function configureEngine({ store }) {
  _store = store;
}

/**
 * Update global context available to conditions and actions.
 * Call this when auth state changes, etc.
 */
export function setEngineContext(ctx) {
  _context = { ..._context, ...ctx };
}

// ── Public API ────────────────────────────────────────────────

/**
 * Evaluate all active rules for a given trigger type.
 * Returns array of execution records (for logging/monitoring).
 *
 * @param {string} triggerType — TRIGGER_TYPE value
 * @param {object} payload     — event bus payload
 * @returns {Promise<object[]>} — execution records
 */
export async function evaluate(triggerType, payload) {
  if (!_store) return [];

  const { rules } = _store.getState();

  // Filter: matching trigger + ACTIVE state
  const candidates = rules.filter(
    (r) => r.trigger.type === triggerType && r.state === RULE_STATE.ACTIVE,
  );

  if (!candidates.length) return [];

  // Process rules concurrently, isolated per rule
  const results = await Promise.all(
    candidates.map((rule) => _evaluateRule(rule, payload)),
  );

  return results.filter(Boolean);
}

// ── Rule evaluator ────────────────────────────────────────────

async function _evaluateRule(rule, payload) {
  const execId  = _execId();
  const startMs = Date.now();

  try {
    // ── Debounce ──────────────────────────────────────────────
    if (rule.debounceMs > 0) {
      const lastRun = _debounceMap.get(rule.id) ?? 0;
      if (Date.now() - lastRun < rule.debounceMs) {
        return _record({
          id: execId, ruleId: rule.id, ruleName: rule.name,
          triggerType: rule.trigger.type, payload,
          status: EXEC_STATUS.DEBOUNCED,
          conditionsMet: null,
          actionsExecuted: [],
          startedAt: startMs,
          durationMs: Date.now() - startMs,
        });
      }
    }

    // ── Condition evaluation (synchronous, fast) ──────────────
    const conditionsMet = evaluateConditions(
      rule.conditions ?? [],
      payload,
      rule.conditionOperator,
      _context,
    );

    if (!conditionsMet) {
      return _record({
        id: execId, ruleId: rule.id, ruleName: rule.name,
        triggerType: rule.trigger.type, payload,
        status: EXEC_STATUS.SKIPPED,
        conditionsMet: false,
        actionsExecuted: [],
        startedAt: startMs,
        durationMs: Date.now() - startMs,
      });
    }

    // Update debounce timestamp
    if (rule.debounceMs > 0) _debounceMap.set(rule.id, Date.now());

    // ── Action execution with optional delay ──────────────────
    const context = {
      ruleId:      rule.id,
      ruleName:    rule.name,
      triggerType: rule.trigger.type,
      ..._context,
    };

    let actionsExecuted;

    if (rule.delayMs > 0) {
      // Delayed execution — schedule and return immediately
      setTimeout(async () => {
        const results = await _executeWithRetry(rule, payload, context);
        _record({
          id: execId, ruleId: rule.id, ruleName: rule.name,
          triggerType: rule.trigger.type, payload,
          status: _deriveStatus(results),
          conditionsMet: true,
          actionsExecuted: results,
          startedAt: startMs,
          durationMs: Date.now() - startMs,
          delayed: true,
        });
      }, rule.delayMs);

      // Return a provisional record
      actionsExecuted = [];
      return _record({
        id: execId, ruleId: rule.id, ruleName: rule.name,
        triggerType: rule.trigger.type, payload,
        status: EXEC_STATUS.SUCCESS,
        conditionsMet: true,
        actionsExecuted,
        startedAt: startMs,
        durationMs: Date.now() - startMs,
        delayed: true,
        delayMs: rule.delayMs,
      });
    }

    actionsExecuted = await _executeWithRetry(rule, payload, context);

    const rec = {
      id: execId, ruleId: rule.id, ruleName: rule.name,
      triggerType: rule.trigger.type, payload,
      status: _deriveStatus(actionsExecuted),
      conditionsMet: true,
      actionsExecuted,
      startedAt: startMs,
      durationMs: Date.now() - startMs,
    };

    _record(rec);
    return rec;

  } catch (err) {
    const rec = {
      id: execId, ruleId: rule.id, ruleName: rule.name,
      triggerType: rule.trigger.type, payload,
      status: EXEC_STATUS.ERROR,
      conditionsMet: null,
      actionsExecuted: [],
      error: err?.message ?? String(err),
      startedAt: startMs,
      durationMs: Date.now() - startMs,
    };
    _record(rec);
    return rec;
  }
}

// ── Retry wrapper ─────────────────────────────────────────────

/**
 * Execute all actions, then retry failed ones up to rule.maxRetries.
 */
async function _executeWithRetry(rule, payload, context) {
  const maxRetries = rule.maxRetries ?? 0;
  let results = await executeActions(rule.actions ?? [], payload, context);

  // Collect failed actions
  let failed = results
    .map((r, i) => ({ result: r, action: rule.actions[i] }))
    .filter(({ result }) => !result.success);

  let attempt = 0;
  while (failed.length > 0 && attempt < maxRetries) {
    attempt++;
    await _sleep(500 * Math.pow(2, attempt - 1)); // 500ms, 1s, 2s…

    const retryResults = await executeActions(
      failed.map(({ action }) => action),
      payload,
      context,
    );

    // Merge retry results back
    let retryIdx = 0;
    results = results.map((r) => {
      if (!r.success) {
        const retry = retryResults[retryIdx++];
        return retry ?? r;
      }
      return r;
    });

    failed = results
      .map((r, i) => ({ result: r, action: rule.actions[i] }))
      .filter(({ result }) => !result.success);
  }

  return results;
}

// ── Helpers ───────────────────────────────────────────────────

function _deriveStatus(actionsExecuted) {
  if (!actionsExecuted.length)        return EXEC_STATUS.SUCCESS;
  const allOk   = actionsExecuted.every((a) => a.success);
  const someOk  = actionsExecuted.some((a) => a.success);
  if (allOk)  return EXEC_STATUS.SUCCESS;
  if (someOk) return EXEC_STATUS.PARTIAL;
  return EXEC_STATUS.FAILED;
}

function _record(entry) {
  _store?.getState()._recordExecution(entry);
  return entry;
}

function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
