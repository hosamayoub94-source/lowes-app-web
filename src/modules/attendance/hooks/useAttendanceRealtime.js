// Safe wrapper: auto-unsubscribes on unmount.
import { useEffect } from 'react';
import { useAttendanceStore } from '../store/useAttendanceStore';

export function useAttendanceRealtime(filterUserId = null) {
  useEffect(() => {
    const { subscribeRealtime, unsubscribeRealtime } = useAttendanceStore.getState();
    subscribeRealtime(filterUserId);
    return () => {
      unsubscribeRealtime();
    };
  }, [filterUserId]);
}
