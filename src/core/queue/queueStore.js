// =============================================================
// Queue System — Zustand Store
//
// State shape:
//   jobs        — active + historical job array
//   deadLetter  — permanently failed jobs (separate list)
//   paused      — worker is paused
//
// Actions:
//   enqueue(type, payload, opts)   → string (jobId)
//   cancel(jobId)
//   retry(jobId)                   — move DL job back to pending
//   clearCompleted()
//   clearDeadLetter()
//   pauseQueue() / resumeQueue()
//
// Internal (used by worker — prefixed with _):
//   _setJobState(id, state, patch)
//   _deadLetter(id, errorMsg, attempts)
// =============================================================
import { create } from 'zustand';
import { JOB_STATE } from './jobTypes';
import { createJob, computeStats } from './jobQueue';

// ── Store ─────────────────────────────────────────────────────

export const useQueueStore = create((set, get) => ({
  // ── State ─────────────────────────────────────────────────
  jobs:       [],
  deadLetter: [],
  paused:     false,

  // ── Public actions ────────────────────────────────────────

  /**
   * Add a new job to the queue.
   *
   * @param {string}  type
   * @param {object} [payload={}]
   * @param {object} [opts]
   * @param {number} [opts.priority]
   * @param {number} [opts.maxRetries]
   * @param {Date|number} [opts.runAt]
   * @param {string} [opts.idempotencyKey]
   * @returns {string} jobId
   */
  enqueue(type, payload = {}, opts = {}) {
    // Idempotency check: don't enqueue if an identical non-terminal job exists
    const { idempotencyKey } = opts;
    if (idempotencyKey) {
      const existing = get().jobs.find(
        (j) =>
          j.idempotencyKey === idempotencyKey &&
          j.state !== JOB_STATE.COMPLETED &&
          j.state !== JOB_STATE.CANCELLED,
      );
      if (existing) return existing.id;
    }

    const job = createJob({ type, payload, ...opts });

    set((s) => ({ jobs: [...s.jobs, job] }));

    // Persist after enqueue
    _schedulePersist(get);

    return job.id;
  },

  /**
   * Cancel a pending or retrying job.
   * Jobs that are already processing cannot be cancelled here
   * (the worker timeout will handle them).
   */
  cancel(jobId) {
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId &&
        (j.state === JOB_STATE.PENDING || j.state === JOB_STATE.RETRYING)
          ? { ...j, state: JOB_STATE.CANCELLED, completedAt: Date.now() }
          : j,
      ),
    }));
    _schedulePersist(get);
  },

  /**
   * Re-queue a dead-lettered job (reset to PENDING, zero attempts).
   * @param {string} jobId — dead letter entry id
   */
  retry(jobId) {
    const dl = get().deadLetter.find((j) => j.id === jobId);
    if (!dl) return;

    const revived = {
      ...dl,
      state:    JOB_STATE.PENDING,
      attempts: 0,
      error:    null,
      runAt:    null,
      startedAt:   null,
      completedAt: null,
    };

    set((s) => ({
      deadLetter: s.deadLetter.filter((j) => j.id !== jobId),
      jobs:       [...s.jobs, revived],
    }));
    _schedulePersist(get);
  },

  /** Remove all COMPLETED jobs from the active list. */
  clearCompleted() {
    set((s) => ({
      jobs: s.jobs.filter((j) => j.state !== JOB_STATE.COMPLETED),
    }));
    _schedulePersist(get);
  },

  /** Wipe the dead-letter queue. */
  clearDeadLetter() {
    set({ deadLetter: [] });
    _schedulePersist(get);
  },

  pauseQueue() {
    set({ paused: true });
  },

  resumeQueue() {
    set({ paused: false });
  },

  // ── Internal (worker-only) ────────────────────────────────

  /**
   * Update a job's state and merge a patch object.
   * @param {string} id
   * @param {string} state  — JOB_STATE value
   * @param {object} [patch]
   */
  _setJobState(id, state, patch = {}) {
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === id ? { ...j, state, ...patch } : j,
      ),
    }));
    _schedulePersist(get);
  },

  /**
   * Move a job to the dead-letter queue.
   * @param {string} id
   * @param {string} errorMsg
   * @param {number} attempts
   */
  _deadLetter(id, errorMsg, attempts) {
    const job = get().jobs.find((j) => j.id === id);
    if (!job) return;

    const dlEntry = {
      ...job,
      state:       JOB_STATE.FAILED,
      error:       errorMsg,
      attempts,
      completedAt: Date.now(),
    };

    set((s) => ({
      jobs:       s.jobs.filter((j) => j.id !== id),
      deadLetter: [dlEntry, ...s.deadLetter],
    }));
    _schedulePersist(get);
  },

  // ── Derived / Selectors ───────────────────────────────────

  /**
   * Compute real-time queue statistics.
   * @returns {{ pending, processing, completed, failed, cancelled, retrying, total, deadLetterCount }}
   */
  getStats() {
    const { jobs, deadLetter } = get();
    return { ...computeStats(jobs), deadLetterCount: deadLetter.length };
  },
}));

// ── Deferred persistence ──────────────────────────────────────
// Debounced to avoid hammering localStorage on rapid enqueues.

let _persistTimer = null;

function _schedulePersist(get) {
  if (_persistTimer) return;
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    try {
      const { jobs, deadLetter } = get();
      // Persist only non-terminal active jobs + last 50 completed for history
      const active = jobs.filter((j) => j.state !== JOB_STATE.COMPLETED);
      const recentDone = jobs
        .filter((j) => j.state === JOB_STATE.COMPLETED)
        .slice(-50);
      const toSave = [...active, ...recentDone];
      localStorage.setItem('__queue_jobs',       JSON.stringify(toSave));
      localStorage.setItem('__queue_deadLetter', JSON.stringify(deadLetter));
    } catch (_) { /* quota exceeded or private mode — silently skip */ }
  }, 200);
}
