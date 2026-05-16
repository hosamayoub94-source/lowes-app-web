// =============================================================
// Event Bus Bootstrap — wires module listeners once at app boot.
//
// Usage (already non-invasive — UI is untouched):
//   import { bootEventListeners } from '@/core/events';
//   bootEventListeners();   // safe to call multiple times
//
// Returns an `unbind()` you can call from tests / HMR cleanup.
// =============================================================
import eventBus, { setDebug } from './eventBus';
import { EVENTS, EVENT_SOURCES } from './eventTypes';
import bindNotificationsListener from './listeners/notificationsListener';
import bindAuditListener         from './listeners/auditListener';

let _booted   = false;
let _unbinds  = [];

export function bootEventListeners({ debug = false } = {}) {
  if (_booted) return () => {};
  _booted = true;

  if (debug || import.meta?.env?.DEV) setDebug(true);

  _unbinds.push(bindNotificationsListener());
  _unbinds.push(bindAuditListener());

  // Mark boot for traceability
  eventBus.emit(EVENTS.SYSTEM_BOOT, { at: Date.now() }, {
    source: EVENT_SOURCES.SYSTEM,
  });

  return unbootEventListeners;
}

export function unbootEventListeners() {
  _unbinds.forEach((fn) => { try { fn(); } catch { /* */ } });
  _unbinds = [];
  _booted = false;
}

export function isEventBusBooted() { return _booted; }
