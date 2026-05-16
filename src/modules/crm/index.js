/**
 * CRM Module — public barrel export
 * Import from '@modules/crm' instead of deep paths.
 */

// ── Types & constants ──────────────────────────────────────────────────────
export {
  LEAD_STATUS,
  LEAD_SOURCE,
  DEAL_STATUS,
  CUSTOMER_STATUS,
  ACTIVITY_TYPE,
  FOLLOWUP_TYPE,
  FOLLOWUP_STATUS,
  CRM_ROLE,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCE_ICONS,
  DEAL_STATUS_LABELS,
  DEAL_STATUS_COLORS,
  CUSTOMER_STATUS_LABELS,
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_ICONS,
  FOLLOWUP_TYPE_LABELS,
  FOLLOWUP_TYPE_ICONS,
  FOLLOWUP_STATUS_LABELS,
  FOLLOWUP_STATUS_COLORS,
  DEFAULT_STAGES,
  formatCurrency,
  getPipelineValue,
  getWinRate,
  getLeadConversionRate,
  countOverdueFollowups,
  daysFromNow,
} from './types/crm.types.js';

// ── Service ────────────────────────────────────────────────────────────────
export {
  fetchPipelines,
  fetchStages,
  fetchLeads,
  createLead,
  updateLead,
  deleteLead,
  convertLeadToCustomer,
  fetchDeals,
  createDeal,
  updateDealStage,
  updateDeal,
  deleteDeal,
  fetchCustomers,
  createCustomer,
  updateCustomer,
  assignSalesAgent,
  fetchActivities,
  addActivity,
  fetchFollowups,
  scheduleFollowup,
  completeFollowup,
  cancelFollowup,
  fetchNotes,
  addNote,
  deleteNote,
  searchCRM,
  fetchContacts,
  createContact,
  deleteContact,
} from './services/crmService.js';

// ── Store ──────────────────────────────────────────────────────────────────
export { default as useCRMStore } from './store/useCRMStore.js';

// ── Hooks ──────────────────────────────────────────────────────────────────
export {
  usePipelines,
  useStages,
  useActivePipelineId,
  useLeads,
  useDeals,
  useCustomers,
  useFollowups,
  useActivities,
  useNotes,
  useContacts,
  useSelectedDealId,
  useSelectedCustomerId,
  useSelectedLeadId,
  useCRMFilters,
  useCRMLoading,
  useCRMError,
  useActiveFollowups,
  useOverdueFollowups,
  useOpenDeals,
  useWonDeals,
  usePipelineKPIs,
  useDealsGroupedByStage,
  useDeal,
  useCustomer,
  useLead,
  useCRMActions,
  useCRMBootstrap,
  usePipelineBoard,
  useLeadPanel,
  useDealDetail,
  useCustomerProfile,
  useFollowupPanel,
  useCRMSearch,
  useCRMDashboard,
} from './hooks/useCRM.js';

// ── UI Components ──────────────────────────────────────────────────────────
export { default as LeadCard }           from './components/LeadCard.jsx';
export { default as DealCard }           from './components/DealCard.jsx';
export { default as PipelineKanban }     from './components/PipelineKanban.jsx';
export { default as CustomerProfile }    from './components/CustomerProfile.jsx';
export { default as FollowupScheduler }  from './components/FollowupScheduler.jsx';
export { default as SalesTimeline }      from './components/SalesTimeline.jsx';

// ── Pages ──────────────────────────────────────────────────────────────────
export { default as CRMDashboard } from './pages/CRMDashboard.jsx';

// ── Integration ────────────────────────────────────────────────────────────
export { bootCRMIntegration } from './integrations/crmEventBus.js';

// ── Dev monitor (null in prod) ─────────────────────────────────────────────
export { default as DevCRMMonitor } from './monitor/DevCRMMonitor.jsx';
