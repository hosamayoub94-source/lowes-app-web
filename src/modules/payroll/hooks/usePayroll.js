// =============================================================
// Payroll — Selector hooks & compound hooks
// =============================================================

import { useEffect } from 'react';
import usePayrollStore from '../store/usePayrollStore.js';

// ── Primitive selectors ────────────────────────────────────────────────────

export const usePayrollRuns       = () => usePayrollStore(s => s.runs);
export const usePayrollEntries    = () => usePayrollStore(s => s.entries);
export const useSalarySettings    = () => usePayrollStore(s => s.salarySettings);
export const useExchangeRates     = () => usePayrollStore(s => s.exchangeRates);
export const useSelectedRunId     = () => usePayrollStore(s => s.selectedRunId);
export const usePayrollFilters    = () => usePayrollStore(s => s.filters);
export const usePayrollLoading    = () => usePayrollStore(s => s.loading);
export const usePayrollError      = () => usePayrollStore(s => s.error);

// ── Derived selectors ──────────────────────────────────────────────────────

export const useSelectedRun = () =>
  usePayrollStore(s => s.runs.find(r => r.id === s.selectedRunId) ?? null);

export const useRunsByStatus = (status) =>
  usePayrollStore(s => s.runs.filter(r => r.status === status));

export const usePayrollKPIs = () =>
  usePayrollStore(s => s.getRunKPIs());

export const useEmployeeSettings = (employeeId) =>
  usePayrollStore(s => s.salarySettings.find(x => x.employee_id === employeeId) ?? null);

// ── Action hook ────────────────────────────────────────────────────────────

export const usePayrollActions = () =>
  usePayrollStore(s => ({
    loadRuns:         s.loadRuns,
    createRun:        s.createRun,
    updateRun:        s.updateRun,
    approveRun:       s.approveRun,
    markRunPaid:      s.markRunPaid,
    deleteRun:        s.deleteRun,
    selectRun:        s.selectRun,
    loadEntries:      s.loadEntries,
    upsertEntry:      s.upsertEntry,
    deleteEntry:      s.deleteEntry,
    loadSalarySettings: s.loadSalarySettings,
    saveSettings:     s.saveSettings,
    loadExchangeRates: s.loadExchangeRates,
    saveExchangeRate: s.saveExchangeRate,
    setFilters:       s.setFilters,
    clearError:       s.clearError,
  }));

// ── Compound hooks ─────────────────────────────────────────────────────────

/**
 * Bootstrap: initialize Payroll store for current user, teardown on unmount.
 */
export function usePayrollBootstrap(userId) {
  const init     = usePayrollStore(s => s.init);
  const teardown = usePayrollStore(s => s.teardown);

  useEffect(() => {
    if (userId) init(userId);
    return () => teardown();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Full dashboard view data.
 */
export function usePayrollDashboard() {
  const runs    = usePayrollRuns();
  const kpis    = usePayrollKPIs();
  const loading = usePayrollLoading();

  return { runs, kpis, isLoading: loading.runs };
}

/**
 * Run detail view — selected run + its entries.
 */
export function useRunDetail() {
  const run     = useSelectedRun();
  const entries = usePayrollEntries();
  const loading = usePayrollLoading();
  const { upsertEntry, deleteEntry, approveRun, markRunPaid } = usePayrollActions();

  return {
    run,
    entries,
    isLoading: loading.entries,
    isSubmitting: loading.action,
    upsertEntry,
    deleteEntry,
    approveRun: run ? () => approveRun(run.id) : null,
    markRunPaid: run ? () => markRunPaid(run.id) : null,
  };
}
