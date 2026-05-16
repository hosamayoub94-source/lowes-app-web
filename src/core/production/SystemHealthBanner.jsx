// =============================================================
// SystemHealthBanner — Top-of-screen system status ribbon
//
// Shows:
//   • Offline: red banner with queued-actions count
//   • Reconnecting: amber pulsing banner
//   • Degraded: yellow warning with brief signal detail
//   • Healthy: renders nothing (no DOM cost)
//
// Mount once near app root, above main content.
// =============================================================
import { useEffect, useState } from 'react';
import { useSystemHealth }     from './useSystemHealth';
import { getOfflineQueueStats } from './offlineRecovery';

const STATUS_CONFIG = {
  offline: {
    bg:   'bg-red-600',
    text: 'text-white',
    icon: '📡',
  },
  reconnecting: {
    bg:   'bg-amber-500',
    text: 'text-white',
    icon: '🔄',
  },
  degraded: {
    bg:   'bg-yellow-400',
    text: 'text-yellow-900',
    icon: '⚠️',
  },
};

export function SystemHealthBanner() {
  const { status, signals, isHealthy, queuePending, deadLetterCount } = useSystemHealth();
  const [visible, setVisible] = useState(false);

  // Small delay before showing degraded banner (avoid flash on load)
  useEffect(() => {
    if (!isHealthy) {
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [isHealthy]);

  if (isHealthy || !visible) return null;

  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.degraded;

  const message = (() => {
    if (status === 'offline') {
      return queuePending > 0
        ? `أنت غير متصل بالإنترنت — ${queuePending} إجراء في الانتظار`
        : 'أنت غير متصل بالإنترنت';
    }
    if (status === 'reconnecting') {
      return 'جارٍ إعادة الاتصال...';
    }
    if (status === 'degraded') {
      if (deadLetterCount > 0) return `تعذّر تنفيذ ${deadLetterCount} إجراء — راجع المسؤول`;
      if (!signals?.realtime?.ok) return 'اتصال البيانات الحية غير مستقر';
      return 'أداء النظام متأخر';
    }
    return 'حالة النظام غير طبيعية';
  })();

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`
        fixed top-0 inset-x-0 z-[9999] flex items-center justify-center
        px-4 py-2 text-sm font-medium
        ${cfg.bg} ${cfg.text}
        ${status === 'reconnecting' ? 'animate-pulse' : ''}
        safe-top
      `}
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
    >
      <span className="ml-2">{cfg.icon}</span>
      <span>{message}</span>
    </div>
  );
}

export default SystemHealthBanner;
