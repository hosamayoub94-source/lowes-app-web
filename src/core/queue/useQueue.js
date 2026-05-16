// =============================================================
// Queue System — React Hooks
//
// useQueue()         — full store access (use sparingly)
// useQueueStats()    — live stats object
// useJobStatus(id)   — single job state
// useEnqueue()       — stable enqueue function reference
// useJobsByState(s)  — filtered job list
// =============================================================
import { useCallback } from 'react';
import { useQueueStore } from './queueStore';

// ── Full store (escape hatch) ─────────────────────────────────

export function useQueue() {
  return useQueueStore();
}

// ── Stats ─────────────────────────────────────────────────────

/**
 * Returns live queue statistics.
 * Re-renders on every job state change.
 *
 * @returns {{ pending, processing, completed, failed, cancelled, retrying, total, deadLetterCount }}
 */
export function useQueueStats() {
  return useQueueStore((s) => s.getStats());
}

// ── Single job status ─────────────────────────────────────────

/**
 * Returns the current state (and error) of a specific job.
 * Returns null if the job doesn't exist.
 *
 * @param {string} jobId
 * @returns {{ state: string, error: string|null, result: any }|null}
 */
export function useJobStatus(jobId) {
  return useQueueStore((s) => {
    const job = s.jobs.find((j) => j.id === jobId)
             ?? s.deadLetter.find((j) => j.id === jobId);
    if (!job) return null;
    return { state: job.state, error: job.error, result: job.result };
  });
}

// ── Enqueue ───────────────────────────────────────────────────

/**
 * Returns a stable enqueue function — safe to use in event handlers
 * without triggering dependency-array churn.
 *
 * @returns {(type: string, payload?: object, opts?: object) => string}
 */
export function useEnqueue() {
  const enqueue = useQueueStore((s) => s.enqueue);
  return useCallback(
    (type, payload = {}, opts = {}) => enqueue(type, payload, opts),
    [enqueue],
  );
}

// ── Jobs by state ─────────────────────────────────────────────

/**
 * Returns all jobs with a specific state.
 * Memoised — only re-renders when the filtered list changes.
 *
 * @param {string} state — JOB_STATE value
 * @returns {object[]}
 */
export function useJobsByState(state) {
  return useQueueStore((s) => s.jobs.filter((j) => j.state === state));
}

// ── Dead-letter ───────────────────────────────────────────────

/**
 * Returns the dead-letter queue entries.
 * @returns {object[]}
 */
export function useDeadLetter() {
  return useQueueStore((s) => s.deadLetter);
}

// ── Paused state ──────────────────────────────────────────────

/**
 * Returns true when the worker is paused.
 * @returns {boolean}
 */
export function useQueuePaused() {
  return useQueueStore((s) => s.paused);
}
