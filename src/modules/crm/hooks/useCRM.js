/**
 * CRM Hooks
 * Selector hooks + compound hooks for the CRM module.
 */

import { useEffect, useCallback, useRef } from 'react';
import useCRMStore from '../store/useCRMStore.js';

// ── Primitive selectors ────────────────────────────────────────────────────

export const usePipelines = () => useCRMStore(s => s.pipelines);
export const useStages = () => useCRMStore(s => s.stages);
export const useActivePipelineId = () => useCRMStore(s => s.activePipelineId);

export const useLeads = () => useCRMStore(s => s.leads);
export const useDeals = () => useCRMStore(s => s.deals);
export const useCustomers = () => useCRMStore(s => s.customers);
export const useFollowups = () => useCRMStore(s => s.followups);
export const useActivities = () => useCRMStore(s => s.activities);
export const useNotes = () => useCRMStore(s => s.notes);
export const useContacts = () => useCRMStore(s => s.contacts);

export const useSelectedDealId = () => useCRMStore(s => s.selectedDealId);
export const useSelectedCustomerId = () => useCRMStore(s => s.selectedCustomerId);
export const useSelectedLeadId = () => useCRMStore(s => s.selectedLeadId);

export const useCRMFilters = () => useCRMStore(s => s.filters);
export const useCRMLoading = () => useCRMStore(s => s.loading);
export const useCRMError = () => useCRMStore(s => s.error);

// ── Derived selectors ──────────────────────────────────────────────────────

/**
 * Returns only pending + overdue followups (what needs action today).
 */
export const useActiveFollowups = () =>
  useCRMStore(s =>
    s.followups.filter(f => f.status === 'pending' || f.status === 'overdue')
  );

export const useOverdueFollowups = () =>
  useCRMStore(s => s.followups.filter(f => f.status === 'overdue'));

export const useOpenDeals = () =>
  useCRMStore(s => s.deals.filter(d => d.status === 'open'));

export const useWonDeals = () =>
  useCRMStore(s => s.deals.filter(d => d.status === 'won'));

/**
 * Returns pipeline KPIs: win rate, pipeline value, overdue count, etc.
 */
export const usePipelineKPIs = () => useCRMStore(s => s.getPipelineKPIs());

/**
 * Returns deals grouped by stage as a map: { [stageId]: Deal[] }
 */
export const useDealsGroupedByStage = () =>
  useCRMStore(s => {
    const map = {};
    s.stages.forEach(st => {
      map[st.id] = s.deals.filter(
        d => d.stage_id === st.id && d.status !== 'archived'
      );
    });
    return map;
  });

/**
 * Find a single deal by ID.
 */
export const useDeal = id =>
  useCRMStore(s => s.deals.find(d => d.id === id) ?? null);

/**
 * Find a single customer by ID.
 */
export const useCustomer = id =>
  useCRMStore(s => s.customers.find(c => c.id === id) ?? null);

/**
 * Find a single lead by ID.
 */
export const useLead = id =>
  useCRMStore(s => s.leads.find(l => l.id === id) ?? null);

// ── Action hooks ───────────────────────────────────────────────────────────

export const useCRMActions = () =>
  useCRMStore(s => ({
    // Leads
    createLead: s.createLead,
    updateLead: s.updateLead,
    deleteLead: s.deleteLead,
    convertLead: s.convertLead,

    // Deals
    createDeal: s.createDeal,
    moveDeal: s.moveDeal,
    updateDeal: s.updateDeal,
    deleteDeal: s.deleteDeal,

    // Customers
    createCustomer: s.createCustomer,
    updateCustomer: s.updateCustomer,

    // Activities & Notes
    addActivity: s.addActivity,
    addNote: s.addNote,
    deleteNote: s.deleteNote,

    // Followups
    scheduleFollowup: s.scheduleFollowup,
    completeFollowup: s.completeFollowup,
    cancelFollowup: s.cancelFollowup,

    // Contacts
    createContact: s.createContact,

    // Assignment
    assignAgent: s.assignAgent,

    // Search
    searchCRM: s.searchCRM,

    // Selection
    selectDeal: s.selectDeal,
    selectCustomer: s.selectCustomer,
    selectLead: s.selectLead,

    // Filters
    setFilters: s.setFilters,
    resetFilters: s.resetFilters,

    // Pipeline
    setActivePipeline: s.setActivePipeline,

    // Misc
    clearError: s.clearError,
    loadActivities: s.loadActivities,
    loadNotes: s.loadNotes,
    loadFollowups: s.loadFollowups,
  }));

// ── Compound hooks ─────────────────────────────────────────────────────────

/**
 * Bootstrap hook — initializes the CRM store for the current user
 * and tears it down on unmount. Safe to call from multiple components.
 */
