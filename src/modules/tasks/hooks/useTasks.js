// =============================================================
// useTasks — primary orchestration hook for the Tasks module.
// Loads data on mount, exposes all store slices + actions needed
// by TasksPage. Components import this instead of the store directly.
// =============================================================

import { useEffect, useCallback } from 'react';
import {
  useTaskStore,
  selectFilteredTasks,
  selectStats,
  selectSelectedTask,
  selectEmployees,
  selectUnseenCount,
} from '../store/useTaskStore';
import { useTaskRealtime } from './useTaskRealtime';

export function useTasks({ realtime = true } = {}) {
  // Wire Supabase realtime — NO-OP under mock mode. Mounted here
  // so any consumer of useTasks gets live updates "for free".
  useTaskRealtime({ enabled: realtime });
  // ── Store slices ──────────────────────────────────────────
  const tasks          = useTaskStore((s) => s.tasks);
  const loading        = useTaskStore((s) => s.loading);
  const error          = useTaskStore((s) => s.error);
  const actionLoading  = useTaskStore((s) => s.actionLoading);
  const filters        = useTaskStore((s) => s.filters);
  const drawerOpen     = useTaskStore((s) => s.drawerOpen);
  const filteredTasks  = useTaskStore(selectFilteredTasks);
  const stats          = useTaskStore(selectStats);
  const selectedTask   = useTaskStore(selectSelectedTask);
  const employees      = useTaskStore(selectEmployees);
  const unseenCount    = useTaskStore(selectUnseenCount);

  // ── Store actions ─────────────────────────────────────────
  const loadTasks        = useTaskStore((s) => s.loadTasks);
  const openTask         = useTaskStore((s) => s.openTask);
  const closeDrawer      = useTaskStore((s) => s.closeDrawer);
  const setFilter        = useTaskStore((s) => s.setFilter);
  const toggleFilter     = useTaskStore((s) => s.toggleFilter);
  const resetFilters     = useTaskStore((s) => s.resetFilters);
  const changeStatus     = useTaskStore((s) => s.changeStatus);
  const changeProgress   = useTaskStore((s) => s.changeProgress);
  const postComment      = useTaskStore((s) => s.postComment);
  const addTask          = useTaskStore((s) => s.addTask);
  const clearError       = useTaskStore((s) => s.clearError);
  const uploadAttachment = useTaskStore((s) => s.uploadAttachment);
  const removeAttachment = useTaskStore((s) => s.removeAttachment);

  // ── Initial load ──────────────────────────────────────────
  useEffect(() => {
    // Only fetch if tasks not yet loaded
    if (tasks.length === 0) {
      loadTasks();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stable callbacks ─────────────────────────────────────
  const handleStatusChange = useCallback(
    (taskId, status) => changeStatus(taskId, status),
    [changeStatus],
  );

  const handleProgressChange = useCallback(
    (taskId, progress) => changeProgress(taskId, progress),
    [changeProgress],
  );

  const handlePostComment = useCallback(
    (taskId, payload) => postComment(taskId, payload),
    [postComment],
  );

  const handleAddTask = useCallback(
    (payload, actorId) => addTask(payload, actorId),
    [addTask],
  );

  const handleUploadAttachment = useCallback(
    (taskId, file) => uploadAttachment(taskId, file),
    [uploadAttachment],
  );

  const handleRemoveAttachment = useCallback(
    (taskId, attachmentId) => removeAttachment(taskId, attachmentId),
    [removeAttachment],
  );

  return {
    // State
    tasks,
    filteredTasks,
    loading,
    error,
    actionLoading,
    filters,
    stats,
    selectedTask,
    employees,
    unseenCount,
    drawerOpen,

    // Actions
    loadTasks,
    openTask,
    closeDrawer,
    setFilter,
    toggleFilter,
    resetFilters,
    changeStatus: handleStatusChange,
    changeProgress: handleProgressChange,
    postComment: handlePostComment,
    addTask: handleAddTask,
    clearError,
    uploadAttachment: handleUploadAttachment,
    removeAttachment: handleRemoveAttachment,
  };
}

export default useTasks;
