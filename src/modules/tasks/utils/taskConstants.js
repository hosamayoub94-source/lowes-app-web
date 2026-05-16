// =============================================================
// Re-export shim — canonical constants live in ../types/task.types.
// Kept here only so older imports continue to resolve.
// =============================================================
export {
  TASK_STATUS,
  TASK_PRIORITY,
  ACTIVITY_TYPE,
  STATUS_META,
  PRIORITY_META,
  ACTIVITY_META,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  progressTone,
} from '../types/task.types';

// Service mode flag — true when running against mock data.
export { USE_MOCK_DATA } from '../services/taskService';
