// =============================================================
// Automation Engine — React Hooks
//
// useAutomationRules()     — all rules (filtered/sorted)
// useAutomationHistory()   — execution history
// useAutomationStats()     — live stats object
// useAutomationEnabled()   — global on/off
// useRule(id)              — single rule
// useRuleHistory(id)       — executions for one rule
// useAddRule()             — stable addRule reference
// =============================================================
import { useCallback }         from 'react';
import { useAutomationStore }  from './automationStore';
import { RULE_STATE }          from './automationTypes';

// ── Full store (escape hatch) ─────────────────────────────────

export function useAutomation() {
  return useAutomationStore();
}

// ── Rules ─────────────────────────────────────────────────────

/**
 * Returns all rules, optionally filtered by state.
 * @param {string|null} [stateFilter] — RULE_STATE value or null for all
 * @returns {object[]}
 */
export function useAutomationRules(stateFilter = null) {
  return useAutomationStore((s) =>
    stateFilter ? s.rules.filter((r) => r.state === stateFilter) : s.rules,
  );
}

/**
 * Returns a single rule by ID or null.
 * @param {string} id
 */
export function useRule(id) {
  return useAutomationStore((s) => s.rules.find((r) => r.id === id) ?? null);
}

// ── History ───────────────────────────────────────────────────

/**
 * Returns execution history, most recent first.
 * @param {number} [limit=50]
 * @returns {object[]}
 */
export function useAutomationHistory(limit = 50) {
  return useAutomationStore((s) => s.history.slice(0, limit));
}

/**
 * Returns execution history for a specific rule.
 * @param {string} ruleId
 * @param {number} [limit=20]
 */
export function useRuleHistory(ruleId, limit = 20) {
  return useAutomationStore((s) =>
    s.history.filter((h) => h.ruleId === ruleId).slice(0, limit),
  );
}

// ── Stats ─────────────────────────────────────────────────────

/**
 * Returns live automation statistics.
 * @returns {{ totalRules, activeRules, pausedRules, disabledRules,
 *             totalExecutions, successCount, failedCount, skippedCount, avgDuration }}
 */
export function useAutomationStats() {
  return useAutomationStore((s) => s.getStats());
}

// ── Global enable / disable ───────────────────────────────────

/**
 * Returns [enabled, setEnabled] — controls the entire engine.
 * @returns {[boolean, function]}
 */
export function useAutomationEnabled() {
  const enabled    = useAutomationStore((s) => s.enabled);
  const setEnabled = useAutomationStore((s) => s.setEnabled);
  return [enabled, setEnabled];
}

// ── Stable action references ──────────────────────────────────

/**
 * Stable addRule function — won't change between renders.
 * @returns {(ruleDef: object) => string}
 */
export function useAddRule() {
  const addRule = useAutomationStore((s) => s.addRule);
  return useCallback((ruleDef) => addRule(ruleDef), [addRule]);
}

/**
 * Stable rule-state setter.
 * @returns {(id: string, state: string) => void}
 */
export function useSetRuleState() {
  const setRuleState = useAutomationStore((s) => s.setRuleState);
  return useCallback((id, state) => setRuleState(id, state), [setRuleState]);
}

/**
 * Returns active rule count (for badge displays).
 * @returns {number}
 */
export function useActiveRuleCount() {
  return useAutomationStore(
    (s) => s.rules.filter((r) => r.state === RULE_STATE.ACTIVE).length,
  );
}
