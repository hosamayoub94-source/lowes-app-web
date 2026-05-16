// =============================================================
// Notifications — announcements, urgent messages, browser push.
// Mirrors `announcements` + `messages` tables in v4.
// =============================================================
import { supabase } from './supabase';

export async function getActiveAnnouncement() {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function publishAnnouncement(message) {
  // Deactivate prior + insert new — same flow as legacy v4.
  await supabase.from('announcements').update({ is_active: false }).eq('is_active', true);
  const { error } = await supabase.from('announcements').insert({ message, is_active: true });
  if (error) throw error;
}

export async function clearAnnouncement() {
  const { error } = await supabase
    .from('announcements')
    .update({ is_active: false })
    .eq('is_active', true);
  if (error) throw error;
}

export async function getUrgent() {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('type', 'urgent')
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function markRead(id) {
  const { error } = await supabase.from('messages').update({ is_read: true }).eq('id', id);
  if (error) throw error;
}

/** Browser push permission + show. */
export async function requestPushPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  return Notification.requestPermission();
}

export function pushNotify(title, body, icon = '/icon-192.png') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  // eslint-disable-next-line no-new
  new Notification(title, { body, icon });
}
