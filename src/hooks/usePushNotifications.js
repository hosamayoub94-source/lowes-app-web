// =============================================================
// usePushNotifications — تنبيهات browser فورية
// يستمع لـ:
//   • رسائل DM جديدة (chat_messages — sender ≠ me, type = dm)
//   • رسائل في القنوات التي أنا فيها
//   • إعلانات جديدة (announcements)
//   • مهام مسندة لي (tasks)
// يطلب إذن Notifications عند أول إشعار فقط.
// =============================================================
import { useEffect, useRef } from 'react';
import { supabase }          from '@services/supabase';
import { useAuth }           from '@hooks/useAuth';

// ── Play a subtle notification sound ────────────────────────────
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o   = ctx.createOscillator();
    const g   = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    g.gain.linearRampToValueAtTime(0,    ctx.currentTime + 0.3);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.32);
  } catch {}
}

// ── Request browser notification permission ──────────────────────
async function askPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied')  return false;
  const res = await Notification.requestPermission();
  return res === 'granted';
}

// ── Show a browser notification ──────────────────────────────────
async function showNotif({ title, body, icon = '/icon-192x192.png', tag }) {
  const ok = await askPermission();
  if (!ok) return;
  // If SW is active, use it for better mobile support
  if (navigator.serviceWorker?.controller) {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.showNotification(title, { body, icon, tag, badge: '/icon-72x72.png' });
      return;
    }
  }
  new Notification(title, { body, icon, tag });
}

// ── Hook ─────────────────────────────────────────────────────────
export function usePushNotifications() {
  const { id: userId, name: userName } = useAuth();
  const chatSubRef    = useRef(null);
  const notifSubRef   = useRef(null);
  const memberRoomIds = useRef([]);

  // Load rooms user is member of
  useEffect(() => {
    if (!userId) return;
    supabase.from('chat_room_members').select('room_id').eq('user_id', userId)
      .then(({ data }) => { memberRoomIds.current = (data ?? []).map(r => r.room_id); })
      .catch(() => {});
  }, [userId]);

  // ── Chat messages subscription ─────────────────────────────────
  useEffect(() => {
    if (!userId || !userName) return;

    chatSubRef.current = supabase
      .channel('push-chat-global')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        async (payload) => {
          const msg = payload.new;
          // Ignore my own messages
          if (msg.sender_id === userId) return;
          // Ignore messages in rooms I'm not a member of
          if (!memberRoomIds.current.includes(msg.room_id)) return;
          // Ignore if tab is focused
          if (document.hasFocus()) return;
          // Ignore deleted or empty
          if (msg.is_deleted || !msg.content && !msg.file_url) return;

          const body = msg.message_type === 'text'
            ? (msg.content?.slice(0, 80) ?? '')
            : msg.message_type === 'image' ? '📷 أرسل صورة'
            : msg.message_type === 'voice' ? '🎙️ رسالة صوتية'
            : `📎 ${msg.file_name ?? 'ملف'}`;

          playBeep();
          await showNotif({
            title: `💬 ${msg.sender_name ?? 'رسالة جديدة'}`,
            body,
            tag: `chat-${msg.room_id}`,
          });
        }
      )
      .subscribe();

    return () => { chatSubRef.current?.unsubscribe(); };
  }, [userId, userName]);

  // ── Announcements subscription ─────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    notifSubRef.current = supabase
      .channel('push-announcements')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'announcements' },
        async (payload) => {
          if (document.hasFocus()) return;
          const ann = payload.new;
          playBeep();
          await showNotif({
            title: `📢 إعلان جديد`,
            body:  ann.title ?? '',
            tag:   `ann-${ann.id}`,
          });
        }
      )
      .subscribe();

    return () => { notifSubRef.current?.unsubscribe(); };
  }, [userId]);
}

export default usePushNotifications;
