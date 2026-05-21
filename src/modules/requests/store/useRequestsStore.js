// =============================================================
// Requests Zustand Store
// =============================================================

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { REQUESTS_REALTIME_INTERVAL_MS } from '../types/requests.types.js';

const INITIAL_STATE = {
  requests:     [],
  leaveBalances: [],
  filters: { status: null, type: null, employeeId: null },
  selectedId:   null,
  loading: { requests: false, action: false, balances: false },
  error: null,
  _initialized: false,
  _userId: null,
  _role: null,
  _realtimeTimer: null,
};

const useRequestsStore = create()(
  subscribeWithSelector((set, get) => ({
    ...INITIAL_STATE,

    async init(userId, role) {
      if (get()._initialized && get()._userId === userId) return;
      set({ _userId: userId, _role: role, _initialized: true, error: null });
      await get().loadRequests();
      get()._startRealtime();
    },

    teardown() {
      get()._stopRealtime();
      set({ ...INITIAL_STATE });
    },

    // ── Requests ───────────────────────────────────────────────────────────

    async loadRequests(extra = {}) {
      get()._setLoading('requests', true);
      try {
        const { fetchRequests } = await import('../services/requestsService.js');
        const { _role, _userId, filters } = get();
        // employees see only their own; managers/admins see all
        const isEmployee = _role === 'employee' || _role === 'media_buyer';
        const merged = {
          ...filters,
          ...extra,
          ...(isEmployee ? { employeeId: _userId } : {}),
        };
        const requests = await fetchRequests(merged);
        set({ requests });
      } catch (err) {
        set({ error: err.message });
      } finally {
        get()._setLoading('requests', false);
      }
    },

    async createRequest(data) {
      get()._setLoading('action', true);
      try {
        const { createRequest } = await import('../services/requestsService.js');
        const req = await createRequest({ ...data, employee_id: get()._userId });
        // Optimistically prepend, then reload to get join fields (employee_name)
        set(s => ({ requests: [req, ...s.requests] }));
        // Reload in background so employee_name is populated via join
        get().loadRequests().catch(() => {});
        return req;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    async approveRequest(id, note = '') {
      get()._setLoading('action', true);
      try {
        const { decideRequest } = await import('../services/requestsService.js');
        const updated = await decideRequest(id, {
          status: 'approved',
          decisionNote: note,
          decidedBy: get()._userId,
        });
        set(s => ({ requests: s.requests.map(r => (r.id === id ? updated : r)) }));
        return updated;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    async rejectRequest(id, note = '') {
      get()._setLoading('action', true);
      try {
        const { decideRequest } = await import('../services/requestsService.js');
        const updated = await decideRequest(id, {
          status: 'rejected',
          decisionNote: note,
          decidedBy: get()._userId,
        });
        set(s => ({ requests: s.requests.map(r => (r.id === id ? updated : r)) }));
        return updated;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    async cancelRequest(id) {
      get()._setLoading('action', true);
      try {
        const { cancelRequest } = await import('../services/requestsService.js');
        const updated = await cancelRequest(id, get()._userId);
        set(s => ({ requests: s.requests.map(r => (r.id === id ? updated : r)) }));
        return updated;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    // ── Leave Balances ─────────────────────────────────────────────────────

    async loadLeaveBalances(year = new Date().getFullYear()) {
      get()._setLoading('balances', true);
      try {
        const { fetchAllLeaveBalances } = await import('../services/requestsService.js');
        const leaveBalances = await fetchAllLeaveBalances(year);
        set({ leaveBalances });
      } catch (err) {
        set({ error: err.message });
      } finally {
        get()._setLoading('balances', false);
      }
    },

    // ── Filters & selection ────────────────────────────────────────────────

    setFilters(partial) {
      set(s => ({ filters: { ...s.filters, ...partial } }));
      get().loadRequests();
    },

    resetFilters() {
      set({ filters: { status: null, type: null, employeeId: null } });
      get().loadRequests();
    },

    selectRequest(id) {
      set({ selectedId: id });
    },

    clearError() {
      set({ error: null });
    },

    // ── Computed ───────────────────────────────────────────────────────────

    getKPIs() {
      const { requests } = get();
      return {
        total:    requests.length,
        pending:  requests.filter(r => r.status === 'pending').length,
        approved: requests.filter(r => r.status === 'approved').length,
        rejected: requests.filter(r => r.status === 'rejected').length,
      };
    },

    // ── Internal ───────────────────────────────────────────────────────────

    _setLoading(key, val) {
      set(s => ({ loading: { ...s.loading, [key]: val } }));
    },

    _startRealtime() {
      const timer = setInterval(() => {
        if (!get()._initialized) return;
        get().loadRequests();
      }, REQUESTS_REALTIME_INTERVAL_MS);
      set({ _realtimeTimer: timer });
    },

    _stopRealtime() {
      const { _realtimeTimer } = get();
      if (_realtimeTimer) clearInterval(_realtimeTimer);
      set({ _realtimeTimer: null });
    },
  }))
);

export default useRequestsStore;
