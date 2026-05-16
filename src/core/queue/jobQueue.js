// =============================================================
// Queue System — Pure Job Utilities
// No React, no Zustand, no service imports.
// =============================================================
import { JOB_STATE, JOB_PRIORITY, JOB_CONFIG, DEFAULT_JOB_CONFIG } from './jobTypes';

// ── Job Factory ───────────────────────────────────────────────

let _seq = 1;

/**
 * Create a new job object (not yet in the store).
 *
 * @param {object} params
 * @param {string}  params.type        — JOB_TYPE value
 * @param {object} [params.payload]    — arbitrary data for the handler
 * @param {number} [params.priority]   — JOB_PRIORITY override
 * @param {number} [params.maxRetries] — override config default
 * @param {Date|number|null} [params.runAt] — schedule delay (Date or ms timestamp)
 * @param {string} [params.idempotencyKey] — dedup across enqueues
 * @returns {object} job
 */
export function createJob({
  type,
  payload      = {},
  priority     = null,
  maxRetries   = null,
  runAt        = null,
  idempotencyKey = null,
}) {
  const cfg = JOB_CONFIG[type] ?? DEFAULT_JOB_CONFIG;

  return {
    id:             `job_${Date.now()}_${String(_seq++).padStart(5, '0')}`,
    type,
    payload,
    state:          JOB_STATE.PENDING,
    priority:       priority     ?? cfg.priority,
    maxRetries:     maxRetries   ?? cfg.maxRetries,
    timeoutMs:      cfg.timeoutMs,
    backoffBase:    cfg.backoffBase,
    attempts:       0,
    error:          null,
    result:         null,
    idempotencyKey: idempotencyKey ?? null,
    runAt:          runAt ? (runAt instanceof Date ? runAt.getTime() : runAt) : null,
    createdAt:      Date.now(),
    startedAt:      null,
    completedAt:    null,
  };
}

// ── Selector ──────────────────────────────────────────────────

/**
 * Pick the next runnable job from the queue.
 *
 * Rules:
 *   1. State must be PENDING (or RETRYING with runAt ≤ now)
 *   2. runAt must be null or ≤ now
 *   3. Sort: priority ASC, createdAt ASC (FIFO within same priority)
 *
 * @param {object[]} jobs   — all jobs in the store
 * @returns {object|null}
 */
export function selectNextJob(jobs) {
  const now = Date.now();

  const runnable = jobs.filter((j) => {
    if (j.state === JOB_STATE.PENDING) {
      return !j.runAt || j.runAt <= now;
    }
    if (j.state === JOB_STATE.RETRYING) {
      return j.runAt && j.runAt <= now;
    }
    return false;
  });

  if (!runnable.length) return null;

  // Sort: lower priority number = higher urgency, then FIFO
  runnable.sort((a, b) =>
    a.priority !== b.priority
      ? a.priority - b.priority
      : a.createdAt - b.createdAt,
  );

  return runnable[0];
}

// ── Backoff ───────────────────────────────────────────────────

/**
 * Calculate the next runAt timestamp using exponential backoff + jitter.
 *
 * Formula: base * 2^attempt + jitter (up to base)
 * Capped at 10 minutes.
 *
 * @param {object} job      — job with backoffBase and attempts
 * @returns {number}        — absolute ms timestamp (Date.now() + delay)
 */
export function calcBackoff(job) {
  const MAX_DELAY_MS = 10 * 60 * 1000; // 10 min cap
  const base         = job.backoffBase ?? 1_000;
  const exp          = Math.min(job.attempts, 10); // cap exponent
  const delay        = Math.min(base * Math.pow(2, exp), MAX_DELAY_MS);
  const jitter       = Math.random() * base;
  return Date.now() + delay + jitter;
}

// ── State Helpers ─────────────────────────────────────────────

/**
 * Returns true for states that will never transition again.
 * @param {string} state — JOB_STATE value
 */
export function isTerminal(state) {
  return (
    state === JOB_STATE.COMPLETED ||
    state === JOB_STATE.CANCELLED
  );
}

/**
 * Returns true if the job has exhausted all retries and should be dead-lettered.
 * @param {object} job
 */
export function isDeadLetter(job) {
  return (
    job.state === JOB_STATE.FAILED &&
    job.attempts >= job.maxRetries
  );
}

/**
 * Compute a breakdown of job counts by state.
 * @param {object[]} jobs
 * @returns {{ pending, processing, completed, failed, cancelled, retrying, total }}
 */
export function computeStats(jobs) {
  const counts = {
    pending:    0,
    processing: 0,
    completed:  0,
    failed:     0,
    cancelled:  0,
    retrying:   0,
  };
  for (const j of jobs) {
    if (counts[j.state] !== undefined) counts[j.state]++;
  }
  return { ...counts, total: jobs.length };
}
