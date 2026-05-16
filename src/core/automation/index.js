// =============================================================
// Automation Engine — Public Barrel Export
// Always import from '@/core/automation' — never from internals.
// =============================================================

// ── Types & Constants ─────────────────────────────────────────
export {
  RULE_STATE,
  TRIGGER_TYPE,
  CONDITION_TYPE,
  CONDITION_OPERATOR,
  ACTION_TYPE,
  EXEC_STATUS,
  ACTION_CONFIG,
  DEFAULT_ACTION_CONFIG,
  RULE_STATE_LABELS,
  TRIGGER_TYPE_LABELS,
  ACTION_TYPE_LABELS,
  CONDITION_TYPE_LABELS,
  RULE_STATE_COLORS,
  EXEC_STATUS_COLORS,
} from './automationTypes';

// ── Condition evaluator (pure) ────────────────────────────────
export {
  evaluateCondition,
  evaluateConditions,
} from './conditionEvaluator';

// ── Action executor ───────────────────────────────────────────
export {
  executeAction,
  executeActions,
} from './actionExecutor';

// ── Engine ────────────────────────────────────────────────────
export {
  configureEngine,
  setEngineContext,
  evaluate,
} from './automationEngine';

// ── Store ─────────────────────────────────────────────────────
export {
  useAutomationStore,
  hydrateAutomation,
  clearPersistedAutomation,
} from './automationStore';

// ── React hooks ───────────────────────────────────────────────
export {
  useAutomation,
  useAutomationRules,
  useRule,
  useAutomationHistory,
  useRuleHistory,
  useAutomationStats,
  useAutomationEnabled,
  useAddRule,
  useSetRuleState,
  useActiveRuleCount,
} from './useAutomation';

// ── Rule builder ──────────────────────────────────────────────
export {
  createRule,
  ruleNotifyOnTaskAssigned,
  ruleEscalateOverdueTasks,
  ruleNotifyLateAttendance,
  ruleLogCriticalAuditEvents,
} from './ruleBuilder';

// ── Event bus bridge ──────────────────────────────────────────
export {
  registerAutomationBridge,
  unregisterAutomationBridge,
} from './eventBusIntegration';

// ── Bootstrap ─────────────────────────────────────────────────
export {
  bootAutomation,
  shutdownAutomation,
  isAutomationBooted,
} from './bootstrap';

// ── Monitor UI ────────────────────────────────────────────────
export { AutomationMonitor }      from './monitor/AutomationMonitor';
export { DevAutomationInspector } from './monitor/DevAutomationInspector';
