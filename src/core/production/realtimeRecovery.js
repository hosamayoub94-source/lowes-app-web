// =============================================================
// realtimeRecovery — Supabase Realtime Resilience Engine
//
// Handles:
//   • Channel registration + health tracking
//   • Heartbeat ping every 15s (configurable)
//   • Exponential backoff reconnect on disconnect
//   • Stale subscription detection + cleanup
//   • Auto-resubscribe after reconnect
//   • Online/offline event bridge
//
// Usage:
//   import { registerChannel, unregisterChannel, initRealtimeRecovery }
//     from '@/core/production/realtimeRecovery';
//
//   // Register a channel so recovery tracks it
//   registerChannel('tasks', () => supabase.channel('tasks')
//     .on('postgres_changes', ..., handler)
//     .subscribe());
//
//   // Init once at app boot
//   initRealtimeRecovery(supabaseClient);
// =============================================================
import { getFlag }      from './productionConfig';
import { createLogger } from './productionLogger';
import { captureError } from './errorReporter';
import { emit }         from '@/core/events/eventBus';
import { EVENTS }       from '@/core/events/eventTypes';

const log = createLogger('RealtimeRecovery');

// ── Internal state ─────────────────────────────────────────────
let _supabase        = null;
let _initialized     = false;
let _heartbeatTimer  = null;
let _reconnectTimer  = null;
let _reconnectCount  = 0;
let _lastHeartbeat   = null;
let _isOnline        = typeof navigator !== 'undefined' ? navigator.onLine : true;
let _realtimeStatus  = 'connected'; // 'connected'|'reconnecting'|'offline'|'error'

// Channel registry: name → { factory, channel, subscribedAt, healthy }
const _channels = new Map();

// ── Status helpers ─────────────────────────────────────────────
function _setStatus(status) {
  if (_realtimeStatus === status) return;
  _realtimeStatus = status;
  log.info(`realtime status → ${status}`);
  emit(EVENTS.SYSTEM?.REALTIME_STATUS_CHANGED ?? 'system:realtime_status_changed', { status });
}

export function getRealtimeStatus() { return _realtimeStatus; }
export function getReconnectCount() { return _reconnectCount; }
export function getLastHeartbeat()  { return _lastHeartbeat; }

// ── Channel registration ───────────────────────────────────────
/**
 * Register a channel for automatic recovery.
 *
 * @param {string}   name     — unique channel identifier
 * @param {function(): RealtimeChannel} factory — creates + subscribes the channel
 */
export function registerChannel(name, factory) {
  if (_channels.has(name)) {
    log.warn(`channel already registered: "${name}" — skipping`);
    return;
  }

  _channels.set(name, {
    factory,
    channel:      null,
    subscribedAt: null,
    healthy:      false,
  });

  log.debug(`channel registered: "${name}"`);

  // Subscribe immediately if we're already initialized
  if (_initialized) _subscribeChannel(name);
}

/**
 * Remove channel from recovery tracking and unsubscribe.
 * @param {string} name
 */
export function unregisterChannel(name) {
  const entry = _channels.get(name);
  if (!entry) return;

  _cleanupChannel(name, entry);
  _channels.delete(name);
  log.debug(`channel unregistered: "${name}"`);
}

// ── Subscribe / cleanup ────────────────────────────────────────
function _subscribeChannel(name) {
  const entry = _channels.get(name);
  if (!entry) return;

  // Clean up old channel first
  if (entry.channel) _cleanupChannel(name, entry);

  try {
    const channel = entry.factory();

    // Patch channel status callbacks if Supabase exposes them
    if (channel && typeof channel.on === 'function') {
      const originalOn = channel.on.bind(channel);
      channel._onStatus = (status) => {
        const rec = _channels.get(name);
        if (!rec) return;

        if (status === 'SUBSCRIBED') {
          rec.healthy      = true;
          rec.subscribedAt = Date.now();
          log.info(`channel subscribed: "${name}"`);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          rec.healthy = false;
          log.warn(`channel error: "${name}" (${status})`);
          _scheduleReconnect();
        } else if (status === 'CLOSED') {
          rec.healthy = false;
          log.warn(`channel closed: "${name}"`);
        }
      };
    }

    const rec = _channels.get(name);
    if (rec) {
      rec.channel      = channel;
      rec.subscribedAt = Date.now();
      rec.healthy      = true; // optimistic until error
    }
  } catch (err) {
    captureError(err, { context: `realtimeRecovery:subscribeChannel:${name}` });
    log.error(`failed to subscribe channel: "${name}"`, { error: err?.message });
  }
}

function _cleanupChannel(name, entry) {
  if (!entry.channel) return;
  try {
    if (_supabase && typeof _supabase.removeChannel === 'function') {
      _supabase.removeChannel(entry.channel);
    } else if (typeof entry.channel.unsubscribe === 'function') {
      entry.channel.unsubscribe();
    }
  } catch (err) {
    log.warn(`cleanup error for channel "${name}"`, { error: err?.message });
  }
  entry.channel      = null;
  entry.healthy      = false;
  entry.subscribedAt = null;
}

// ── Stale detection ────────────────────────────────────────────
const STALE_THRESHOLD_MS = 5 * 60_000; // 5 min without heartbeat = stale

function _detectStaleChannels() {
  const now = Date.now();
  for (const [name, entry] of _channels) {
    if (!entry.channel || !entry.subscribedAt) continue;
    const age = now - entry.subscribedAt;
    if (age > STALE_THRESHOLD_MS && !entry.healthy) {
      log.warn(`stale channel detected: "${name}" (${Math.round(age / 1000)}s old)`);
      _subscribeChannel(name); // re-subscribe
    }
  }
}

