// =============================================================
// operationalReplay — Failed workflow + action replay engine
//
// Records actionable sequences and replays them to:
//   • Reproduce bugs from production
//   • Retry failed workflows end-to-end
//   • Replay queue failures with original payloads
//   • Simulate realtime disconnect + reconnect
// =============================================================
import { createLogger }          from '@/core/production/productionLogger';
import { emit, on, onAny }       from '@/core/events/eventBus';
import { enqueueOfflineAction }  from '@/core/production/offlineRecovery';

const log = createLogger('OperationalReplay');

// ── Replay store ───────────────────────────────────────────────
const _replayLog  = [];   // all replayable sequences
const MAX_REPLAYS = 100;

// ── Record a replayable action sequence ───────────────────────
export function recordReplayableSequence(name, steps = [], meta = {}) {
  const record = {
    id:        `rp_${Date.now()}`,
    name,
    steps,     // [{ type: 'event'|'action'|'queue', payload, delay }]
    meta,
    recordedAt: Date.now(),
    replayed:   0,
  };

  _replayLog.unshift(record);
  if (_replayLog.length > MAX_REPLAYS) _replayLog.pop();

  log.debug(`Replay recorded: ${name} (${steps.length} steps)`);
  return record.id;
}

// ── Auto-record from event bus ────────────────────────────────
const _recordingBuffer = [];
let   _recordingActive = false;
let   _recordingStart  = null;

export function startRecording(label = 'Recording') {
  if (_recordingActive) return;
  _recordingBuffer.length = 0;
  _recordingActive        = true;
  _recordingStart         = Date.now();

  // We intercept via on('*') if available
  const unsub = _subscribeAll((type, payload) => {
    _recordingBuffer.push({ type: 'event', eventType: type, payload, delay: Date.now() - _recordingStart });
  });

  log.info(`Replay recording started: ${label}`);
  return () => stopRecording(label, unsub);
}

export function stopRecording(label, unsub) {
  if (!_recordingActive) return null;
  _recordingActive = false;
  unsub?.();

  const id = recordReplayableSequence(label, [..._recordingBuffer], { duration: Date.now() - _recordingStart });
  _recordingBuffer.length = 0;

  log.info(`Replay recording stopped: ${label} — ${_replayLog[0]?.steps.length ?? 0} steps`);
  return id;
}

function _subscribeAll(handler) {
  // Try to use wildcard subscription if available
  try {
    return onAny?.(handler) ?? (() => {});
  } catch { return () => {}; }
}

// ── Replay a recorded sequence ─────────────────────────────────
export async function replaySequence(id, { speedMultiplier = 1, dryRun = false } = {}) {
  const record = _replayLog.find((r) => r.id === id);
  if (!record) {
    log.warn(`Replay not found: ${id}`);
    return { success: false, error: 'not_found' };
  }

  log.info(`Replaying: "${record.name}" (${record.steps.length} steps, ${speedMultiplier}x)`);
  record.replayed++;

  const results = [];

  for (const step of record.steps) {
    const delay = Math.max(0, (step.delay ?? 0) / speedMultiplier);
    if (delay > 0) await _sleep(delay);

    if (dryRun) {
      results.push({ step, status: 'dry_run' });
      continue;
    }

    try {
      if (step.type === 'event') {
        emit(step.eventType, step.payload);
        results.push({ step, status: 'emitted' });
      } else if (step.type === 'queue') {
        enqueueOfflineAction(step.actionType, step.payload);
        results.push({ step, status: 'enqueued' });
      } else if (step.type === 'action' && typeof step.fn === 'function') {
        await step.fn(step.payload);
        results.push({ step, status: 'executed' });
      }
    } catch (err) {
      results.push({ step, status: 'error', error: err.message });
      log.warn(`Replay step failed: ${step.eventType ?? step.type}`, { error: err.message });
    }
  }

  const success = results.every((r) => r.status !== 'error');
  log.info(`Replay complete: "${record.name}" — ${results.length} steps, success: ${success}`);

  return { success, results, record };
}

// ── Replay failed queue items ──────────────────────────────────
export function getReplayableQueueItems() {
  try {
    const raw  = localStorage.getItem('__prod_offline_queue:dead');
    if (!raw) return [];
    const dead = JSON.parse(raw);
    if (!Array.isArray(dead)) return [];
    return dead.map((item) => ({
      id:     item.id,
      type:   item.type ?? item.action,
      reason: item.failReason ?? item.lastError,
      ts:     item.lastAttempt,
      payload: item.payload ?? item.data,
    }));
  } catch { return []; }
}

export function replayQueueItem(itemId) {
  try {
    const raw  = localStorage.getItem('__prod_offline_queue:dead');
    if (!raw) return { success: false, error: 'no_dead_queue' };
    const dead = JSON.parse(raw);
    const item = dead.find((i) => i.id === itemId);
    if (!item) return { success: false, error: 'item_not_found' };

    enqueueOfflineAction(item.type ?? item.action, item.payload ?? item.data, {
      maxRetries: 1,
      label:      `Replay: ${item.type}`,
    });

    // Remove from dead queue
    const remaining = dead.filter((i) => i.id !== itemId);
    localStorage.setItem('__prod_offline_queue:dead', JSON.stringify(remaining));

    log.info(`Queue item replayed: ${itemId}`);
    return { success: true, itemId };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Realtime disconnect simulation ────────────────────────────
export async function replayDisconnectSequence(disconnectDurationMs = 5000) {
  log.info(`Simulating disconnect for ${disconnectDurationMs}ms`);

  // Dispatch offline
  window.dispatchEvent(new Event('offline'));
  emit('realtime.disconnected', { simulated: true, ts: Date.now() });

  await _sleep(disconnectDurationMs);

  // Reconnect
  window.dispatchEvent(new Event('online'));
  emit('realtime.reconnected', { simulated: true, ts: Date.now() });

  log.info('Disconnect replay complete — reconnected');
  return { success: true, disconnectDurationMs };
}

// ── Failed workflow replay ─────────────────────────────────────
const _failedWorkflows = [];

export function recordFailedWorkflow(workflowType, steps, failReason) {
  _failedWorkflows.unshift({ workflowType, steps, failReason, ts: Date.now() });
  if (_failedWorkflows.length > 50) _failedWorkflows.pop();
}

export function getFailedWorkflows() { return [..._failedWorkflows]; }

export async function replayFailedWorkflow(index = 0) {
  const wf = _failedWorkflows[index];
  if (!wf) return { success: false, error: 'not_found' };

  log.info(`Replaying failed workflow: ${wf.workflowType}`);
  const id = recordReplayableSequence(
    `Retry: ${wf.workflowType}`,
    wf.steps.map((s, i) => ({ type: 'event', eventType: s.event, payload: s.payload, delay: i * 100 }))
  );

  return replaySequence(id, { speedMultiplier: 2 });
}

// ── Inspection ────────────────────────────────────────────────
export function getReplayLog()                 { return [..._replayLog]; }
export function getReplayById(id)              { return _replayLog.find((r) => r.id === id) ?? null; }

// ── Helpers ───────────────────────────────────────────────────
function _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── Expose on window in DEV ────────────────────────────────────
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__operationalReplay = {
    startRecording, stopRecording, replaySequence, getReplayLog,
    getReplayableQueueItems, replayQueueItem,
    replayDisconnectSequence, replayFailedWorkflow, getFailedWorkflows,
  };
}
