// =============================================================
// Payroll Zustand Store
// =============================================================

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { PAYROLL_REALTIME_INTERVAL_MS, calcRunTotal } from '../types/payroll.types.js';

const INITIAL_STATE = {
  runs: [],
  entries: [],          // entries for the selected run
  salarySettings: [],
  exchangeRates: [],

  selectedRunId: null,
  filters: { year: new Date().getFullYear(), status: null },

  loading: {
    runs: false,
    entries: false,
    settings: false,
    rates: false,
    action: false,
  },
  error: null,

  _initialized: false,
  _userId: null,
  _realtimeTimer: null,
};

const usePayrollStore = create()(
  subscribeWithSelector((set, get) => ({
    ...INITIAL_STATE,

    // ── Bootstrap ──────────────────────────────────────────────────────────

    async init(userId) {
      if (get()._initialized && get()._userId === userId) return;
      set({ _userId: userId, _initialized: true, error: null });

      await Promise.all([
        get().loadRuns(),
        get().loadExchangeRates(),
        get().loadSalarySettings(),
      ]);

      get()._startRealtime();
    },

    teardown() {
      get()._stopRealtime();
      set({ ...INITIAL_STATE });
    },

    // ── Payroll Runs ───────────────────────────────────────────────────────

    async loadRuns(filters = {}) {
      get()._setLoading('runs', true);
      try {
        const { fetchPayrollRuns } = await import('../services/payrollService.js');
        const merged = { ...get().filters, ...filters };
        const runs = await fetchPayrollRuns(merged);
        set({ runs });
      } catch (err) {
        set({ error: err.message });
      } finally {
        get()._setLoading('runs', false);
      }
    },

    async createRun(data) {
      get()._setLoading('action', true);
      try {
        const { createPayrollRun } = await import('../services/payrollService.js');
        const run = await createPayrollRun({ ...data, created_by: get()._userId });
        set(s => ({ runs: [run, ...s.runs] }));
        return run;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    async updateRun(id, data) {
      get()._setLoading('action', true);
      try {
        const { updatePayrollRun } = await import('../services/payrollService.js');
        const updated = await updatePayrollRun(id, data);
        set(s => ({ runs: s.runs.map(r => (r.id === id ? updated : r)) }));
        return updated;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    async approveRun(id) {
      return get().updateRun(id, { status: 'approved', approved_by: get()._userId });
    },

    async markRunPaid(id) {
      return get().updateRun(id, { status: 'paid', paid_at: new Date().toISOString() });
    },

    async deleteRun(id) {
      get()._setLoading('action', true);
      try {
        const { deletePayrollRun } = await import('../services/payrollService.js');
        await deletePayrollRun(id);
        set(s => ({
          runs: s.runs.filter(r => r.id !== id),
          selectedRunId: s.selectedRunId === id ? null : s.selectedRunId,
          entries: s.selectedRunId === id ? [] : s.entries,
        }));
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    // ── Payroll Entries ────────────────────────────────────────────────────

    async selectRun(runId) {
      set({ selectedRunId: runId, entries: [] });
      if (runId) await get().loadEntries(runId);
    },

    async loadEntries(runId) {
      get()._setLoading('entries', true);
      try {
        const { fetchPayrollEntries } = await import('../services/payrollService.js');
        const entries = await fetchPayrollEntries(runId);
        set({ entries });
      } catch (err) {
        set({ error: err.message });
      } finally {
        get()._setLoading('entries', false);
      }
    },

    async upsertEntry(entry) {
      get()._setLoading('action', true);
      try {
        const { upsertPayrollEntry } = await import('../services/payrollService.js');
        const saved = await upsertPayrollEntry({ ...entry, run_id: get().selectedRunId });
        set(s => {
          const idx = s.entries.findIndex(e => e.id === saved.id);
          return {
            entries: idx >= 0
              ? s.entries.map(e => (e.id === saved.id ? saved : e))
              : [...s.entries, saved],
          };
        });
        return saved;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    async deleteEntry(id) {
      get()._setLoading('action', true);
      try {
        const { deletePayrollEntry } = await import('../services/payrollService.js');
        await deletePayrollEntry(id);
        set(s => ({ entries: s.entries.filter(e => e.id !== id) }));
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    // ── Salary Settings ────────────────────────────────────────────────────

    async loadSalarySettings(filters = {}) {
      get()._setLoading('settings', true);
      try {
        const { fetchSalarySettings } = await import('../services/payrollService.js');
        const salarySettings = await fetchSalarySettings(filters);
        set({ salarySettings });
      } catch (err) {
        set({ error: err.message });
      } finally {
        get()._setLoading('settings', false);
      }
    },

    async saveSettings(settings) {
      get()._setLoading('action', true);
      try {
        const { upsertSalarySettings } = await import('../services/payrollService.js');
        const saved = await upsertSalarySettings(settings);
        set(s => {
          const idx = s.salarySettings.findIndex(x => x.employee_id === saved.employee_id);
          return {
            salarySettings: idx >= 0
              ? s.salarySettings.map(x => (x.employee_id === saved.employee_id ? saved : x))
              : [...s.salarySettings, saved],
          };
        });
        return saved;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    // ── Exchange Rates ─────────────────────────────────────────────────────

    async loadExchangeRates() {
      get()._setLoading('rates', true);
      try {
        const { fetchExchangeRates } = await import('../services/payrollService.js');
        const exchangeRates = await fetchExchangeRates();
        set({ exchangeRates });
      } catch (err) {
        set({ error: err.message });
      } finally {
        get()._setLoading('rates', false);
      }
    },

    async saveExchangeRate(rate) {
      get()._setLoading('action', true);
      try {
        const { upsertExchangeRate } = await import('../services/payrollService.js');
        const saved = await upsertExchangeRate(rate);
        set(s => {
          const idx = s.exchangeRates.findIndex(
            r => r.from_currency === saved.from_currency && r.to_currency === saved.to_currency
          );
          return {
            exchangeRates: idx >= 0
              ? s.exchangeRates.map(r =>
                  r.from_currency === saved.from_currency && r.to_currency === saved.to_currency
                    ? saved : r
                )
              : [...s.exchangeRates, saved],
          };
        });
        return saved;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    // ── Filters ────────────────────────────────────────────────────────────

    setFilters(partial) {
      set(s => ({ filters: { ...s.filters, ...partial } }));
      get().loadRuns();
    },

    clearError() {
      set({ error: null });
    },

    // ── Computed ───────────────────────────────────────────────────────────

    getRunKPIs() {
      const { runs, entries } = get();
      const totalPaid = runs.filter(r => r.status === 'paid').reduce((s, r) => s + Number(r.total_net_usd ?? 0), 0);
      const totalPending = runs.filter(r => r.status === 'approved').reduce((s, r) => s + Number(r.total_net_usd ?? 0), 0);
      const currentRunTotal = calcRunTotal(entries);
      return {
        totalRuns: runs.length,
        totalPaid,
        totalPending,
        currentRunTotal,
        entriesCount: entries.length,
      };
    },

    // ── Internal ───────────────────────────────────────────────────────────

    _setLoading(key, value) {
      set(s => ({ loading: { ...s.loading, [key]: value } }));
    },

    _startRealtime() {
      const timer = setInterval(() => {
        if (!get()._initialized) return;
        get().loadRuns();
        if (get().selectedRunId) get().loadEntries(get().selectedRunId);
      }, PAYROLL_REALTIME_INTERVAL_MS);
      set({ _realtimeTimer: timer });
    },

    _stopRealtime() {
      const { _realtimeTimer } = get();
      if (_realtimeTimer) clearInterval(_realtimeTimer);
      set({ _realtimeTimer: null });
    },
  }))
);

export default usePayrollStore;
