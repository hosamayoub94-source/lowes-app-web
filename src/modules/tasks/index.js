// =============================================================
// Tasks Module — public API.
// Import from here, never from internal paths directly.
// =============================================================

// Page
export { default as TasksPage } from './pages/TasksPage';

// Components (for use outside the module if needed)
export { TaskCard }         from './components/TaskCard';
export { TaskStatsBar }     from './components/TaskStatsBar';
export { TaskFilters }      from './components/TaskFilters';
export { TaskDetailsDrawer } from './components/TaskDetailsDrawer';
export { CommentThread }    from './components/CommentThread';
export { ActivityTimeline } from './components/ActivityTimeline';

// Store + selectors
export {
  useTaskStore,
  selectFilteredTasks,
  selectStats,
  selectSelectedTask,
  selectEmployees,
  selectUnseenCount,
} from './store/useTaskStore';

// Hooks
export { useTasks }         from './hooks/useTasks';
export { useCountdown }     from './hooks/useCountdown';
export { useTaskRealtime }  from './hooks/useTaskRealtime';

// Service layer (for advanced consumers — pages should prefer hooks)
export {
  fetchTasks,
  fetchTask,
  createTask,
  updateTask,
  updateTaskStatus,
  updateTaskProgress,
  updateTaskPriority,
  updateTaskDueDate,
  reassignTask,
  deleteTask,
  markTaskSeen,
  listComments,
  addTaskComment,
  listActivity,
  logActivity,
  listAssignableProfiles,
  subscribeToTasks,
  USE_MOCK_DATA,
} from './services/taskService';

// Mappers (for hand-written subscribers / external integrations)
export { mapTask, mapComment, mapActivity, mapProfile } from './services/taskMappers';

// Types
export {
  TASK_STATUS,
  TASK_PRIORITY,
  ACTIVITY_TYPE,
  STATUS_META,
  PRIORITY_META,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  progressTone,
} from './types/task.types';

// Utils
export {
  isOverdue,
  effectiveStatus,
  daysUntilDue,
  countdownLabel,
  dueDateColorClass,
  shortDate,
  timeAgo,
  filterTasks,
  sortTasks,
  computeStats,
  extractEmployees,
  countActiveFilters,
} from './utils/taskUtils';
