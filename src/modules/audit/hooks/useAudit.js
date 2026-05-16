// =============================================================
// Audit Module — useAudit
//
// Dashboard data hook. Loads logs + stats on mount, wires
// realtime subscription, and exposes all store slices.
//
// Usage (in AuditDashboard):
//   const {
//     logs, stats, filters, pagination,
//     loading, statsLoading, liveEntries,
//     setFilter, resetFilters, goToPage, exportCSV,
//   } = useAudit();
// =============================================================
import { useEffect, useRef } from 'react';
import { useAuditStore } from '../store/useAuditStore';

/**
 * @param {object}  opts
 * @param {boolean} [opts.realtime=true]  — subscribe to live inserts
 * @param {boolean} [opts.autoLoad=true]  — load on mount
 */
export function useAudit({ realtime = true, autoLoad = true } = {}) {
  const store     = useAuditStore();
  const unsubRef  = useRef(null);

  // ── Initial load ──────────────────────────────────────────
  useEffect(() => {
    if (!autoLoad) return;
    store.loadLogs();
    store.loadStats();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime subscription ─────────────────────────────────
  useEffect(() => {
    if (!realtime) return;
    unsubRef.current = store.startRealtime();
    return () => {
      unsubRef.current?.();
    };
  }, [realtime]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // Data
    logs:           store.logs,
    stats:          store.stats,
    liveEntries:    store.liveEntries,
    realtimeActive: store.realtimeActive,

    // UI state
    filters:        store.filters,
    pagination:     store.pagination,
    loading:        store.loading,
    statsLoading:   store.statsLoading,
    error:          store.error,

    // Actions
    setFilter:        store.setFilter,
    resetFilters:     store.resetFilters,
    goToPage:         store.goToPage,
    reloadLogs:       store.reloadLogs,
    loadStats:        store.loadStats,
    clearLiveEntries: store.clearLiveEntries,
    exportCSV:        store.exportCSV,
    clearError:       store.clearError,
  };
}
