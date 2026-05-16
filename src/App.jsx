// =============================================================
// App — top-level component. Wires the router, theme bootstrap,
// production safety layer, rollout layer, and global providers.
// No business logic lives here.
// =============================================================
import { BrowserRouter }         from 'react-router-dom';
import { ThemeBoot }             from '@context/ThemeBoot';
import { AuthBoot }              from '@context/AuthBoot';
import { AppRoutes }             from '@routes/AppRoutes';

// Production layer
import { SystemHealthBanner }    from '@/core/production/SystemHealthBanner';
import { ProductionInspector }   from '@/core/production/ProductionInspector';
import {
  initErrorReporter,
  initOfflineRecovery,
  initHealthEngine,
} from '@/core/production';

// Rollout layer
import { OnboardingFlow }        from '@/core/rollout/onboarding/OnboardingFlow';
import { ConfirmDialog }         from '@/core/rollout/safety/ConfirmDialog';
import { FeedbackWidget }        from '@/core/rollout/feedback/FeedbackWidget';
import { GlobalSuccessToasts }   from '@/core/rollout/ux/SuccessFeedback';
import { RolloutInspector }      from '@/core/rollout/inspector/RolloutInspector';
import { HelpProvider }          from '@/core/rollout/help/HelpLayer';

// Testing / QA layer (DEV tools — no-ops in production)
import { DevToolbar }            from '@/core/testing/debug/devToolbar';
import { QADashboardModal }      from '@/core/testing/dashboard/OperationalDashboard';

// Boot migrations on app start
import '@/core/testing/migration/safeMigrationRunner';

// Maintenance layer
import { MaintenanceDashboardModal }           from '@/core/maintenance/dashboard/MaintenanceDashboard';
import {
  scheduleMaintenanceCleanup,
  initWorkspaceOptimizer,
  hydrateFromStorage,
} from '@/core/maintenance';

// Operations layer
import { OperationalInsightsModal }            from '@/core/operations/dashboard/OperationalInsightsDashboard';
import {
  initUsageTracker,
  wireWorkflowMetricsToEventBus,
  loadPersistedHeatmap,
  loadPersistedProductivityMetrics,
} from '@/core/operations';

// ── Boot sequence ─────────────────────────────────────────────
// Production layer — must be first
initErrorReporter();
initOfflineRecovery();
initHealthEngine();

// Maintenance layer
scheduleMaintenanceCleanup();
initWorkspaceOptimizer();
hydrateFromStorage();

// Operations layer — load persisted data + wire event bus
initUsageTracker();
wireWorkflowMetricsToEventBus();
loadPersistedHeatmap();
loadPersistedProductivityMetrics();

// ─────────────────────────────────────────────────────────────

export default function App() {
  return (
    <HelpProvider>
      <ThemeBoot>
        {/* System-wide status ribbon (offline / reconnecting / degraded) */}
        <SystemHealthBanner />

        {/* Global success toasts */}
        <GlobalSuccessToasts />

        {/* Imperative confirm dialog — registered with safetyGuards */}
        <ConfirmDialog />

        <AuthBoot>
          <BrowserRouter>
            {/* Onboarding overlay — shows on first login, role-aware */}
            <OnboardingFlow />

            <AppRoutes />
          </BrowserRouter>
        </AuthBoot>

        {/* Feedback FAB — visible to all employees */}
        <FeedbackWidget />

        {/* Dev inspectors — Ctrl+Shift+I (production) + Ctrl+Shift+R (rollout) */}
        <ProductionInspector />
        <RolloutInspector />

        {/* QA Dashboard overlay — Ctrl+Shift+Q */}
        <QADashboardModal />

        {/* Maintenance Dashboard overlay — Ctrl+Shift+M */}
        <MaintenanceDashboardModal />

        {/* Operations Insights overlay — Ctrl+Shift+O */}
        <OperationalInsightsModal />

        {/* Dev toolbar — fixed bottom strip, DEV only, Ctrl+Shift+D */}
        <DevToolbar />
      </ThemeBoot>
    </HelpProvider>
  );
}
