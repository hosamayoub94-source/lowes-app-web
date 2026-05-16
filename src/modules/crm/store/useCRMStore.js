/**
 * CRM Zustand Store
 * Enterprise CRM & Sales Pipeline — State management
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import {
  DEAL_STATUS,
  FOLLOWUP_STATUS,
  CRM_REALTIME_INTERVAL_MS,
  FOLLOWUP_OVERDUE_CHECK_MS,
  getPipelineValue,
  getWinRate,
  getLeadConversionRate,
  countOverdueFollowups,
} from '../types/crm.types.js';

// ── Initial state ──────────────────────────────────────────────────────────

const INITIAL_FILTERS = {
  stageId: null,
  assignedTo: null,
  search: '',
  dateRange: null, // { from, to }
  tags: [],
  status: null,
  source: null,
};

const INITIAL_STATE = {
  // Pipeline
  pipelines: [],
  stages: [],
  activePipelineId: null,

  // CRM entities
  leads: [],
  deals: [],
  customers: [],
  followups: [],
  activities: [],
  notes: [],
  contacts: [],

  // Selection
  selectedDealId: null,
  selectedCustomerId: null,
  selectedLeadId: null,

  // UI filters
  filters: { ...INITIAL_FILTERS },

  // Loading flags
  loading: {
    pipeline: false,
    leads: false,
    deals: false,
    customers: false,
    followups: false,
    activities: false,
    notes: false,
    contacts: false,
    action: false,
    search: false,
  },

  error: null,

  // Internal
  _userId: null,
  _realtimeChannel: null,
  _realtimeTimer: null,
  _overdueTimer: null,
  _initialized: false,
};

// ── Store ──────────────────────────────────────────────────────────────────

const useCRMStore = create()(
  subscribeWithSelector((set, get) => ({
    ...INITIAL_STATE,

    // ── Init / Teardown ──────────────────────────────────────────────────

    /**
     * Bootstrap CRM store for a given user.
     * Idempotent — calling again is a no-op if already initialized for same user.
     */
    async init(userId) {
      if (get()._initialized && get()._userId === userId) return;

      set({ _userId: userId, _initialized: true, error: null });

      await get().loadPipeline();
      await Promise.all([
        get().loadLeads(),
        get().loadDeals(),
        get().loadCustomers(),
        get().loadFollowups(),
      ]);

      get()._startRealtime();
      get()._startOverdueCheck();
    },

    teardown() {
      get()._stopRealtime();
      get()._stopOverdueCheck();
      set({ ...INITIAL_STATE });
    },

    // ── Pipeline ─────────────────────────────────────────────────────────

    async loadPipeline() {
      const { _setLoading, activePipelineId } = get();
      _setLoading('pipeline', true);
      try {
        const { fetchPipelines, fetchStages } = await import('../services/crmService.js');
        const pipelines = await fetchPipelines();

        let targetId = activePipelineId;
        if (!targetId && pipelines.length > 0) {
          const def = pipelines.find(p => p.is_default) ?? pipelines[0];
          targetId = def.id;
        }

        const stages = targetId ? await fetchStages(targetId) : [];
        set({ pipelines, stages, activePipelineId: targetId });
      } catch (err) {
        set({ error: err.message });
      } finally {
        _setLoading('pipeline', false);
      }
    },

    setActivePipeline(pipelineId) {
      set({ activePipelineId: pipelineId });
      get().loadPipeline();
    },

    // ── Leads ─────────────────────────────────────────────────────────────

    async loadLeads(filters = {}) {
      get()._setLoading('leads', true);
      try {
        const { fetchLeads } = await import('../services/crmService.js');
        const leads = await fetchLeads({ ...get().filters, ...filters });
        set({ leads });
      } catch (err) {
        set({ error: err.message });
      } finally {
        get()._setLoading('leads', false);
      }
    },

    async createLead(data) {
      get()._setLoading('action', true);
      try {
        const { createLead } = await import('../services/crmService.js');
        const lead = await createLead(data);
        set(s => ({ leads: [lead, ...s.leads] }));

        // Emit event
        const { emit, EVENT_TYPES, EVENT_SOURCES } = await import('@/core/events/eventBus.js');
        emit(EVENT_TYPES.LEAD_CREATED, { lead }, { source: EVENT_SOURCES.CRM });

        return lead;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    async updateLead(id, data) {
      get()._setLoading('action', true);
      try {
        const { updateLead } = await import('../services/crmService.js');
        const updated = await updateLead(id, data);
        set(s => ({ leads: s.leads.map(l => (l.id === id ? updated : l)) }));
        return updated;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    async deleteLead(id) {
      get()._setLoading('action', true);
      try {
        const { deleteLead } = await import('../services/crmService.js');
        await deleteLead(id);
        set(s => ({ leads: s.leads.filter(l => l.id !== id) }));
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    async convertLead(leadId, dealData = {}) {
      get()._setLoading('action', true);
      try {
        const { convertLeadToCustomer } = await import('../services/crmService.js');
        const { customer, deal } = await convertLeadToCustomer(leadId, dealData);

        set(s => ({
          leads: s.leads.map(l =>
            l.id === leadId ? { ...l, status: 'converted', customer_id: customer.id } : l
          ),
          customers: [customer, ...s.customers],
          deals: [deal, ...s.deals],
        }));

        const { emit, EVENT_TYPES, EVENT_SOURCES } = await import('@/core/events/eventBus.js');
        emit(EVENT_TYPES.CUSTOMER_CREATED, { customer }, { source: EVENT_SOURCES.CRM });

        return { customer, deal };
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    // ── Deals ─────────────────────────────────────────────────────────────

    async loadDeals(filters = {}) {
      get()._setLoading('deals', true);
      try {
        const { fetchDeals } = await import('../services/crmService.js');
        const deals = await fetchDeals({ pipelineId: get().activePipelineId, ...filters });
        set({ deals });
      } catch (err) {
        set({ error: err.message });
      } finally {
        get()._setLoading('deals', false);
      }
    },

    async createDeal(data) {
      get()._setLoading('action', true);
      try {
        const { createDeal } = await import('../services/crmService.js');
        const deal = await createDeal({ pipeline_id: get().activePipelineId, ...data });
        set(s => ({ deals: [deal, ...s.deals] }));
        return deal;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    /**
     * Move deal to a new stage (Kanban drag-drop).
     */
    async moveDeal(dealId, stageId) {
      const { stages } = get();
      const stage = stages.find(s => s.id === stageId);
      const prevDeal = get().deals.find(d => d.id === dealId);
      if (!prevDeal) return;

      // Optimistic update
      const optimistic = {
        ...prevDeal,
        stage_id: stageId,
        status: stage?.is_won
          ? DEAL_STATUS.WON
          : stage?.is_lost
            ? DEAL_STATUS.LOST
            : DEAL_STATUS.OPEN,
      };
      set(s => ({ deals: s.deals.map(d => (d.id === dealId ? optimistic : d)) }));

      try {
        const { updateDealStage } = await import('../services/crmService.js');
        const updated = await updateDealStage(dealId, stageId, get()._userId);
        set(s => ({ deals: s.deals.map(d => (d.id === dealId ? updated : d)) }));

        const { emit, EVENT_TYPES, EVENT_SOURCES } = await import('@/core/events/eventBus.js');
        emit(
          EVENT_TYPES.DEAL_STAGE_CHANGED,
          { deal: updated, prevStageId: prevDeal.stage_id, newStageId: stageId },
          { source: EVENT_SOURCES.CRM }
        );

        return updated;
      } catch (err) {
        // Rollback
        set(s => ({ deals: s.deals.map(d => (d.id === dealId ? prevDeal : d)) }));
        set({ error: err.message });
        throw err;
      }
    },

    async updateDeal(id, data) {
      get()._setLoading('action', true);
      try {
        const { updateDeal } = await import('../services/crmService.js');
        const updated = await updateDeal(id, data);
        set(s => ({ deals: s.deals.map(d => (d.id === id ? updated : d)) }));
        return updated;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    async deleteDeal(id) {
      get()._setLoading('action', true);
      try {
        const { deleteDeal } = await import('../services/crmService.js');
        await deleteDeal(id);
        set(s => ({
          deals: s.deals.filter(d => d.id !== id),
          selectedDealId: get().selectedDealId === id ? null : get().selectedDealId,
        }));
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    // ── Customers ─────────────────────────────────────────────────────────

    async loadCustomers(filters = {}) {
      get()._setLoading('customers', true);
      try {
        const { fetchCustomers } = await import('../services/crmService.js');
        const customers = await fetchCustomers(filters);
        set({ customers });
      } catch (err) {
        set({ error: err.message });
      } finally {
        get()._setLoading('customers', false);
      }
    },

    async createCustomer(data) {
      get()._setLoading('action', true);
      try {
        const { createCustomer } = await import('../services/crmService.js');
        const customer = await createCustomer(data);
        set(s => ({ customers: [customer, ...s.customers] }));

        const { emit, EVENT_TYPES, EVENT_SOURCES } = await import('@/core/events/eventBus.js');
        emit(EVENT_TYPES.CUSTOMER_CREATED, { customer }, { source: EVENT_SOURCES.CRM });

        return customer;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    async updateCustomer(id, data) {
      get()._setLoading('action', true);
      try {
        const { updateCustomer } = await import('../services/crmService.js');
        const updated = await updateCustomer(id, data);
        set(s => ({ customers: s.customers.map(c => (c.id === id ? updated : c)) }));
        return updated;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    // ── Activities ────────────────────────────────────────────────────────

    async loadActivities(filters = {}) {
      get()._setLoading('activities', true);
      try {
        const { fetchActivities } = await import('../services/crmService.js');
        const activities = await fetchActivities(filters);
        set({ activities });
      } catch (err) {
        set({ error: err.message });
      } finally {
        get()._setLoading('activities', false);
      }
    },

    async addActivity(data) {
      get()._setLoading('action', true);
      try {
        const { addActivity } = await import('../services/crmService.js');
        const activity = await addActivity({ ...data, user_id: get()._userId });
        set(s => ({ activities: [activity, ...s.activities] }));
        return activity;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    // ── Followups ─────────────────────────────────────────────────────────

    async loadFollowups(filters = {}) {
      get()._setLoading('followups', true);
      try {
        const { fetchFollowups } = await import('../services/crmService.js');
        const followups = await fetchFollowups({ assignedTo: get()._userId, ...filters });
        set({ followups });
      } catch (err) {
        set({ error: err.message });
      } finally {
        get()._setLoading('followups', false);
      }
    },

    async scheduleFollowup(data) {
      get()._setLoading('action', true);
      try {
        const { scheduleFollowup } = await import('../services/crmService.js');
        const followup = await scheduleFollowup({ ...data, assigned_to: get()._userId });
        set(s => ({ followups: [followup, ...s.followups] }));

        const { emit, EVENT_TYPES, EVENT_SOURCES } = await import('@/core/events/eventBus.js');
        emit(EVENT_TYPES.FOLLOWUP_SCHEDULED, { followup }, { source: EVENT_SOURCES.CRM });

        return followup;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    async completeFollowup(id) {
      get()._setLoading('action', true);
      try {
        const { completeFollowup } = await import('../services/crmService.js');
        const updated = await completeFollowup(id);
        set(s => ({ followups: s.followups.map(f => (f.id === id ? updated : f)) }));
        return updated;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    async cancelFollowup(id) {
      get()._setLoading('action', true);
      try {
        const { cancelFollowup } = await import('../services/crmService.js');
        const updated = await cancelFollowup(id);
        set(s => ({ followups: s.followups.map(f => (f.id === id ? updated : f)) }));
        return updated;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    // ── Notes ─────────────────────────────────────────────────────────────

    async loadNotes(filters = {}) {
      get()._setLoading('notes', true);
      try {
        const { fetchNotes } = await import('../services/crmService.js');
        const notes = await fetchNotes(filters);
        set({ notes });
      } catch (err) {
        set({ error: err.message });
      } finally {
        get()._setLoading('notes', false);
      }
    },

    async addNote(data) {
      get()._setLoading('action', true);
      try {
        const { addNote } = await import('../services/crmService.js');
        const note = await addNote({ ...data, user_id: get()._userId });
        set(s => ({ notes: [note, ...s.notes] }));
        return note;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    async deleteNote(id) {
      try {
        const { deleteNote } = await import('../services/crmService.js');
        await deleteNote(id);
        set(s => ({ notes: s.notes.filter(n => n.id !== id) }));
      } catch (err) {
        set({ error: err.message });
        throw err;
      }
    },

    // ── Contacts ──────────────────────────────────────────────────────────

    async loadContacts(customerId) {
      get()._setLoading('contacts', true);
      try {
        const { fetchContacts } = await import('../services/crmService.js');
        const contacts = await fetchContacts(customerId);
        set({ contacts });
      } catch (err) {
        set({ error: err.message });
      } finally {
        get()._setLoading('contacts', false);
      }
    },

    async createContact(data) {
      get()._setLoading('action', true);
      try {
        const { createContact } = await import('../services/crmService.js');
        const contact = await createContact(data);
        set(s => ({ contacts: [contact, ...s.contacts] }));
        return contact;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    // ── Agent Assignment ──────────────────────────────────────────────────

    async assignAgent(entityType, entityId, agentId) {
      get()._setLoading('action', true);
      try {
        const { assignSalesAgent } = await import('../services/crmService.js');
        const updated = await assignSalesAgent(entityType, entityId, agentId);

        if (entityType === 'lead') {
          set(s => ({ leads: s.leads.map(l => (l.id === entityId ? updated : l)) }));
        } else if (entityType === 'deal') {
          set(s => ({ deals: s.deals.map(d => (d.id === entityId ? updated : d)) }));
        } else if (entityType === 'customer') {
          set(s => ({ customers: s.customers.map(c => (c.id === entityId ? updated : c)) }));
        }

        const { emit, EVENT_TYPES, EVENT_SOURCES } = await import('@/core/events/eventBus.js');
        emit(
          EVENT_TYPES.CRM_AGENT_ASSIGNED,
          { entityType, entityId, agentId },
          { source: EVENT_SOURCES.CRM }
        );

        return updated;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    // ── Search ────────────────────────────────────────────────────────────

    async searchCRM(query) {
      if (!query?.trim()) return { leads: [], deals: [], customers: [] };
      get()._setLoading('search', true);
      try {
        const { searchCRM } = await import('../services/crmService.js');
        return await searchCRM(query);
      } catch (err) {
        set({ error: err.message });
        return { leads: [], deals: [], customers: [] };
      } finally {
        get()._setLoading('search', false);
      }
    },

    // ── Filters ───────────────────────────────────────────────────────────

    setFilters(partial) {
      set(s => ({ filters: { ...s.filters, ...partial } }));
    },

    resetFilters() {
      set({ filters: { ...INITIAL_FILTERS } });
    },

    // ── Selection ─────────────────────────────────────────────────────────

    selectDeal(id) {
      set({ selectedDealId: id });
      if (id) {
        get().loadActivities({ dealId: id });
        get().loadNotes({ dealId: id });
      }
    },

    selectCustomer(id) {
      set({ selectedCustomerId: id });
      if (id) {
        get().loadActivities({ customerId: id });
        get().loadNotes({ customerId: id });
        get().loadContacts(id);
      }
    },

    selectLead(id) {
      set({ selectedLeadId: id });
    },

    clearError() {
      set({ error: null });
    },

    // ── Computed ──────────────────────────────────────────────────────────

    /**
     * Returns deals array filtered to a specific stage.
     */
    getDealsForStage(stageId) {
      return get().deals.filter(d => d.stage_id === stageId && d.status !== DEAL_STATUS.ARCHIVED);
    },

    /**
     * Aggregate KPIs for the CRM dashboard.
     */
    getPipelineKPIs() {
      const { deals, leads, followups, stages } = get();

      const openDeals = deals.filter(d => d.status === DEAL_STATUS.OPEN);
      const wonDeals = deals.filter(d => d.status === DEAL_STATUS.WON);
      const lostDeals = deals.filter(d => d.status === DEAL_STATUS.LOST);

      const stagesWithDeals = stages.map(s => ({
        ...s,
        deals: deals.filter(d => d.stage_id === s.id && d.status !== DEAL_STATUS.ARCHIVED),
        value: deals
          .filter(d => d.stage_id === s.id && d.status !== DEAL_STATUS.ARCHIVED)
          .reduce((sum, d) => sum + Number(d.value || 0), 0),
      }));

      return {
        totalOpenDeals: openDeals.length,
        totalWonDeals: wonDeals.length,
        totalLostDeals: lostDeals.length,
        pipelineValue: getPipelineValue(openDeals),
        wonValue: wonDeals.reduce((s, d) => s + Number(d.value || 0), 0),
        winRate: getWinRate(wonDeals.length, lostDeals.length),
        leadConversionRate: getLeadConversionRate(
          leads.filter(l => l.status === 'converted').length,
          leads.length
        ),
        overdueFollowups: countOverdueFollowups(followups),
        pendingFollowups: followups.filter(f => f.status === FOLLOWUP_STATUS.PENDING).length,
        stagesWithDeals,
        avgDealValue:
          wonDeals.length > 0
            ? wonDeals.reduce((s, d) => s + Number(d.value || 0), 0) / wonDeals.length
            : 0,
      };
    },

    // ── Internal helpers ──────────────────────────────────────────────────

    _setLoading(key, value) {
      set(s => ({ loading: { ...s.loading, [key]: value } }));
    },

    _startRealtime() {
      const timer = setInterval(() => {
        const state = get();
        if (!state._initialized) return;
        state.loadDeals();
        state.loadFollowups();
      }, CRM_REALTIME_INTERVAL_MS);
      set({ _realtimeTimer: timer });
    },

    _stopRealtime() {
      const { _realtimeTimer, _realtimeChannel } = get();
      if (_realtimeTimer) clearInterval(_realtimeTimer);
      if (_realtimeChannel) {
        import('@/services/supabase.js').then(({ supabase }) => {
          supabase.removeChannel(_realtimeChannel).catch(() => {});
        });
      }
      set({ _realtimeTimer: null, _realtimeChannel: null });
    },

    _startOverdueCheck() {
      const timer = setInterval(async () => {
        const { followups } = get();
        const overdue = followups.filter(
          f =>
            f.status === FOLLOWUP_STATUS.PENDING &&
            new Date(f.due_at) < new Date()
        );

        if (overdue.length > 0) {
          // Mark them overdue locally
          set(s => ({
            followups: s.followups.map(f =>
              overdue.find(o => o.id === f.id)
                ? { ...f, status: FOLLOWUP_STATUS.OVERDUE }
                : f
            ),
          }));

          // Emit event for notification integration
          const { emit, EVENT_TYPES, EVENT_SOURCES } = await import('@/core/events/eventBus.js');
          overdue.forEach(f => {
            emit(EVENT_TYPES.FOLLOWUP_DUE, { followup: f }, { source: EVENT_SOURCES.CRM });
          });
        }
      }, FOLLOWUP_OVERDUE_CHECK_MS);
      set({ _overdueTimer: timer });
    },

    _stopOverdueCheck() {
      const { _overdueTimer } = get();
      if (_overdueTimer) clearInterval(_overdueTimer);
      set({ _overdueTimer: null });
    },
  }))
);

export default useCRMStore;
