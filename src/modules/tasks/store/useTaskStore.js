// =============================================================
// Tasks Module — Zustand store.
// State lives here. Business logic delegated to taskUtils +
// taskService. UI components read selectors, call actions only.
// =============================================================

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  fetchTasks,
  createTask,
  updateTaskStatus,
  updateTaskProgress,
  addTaskComment,
  markTaskSeen,
} from '../services/taskService';
import { filterTasks, sortTasks, computeStats, extractEmployees } from '../utils/taskUtils';

// ── Initial filter state ──────────────────────────────────────
const INITIAL_FILTERS = {
  search:        '',
  status:        '',
  priority:      '',
  assignedTo:    '',
  overdueOnly:   false,
  completedOnly: false,
};

// ── Store ─────────────────────────────────────────────────────
export const useTaskStore = create()(
  subscribeWithSelector((set, get) => ({

    // ── State ──────────────────────────────────────────────────
    tasks:          [],
    loading:        false,
    error:          null,
    selectedTaskId: null,
    drawerOpen:     false,
    filters:        { ...INITIAL_FILTERS },
    /** Optimistic flag set while an action is in-flight */
    actionLoading:  false,

    // ── Derived selectors (called outside via useTaskStore.getState() or selectors) ──
    // Not stored in state — computed on demand via exported selector fns below.

    // ── Data actions ──────────────────────────────────────────

    /** Load / reload the task list */
    loadTasks: async (params = {}) => {
      set({ loading: true, error: null });
      try {
        const tasks = await fetchTasks(params);
        set({ tasks, loading: false });
      } catch (err) {
        set({ error: err?.message || 'حدث خطأ أثناء تحميل المهام', loading: false });
      }
    },

    /** Reload silently (no loading spinner — background refresh) */
    refreshTasks: async () => {
      try {
        const tasks = await fetchTasks();
        set({ tasks });
      } catch {
        /* silent */
      }
    },

    /** Change task status with optimistic update + rollback */
    changeStatus: async (taskId, newStatus) => {
      const prev = get().tasks;

      // Optimistic
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === taskId ? { ...t, status: newStatus, updated_at: new Date().toISOString() } : t,
        ),
        actionLoading: true,
      }));

      try {
        const updated = await updateTaskStatus(taskId, newStatus);
        // Sync with server response
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, ...updated } : t)),
          actionLoading: false,
        }));
      } catch (err) {
        // Rollback
        set({ tasks: prev, actionLoading: false, error: err?.message });
      }
    },

    /** Update progress with optimistic update */
    changeProgress: async (taskId, progress) => {
      const prev = get().tasks;

      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === taskId ? { ...t, progress, updated_at: new Date().toISOString() } : t,
        ),
        actionLoading: true,
      }));

      try {
        const updated = await updateTaskProgress(taskId, progress);
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, ...updated } : t)),
          actionLoading: false,
        }));
      } catch (err) {
        set({ tasks: prev, actionLoading: false, error: err?.message });
      }
    },

    /** Post a comment on a task */
    postComment: async (taskId, commentPayload) => {
      set({ actionLoading: true });
      try {
        const comment = await addTaskComment(taskId, commentPayload);
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  comments: [...(t.comments || []), comment],
                  comments_count: (t.comments_count || 0) + 1,
                }
              : t,
          ),
          actionLoading: false,
        }));
        return comment;
      } catch (err) {
        set({ actionLoading: false, error: err?.message });
        throw err;
      }
    },

    /** Create a new task and prepend to the list */
    addTask: async (payload, actorId) => {
      set({ actionLoading: true });
      try {
        const task = await createTask(payload, { actorId });
        set((s) => ({ tasks: [task, ...s.tasks], actionLoading: false }));
        return task;
      } catch (err) {
        set({ actionLoading: false, error: err?.message });
        throw err;
      }
    },

    /** Mark task as seen */
    markSeen: (taskId) => {
      // lazy import to avoid circular deps
      import('@stores/authStore').then(({ useAuthStore }) => {
        const userId = useAuthStore.getState().user?.id ?? null;
        markTaskSeen(taskId, userId).catch(() => {});
      }).catch(() => markTaskSeen(taskId, null).catch(() => {}));
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, seen: true } : t)),
      }));
    },

    // ── Selection & drawer ──────────────────────────────────────

    openTask: (taskId) => {
      set({ selectedTaskId: taskId, drawerOpen: true });
      // Mark as seen when opened
      get().markSeen(taskId);
    },

    closeDrawer: () => set({ selectedTaskId: null, drawerOpen: false }),

    // ── Filter actions ─────────────────────────────────────────

    setFilter: (key, value) =>
      set((s) => ({ filters: { ...s.filters, [key]: value } })),

    toggleFilter: (key) =>
      set((s) => ({ filters: { ...s.filters, [key]: !s.filters[key] } })),

    resetFilters: () => set({ filters: { ...INITIAL_FILTERS } }),

    // ── Error ──────────────────────────────────────────────────
    clearError: () => set({ error: null }),
  })),
);

// ── Selectors ─────────────────────────────────────────────────
// Use these in components instead of re-computing inside render.

/** Filtered + sorted task list */
export const selectFilteredTasks = (state) =>
  sortTasks(filterTasks(state.tasks, state.filters));

/** Dashboard KPI stats */
export const selectStats = (state) => computeStats(state.tasks);

/** Currently selected task object */
export const selectSelectedTask = (state) =>
  state.tasks.find((t) => t.id === state.selectedTaskId) ?? null;

/** Unique employee list extracted from tasks */
export const selectEmployees = (state) => extractEmployees(state.tasks);

/** Number of unseen tasks */
export const selectUnseenCount = (state) =>
  state.tasks.filter((t) => !t.seen).length;
