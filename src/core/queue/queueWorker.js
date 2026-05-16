// =============================================================
// Queue System — Worker Engine
//
// Features:
//   • Non-blocking loop (requestIdleCallback / setTimeout fallback)
//   • Configurable concurrency (default: 3 parallel jobs)
//   • Per-job timeout enforcement via Promise.race
//   • Exponential backoff with jitter on failure
//   • Dead-letter after maxRetries exhausted
//   • Event bus integration (emits queue:* events on state changes)
//   • Pause / resume support
// =============================================================
import { JOB_STATE }                from './jobTypes';
import { selectNextJob, calcBackoff } from './jobQueue';
import { executeHandler }            from './queueHandlers';

// ── Worker State ──────────────────────────────────────────────

let _store          = null;   // queueStore (zustand) — injected at boot
let _paused         = false;
let _running        = 0;      // concurrent active jobs
let _tickHandle     = null;
let _concurrency    = 3;
let _emit           = null;   // emit(eventName, payload) from event bus
let _EVENTS         = null;   // flat EVENTS map from @/core/events

const TICK_INTERVAL_MS = 300;
const IDLE_TIMEOUT_MS  = 1_000;

// ── Dependency injection ──────────────────────────────────────

/**
 * Wire the worker to the queue store + event bus.
 * Must be called before startWorker().
 *
 * @param {object}   opts
 * @param {object}   opts.store        — useQueueStore (zustand store ref)
 * @param {number}  [opts.concurrency] — max parallel jobs (default 3)
 * @param {function}[opts.emit]        — emit() from @/core/events
 * @param {object}  [opts.EVENTS]      — flat EVENTS map
 */
export function configureWorker({ store, concurrency = 3, emit = null, EVENTS = null }) {
  _store       = store;
  _concurrency = concurrency;
  _emit        = emit;
  _EVENTS      = EVENTS;
}

// ── Public API ────────────────────────────────────────────────

export function startWorker() {
  if (_tickHandle !== null) return;
  _paused = false;
  _scheduleTick();
}

export function stopWorker() {
  _cancelTick();
}

export function pauseWorker() {
  _paused = true;
  _emitSafe(_EVENTS?.QUEUE_PAUSED, {});
}

export function resumeWorker() {
  _paused = false;
  _emitSafe(_EVENTS?.QUEUE_RESUMED, {});
  _scheduleTick();
}

export function isWorkerPaused() { return _paused; }
export function getActiveCount()  { return _running; }

// ── Tick loop ─────────────────────────────────────────────────

function _scheduleTick() {
  _cancelTick();
  if (typeof requestIdleCallback === 'function') {
    _tickHandle = requestIdleCallback(_onTick, { timeout: IDLE_TIMEOUT_MS });
  } else {
    _tickHandle = setTimeout(_onTick, TICK_INTERVAL_MS);
  }
}

function _cancelTick() {
  if (_tickHandle === null) return;
  if (typeof cancelIdleCallback === 'function') cancelIdleCallback(_tickHandle);
  else clearTimeout(_tickHandle);
  _tickHandle = null;
}

async function _onTick() {
  _tickHandle = null;

  if (!_store || _paused) {
    _scheduleTick();
    return;
  }

  // Fill concurrency slots
  while (_running < _concurrency) {
    const jobs = _store.getState().jobs;
    const next = selectNextJob(jobs);
    if (!next) break;

    _running++;
    _store.getState()._setJobState(next.id, JOB_STATE.PROCESSING, {
      startedAt: Date.now(),
    });

    _processJob(next).finally(() => {
      _running--;
    });
  }

  _scheduleTick();
}

// ── Job processor ─────────────────────────────────────────────

async function _processJob(job) {
  try {
    const result = await Promise.race([
      executeHandler(job),
      _timeoutPromise(job.timeoutMs, job.id),
    ]);

    _store.getState()._setJobState(job.id, JOB_STATE.COMPLETED, {
      result,
      completedAt: Date.now(),
      error: null,
    });

    _emitSafe(_EVENTS?.QUEUE_JOB_COMPLETED, {
      jobId:   job.id,
      jobType: job.type,
      result,
    });

  } catch (err) {
    const attempts    = (job.attempts ?? 0) + 1;
    const maxRetries  = job.maxRetries ?? 3;
    const errMsg      = err?.message ?? String(err);

    if (attempts >= maxRetries) {
      // ── Dead-letter ──
      _store.getState()._deadLetter(job.id, errMsg, attempts);
      _emitSafe(_EVENTS?.QUEUE_JOB_DEAD_LETTERED, {
        jobId:    job.id,
        jobType:  job.type,
        error:    errMsg,
        attempts,
      });
    } else {
      // ── Retry with backoff ──
      const runAt = calcBackoff({ ...job, attempts });
      _store.getState()._setJobState(job.id, JOB_STATE.RETRYING, {
        attempts,
        runAt,
        error: errMsg,
      });
      _emitSafe(_EVENTS?.QUEUE_JOB_FAILED, {
        jobId:    job.id,
        jobType:  job.type,
        error:    errMsg,
        attempts,
        retryAt:  runAt,
      });
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────

function _timeoutPromise(ms, jobId) {
  return new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`Job ${jobId} timed out after ${ms}ms`)),
      ms,
    ),
  );
}

function _emitSafe(eventName, payload) {
  if (_emit && eventName) {
    try { _emit(eventName, payload); } catch (_) { /* never throw */ }
  }
}
