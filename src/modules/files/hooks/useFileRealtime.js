// Safe wrapper: auto-unsubscribes on unmount.
import { useEffect } from 'react';
import { useFileStore } from '../store/useFileStore';

export function useFileRealtime(userId) {
  useEffect(() => {
    if (!userId) return;
    const { subscribeRealtime, unsubscribeRealtime } = useFileStore.getState();
    subscribeRealtime(userId);
    return () => {
      unsubscribeRealtime();
    };
  }, [userId]);
}
