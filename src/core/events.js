// =============================================================
// Core Events — root-level re-export of the advanced event bus.
//
// Importing from '@/core/events' or '@/core/events/eventBus'
// both resolve to the SAME underlying bus instance, so events
// emitted in one module are received in all others.
// =============================================================

export {
  on,
  off,
  emit,
  once,
  onAny,
} from './events/eventBus';

/** Called by main.jsx during boot. Wires global browser events to the bus. */
export function bootEventListeners() {
  import('./events/eventBus').then(({ emit: busEmit }) => {
    window.addEventListener('online',  () => busEmit('app:online',  { ts: Date.now() }));
    window.addEventListener('offline', () => busEmit('app:offline', { ts: Date.now() }));
    console.info('[core/events] Event bus ready');
  });
}

export { default } from './events/eventBus';
