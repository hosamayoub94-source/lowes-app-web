// =============================================================
// Sales Zustand Store
// =============================================================

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { SALES_REALTIME_INTERVAL_MS, calcROAS } from '../types/sales.types.js';

const INITIAL_STATE = {
  reports:     [],
  channels:    [],
  campaigns:   [],
  // Detail of selected report
  channelResults: [],
  adResults:   [],
  selectedReportId: null,
  filters: { from: null, to: null, status: null },
  loading: { reports: false, detail: false, action: false },
  error: null,
  _initialized: false,
  _userId: null,
  _realtimeTimer: null,
};

const useSalesStore = create()(
  subscribeWithSelector((set, get) => ({
    ...INITIAL_STATE,

    async init(userId) {
      if (get()._initialized && get()._userId === userId) return;
      set({ _userId: userId, _initialized: true, error: null });
      await Promise.all([get().loadReports(), get().loadChannels(), get().loadCampaigns()]);
      get()._startRealtime();
    },

    teardown() {
      get()._stopRealtime();
      set({ ...INITIAL_STATE });
    },

    // ── Reports ────────────────────────────────────────────────────────────

    async loadReports(extra = {}) {
      get()._setLoading('reports', true);
      try {
        const { fetchReports } = await import('../services/salesService.js');
        const reports = await fetchReports({ ...get().filters, ...extra });
        set({ reports });
      } catch (err) {
        set({ error: err.message });
      } finally {
        get()._setLoading('reports', false);
      }
    },

    async createReport(data) {
      get()._setLoading('action', true);
      try {
        const { createReport } = await import('../services/salesService.js');
        const report = await createReport({
          ...data,
          status: 'draft',
          created_by: get()._userId,
        });
        set(s => ({ reports: [report, ...s.reports] }));
        return report;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    async updateReport(id, data) {
      get()._setLoading('action', true);
      try {
        const { updateReport } = await import('../services/salesService.js');
        const updated = await updateReport(id, data);
        set(s => ({ reports: s.reports.map(r => (r.id === id ? updated : r)) }));
        return updated;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    async submitReport(id) {
      return get().updateReport(id, { status: 'submitted' });
    },

    async approveReport(id) {
      return get().updateReport(id, { status: 'approved' });
    },

    async deleteReport(id) {
      get()._setLoading('action', true);
      try {
        const { deleteReport } = await import('../services/salesService.js');
        await deleteReport(id);
        set(s => ({
          reports: s.reports.filter(r => r.id !== id),
          selectedReportId: s.selectedReportId === id ? null : s.selectedReportId,
        }));
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    // ── Report detail ──────────────────────────────────────────────────────

    async selectReport(id) {
      set({ selectedReportId: id, channelResults: [], adResults: [] });
      if (id) {
        get()._setLoading('detail', true);
        try {
          const { fetchChannelResults, fetchAdResults } = await import('../services/salesService.js');
          const [channelResults, adResults] = await Promise.all([
            fetchChannelResults(id),
            fetchAdResults(id),
          ]);
          set({ channelResults, adResults });
        } catch (err) {
          set({ error: err.message });
        } finally {
          get()._setLoading('detail', false);
        }
      }
    },

    // ── Channels & Campaigns ───────────────────────────────────────────────

    async loadChannels() {
      try {
        const { fetchChannels } = await import('../services/salesService.js');
        const channels = await fetchChannels();
        set({ channels });
      } catch (err) {
        set({ error: err.message });
      }
    },

    async loadCampaigns() {
      try {
        const { fetchCampaigns } = await import('../services/salesService.js');
        const campaigns = await fetchCampaigns();
        set({ campaigns });
      } catch (err) {
        set({ error: err.message });
      }
    },

    // ── Filters ────────────────────────────────────────────────────────────

    setFilters(partial) {
      set(s => ({ filters: { ...s.filters, ...partial } }));
      get().loadReports();
    },

    clearError() {
      set({ error: null });
    },

    // ── Computed ───────────────────────────────────────────────────────────

    getDashboardKPIs() {
      const { reports } = get();
      const last7 = reports.slice(0, 7);
      const totalOrders = last7.reduce((s, r) => s + Number(r.total_orders ?? 0), 0);
      const totalSales  = last7.reduce((s, r) => s + Number(r.total_sales_usd ?? 0), 0);
      const totalSpend  = last7.reduce((s, r) => s + Number(r.total_ad_spend_usd ?? 0), 0);
      const avgRoas     = totalSpend > 0 ? calcROAS(totalSales, totalSpend) : 0;
      return {
        totalReports: reports.length,
        last7Orders: totalOrders,
        last7Sales:  totalSales,
        last7Spend:  totalSpend,
        avgRoas,
      };
    },

    // ── Internal ───────────────────────────────────────────────────────────

    _setLoading(key, val) {
      set(s => ({ loading: { ...s.loading, [key]: val } }));
    },

    _startRealtime() {
      const timer = setInterval(() => {
        if (!get()._initialized) return;
        get().loadReports();
      }, SALES_REALTIME_INTERVAL_MS);
      set({ _realtimeTimer: timer });
    },

    _stopRealtime() {
      const { _realtimeTimer } = get();
      if (_realtimeTimer) clearInterval(_realtimeTimer);
      set({ _realtimeTimer: null });
    },
  }))
);

export default useSalesStore;
