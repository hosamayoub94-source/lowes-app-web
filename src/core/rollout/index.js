// =============================================================
// src/core/rollout/index.js
// Final Rollout & Operational Readiness Layer — barrel export
// =============================================================

// ── Onboarding ─────────────────────────────────────────────────
export { useOnboardingStore, ONBOARDING_STEPS, ROLE_STEPS } from './onboarding/useOnboardingStore';
export { OnboardingFlow }  from './onboarding/OnboardingFlow';

// ── Session Recovery ───────────────────────────────────────────
export {
  restoreSession, saveSession, getSession, clearSession, clearLastSession,
  setActiveSection, getActiveSection,
  saveScrollPosition, getScrollPosition,
  saveFilters, getFilters, clearFilters,
  saveDraft, getDraft, getDraftsByType, clearDraft, clearAllDrafts,
  savePendingAction, getPendingActions, removePendingAction,
  saveWidgetVisibility, getWidgetVisibility,
  saveCompactMode, getCompactMode,
} from './session/sessionRecovery';
export { useSessionRecovery } from './session/useSessionRecovery';

// ── Safety Guards ──────────────────────────────────────────────
export {
  guardDelete, guardBatch, guardDuplicate,
  validateRequired, validateTransition, guardUnsavedChanges, guardRequiredAction,
  registerConfirmHandler,
} from './safety/safetyGuards';
export { ConfirmDialog, useConfirm }  from './safety/ConfirmDialog';
export { SafeActionButton }           from './safety/SafeActionButton';

// ── Admin ──────────────────────────────────────────────────────
export { useAdminOps }               from './admin/useAdminOps';
export { AdminOperationsCenter }     from './admin/AdminOperationsCenter';

// ── Mobile ────────────────────────────────────────────────────
export { useMobileMode }             from './mobile/useMobileMode';
export { MobileNav }                 from './mobile/MobileNav';

// ── Help Layer ─────────────────────────────────────────────────
export {
  HelpProvider, useHelpVisible,
  HelpTooltip, ShortcutHint, OnboardingHint, ContextualHelp,
} from './help/HelpLayer';

// ── Personalization ────────────────────────────────────────────
export { usePersonalizationStore }   from './personalization/usePersonalizationStore';

// ── Smart Reminders ────────────────────────────────────────────
export { useSmartReminders }         from './reminders/useSmartReminders';

// ── Feedback ──────────────────────────────────────────────────
export { FeedbackWidget }            from './feedback/FeedbackWidget';

// ── Operational Metrics ────────────────────────────────────────
export {
  trackAction, getTopActions,
  trackSectionEnter, getNavStats,
  startWorkflow, completeWorkflow, getWorkflowStats,
  trackFriction, getFrictionStats,
  getMetricsSnapshot, clearMetrics,
} from './metrics/operationalMetrics';

// ── UX Polish ─────────────────────────────────────────────────
export { EmptyState }                from './ux/EmptyState';
export {
  SuccessFlash, SuccessBadge, LoadingPulse, ActionFeedback,
  GlobalSuccessToasts, showSuccessToast,
  useSuccessFeedback,
} from './ux/SuccessFeedback';

// ── Dev Inspector ──────────────────────────────────────────────
export { RolloutInspector }          from './inspector/RolloutInspector';
