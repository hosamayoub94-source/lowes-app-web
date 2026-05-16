// =============================================================
// useTeamPresence — online/offline status + active section
// Uses Supabase Presence when available, falls back to mock data
// =============================================================
import { useEffect, useRef } from 'react';
import { useAuth }           from '@hooks/useAuth';
import useCollaborationStore from '../store/useCollaborationStore';
import { joinPresence, updatePresenceSection } from '../services/collaborationService';
import { on }                from '@/core/events/eventBus.js';
import { EVENTS }            from '@/core/events/eventTypes.js';

const MOCK_PRESENCE = [
  { userId: 'mock_01', userName: 'أحمد محمد',   status: 'online',  section: 'tasks',      last_seen: Date.now() - 2_000  },
  { userId: 'mock_02', userName: 'سارة علي',     status: 'online',  section: 'attendance', last_seen: Date.now() - 15_000 },
  { userId: 'mock_03', userName: 'محمد خالد',    status: 'away',    section: 'crm',        last_seen: Date.now() - 300_000 },
  { userId: 'mock_04', userName: 'نورة سعد',     status: 'offline', section: null,         last_seen: Date.now() - 3_600_000 },
];

export function useTeamPresence({ section = 'workspace' } = {}) {
  const auth    = useAuth();
  const cleanup = useRef(null);

  const presence        = useCollaborationStore((s) => s.presence);
  const setPresence     = useCollaborationStore((s) => s.setPresence);
  const setPresenceState = useCollaborationStore((s) => s.setPresenceState);

  // ── Seed mock presence on mount ────────────────────────────────
  useEffect(() => {
    // Always seed mock data for a realistic-feeling UI
    const mockMap = {};
    MOCK_PRESENCE.forEach((p) => { mockMap[p.userId] = p; });
    // Also add current user
    if (auth.id) {
      mockMap[auth.id] = {
        userId:   auth.id,
        userName: auth.name ?? 'أنت',
        status:   'online',
        section,
        last_seen: Date.now(),
      };
    }
    setPresenceState(mockMap);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Join real presence channel ─────────────────────────────────
  useEffect(() => {
    if (!auth.id) return;
    cleanup.current = joinPresence({ userId: auth.id, userName: auth.name, section });
    return () => cleanup.current?.();
  }, [auth.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update section when it changes ────────────────────────────
  useEffect(() => {
    updatePresenceSection(section);
    if (auth.id) {
      setPresence(auth.id, { section, status: 'online', last_seen: Date.now() });
    }
  }, [section, auth.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Listen to presence_changed events ─────────────────────────
  useEffect(() => {
    const off = on(EVENTS.PRESENCE_CHANGED, ({ state }) => {
      if (!state) return;
      const map = {};
      Object.entries(state).forEach(([userId, [data]]) => {
        if (data) map[userId] = { ...data, status: 'online', last_seen: Date.now() };
      });
      setPresenceState(map);
    });
    return off;
  }, [setPresenceState]);

  // ── Derived values ─────────────────────────────────────────────
  const users       = Object.values(presence);
  const online      = users.filter((u) => u.status === 'online' && u.userId !== auth.id);
  const away        = users.filter((u) => u.status === 'away');
  const offline     = users.filter((u) => u.status === 'offline');
  const onlineCount = online.length + (auth.id ? 1 : 0); // +1 for self

  function getStatusColor(status) {
    if (status === 'online') return 'bg-green-400';
    if (status === 'away')   return 'bg-amber-400';
    return 'bg-gray-300';
  }

  function getLastSeenLabel(ts) {
    if (!ts) return 'غير معروف';
    const diff = Date.now() - ts;
    if (diff < 60_000)    return 'الآن';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} د`;
    if (diff < 86_400_000)return `${Math.floor(diff / 3_600_000)} س`;
    return new Date(ts).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
  }

  return {
    users,
    online,
    away,
    offline,
    onlineCount,
    getStatusColor,
    getLastSeenLabel,
  };
}

export default useTeamPresence;
