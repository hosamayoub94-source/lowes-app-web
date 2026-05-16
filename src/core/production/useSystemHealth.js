// =============================================================
// useSystemHealth — React hook for system health state
//
// Subscribes to health change events and returns live status.
// Re-renders only when status or a signal changes.
//
// Usage:
//   const { status, signals, isHealthy, isDegraded, isOffline } = useSystemHealth();
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { on }                               from '@/core/events/eventBus';
import { getHealthSnapshot, checkNow }      from './healthEngine';

export function useSystemHealth() {
  const [snapshot, setSnapshot] = useState(() => {
    try { return getHealthSnapshot(); } catch { return { status: 'healthy', signals: {}, lastCheck: null }; }
  });

  const refresh = useCallback(() => {
    try { setSnapshot(checkNow()); } catch { /* engine not initialized */ }
  }, []);

  useEffect(() => {
    // Subscribe to changes
    const unsub = on('system:health_changed', ({ status, signals }) => {
      setSnapshot((prev) => ({ ...prev, status, signals }));
    });

    // Also listen for realtime status changes
    const unsubRt = on('system:realtime_status_changed', () => {
      // Refresh the full snapshot
      try { setSnapshot(getHealthSnapshot()); } catch { /* ignore */ }
    });

    return () => {
      unsub?.();
      unsubRt?.();
    };
  }, []);

  const { status, signals, lastCheck, offlineDurationMs } = snapshot;

  return {
    status,
    signals,
    lastCheck,
    offlineDurationMs,

    // Convenience booleans
    isHealthy:      status === 'healthy',
    isDegraded:     status === 'degraded',
    isOffline:      status === 'offline',
    isReconnecting: status === 'reconnecting',

    // Dead-letter count for badges
    deadLetterCount:  signals?.deadLetter?.value  ?? 0,
    queuePending:     signals?.offlineQueue?.value ?? 0,

    refresh,
  };
}
