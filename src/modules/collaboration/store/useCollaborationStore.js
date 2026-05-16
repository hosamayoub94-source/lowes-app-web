// =============================================================
// Collaboration Module — Zustand Store
// =============================================================
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export const useCollaborationStore = create()(
  subscribeWithSelector((set, get) => ({
    // ── Comments ────────────────────────────────────────────────
    // { [entityKey]: Comment[] }  entityKey = `${entityType}:${entityId}` or `channel:${channelId}`
    commentsByEntity: {},

    // ── Channels ─────────────────────────────────────────────────
    channels:         [],
    activeChannelId:  null,

    // ── Team Presence ─────────────────────────────────────────────
    // { [userId]: { userId, userName, status, section, last_seen } }
    presence:         {},

    // ── Unread tracking ───────────────────────────────────────────
    // { [entityKey]: number }
    unreadByEntity:   {},
    totalUnread:      0,

    // ── Discussion Drawer ─────────────────────────────────────────
    drawerOpen:       false,
    drawerContext:    null,  // { entityType, entityId, entityTitle }

    // ── Loading ───────────────────────────────────────────────────
    loading:          {},

    // ── Feed (recent across all) ──────────────────────────────────
    recentComments:   [],   // last 30 comments across all entities

    // ── Actions — Comments ─────────────────────────────────────────
    setComments: (entityKey, comments) =>
      set((s) => ({
        commentsByEntity: {
          ...s.commentsByEntity,
          [entityKey]: comments,
        },
      })),

    appendComment: (entityKey, comment) =>
      set((s) => {
        const existing = s.commentsByEntity[entityKey] ?? [];
        // Avoid duplicate from optimistic + server echo
        if (existing.some((c) => c.id === comment.id)) return {};
        const updated = [...existing, comment];
        return {
          commentsByEntity: { ...s.commentsByEntity, [entityKey]: updated },
          recentComments:   [comment, ...s.recentComments].slice(0, 30),
          unreadByEntity:   {
            ...s.unreadByEntity,
            [entityKey]: (s.unreadByEntity[entityKey] ?? 0) + 1,
          },
          totalUnread: s.totalUnread + 1,
        };
      }),

    removeComment: (entityKey, commentId) =>
      set((s) => ({
        commentsByEntity: {
          ...s.commentsByEntity,
          [entityKey]: (s.commentsByEntity[entityKey] ?? []).map((c) =>
            c.id === commentId ? { ...c, is_deleted: true, content: '[تم حذف هذا التعليق]' } : c
          ),
        },
      })),

    // ── Actions — Channels ─────────────────────────────────────────
    setChannels: (channels) => set({ channels }),

    addChannel: (channel) =>
      set((s) => ({
        channels: [...s.channels, channel],
      })),

    setActiveChannel: (channelId) => set({ activeChannelId: channelId }),

    // ── Actions — Presence ─────────────────────────────────────────
    setPresence: (userId, data) =>
      set((s) => ({
        presence: {
          ...s.presence,
          [userId]: { ...s.presence[userId], ...data, last_seen: Date.now() },
        },
      })),

    setPresenceState: (presenceMap) =>
      set(() => ({
        presence: presenceMap,
      })),

    removePresence: (userId) =>
      set((s) => {
        const p = { ...s.presence };
        delete p[userId];
        return { presence: p };
      }),

    // ── Actions — Unread ───────────────────────────────────────────
    markEntityRead: (entityKey) =>
      set((s) => {
        const count = s.unreadByEntity[entityKey] ?? 0;
        return {
          unreadByEntity: { ...s.unreadByEntity, [entityKey]: 0 },
          totalUnread:    Math.max(0, s.totalUnread - count),
        };
      }),

    clearAllUnread: () => set({ unreadByEntity: {}, totalUnread: 0 }),

    // ── Actions — Drawer ───────────────────────────────────────────
    openDrawer: (context) =>
      set({ drawerOpen: true, drawerContext: context }),

    closeDrawer: () =>
      set({ drawerOpen: false }),

    // ── Actions — Loading ──────────────────────────────────────────
    setLoading: (key, val) =>
      set((s) => ({ loading: { ...s.loading, [key]: val } })),

    isLoading: (key) => !!get().loading[key],

    // ── Recent feed ────────────────────────────────────────────────
    setRecentComments: (comments) =>
      set({ recentComments: comments }),

    prependRecentComment: (comment) =>
      set((s) => ({
        recentComments: [comment, ...s.recentComments].slice(0, 30),
      })),

    // ── Selectors ──────────────────────────────────────────────────
    getCommentsForEntity: (entityType, entityId) => {
      const key = `${entityType}:${entityId}`;
      return get().commentsByEntity[key] ?? [];
    },

    getCommentsForChannel: (channelId) => {
      const key = `channel:${channelId}`;
      return get().commentsByEntity[key] ?? [];
    },

    getUnreadForEntity: (entityType, entityId) => {
      const key = `${entityType}:${entityId}`;
      return get().unreadByEntity[key] ?? 0;
    },

    getOnlineUsers: () => {
      const p = get().presence;
      return Object.values(p).filter((u) => u.status === 'online');
    },
  }))
);

// ── Entity key helper (exported for use in hooks/components) ──
export const entityKey = (entityType, entityId) => `${entityType}:${entityId}`;
export const channelKey = (channelId) => `channel:${channelId}`;

export default useCollaborationStore;
