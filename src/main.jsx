// =============================================================
// main — Vite entry. Imports global styles, boots Event Bus, mounts <App />.
// =============================================================
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { bootEventListeners }        from '@/core/events';
import { bootQueue }                 from '@/core/queue';
import { bootAutomation }            from '@/core/automation';
import { bootAttendanceIntegration } from '@modules/attendance';
import { bootFileIntegration }       from '@modules/files/integrations/fileEventBus';
import { bootAnalyticsIntegration }  from '@modules/analytics/integrations/analyticsEventBus';
import { bootCRMIntegration }        from '@modules/crm/integrations/crmEventBus';
import {
  wireWorkflowMetricsToEventBus,
  loadPersistedMetrics,
  loadPersistedProductivityMetrics,
  loadPersistedHeatmap,
} from '@/core/operations';
import { patchTimerTracking, scheduleMaintenanceCleanup } from '@/core/maintenance';
import { validateEnvironment } from '@/core/testing';
import { bootProductionLayer } from '@/core/production';
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

// ── Boot sequence (each wrapped — one bad subsystem won't kill the app) ──
// Production hardening first so error capture wraps the rest of the boot.
safeBoot('Production',           () => bootProductionLayer(supabase));
safeBoot('EventListeners',      () => bootEventListeners());
safeBoot('Queue',               () => bootQueue());
safeBoot('Automation',          () => bootAutomation());
safeBoot('AttendanceInteg',     () => bootAttendanceIntegration());
safeBoot('FileInteg',           () => bootFileIntegration());
safeBoot('AnalyticsInteg',      () => bootAnalyticsIntegration());
safeBoot('CRMInteg',            () => bootCRMIntegration());
safeBoot('EnvValidation',       () => validateEnvironment());
safeBoot('TimerTracking',       () => patchTimerTracking());
safeBoot('WorkflowMetrics',     () => wireWorkflowMetricsToEventBus());
safeBoot('PersistedMetrics',    () => { loadPersistedMetrics(); loadPersistedProductivityMetrics(); loadPersistedHeatmap(); });
safeBoot('MaintenanceCleanup',  () => scheduleMaintenanceCleanup());

// ── Mount ──────────────────────────────────────────────────────
const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
