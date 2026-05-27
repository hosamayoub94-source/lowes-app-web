// =============================================================
// Notifications Module — Zustand store
//
// State shape:
//   notifications[]   — paginated list (current page)
//   unreadCount       — fast scalar, updated optimistically
//   toasts[]          — live incoming notifications (auto-dismissed)
//   loading           — true during initial load
//   loadingMore       — true during paginated fetch
//   error             — last error message or null
//   page              — current 0-indexed page
//   total             — total rows from DB
//   realtimeStatus    — 'connecting'|'SUBSCRIBED'|'CLOSED'|null
//
// Actions follow the pattern: optimistic update → async → rollback on error.
// =============================================================
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  fetchNotifications,
  fetchUnreadCount,
  markAsRead     as svcMarkAsRead,
  markAllAsRead  as svcMarkAllAsRead,
} from '../services/notificationService';

const PAGE_SIZE      = 20;
const TOAST_DURATION = 6000; // ms before auto-dismiss

let _toastSeq = 0;

export const useNotificationStore = create(
  subscribeWithSelector((set, get) => ({
    // ── State ──────────────────────────────────────────────────
    notifications:   [],
    unreadCount:     0,
    toasts:          [],
    loading:         false,
    loadingMore:     false,
    error:           null,
    page:            0,
    total:           0,
    realtimeStatus:  null,

    // ── Load ───────────────────────────────────────────────────

    /** Initial load: fetch page 0 + unread count in parallel. */
    loadNotifications: async () => {
      set({ loading: true, error: null, page: 0 });
      try {
        const [{ data, total }, count] = await Promise.all([
          fetchNotifications({ page: 0, pageSize: PAGE_SIZE }),
          fetchUnreadCount(),
        ]);
        set({ notifications: data, total, unreadCount: count, loading: false });
      } catch (e) {
        set({ error: e.message, loading: false });
      }
    },

    /** Load the next page and append results. */
    loadMore: async () => {
      const { page, total, notifications, loadingMore } = get();
      if (loadingMore || notifications.length >= total) return;

      const nextPage = page + 1;
      set({ loadingMore: true });
      try {
        const { data } = await fetchNotifications({
          page: nextPage,
          pageSize: PAGE_SIZE,
        });
        set((s) => ({
          notifications: [...s.notifications, ...data],
          page: nextPage,
          loadingMore: false,
        }));
      } catch (e) {
        set({ error: e.message, loadingMore: false });
      }
    },

    /** Refresh unread count without reloading the full list. */
    refreshUnreadCount: async () => {
      try {
        const count = await fetchUnreadCount();
        set({ unreadCount: count });
      } catch { /* silent — non-critical */ }
    },

    // ── Mark as read ───────────────────────────────────────────

    /** Optimistic mark-as-read for a single notification. */
    markAsRead: async (notificationId) => {
      // Optimistic
      set((s) => ({
        notifications: s.notifications.map((n) =>
          n.id === notificationId ? { ...n, is_read: true } : n,
        ),
        unreadCount: Math.max(0, s.unreadCount - 1),
      }));

      try {
        await svcMarkAsRead(notificationId);
      } catch (e) {
        // Rollback
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.id === notificationId ? { ...n, is_read: false } : n,
          ),
          unreadCount: s.unreadCount + 1,
          error: e.message,
        }));
      }
    },

    /** Optimistic mark-all-as-read. */
    markAllAsRead: async () => {
      const prev = get().notifications;
      const prevCount = get().unreadCount;

      // Optimistic
      set((s) => ({
        notifications: s.notifications.map((n) => ({ ...n, is_read: true })),
        unreadCount: 0,
      }));

      try {
        await svcMarkAllAsRead();
      } catch (e) {
        // Rollback
        set({ notifications: prev, unreadCount: prevCount, error: e.message });
      }
    },

    // ── Realtime ───────────────────────────────────────────────

    setRealtimeStatus: (status) => set({ realtimeStatus: status }),

    /**
     * Called by the realtime subscription when a new notification arrives.
     * Prepends to the list, bumps unread count, and queues a toast.
     */
    receiveNotification: (notification) => {
      set((s) => {
        // Deduplicate: skip if already in the list
        if (s.notifications.some((n) => n.id === notification.id)) return {};

        const toast = {
          ...notification,
          _toastId: ++_toastSeq,
        };

        return {
          notifications: [notification, ...s.notifications],
          total: s.total + 1,
          unreadCount: s.unreadCount + 1,
          toasts: [...s.toasts, toast],
        };
      });

      // Show system notification if app is open but page is not focused
      if (
        typeof window !== 'undefined' &&
        Notification?.permission === 'granted' &&
        document.visibilityState !== 'visible'
      ) {
        navigator.serviceWorker?.ready
          .then((reg) =>
            reg.showNotification(notification.title ?? 'إشعار جديد', {
              body:  notification.message ?? '',
              icon:  '/icons/icon-192.png',
              badge: '/icons/icon-192.png',
              dir:   'rtl',
              lang:  'ar',
              tag:   notification.id,
              data:  { url: '/' },
            })
          )
          .catch(() => {});
      }
    },

    // ── Toasts ─────────────────────────────────────────────────

    dismissToast: (toastId) =>
      set((s) => ({ toasts: s.toasts.filter((t) => t._toastId !== toastId) })),

    dismissAllToasts: () => set({ toasts: [] }),

    // ── Misc ───────────────────────────────────────────────────
    clearError: () => set({ error: null }),
  })),
);

// ── Selectors ─────────────────────────────────────────────────
export const selectUnreadCount    = (s) => s.unreadCount;
export const selectHasUnread      = (s) => s.unreadCount > 0;
export const selectNotifications  = (s) => s.notifications;
export const selectToasts         = (s) => s.toasts;
export const selectLoading        = (s) => s.loading;
export const selectHasMore        = (s) => s.notifications.length < s.total;
export const selectRealtimeActive = (s) => s.realtimeStatus === 'SUBSCRIBED';

export const TOAST_DURATION_MS = TOAST_DURATION;
