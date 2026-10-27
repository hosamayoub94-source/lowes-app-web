// =============================================================
// main — Vite entry. Imports global styles, boots Event Bus, mounts <App />.
// =============================================================
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { supabase } from '@/services/supabase';

import './styles/theme.css';
import './styles/globals.css';

// ── Safe boot wrapper ─────────────────────────────────────────
// Prevents any crashing subsystem from killing the whole app.
function safeBoot(label, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`[Boot] ${label} failed — continuing:`, err);
  }
}

// Warn if any mock modules are active in production
if (!import.meta.env.DEV) {
  const mockModules = ['VITE_USE_MOCK_TASKS','VITE_USE_MOCK_ATTENDANCE','VITE_USE_MOCK_NOTIFICATIONS','VITE_USE_MOCK_ANALYTICS','VITE_USE_MOCK_AUDIT','VITE_USE_MOCK_FILES','VITE_USE_MOCK_CRM'];
  const active = mockModules.filter(k => String(import.meta.env[k] ?? '').toLowerCase() === 'true');
  if (active.length > 0) {
    console.warn('[PRODUCTION WARNING] Mock modules are active:', active.join(', '));
  }
}

// Non-visual integrations are started after the first paint below so they
// cannot block React's initial screen.

// ── Mount ──────────────────────────────────────────────────────
const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Keep all existing boot systems enabled, but start them after first paint.
// Dynamic imports also keep heavy QA/analytics modules out of the initial JS.
const idle = window.requestIdleCallback || ((cb) => window.setTimeout(cb, 0));
idle(async () => {
  const load = async (label, importer, run) => {
    try {
      const mod = await importer();
      run(mod);
    } catch (err) {
      console.error(`[Boot] ${label} deferred start failed — continuing:`, err);
    }
  };

  await load('Production', () => import('@/core/production'), (m) => safeBoot('Production', () => m.bootProductionLayer(supabase)));
  await load('EventListeners', () => import('@/core/events'), (m) => safeBoot('EventListeners', () => m.bootEventListeners()));
  await load('Queue', () => import('@/core/queue'), (m) => safeBoot('Queue', () => m.bootQueue()));
  await load('Automation', () => import('@/core/automation'), (m) => safeBoot('Automation', () => m.bootAutomation()));
  await load('AttendanceInteg', () => import('@modules/attendance'), (m) => safeBoot('AttendanceInteg', () => m.bootAttendanceIntegration()));
  await load('FileInteg', () => import('@modules/files/integrations/fileEventBus'), (m) => safeBoot('FileInteg', () => m.bootFileIntegration()));
  await load('AnalyticsInteg', () => import('@modules/analytics/integrations/analyticsEventBus'), (m) => safeBoot('AnalyticsInteg', () => m.bootAnalyticsIntegration()));
  await load('CRMInteg', () => import('@modules/crm/integrations/crmEventBus'), (m) => safeBoot('CRMInteg', () => m.bootCRMIntegration()));
  await load('EnvValidation', () => import('@/core/testing'), (m) => safeBoot('EnvValidation', () => m.validateEnvironment()));
  await load('TimerTracking', () => import('@/core/maintenance'), (m) => safeBoot('TimerTracking', () => m.patchTimerTracking()));
  await load('WorkflowMetrics', () => import('@/core/operations'), (m) => safeBoot('WorkflowMetrics', () => m.wireWorkflowMetricsToEventBus()));
  await load('PersistedMetrics', () => import('@/core/operations'), (m) => safeBoot('PersistedMetrics', () => {
    m.loadPersistedMetrics();
    m.loadPersistedProductivityMetrics();
    m.loadPersistedHeatmap();
  }));
  await load('MaintenanceCleanup', () => import('@/core/maintenance'), (m) => safeBoot('MaintenanceCleanup', () => m.scheduleMaintenanceCleanup()));
  await load('SWAutoUpdate', () => import('@/core/swUpdate'), (m) => safeBoot('SWAutoUpdate', () => m.bootServiceWorkerAutoUpdate()));
});