// ── Heartbeat ─────────────────────────────────────────────────
function _startHeartbeat() {
  _stopHeartbeat();
  const intervalMs = getFlag('realtimeHeartbeatMs');

  _heartbeatTimer = setInterval(() => {
    if (!_isOnline) return;

    _lastHeartbeat = Date.now();

    // Check all channels for health
    let anyUnhealthy = false;
    for (const [name, entry] of _channels) {
      if (entry.channel && !entry.healthy) {
        anyUnhealthy = true;
        log.warn(`unhealthy channel detected: "${name}"`);
      }
    }

    if (anyUnhealthy) {
      _scheduleReconnect();
    } else if (_realtimeStatus === 'connected') {
      log.debug('heartbeat ✓', { channels: _channels.size });
    }

    _detectStaleChannels();
  }, intervalMs);

  log.info(`heartbeat started (every ${intervalMs}ms)`);
}

function _stopHeartbeat() {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
}

// ── Reconnect logic ────────────────────────────────────────────
function _backoffMs(attempt) {
  const base   = getFlag('realtimeReconnectBaseMs');
  const maxMs  = getFlag('realtimeReconnectMaxMs');
  const exp    = Math.min(base * 2 ** attempt, maxMs);
  const jitter = Math.random() * exp * 0.2;
  return Math.round(exp + jitter);
}

function _scheduleReconnect() {
  if (_reconnectTimer) return; // already scheduled
  if (!_isOnline) return;       // wait for online event instead

  const maxReconnects = getFlag('realtimeMaxReconnects');
  if (_reconnectCount >= maxReconnects) {
    log.error(`max reconnects reached (${maxReconnects}). Giving up.`);
    _setStatus('error');
    captureError(new Error('Realtime max reconnects exceeded'), {
      context: 'realtimeRecovery',
      extra:   { reconnectCount: _reconnectCount },
    });
    return;
  }

  const delay = _backoffMs(_reconnectCount);
  _setStatus('reconnecting');
  log.warn(`scheduling reconnect #${_reconnectCount + 1} in ${delay}ms`);

  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    _reconnectCount++;
    _reconnectAllChannels();
  }, delay);
}

function _cancelReconnect() {
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
}

function _reconnectAllChannels() {
  if (!_isOnline) return;
  log.info(`reconnecting all channels (attempt #${_reconnectCount})`);

  for (const [name] of _channels) {
    _subscribeChannel(name);
  }

  // Assume success; channels will self-report via _onStatus if they fail
  _setStatus('connected');
  log.info('all channels resubscribed');
}

// ── Online / Offline bridge ────────────────────────────────────
function _onOnline() {
  if (_isOnline) return;
  _isOnline = true;
  log.info('network online — reconnecting realtime');
  _setStatus('reconnecting');
  _cancelReconnect();
  _reconnectCount = 0; // reset backoff on fresh network recovery
  _reconnectAllChannels();
  _startHeartbeat();
}

function _onOffline() {
  _isOnline = false;
  _setStatus('offline');
  _stopHeartbeat();
  _cancelReconnect();
  log.warn('network offline — realtime paused');
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Initialize the realtime recovery engine.
 * Call once at app boot, after Supabase client is ready.
 *
 * @param {SupabaseClient} supabaseClient
 */
export function initRealtimeRecovery(supabaseClient) {
  if (_initialized || !getFlag('enableRealtimeRecovery')) return;
  _initialized = true;
  _supabase    = supabaseClient;

  // Subscribe all already-registered channels
  for (const [name] of _channels) {
    _subscribeChannel(name);
  }

  // Browser events
  if (typeof window !== 'undefined') {
    window.addEventListener('online',  _onOnline);
    window.addEventListener('offline', _onOffline);
  }

  _startHeartbeat();
  log.info('RealtimeRecovery initialized', { channels: _channels.size });
}

/**
 * Tear down all listeners and timers. Call on app unmount.
 */
export function destroyRealtimeRecovery() {
  _stopHeartbeat();
  _cancelReconnect();

  for (const [name, entry] of _channels) {
    _cleanupChannel(name, entry);
  }
  _channels.clear();

  if (typeof window !== 'undefined') {
    window.removeEventListener('online',  _onOnline);
    window.removeEventListener('offline', _onOffline);
  }

  _initialized   = false;
  _reconnectCount = 0;
  _setStatus('connected');
  log.info('RealtimeRecovery destroyed');
}

/**
 * Force reconnect all channels (emergency use).
 */
export function forceReconnect() {
  log.warn('forceReconnect() called');
  _cancelReconnect();
  _reconnectCount = 0;
  _reconnectAllChannels();
}

/** Snapshot for inspector. */
export function inspectRealtime() {
  const now = Date.now();
  return {
    status:         _realtimeStatus,
    reconnectCount: _reconnectCount,
    isOnline:       _isOnline,
    lastHeartbeat:  _lastHeartbeat,
    heartbeatAgeMs: _lastHeartbeat ? now - _lastHeartbeat : null,
    channels: [..._channels.entries()].map(([name, { healthy, subscribedAt }]) => ({
      name,
      healthy,
      uptimeMs: subscribedAt ? now - subscribedAt : null,
    })),
  };
}

// ── Dev window exposure ────────────────────────────────────────
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__realtimeRecovery = {
    registerChannel,
    unregisterChannel,
    forceReconnect,
    inspectRealtime,
    getRealtimeStatus,
  };
}
