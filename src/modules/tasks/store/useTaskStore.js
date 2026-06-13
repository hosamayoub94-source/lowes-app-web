// =============================================================
// Tasks Module — Zustand store.
// State lives here. Business logic delegated to taskUtils +
// taskService. UI components read selectors, call actions only.
// =============================================================

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  fetchTasks,
  fetchTask,
  createTask,
  updateTask,
  updateTaskStatus,
  updateTaskProgress,
  addTaskComment,
  markTaskSeen,
  uploadTaskAttachment,
  removeTaskAttachment,
  deleteTask,
  listAssignableProfiles,
} from '../services/taskService';
import { filterTasks, sortTasks, computeStats, extractEmployees } from '../utils/taskUtils';
import { resolvePermissions, PERMISSIONS } from '@data/permissions';

/**
 * Resolve the current viewer's visibility scope for tasks.
 * Returns { viewerId, viewAll }. Management (VIEW_ALL_TASKS) sees all;
 * everyone else sees only tasks assigned to / created by them.
 * Auth is read lazily to avoid a circular import.
 */
async function resolveViewer() {
  try {
    const { useAuthStore } = await import('@stores/authStore');
    const session = useAuthStore.getState().session ?? null;
    if (!session?.id) return { viewerId: null, viewAll: true };
    const viewAll = resolvePermissions(session).has(PERMISSIONS.VIEW_ALL_TASKS);
    return { viewerId: session.id, viewAll };
  } catch {
    return { viewerId: null, viewAll: true };
  }
}

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
    profiles:       [], // all assignable profiles from DB
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

    /** Load / reload the task list + profiles in parallel */
    loadTasks: async (params = {}) => {
      set({ loading: true, error: null });
      try {
        const viewer = await resolveViewer();
        const [tasks, profiles] = await Promise.all([
          fetchTasks({ ...viewer, ...params }),
          listAssignableProfiles().catch(() => []),
        ]);
        set({ tasks, profiles, loading: false });
      } catch (err) {
        set({ error: err?.message || 'حدث خطأ أثناء تحميل المهام', loading: false });
      }
    },

    /** Reload silently (no loading spinner — background refresh) */
    refreshTasks: async () => {
      try {
        const viewer = await resolveViewer();
        const tasks = await fetchTasks(viewer);
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
        // Resolve userId lazily (same pattern as markSeen) to avoid circular imports
        let userId = null;
        try {
          const { useAuthStore } = await import('@stores/authStore');
          userId = useAuthStore.getState().session?.id ?? null;
        } catch { /* ignore */ }

        const comment = await addTaskComment(taskId, { ...commentPayload, userId });
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

        // Fire push notification to the task owner (if someone else commented)
        try {
          const task = get().tasks.find((t) => t.id === taskId);
          const recipientId = task?.assigned_to ?? task?.created_by ?? null;
          if (recipientId && recipientId !== userId) {
            const { sendNotification } = await import('@modules/notifications/services/notificationService');
            const commenterName = comment?.author?.name ?? 'أحد الزملاء';
            await sendNotification({
              userId:     recipientId,
              type:       'task_comment',
              title:      `💬 تعليق جديد على مهمتك`,
              message:    `علّق ${commenterName} على: ${task?.title ?? 'مهمة'}`,
              entityType: 'task',
              entityId:   taskId,
              skipDedup:  true,
            });
          }
        } catch { /* silent — notifications are best-effort */ }

        return comment;
      } catch (err) {
        set({ actionLoading: false, error: err?.message });
        throw err;
      }
    },

    /** Edit an existing task's fields */
    editTask: async (taskId, patch, actorId) => {
      const prev = get().tasks;
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === taskId ? { ...t, ...patch, updated_at: new Date().toISOString() } : t,
        ),
        actionLoading: true,
      }));
      try {
        const updated = await updateTask(taskId, patch, { actorId });
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, ...updated } : t)),
          actionLoading: false,
        }));
        return updated;
      } catch (err) {
        set({ tasks: prev, actionLoading: false, error: err?.message });
        throw err;
      }
    },

    /** Delete a task permanently */
    deleteTask: async (taskId) => {
      const prev = get().tasks;
      set((s) => ({
        tasks: s.tasks.filter((t) => t.id !== taskId),
        selectedTaskId: s.selectedTaskId === taskId ? null : s.selectedTaskId,
        drawerOpen: s.selectedTaskId === taskId ? false : s.drawerOpen,
        actionLoading: true,
      }));
      try {
        await deleteTask(taskId);
        set({ actionLoading: false });
      } catch (err) {
        set({ tasks: prev, actionLoading: false, error: err?.message });
        throw err;
      }
    },

    /** Create a new task and prepend to the list */
    addTask: async (payload, actorId) => {
      set({ actionLoading: true });
      try {
        const task = await createTask(payload, { actorId });
        set((s) => ({ tasks: [task, ...s.tasks], actionLoading: false }));

        // Notify the assigned employee (if different from creator)
        const assignedTo = task.assigned_to ?? task.assignee_id ?? null;
        if (assignedTo && assignedTo !== actorId) {
          import('@modules/notifications/services/notificationService').then(({ sendNotification }) => {
            sendNotification({
              userId:     assignedTo,
              type:       'task_assigned',
              title:      `📋 مهمة جديدة بانتظارك`,
              message:    task.title ?? 'تم تعيين مهمة جديدة لك',
              entityType: 'task',
              entityId:   task.id,
              skipDedup:  false,
            }).catch(() => {});
          }).catch(() => {});
        }

        return task;
      } catch (err) {
        set({ actionLoading: false, error: err?.message });
        throw err;
      }
    },

    /** Upload a file attachment */
    uploadAttachment: async (taskId, file) => {
      set({ actionLoading: true });
      try {
        const att = await uploadTaskAttachment(taskId, file);
        // Optimistically append to task's attachments array
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? { ...t, attachments: [...(t.attachments || []), att] }
              : t,
          ),
          actionLoading: false,
        }));
        return att;
      } catch (err) {
        set({ actionLoading: false, error: err?.message || 'فشل رفع الملف' });
        throw err;
      }
    },

    /** Remove a file attachment */
    removeAttachment: async (taskId, attachmentId) => {
      const prev = get().tasks;
      // Optimistic remove
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === taskId
            ? { ...t, attachments: (t.attachments || []).filter((a) => a.id !== attachmentId) }
            : t,
        ),
      }));
      try {
        await removeTaskAttachment(taskId, attachmentId);
      } catch (err) {
        set({ tasks: prev, error: err?.message || 'فشل حذف المرفق' });
        throw err;
      }
    },

    /** Mark task as seen */
    markSeen: (taskId) => {
      // lazy import to avoid circular deps
      import('@stores/authStore').then(({ useAuthStore }) => {
        const userId = useAuthStore.getState().session?.id ?? null;
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
      // Load full task with comments + activity in background
      fetchTask(taskId)
        .then((fullTask) => {
          set((s) => ({
            tasks: s.tasks.map((t) =>
              t.id === taskId ? { ...t, ...fullTask } : t,
            ),
          }));
        })
        .catch(() => { /* silent — drawer shows cached task data */ });
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

/** Employee list: prefer loaded profiles, fallback to task-derived */
export const selectEmployees = (state) =>
  state.profiles.length > 0 ? state.profiles : extractEmployees(state.tasks);

/** Number of unseen tasks */
export const selectUnseenCount = (state) =>
  state.tasks.filter((t) => !t.seen).length;
