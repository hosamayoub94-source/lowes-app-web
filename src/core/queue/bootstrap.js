// =============================================================
// Queue System — Bootstrap
//
// bootQueue()     — called once at app start (after bootEventListeners)
// shutdownQueue() — called on app unmount / test teardown
// =============================================================
import { emit, EVENTS }                                             from '@/core/events';
import { hydrateQueue }                                            from './queuePersistence';
import { configureWorker, startWorker, stopWorker,
         pauseWorker, resumeWorker }                               from './queueWorker';
import { useQueueStore }                                           from './queueStore';
import {
  registerEventBusQueueBridge,
  unregisterEventBusQueueBridge,
} from './eventBusIntegration';

let _booted = false;

/**
 * Initialise the background job queue.
 * Safe to call multiple times — idempotent.
 *
 * @param {object} [opts]
 * @param {number} [opts.concurrency=3]  — max parallel workers
 */
export function bootQueue({ concurrency = 3 } = {}) {
  if (_booted) return;
  _booted = true;

  // 1. Restore persisted jobs from localStorage
  hydrateQueue();

  // 2. Wire the worker to the store + event bus
  configureWorker({
    store:       useQueueStore,
    concurrency,
    emit,
    EVENTS,
  });

  // 3. Bridge event bus events → queue jobs
  registerEventBusQueueBridge();

  // 4. Start the processing loop
  startWorker();

  // 5. Sync worker pause state from store (only when paused flag actually changes)
  let _prevPaused = false;
  useQueueStore.subscribe((state) => {
    if (state.paused === _prevPaused) return;
    _prevPaused = state.paused;
    if (state.paused) pauseWorker();
    else resumeWorker();
  });

  // 6. SYSTEM_BOOT is emitted once by events/bootstrap.js — do not re-emit here.

  if (import.meta.env.DEV) {
    console.info('[Queue] Boot complete — concurrency:', concurrency);
  }
}

/**
 * Tear down the queue (graceful shutdown).
 * Stops the worker, removes event subscriptions.
 * Persisted jobs remain in localStorage for next boot.
 */
export function shutdownQueue() {
  if (!_booted) return;
  _booted = false;

  stopWorker();
  unregisterEventBusQueueBridge();

  if (import.meta.env.DEV) {
    console.info('[Queue] Shutdown complete');
  }
}

/** @returns {boolean} */
export function isQueueBooted() {
  return _booted;
}
