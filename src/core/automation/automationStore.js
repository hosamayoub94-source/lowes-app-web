// =============================================================
// Automation Engine — Zustand Store
//
// State:
//   rules      — array of automation rule objects
//   history    — last N execution records (capped at MAX_HISTORY)
//   enabled    — global engine on/off switch
//
// Actions:
//   addRule(rule)
//   updateRule(id, patch)
//   removeRule(id)
//   setRuleState(id, RULE_STATE)
//   clearHistory()
//   setEnabled(bool)
//
// Internal (used by engine):
//   _recordExecution(entry)
//
// Selectors:
//   getStats()
// =============================================================
import { create }        from 'zustand';
import { RULE_STATE }    from './automationTypes';

const MAX_HISTORY = 200; // keep last 200 execution records in memory
const PERSIST_KEY = '__automation_rules';

let _seq = 1;
const _ruleId = () =>
  `rule_${Date.now()}_${String(_seq++).padStart(4, '0')}`;

// ── Store ─────────────────────────────────────────────────────

export const useAutomationStore = create((set, get) => ({
  // ── State ─────────────────────────────────────────────────
  rules:   [],
  history: [],
  enabled: true,

  // ── Rule management ───────────────────────────────────────

  /**
   * Add a new automation rule.
   * @param {object} ruleDef — partial rule (id, state, timestamps auto-assigned)
   * @returns {string} ruleId
   */
  addRule(ruleDef) {
    const rule = {
      id:                _ruleId(),
      name:              ruleDef.name ?? 'Untitled Rule',
      description:       ruleDef.description ?? '',
      state:             ruleDef.state ?? RULE_STATE.ACTIVE,
      trigger:           ruleDef.trigger ?? { type: null },
      conditions:        ruleDef.conditions ?? [],
      conditionOperator: ruleDef.conditionOperator ?? 'AND',
      actions:           ruleDef.actions ?? [],
      debounceMs:        ruleDef.debounceMs ?? 0,
      delayMs:           ruleDef.delayMs    ?? 0,
      maxRetries:        ruleDef.maxRetries ?? 0,
      tags:              ruleDef.tags ?? [],
      // AI / future fields
      aiGenerated:       ruleDef.aiGenerated ?? false,
      version:           1,
      createdAt:         Date.now(),
      updatedAt:         Date.now(),
    };

    set((s) => ({ rules: [...s.rules, rule] }));
    _persist(get);
    return rule.id;
  },

  /**
   * Merge a patch into an existing rule.
   * @param {string} id
   * @param {object} patch
   */
  updateRule(id, patch) {
    set((s) => ({
      rules: s.rules.map((r) =>
        r.id === id
          ? { ...r, ...patch, updatedAt: Date.now(), version: (r.version ?? 1) + 1 }
          : r,
      ),
    }));
    _persist(get);
  },

  /**
   * Delete a rule by ID.
   * @param {string} id
   */
  removeRule(id) {
    set((s) => ({ rules: s.rules.filter((r) => r.id !== id) }));
    _persist(get);
  },

  /**
   * Change a rule's operational state (active / paused / disabled).
   * @param {string} id
   * @param {string} state — RULE_STATE value
   */
  setRuleState(id, state) {
    get().updateRule(id, { state });
  },

  /** Turn the entire automation engine on or off. */
  setEnabled(enabled) {
    set({ enabled });
  },

  /** Remove all execution history entries. */
  clearHistory() {
    set({ history: [] });
  },

  // ── Internal (engine-only) ────────────────────────────────

  /**
   * Record an execution entry into history.
   * Caps at MAX_HISTORY entries (FIFO eviction).
   * @param {object} entry
   */
  _recordExecution(entry) {
    set((s) => {
      const updated = [entry, ...s.history];
      return { history: updated.slice(0, MAX_HISTORY) };
    });
  },

  // ── Selectors ─────────────────────────────────────────────

  /**
   * Compute live statistics.
   * @returns {{ totalRules, activeRules, pausedRules, disabledRules,
   *             totalExecutions, successCount, failedCount, skippedCount }}
   */
  getStats() {
    const { rules, history } = get();
    const totalRules    = rules.length;
    const activeRules   = rules.filter((r) => r.state === RULE_STATE.ACTIVE).length;
    const pausedRules   = rules.filter((r) => r.state === RULE_STATE.PAUSED).length;
    const disabledRules = rules.filter((r) => r.state === RULE_STATE.DISABLED).length;

    const totalExecutions = history.length;
    const successCount    = history.filter((h) => h.status === 'success').length;
    const failedCount     = history.filter((h) =>
      h.status === 'failed' || h.status === 'error' || h.status === 'partial',
    ).length;
    const skippedCount    = history.filter((h) =>
      h.status === 'skipped' || h.status === 'debounced',
    ).length;

    const avgDuration = totalExecutions > 0
      ? Math.round(history.reduce((sum, h) => sum + (h.durationMs ?? 0), 0) / totalExecutions)
      : 0;

    return {
      totalRules, activeRules, pausedRules, disabledRules,
      totalExecutions, successCount, failedCount, skippedCount,
      avgDuration,
    };
  },
}));

// ── Persistence ───────────────────────────────────────────────
// Persist rules only (history is ephemeral).

let _persistTimer = null;

function _persist(get) {
  if (_persistTimer) return;
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify(get().rules));
    } catch (_) { /* quota / private mode */ }
  }, 300);
}

/** Hydrate rules from localStorage. Call once at boot. */
export function hydrateAutomation() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (raw) {
      const rules = JSON.parse(raw);
      useAutomationStore.setState({ rules });
    }
  } catch (_) {
    useAutomationStore.setState({ rules: [] });
  }
}

/** Wipe persisted rules. */
export function clearPersistedAutomation() {
  try { localStorage.removeItem(PERSIST_KEY); } catch (_) { /* تجاهل */ }
}
