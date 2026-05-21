// =============================================================
// Accounting — Selector & compound hooks
// =============================================================

import { useEffect } from 'react';
import useAccountingStore from '../store/useAccountingStore.js';

// ── Primitive selectors ────────────────────────────────────────────────────

export const useEntries           = () => useAccountingStore(s => s.entries);
export const useCategories        = () => useAccountingStore(s => s.categories);
export const useAccountingFilters = () => useAccountingStore(s => s.filters);
export const useAccountingLoading = () => useAccountingStore(s => s.loading);
export const useAccountingError   = () => useAccountingStore(s => s.error);

// ── Derived selectors ──────────────────────────────────────────────────────

export const useLedgerKPIs         = () => useAccountingStore(s => s.getLedgerKPIs());
export const useEntriesByCategory  = () => useAccountingStore(s => s.getEntriesByCategory());
export const useIncomeEntries      = () => useAccountingStore(s => s.entries.filter(e => e.entry_type === 'income'));
export const useExpenseEntries     = () => useAccountingStore(s => s.entries.filter(e => e.entry_type === 'expense'));
export const useAdvanceEntries     = () => useAccountingStore(s => s.entries.filter(e => e.entry_type === 'advance'));

// ── Action hook ────────────────────────────────────────────────────────────

export const useAccountingActions = () =>
  useAccountingStore(s => ({
    loadEntries:     s.loadEntries,
    createEntry:     s.createEntry,
    updateEntry:     s.updateEntry,
    deleteEntry:     s.deleteEntry,
    loadCategories:  s.loadCategories,
    createCategory:  s.createCategory,
    setFilters:      s.setFilters,
    resetFilters:    s.resetFilters,
    clearError:      s.clearError,
  }));

// ── Compound hooks ─────────────────────────────────────────────────────────

export function useAccountingBootstrap(userId) {
  const init     = useAccountingStore(s => s.init);
  const teardown = useAccountingStore(s => s.teardown);

  useEffect(() => {
    if (userId) init(userId);
    return () => teardown();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useAccountingDashboard() {
  const entries   = useEntries();
  const kpis      = useLedgerKPIs();
  const breakdown = useEntriesByCategory();
  const loading   = useAccountingLoading();

  return { entries, kpis, breakdown, isLoading: loading.entries };
}
