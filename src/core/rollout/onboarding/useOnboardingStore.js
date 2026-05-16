// =============================================================
// useOnboardingStore — Persisted onboarding state
//
// Tracks first-login detection, step completion, role-based
// flow, and preferences gathered during setup.
// =============================================================
import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';

// ── Step definitions per role ──────────────────────────────────
export const ONBOARDING_STEPS = {
  WELCOME:      'welcome',
  PROFILE:      'profile',
  ROLE_GUIDE:   'role_guide',
  WALKTHROUGH:  'walkthrough',
  SHORTCUTS:    'shortcuts',
  DONE:         'done',
};

export const ROLE_STEPS = {
  default:       [ONBOARDING_STEPS.WELCOME, ONBOARDING_STEPS.ROLE_GUIDE, ONBOARDING_STEPS.WALKTHROUGH, ONBOARDING_STEPS.SHORTCUTS],
  admin:         [ONBOARDING_STEPS.WELCOME, ONBOARDING_STEPS.ROLE_GUIDE, ONBOARDING_STEPS.WALKTHROUGH, ONBOARDING_STEPS.SHORTCUTS],
  manager:       [ONBOARDING_STEPS.WELCOME, ONBOARDING_STEPS.ROLE_GUIDE, ONBOARDING_STEPS.WALKTHROUGH, ONBOARDING_STEPS.SHORTCUTS],
  sales_manager: [ONBOARDING_STEPS.WELCOME, ONBOARDING_STEPS.ROLE_GUIDE, ONBOARDING_STEPS.WALKTHROUGH, ONBOARDING_STEPS.SHORTCUTS],
};

export const useOnboardingStore = create(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        // ── State ──────────────────────────────────────────────
        completed:         false,     // onboarding fully done
        skipped:           false,     // user explicitly skipped
        currentStep:       ONBOARDING_STEPS.WELCOME,
        completedSteps:    [],        // array of completed step keys
        userId:            null,      // tracks which user completed
        completedAt:       null,
        showOnNextLogin:   false,     // force re-show (e.g. after major update)

        // Preferences captured during onboarding
        preferences: {
          compactMode:        false,
          mobileMode:         null,   // null = auto-detect
          notificationsOn:    true,
          language:           'ar',
        },

        // ── Actions ────────────────────────────────────────────
        /** Call with the authenticated userId to check if onboarding is needed */
        checkShouldOnboard(userId) {
          const { completed, skipped, userId: storedId, showOnNextLogin } = get();
          if (showOnNextLogin) return true;
          if (userId !== storedId) return true;   // new user on this device
          return !completed && !skipped;
        },

        startOnboarding(userId) {
          set({
            userId,
            completed:      false,
            skipped:        false,
            currentStep:    ONBOARDING_STEPS.WELCOME,
            completedSteps: [],
            showOnNextLogin: false,
          });
        },

        nextStep(role = 'default') {
          const steps    = ROLE_STEPS[role] ?? ROLE_STEPS.default;
          const { currentStep, completedSteps } = get();
          const idx      = steps.indexOf(currentStep);
          const newCompleted = completedSteps.includes(currentStep)
            ? completedSteps
            : [...completedSteps, currentStep];

          if (idx >= steps.length - 1) {
            // Last step — mark done
            set({ completed: true, completedSteps: newCompleted, completedAt: Date.now(), currentStep: ONBOARDING_STEPS.DONE });
          } else {
            set({ currentStep: steps[idx + 1], completedSteps: newCompleted });
          }
        },

        prevStep(role = 'default') {
          const steps = ROLE_STEPS[role] ?? ROLE_STEPS.default;
          const { currentStep } = get();
          const idx = steps.indexOf(currentStep);
          if (idx > 0) set({ currentStep: steps[idx - 1] });
        },

        goToStep(step) {
          set({ currentStep: step });
        },

        skipOnboarding() {
          set({ skipped: true, completedAt: Date.now() });
        },

        completeOnboarding(userId) {
          set({ completed: true, skipped: false, userId, completedAt: Date.now(), currentStep: ONBOARDING_STEPS.DONE });
        },

        setPreference(key, value) {
          set((s) => ({ preferences: { ...s.preferences, [key]: value } }));
        },

        /** Re-trigger onboarding on next login (e.g., after major feature update) */
        scheduleReonboarding() {
          set({ showOnNextLogin: true, completed: false });
        },

        reset() {
          set({
            completed: false, skipped: false,
            currentStep: ONBOARDING_STEPS.WELCOME,
            completedSteps: [], userId: null, completedAt: null,
            showOnNextLogin: false,
          });
        },
      }),
      {
        name:    '__rollout_onboarding',
        version: 1,
        partialize: (s) => ({
          completed:       s.completed,
          skipped:         s.skipped,
          currentStep:     s.currentStep,
          completedSteps:  s.completedSteps,
          userId:          s.userId,
          completedAt:     s.completedAt,
          showOnNextLogin: s.showOnNextLogin,
          preferences:     s.preferences,
        }),
      }
    )
  )
);
