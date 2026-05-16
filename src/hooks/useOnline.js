// =============================================================
// useOnline — subscribes to navigator online/offline events
// and keeps the UI store in sync so any component can read it.
// =============================================================
import { useEffect } from 'react';
import { useUiStore } from '@stores/uiStore';

export function useOnline() {
  const isOnline = useUiStore((s) => s.isOnline);
  const setOnline = useUiStore((s) => s.setOnline);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onUp = () => setOnline(true);
    const onDown = () => setOnline(false);
    window.addEventListener('online', onUp);
    window.addEventListener('offline', onDown);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener('online', onUp);
      window.removeEventListener('offline', onDown);
    };
  }, [setOnline]);

  return isOnline;
}

export default useOnline;
