/**
 * In-memory job queue (client-side stub)
 * Handles delayed/async jobs that don't need server persistence.
 * Used by CRM and other modules for non-critical background tasks.
 */

const _queue = new Map(); // jobId → timeoutId

/**
 * Enqueue a named job with optional delay.
 * @param {string} jobName  - e.g. 'crm:score_lead'
 * @param {object} payload  - data to pass to the handler
 * @param {object} options  - { delay: ms (default 0) }
 * @returns {string} jobId
 */
export function enqueue(jobName, payload = {}, { delay = 0 } = {}) {
  const jobId = `${jobName}__${Date.now()}__${Math.random().toString(36).slice(2)}`;

  const timeoutId = setTimeout(() => {
    _queue.delete(jobId);
    _runJob(jobName, payload);
  }, delay);

  _queue.set(jobId, { jobName, payload, timeoutId });
  return jobId;
}

/**
 * Cancel a pending job by its ID.
 */
export function dequeue(jobId) {
  const job = _queue.get(jobId);
  if (job) {
    clearTimeout(job.timeoutId);
    _queue.delete(jobId);
  }
}

/**
 * Returns all pending jobs (for debugging).
 */
export function getPendingJobs() {
  return [..._queue.entries()].map(([id, job]) => ({ id, ...job }));
}

// ── Internal job runner (no-op in frontend — jobs are fire-and-forget stubs) ─
function _runJob(jobName, payload) {
  if (import.meta.env.DEV) {
    console.debug(`[Queue] Running job: ${jobName}`, payload);
  }
  // In production these would be sent to the backend API.
  // For now they are intentional no-ops — the CRM catches errors gracefully.
}
