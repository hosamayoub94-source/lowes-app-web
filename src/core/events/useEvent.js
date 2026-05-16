// =============================================================
// useEvent — React hook for the Internal Event Bus.
//
// Goals:
//   • Zero re-render unless the consumer asks for state
//   • Always-fresh handler closure (no stale-closure footgun)
//   • Automatic cleanup on unmount
//   • Built-in debounce + once
//   • Companion hooks:
//       useEventState   → subscribe AND keep latest payload in state
//       useEmit         → memoised emit fn bound to a source module
// =============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import eventBus from './eventBus';
import { EVENT_SOURCES } from './eventTypes';

/**
 * Subscribe to one or more events for the lifetime of the component.
 * Handler is wrapped in a ref so updates do NOT re-subscribe.
 *
 * @param {string|string[]} eventName
 * @param {(payload:any, envelope:object) => void|Promise<void>} handler
 * @param {object} [opts]
 * @param {number} [opts.debounce]     — debounce handler invocations
 * @param {boolean}[opts.once]
 * @param {boolean}[opts.enabled=true] — gate subscription without unmounting
 * @param {any[]}  [opts.deps=[]]      — extra deps to force re-bind
 */
export function useEvent(eventName, handler, opts = {}) {
  const { debounce, once, enabled = true, deps = [] } = opts;
  const handlerRef = useRef(handler);

  // Keep ref fresh without re-subscribing
  useEffect(() => { handlerRef.current = handler; }, [handler]);

  useEffect(() => {
    if (!enabled || !eventName) return undefined;

    const dispatch = (payload, envelope) => {
      try { return handlerRef.current?.(payload, envelope); }
      catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[useEvent] handler threw:', err);
        return undefined;
      }
    };

    const unsubscribe = eventBus.on(eventName, dispatch, { debounce, once });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    Array.isArray(eventName) ? eventName.join('|') : eventName,
    enabled,
    debounce,
    once,
    ...deps,
  ]);
}

/**
 * Subscribe AND store the latest payload in component state.
 * Use when the UI actually needs to render on event arrival.
 *
 * @returns {[any, object|null]} [payload, envelope]
 */
export function useEventState(eventName, initial = null, opts = {}) {
  const [snapshot, setSnapshot] = useState({ payload: initial, envelope: null });

  useEvent(
    eventName,
    (payload, envelope) => setSnapshot({ payload, envelope }),
    opts,
  );

  return [snapshot.payload, snapshot.envelope];
}

/**
 * Memoised emit function bound to a module source.
 * Saves you from passing `{ source }` on every call site.
 *
 * @param {string} source — EVENT_SOURCES.*
 */
export function useEmit(source = EVENT_SOURCES.UI) {
  return useCallback(
    (eventName, payload, opts = {}) =>
      eventBus.emit(eventName, payload, { source, ...opts }),
    [source],
  );
}

/**
 * Subscribe to the dev-monitor stream (every event on the bus).
 * Returns an array snapshot capped at `limit` items.
 */
export function useEventTimeline(limit = 50) {
  const [items, setItems] = useState(() => eventBus.getTimeline().slice(-limit));

  useEffect(() => {
    const unsub = eventBus.onAny((envelope) => {
      setItems((prev) => {
        const next = prev.length >= limit
          ? [...prev.slice(prev.length - limit + 1), envelope]
          : [...prev, envelope];
        return next;
      });
    });
    return () => unsub();
  }, [limit]);

  return items;
}
