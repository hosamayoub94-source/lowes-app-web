// =============================================================
// Core Events — public barrel.
// Always import from '@/core/events' (or relative), never from
// internal files. Keeps the surface stable as the bus evolves.
// =============================================================
export { default as eventBus } from './eventBus';
export {
  emit,
  emitDebounced,
  on,
  once,
  off,
  onAny,
  clear,
  registerTransport,
  setDebug,
  isDebug,
  getTimeline,
  clearTimeline,
  inspect,
} from './eventBus';

export {
  EVENTS,
  EVENT_SOURCES,
  EVENT_SEVERITY,
  EVENT_SEVERITY_MAP,
  EVENT_GROUPS,
  resolveEventSeverity,
} from './eventTypes';

export {
  useEvent,
  useEventState,
  useEmit,
  useEventTimeline,
} from './useEvent';

// Listener bootstrappers — invoked once at app start.
export { bootEventListeners, unbootEventListeners, isEventBusBooted } from './bootstrap';

// Dev tools (optional — never mounted automatically)
export { DevEventMonitor } from './DevEventMonitor';
