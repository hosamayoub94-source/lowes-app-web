// =============================================================
// Queue System — localStorage Persistence
//
// Hydrates the store on boot from persisted state.
// Saving is handled inline in queueStore._schedulePersist().
// =============================================================
import { useQueueStore } from './queueStore';
import { JOB_STATE }     from './jobTypes';

const KEY_JOBS        = '__queue_jobs';
const KEY_DEAD_LETTER = '__queue_deadLetter';

/**
 * Load persisted queue state into the Zustand store.
 * Should be called once at app boot, before startWorker().
 *
 * Re-queues any PROCESSING jobs back to PENDING (they were
 * interrupted by a page reload) and keeps the rest as-is.
 */
export function hydrateQueue() {
  try {
    const rawJobs = localStorage.getItem(KEY_JOBS);
    const rawDL   = localStorage.getItem(KEY_DEAD_LETTER);

    const savedJobs = rawJobs ? JSON.parse(rawJobs) : [];
    const savedDL   = rawDL  ? JSON.parse(rawDL)   : [];

    // Reset any PROCESSING jobs to PENDING — they were interrupted
    const restoredJobs = savedJobs.map((j) =>
      j.state === JOB_STATE.PROCESSING
        ? { ...j, state: JOB_STATE.PENDING, startedAt: null }
        : j,
    );

    useQueueStore.setState({
      jobs:       restoredJobs,
      deadLetter: savedDL,
    });
  } catch (_) {
    // Corrupt / missing storage — start fresh
    useQueueStore.setState({ jobs: [], deadLetter: [] });
  }
}

/**
 * Clear all persisted queue data from localStorage.
 * Useful for testing or manual reset.
 */
export function clearPersistedQueue() {
  try {
    localStorage.removeItem(KEY_JOBS);
    localStorage.removeItem(KEY_DEAD_LETTER);
  } catch (_) { /* private mode */ }
}
