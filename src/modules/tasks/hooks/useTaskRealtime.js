// =============================================================
// useTaskRealtime — wires Supabase realtime subscriptions to the
// task store. NO-OP under mock mode (the service helper handles
// that gracefully). Mounted once at the page level.
//
// Strategy: when ANY change comes in, we trigger a silent
// `refreshTasks()` rather than patching the store from the
// payload. Reasons:
//   - The payload from postgres_changes is the flat DB row, not
//     the joined shape the UI expects (assignee, comments_count).
//     Re-fetching guarantees consistency without bespoke patching.
//   - Refetches are debounced — bursts of activity coalesce into
//     a single network round-trip.
// Trade-off: a second of latency on first event vs. a brittle
// patch path. Worth it.
// =============================================================
import { useEffect, useRef } from 'react';
import { subscribeToTasks } from '../services/taskService';
import { useTaskStore } from '../store/useTaskStore';

const DEBOUNCE_MS = 350;

export function useTaskRealtime({ enabled = true } = {}) {
  const refreshTasks = useTaskStore((s) => s.refreshTasks);
  const timerRef = useRef(null);
  const statusRef = useRef('idle');

  useEffect(() => {
    if (!enabled) return undefined;

    const debouncedRefresh = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        refreshTasks();
      }, DEBOUNCE_MS);
    };

    const unsubscribe = subscribeToTasks({
      onTaskChange:    debouncedRefresh,
      onCommentInsert: debouncedRefresh,
      onActivityInsert: debouncedRefresh,
      onStatus: (s) => { statusRef.current = s; },
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      unsubscribe();
    };
  }, [enabled, refreshTasks]);

  return { status: statusRef.current };
}

export default useTaskRealtime;
