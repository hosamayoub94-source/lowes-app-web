// =============================================================
// stressTestUtils — Load + stress simulation utilities
//
// Tests system resilience under:
//   • Realtime event floods
//   • Queue overload
//   • Notification bursts
//   • Concurrent action storms
//   • Memory pressure
//
// All functions are DEV-only and clearly labeled.
// =============================================================
import { createLogger }  from '@/core/production/productionLogger';
import { emit }          from '@/core/events/eventBus';
import { enqueueOfflineAction } from '@/core/production/offlineRecovery';
import { acquireLock, releaseLock } from '@/core/production/actionLock';
import { burst, fireNotification, fireTaskUpdate, fireCommentAdded } from '../mocks/mockRealtime';
import { makeTask, makeQueueJob }   from '../mocks/mockFactories';
import { sleep }                     from '../mocks/networkSimulation';

const log = createLogger('StressTest');

// ── Active stress tests registry ──────────────────────────────
const _active = new Map();

function _register(name, stopper) {
  _active.set(name, stopper);
  log.warn(`[StressTest] Started: ${name}`);
}

function _unregister(name) {
  _active.delete(name);
  log.info(`[StressTest] Stopped: ${name}`);
}

// ── Realtime flood ─────────────────────────────────────────────
/**
 * Flood the event bus with realtime events.
 * @param {number} eventsPerSec
 * @param {number} durationSec
 */
export function stressRealtime(eventsPerSec = 10, durationSec = 10) {
  const intervalMs = 1000 / eventsPerSec;
  let count = 0;
  const factories = [fireTaskUpdate, fireCommentAdded, fireNotification];

  log.warn(`[StressTest] Realtime flood: ${eventsPerSec}/s for ${durationSec}s`);

  const timer = setInterval(() => {
    factories[count % factories.length]();
    count++;
  }, intervalMs);

  const stop = () => { clearInterval(timer); _unregister('realtime_flood'); };
  setTimeout(stop, durationSec * 1000);
  _register('realtime_flood', stop);
  return stop;
}

// ── Queue overload ─────────────────────────────────────────────
/**
 * Enqueue many offline actions rapidly to test queue capacity.
 * @param {number} count
 */
export async function stressQueue(count = 50) {
  log.warn(`[StressTest] Queue overload: enqueuing ${count} actions`);
  const start = Date.now();

  for (let i = 0; i < count; i++) {
    enqueueOfflineAction(
      `stress.test_action_${i % 5}`,
      { testIndex: i, timestamp: Date.now() },
      { maxRetries: 1, label: `Stress action #${i}` }
    );
    if (i % 10 === 0) await sleep(10); // yield to event loop
  }

  const elapsed = Date.now() - start;
  log.info(`[StressTest] Queued ${count} actions in ${elapsed}ms`);
  return { count, elapsed };
}

// ── Notification burst ────────────────────────────────────────
/**
 * Fire N notifications rapidly.
 */
export function stressNotifications(count = 30, intervalMs = 100) {
  log.warn(`[StressTest] Notification burst: ${count} @ ${intervalMs}ms`);
  const stop = burst(
    () => fireNotification({ title: `إشعار ضغط #${Date.now()}`, type: ['system','mention','task_assigned'][Math.floor(Math.random()*3)] }),
    count,
    intervalMs
  );
  _register('notification_burst', stop);
  return stop;
}

// ── Concurrent actions storm ───────────────────────────────────
/**
 * Attempt many concurrent lock acquisitions to test action lock behavior.
 */
export async function stressConcurrentActions(concurrency = 20) {
  log.warn(`[StressTest] Concurrent actions: ${concurrency} simultaneous`);
  const results = { acquired: 0, blocked: 0 };

  const promises = Array.from({ length: concurrency }, async (_, i) => {
    const key = `stress:concurrent:${i % 5}`; // 5 unique keys = some must block
    const acquired = acquireLock(key, 500);
    if (acquired) {
      results.acquired++;
      await sleep(100 + Math.random() * 200);
      releaseLock(key);
    } else {
      results.blocked++;
    }
  });

  await Promise.all(promises);
  log.info(`[StressTest] Concurrent results:`, results);
  return results;
}

// ── Memory pressure ────────────────────────────────────────────
/**
 * Allocate and release memory to test GC behavior.
 * Not harmful — just fills/clears arrays.
 */
export function stressMemory(sizeMB = 20) {
  log.warn(`[StressTest] Memory pressure: allocating ~${sizeMB}MB`);
  const start = performance?.memory?.usedJSHeapSize ?? 0;

  // Each string ~1KB, so sizeMB * 1000 strings ≈ sizeMB MB
  const arr = Array.from({ length: sizeMB * 500 }, () => 'x'.repeat(2000));
  const after = performance?.memory?.usedJSHeapSize ?? 0;
  const allocated = Math.round((after - start) / 1_048_576);

  log.info(`[StressTest] Allocated ~${allocated}MB — releasing in 5s`);

  return new Promise((resolve) => {
    setTimeout(() => {
      arr.length = 0; // release
      resolve({ allocatedMB: allocated });
    }, 5000);
  });
}

// ── Stop all active tests ──────────────────────────────────────
export function stopAllStressTests() {
  for (const [name, stop] of _active) {
    stop?.();
    log.info(`[StressTest] Stopped: ${name}`);
  }
  _active.clear();
}

export function getActiveStressTests() { return [..._active.keys()]; }

// ── Expose on window in DEV ────────────────────────────────────
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__stressTest = {
    stressRealtime, stressQueue, stressNotifications,
    stressConcurrentActions, stressMemory,
    stopAllStressTests, getActiveStressTests,
  };
}
