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
import { bootFileIntegration }        from '@modules/files/integrations/fileEventBus';
import { bootAnalyticsIntegration }  from '@modules/analytics/integrations/analyticsEventBus';
import { bootCRMIntegration }        from '@modules/crm/integrations/crmEventBus';

import './styles/theme.css';
import './styles/globals.css';

// 1. Wire cross-module event listeners.
bootEventListeners();

// 2. Boot the background job queue (hydrates persistence, starts worker).
bootQueue();

// 3. Boot the automation rule engine (hydrates rules, wires event bridge).
bootAutomation();

// 4. Wire attendance event bus bridges (check-in/out → notifications + queue).
bootAttendanceIntegration();

// 5. Wire file management event bus bridges (uploads → notifications + queue).
bootFileIntegration();

// 6. Wire analytics event bus bridges (attendance/tasks/files → realtime counters + KPI alerts).
bootAnalyticsIntegration();

// 7. Wire CRM event bus bridges (leads/deals/followups → notifications + queue + audit).
bootCRMIntegration();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
