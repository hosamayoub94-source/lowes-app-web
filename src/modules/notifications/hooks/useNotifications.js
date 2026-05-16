// =============================================================
// Notifications Module — useNotifications
//
// Manages the full lifecycle:
//   1. Load notifications + unread count on mount
//   2. Subscribe to realtime inserts (scoped to current user)
//   3. Auto-dismiss toasts
//   4. Unsubscribe + cleanup on unmount
//
// Usage:
//   const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
// =============================================================
import { useEffect, useCallback } from 'react';
import { useAuthStore }           from '@stores/authStore';
import { subscribeToNotifications } from '../services/notificationService';
import {
  useNotificationStore,
  selectNotifications,
  selectUnreadCount,
  selectToasts,
  selectLoading,
  selectHasMore,
  selectRealtimeActive,
  TOAST_DURATION_MS,
} from '../store/useNotificationStore';

/**
 * Primary hook for the notification system.
 *
 * @param {object}  opts
 * @param {boolean} [opts.realtime=true]   — subscribe to live inserts
 * @param {boolean} [opts.autoLoad=true]   — load on mount
 * @param {boolean} [opts.autoToast=true]  — auto-dismiss toasts after TOAST_DURATION_MS
 */
export function useNotifications({
  realtime  = true,
  autoLoad  = true,
  autoToast = true,
} = {}) {
  const session = useAuthStore((s) => s.session);
  const userId  = session?.id ?? null;

  // ── Store slices ────────────────────────────────────────────
  const notifications  = useNotificationStore(selectNotifications);
  const unreadCount    = useNotificationStore(selectUnreadCount);
  const toasts         = useNotificationStore(selectToasts);
  const loading        = useNotificationStore(selectLoading);
  const hasMore        = useNotificationStore(selectHasMore);
  const realtimeActive = useNotificationStore(selectRealtimeActive);

  // ── Store actions ───────────────────────────────────────────
  const loadNotifications   = useNotificationStore((s) => s.loadNotifications);
  const loadMore            = useNotificationStore((s) => s.loadMore);
  const markAsRead          = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead       = useNotificationStore((s) => s.markAllAsRead);
  const receiveNotification = useNotificationStore((s) => s.receiveNotification);
  const setRealtimeStatus   = useNotificationStore((s) => s.setRealtimeStatus);
  const dismissToast        = useNotificationStore((s) => s.dismissToast);
  const dismissAllToasts    = useNotificationStore((s) => s.dismissAllToasts);
  const refreshUnreadCount  = useNotificationStore((s) => s.refreshUnreadCount);

  // ── Auto-load ───────────────────────────────────────────────
  useEffect(() => {
    if (autoLoad && userId) {
      loadNotifications();
    }
  }, [autoLoad, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime subscription ───────────────────────────────────
  useEffect(() => {
    if (!realtime || !userId) return;

    const unsubscribe = subscribeToNotifications(
      userId,
      receiveNotification,
      setRealtimeStatus,
    );

    return unsubscribe;
  }, [realtime, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-dismiss toasts ─────────────────────────────────────
  useEffect(() => {
    if (!autoToast || !toasts.length) return;

    const timers = toasts.map((toast) =>
      setTimeout(() => dismissToast(toast._toastId), TOAST_DURATION_MS),
    );

    return () => timers.forEach(clearTimeout);
  }, [toasts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // Data
    notifications,
    unreadCount,
    toasts,
    loading,
    hasMore,
    realtimeActive,
    // Actions
    loadMore,
    markAsRead,
    markAllAsRead,
    dismissToast,
    dismissAllToasts,
    refreshUnreadCount,
    reload: loadNotifications,
  };
}
