// =============================================================
// Queue System — Public Barrel Export
// Always import from '@/core/queue' — never from internal files.
// =============================================================

// ── Constants ─────────────────────────────────────────────────
export {
  JOB_TYPE,
  JOB_STATE,
  JOB_PRIORITY,
  JOB_CONFIG,
  DEFAULT_JOB_CONFIG,
  JOB_TYPE_LABELS,
  JOB_STATE_LABELS,
  JOB_PRIORITY_LABELS,
  JOB_STATE_COLORS,
} from './jobTypes';

// ── Pure utilities ────────────────────────────────────────────
export {
  createJob,
  selectNextJob,
  calcBackoff,
  isTerminal,
  isDeadLetter,
  computeStats,
} from './jobQueue';

// ── Zustand store ─────────────────────────────────────────────
export { useQueueStore } from './queueStore';

// ── React hooks ───────────────────────────────────────────────
export {
  useQueue,
  useQueueStats,
  useJobStatus,
  useEnqueue,
  useJobsByState,
  useDeadLetter,
  useQueuePaused,
} from './useQueue';

// ── Worker ────────────────────────────────────────────────────
export {
  configureWorker,
  startWorker,
  stopWorker,
  pauseWorker,
  resumeWorker,
  isWorkerPaused,
  getActiveCount,
} from './queueWorker';

// ── Handler registry ──────────────────────────────────────────
export {
  registerHandler,
  getHandler,
  executeHandler,
} from './queueHandlers';

// ── Persistence ───────────────────────────────────────────────
export {
  hydrateQueue,
  clearPersistedQueue,
} from './queuePersistence';

// ── Event bus bridge ──────────────────────────────────────────
export {
  registerEventBusQueueBridge,
  unregisterEventBusQueueBridge,
} from './eventBusIntegration';

// ── Bootstrap ─────────────────────────────────────────────────
export {
  bootQueue,
  shutdownQueue,
  isQueueBooted,
} from './bootstrap';

// ── Dev / Monitor UI ──────────────────────────────────────────
export { QueueMonitor }      from './monitor/QueueMonitor';
export { DevQueueInspector } from './monitor/DevQueueInspector';
