// =============================================================
// Requests — Selector & compound hooks
// =============================================================

import { useEffect } from 'react';
import useRequestsStore from '../store/useRequestsStore.js';

// ── Primitive selectors ────────────────────────────────────────────────────

export const useRequests       = () => useRequestsStore(s => s.requests);
export const useLeaveBalances  = () => useRequestsStore(s => s.leaveBalances);
export const useSelectedId     = () => useRequestsStore(s => s.selectedId);
export const useRequestFilters = () => useRequestsStore(s => s.filters);
export const useRequestsLoading = () => useRequestsStore(s => s.loading);
export const useRequestsError  = () => useRequestsStore(s => s.error);
export const useRequestsKPIs   = () => useRequestsStore(s => s.getKPIs());

// ── Derived selectors ──────────────────────────────────────────────────────

export const usePendingRequests = () =>
  useRequestsStore(s => s.requests.filter(r => r.status === 'pending'));

export const useSelectedRequest = () =>
  useRequestsStore(s => s.requests.find(r => r.id === s.selectedId) ?? null);

// ── Action hook ────────────────────────────────────────────────────────────

export const useRequestsActions = () =>
  useRequestsStore(s => ({
    createRequest:   s.createRequest,
    approveRequest:  s.approveRequest,
    rejectRequest:   s.rejectRequest,
    cancelRequest:   s.cancelRequest,
    loadRequests:    s.loadRequests,
    setFilters:      s.setFilters,
    resetFilters:    s.resetFilters,
    selectRequest:   s.selectRequest,
    loadLeaveBalances: s.loadLeaveBalances,
    clearError:      s.clearError,
  }));

// ── Compound hooks ─────────────────────────────────────────────────────────

/**
 * Bootstrap Requests module.
 */
export function useRequestsBootstrap(userId, role) {
  const init     = useRequestsStore(s => s.init);
  const teardown = useRequestsStore(s => s.teardown);

  useEffect(() => {
    if (userId) init(userId, role);
    return () => teardown();
  }, [userId, role]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Full dashboard data.
 */
export function useRequestsDashboard() {
  const requests = useRequests();
  const kpis     = useRequestsKPIs();
  const loading  = useRequestsLoading();

  return { requests, kpis, isLoading: loading.requests };
}
