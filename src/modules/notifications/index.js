// =============================================================
// Notifications Module — public API
// Import from '@modules/notifications' everywhere else.
// =============================================================

// Types
export * from './types/notification.types';

// Service (low-level — use hooks in React components)
export {
  sendNotification,
  sendBulkNotifications,
  markAsRead,
  markAllAsRead,
  fetchNotifications,
  fetchUnreadCount,
  subscribeToNotifications,
  cleanOldNotifications,
} from './services/notificationService';

// Store
export {
  useNotificationStore,
  selectUnreadCount,
  selectHasUnread,
  selectNotifications,
  selectToasts,
  selectLoading,
  selectHasMore,
  selectRealtimeActive,
  TOAST_DURATION_MS,
} from './store/useNotificationStore';

// Hooks
export { useNotifications }         from './hooks/useNotifications';
export { useNotificationTriggers }  from './hooks/useNotificationTriggers';

// Components
export { NotificationBell }    from './components/NotificationBell';
export { NotificationPanel }   from './components/NotificationPanel';
export { NotificationItem }    from './components/NotificationItem';
export { ToastContainer }      from './components/ToastContainer';