export function useCRMBootstrap(userId) {
  const init = useCRMStore(s => s.init);
  const teardown = useCRMStore(s => s.teardown);
  const initialized = useCRMStore(s => s._initialized);

  useEffect(() => {
    if (userId) init(userId);
    return () => teardown();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { initialized };
}

/**
 * Kanban board data: ordered stages + deals grouped by stage.
 */
export function usePipelineBoard() {
  const stages = useStages();
  const dealsMap = useDealsGroupedByStage();
  const kpis = usePipelineKPIs();
  const { moveDeal } = useCRMActions();
  const loading = useCRMLoading();

  return {
    stages,
    dealsMap,
    kpis,
    moveDeal,
    isLoading: loading.pipeline || loading.deals,
  };
}

/**
 * Lead management panel — leads list + create/update/convert actions.
 */
export function useLeadPanel() {
  const leads = useLeads();
  const filters = useCRMFilters();
  const loading = useCRMLoading();
  const { createLead, updateLead, deleteLead, convertLead, setFilters, resetFilters } =
    useCRMActions();

  return {
    leads,
    filters,
    isLoading: loading.leads,
    isSubmitting: loading.action,
    createLead,
    updateLead,
    deleteLead,
    convertLead,
    setFilters,
    resetFilters,
  };
}

/**
 * Deal detail panel — deal + its activities + notes + followups.
 */
export function useDealDetail(dealId) {
  const deal = useDeal(dealId);
  const activities = useActivities();
  const notes = useNotes();
  const followups = useFollowups();
  const loading = useCRMLoading();
  const { addActivity, addNote, deleteNote, scheduleFollowup, completeFollowup } =
    useCRMActions();

  const dealActivities = activities.filter(a => a.deal_id === dealId);
  const dealNotes = notes.filter(n => n.deal_id === dealId);
  const dealFollowups = followups.filter(f => f.deal_id === dealId);

  return {
    deal,
    activities: dealActivities,
    notes: dealNotes,
    followups: dealFollowups,
    isLoading: loading.activities || loading.notes || loading.followups,
    isSubmitting: loading.action,
    addActivity,
    addNote,
    deleteNote,
    scheduleFollowup,
    completeFollowup,
  };
}

/**
 * Customer profile panel — customer + contacts + activities + deals.
 */
export function useCustomerProfile(customerId) {
  const customer = useCustomer(customerId);
  const contacts = useContacts();
  const activities = useActivities();
  const deals = useDeals();
  const notes = useNotes();
  const loading = useCRMLoading();
  const { createContact, addActivity, addNote, updateCustomer, assignAgent } = useCRMActions();

  const customerContacts = contacts.filter(c => c.customer_id === customerId);
  const customerDeals = deals.filter(d => d.customer_id === customerId);
  const customerActivities = activities.filter(a => a.customer_id === customerId);
  const customerNotes = notes.filter(n => n.customer_id === customerId);

  return {
    customer,
    contacts: customerContacts,
    deals: customerDeals,
    activities: customerActivities,
    notes: customerNotes,
    isLoading: loading.customers || loading.contacts || loading.activities,
    isSubmitting: loading.action,
    createContact,
    addActivity,
    addNote,
    updateCustomer: data => updateCustomer(customerId, data),
    assignAgent: agentId => assignAgent('customer', customerId, agentId),
  };
}

/**
 * Followup scheduler panel — upcoming + overdue followups for current user.
 */
export function useFollowupPanel() {
  const followups = useFollowups();
  const loading = useCRMLoading();
  const { scheduleFollowup, completeFollowup, cancelFollowup, loadFollowups } = useCRMActions();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const overdue = followups.filter(f => f.status === 'overdue');
  const dueToday = followups.filter(f => {
    if (f.status !== 'pending') return false;
    const due = new Date(f.due_at);
    return due >= today && due < tomorrow;
  });
  const upcoming = followups.filter(f => {
    if (f.status !== 'pending') return false;
    const due = new Date(f.due_at);
    return due >= tomorrow;
  });
  const completed = followups.filter(f => f.status === 'done');

  return {
    all: followups,
    overdue,
    dueToday,
    upcoming,
    completed,
    isLoading: loading.followups,
    isSubmitting: loading.action,
    scheduleFollowup,
    completeFollowup,
    cancelFollowup,
    refresh: loadFollowups,
  };
}

/**
 * CRM search hook — debounced query with results.
 */
export function useCRMSearch() {
  const { searchCRM } = useCRMActions();
  const loading = useCRMLoading();
  const timerRef = useRef(null);

  const search = useCallback(
    (query, callback) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        const results = await searchCRM(query);
        callback?.(results);
      }, 350);
    },
    [searchCRM]
  );

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { search, isSearching: loading.search };
}

/**
 * Single hook returning everything needed for the CRM dashboard overview.
 */
export function useCRMDashboard() {
  const kpis = usePipelineKPIs();
  const stages = useStages();
  const dealsMap = useDealsGroupedByStage();
  const overdueFollowups = useOverdueFollowups();
  const recentDeals = useDeals().slice(0, 5);
  const loading = useCRMLoading();

  return {
    kpis,
    stages,
    dealsMap,
    overdueFollowups,
    recentDeals,
    isLoading: loading.pipeline || loading.deals || loading.followups,
  };
}
