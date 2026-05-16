// =============================================================
// Audit Module — Zustand Store
//
// Drives the Admin Audit Dashboard.
// All data operations go through auditService — never direct DB.
// =============================================================
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  fetchLogs,
  fetchAuditStats,
  subscribeToAuditLogs,
  exportLogsCSV,
} from '../services/auditService';

// ── Default filter state ─────────────────────────────────────
const DEFAULT_FILTERS = {
  search:     '',
  severity:   '',
  entityType: '',
  actionType: '',
  userId:     '',
  dateFrom:   '',
  dateTo:     '',
};

const DEFAULT_PAGINATION = {
  page:     1,
  pageSize: 50,
  total:    0,
};

// ── Store ────────────────────────────────────────────────────
export const useAuditStore = create(
  subscribeWithSelector((set, get) => ({
    // ── State ──────────────────────────────────────────────
    logs:          [],
    stats:         null,
    filters:       { ...DEFAULT_FILTERS },
    pagination:    { ...DEFAULT_PAGINATION },
    loading:       false,
    statsLoading:  false,
    error:         null,
    liveEntries:   [],          // newest entries pushed via realtime (shown in "live" feed)
    realtimeActive: false,

    // ── Actions — data loading ─────────────────────────────

    /** Load a page of logs using current filters. */
    async loadLogs() {
      const { filters, pagination } = get();
      set({ loading: true, error: null });
      try {
        const { logs, total } = await fetchLogs({
          ...filters,
          page:     pagination.page,
          pageSize: pagination.pageSize,
        });
        set((s) => ({
          logs,
          loading: false,
          pagination: { ...s.pagination, total },
        }));
      } catch (err) {
        set({ loading: false, error: err.message || 'حدث خطأ أثناء تحميل السجلات' });
      }
    },

    /** Reload first page (used after filter changes). */
    async reloadLogs() {
      set((s) => ({ pagination: { ...s.pagination, page: 1 } }));
      await get().loadLogs();
    },

    /** Load dashboard stats. */
    async loadStats() {
      set({ statsLoading: true });
      try {
        const stats = await fetchAuditStats();
        set({ stats, statsLoading: false });
      } catch {
        set({ statsLoading: false });
      }
    },

    /** Go to a specific page. */
    async goToPage(page) {
      set((s) => ({ pagination: { ...s.pagination, page } }));
      await get().loadLogs();
    },

    // ── Actions — filters ──────────────────────────────────

    /** Set one or more filter keys and reload. */
    async setFilter(patch) {
      set((s) => ({
        filters:    { ...s.filters, ...patch },
        pagination: { ...s.pagination, page: 1 },
      }));
      await get().loadLogs();
    },

    /** Reset all filters to defaults. */
    async resetFilters() {
      set({ filters: { ...DEFAULT_FILTERS }, pagination: { ...DEFAULT_PAGINATION } });
      await get().loadLogs();
    },

    // ── Actions — realtime ─────────────────────────────────

    /** Start live feed subscription. Returns unsubscribe fn. */
    startRealtime() {
      const unsubscribe = subscribeToAuditLogs(
        (newRow) => {
          set((s) => ({
            liveEntries: [newRow, ...s.liveEntries].slice(0, 50),
            // Also prepend to main log list if it fits the current filters
            logs: [newRow, ...s.logs],
          }));
        },
        (status) => {
          set({ realtimeActive: status === 'SUBSCRIBED' });
        },
      );
      set({ realtimeActive: false });
      return unsubscribe;
    },

    /** Clear the live feed badge. */
    clearLiveEntries() {
      set({ liveEntries: [] });
    },

    // ── Actions — export ───────────────────────────────────

    /** Download current filter set as CSV. */
    async exportCSV() {
      const { filters } = get();
      const csv      = await exportLogsCSV(filters);
      const blob     = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement('a');
      a.href         = url;
      a.download     = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    // ── Helpers ────────────────────────────────────────────
    clearError() { set({ error: null }); },
  })),
);

// ── Selectors ────────────────────────────────────────────────

/** Derived: number of active (non-empty) filters. */
export function selectActiveFilterCount(state) {
  return Object.values(state.filters).filter(Boolean).length;
}

/** Derived: total pages. */
export function selectTotalPages(state) {
  const { total, pageSize } = state.pagination;
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Derived: critical + warning entries in current view. */
export function selectAlerts(state) {
  return state.logs.filter((l) => l.severity === 'critical' || l.severity === 'warning');
}
