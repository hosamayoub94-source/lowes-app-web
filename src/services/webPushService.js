// =============================================================
// webPushService — send Web Push via Supabase Edge Function
//
// Called after sendNotification() inserts a row into the DB.
// The Edge Function (supabase/functions/send-push/) reads the
// user's push subscriptions and delivers the actual push payload.
//
// If the Edge Function is not deployed, this fails silently —
// in-app notifications still work via realtime.
// =============================================================
import { supabase } from '@services/supabase';

const EDGE_FN = 'send-push'; // name of the Supabase Edge Function

/**
 * Trigger a Web Push notification for a specific user.
 * Calls the `send-push` Edge Function which handles VAPID signing
 * and delivery to all of the user's registered push subscriptions.
 *
 * @param {object} params
 * @param {string} params.userId     — recipient profile UUID
 * @param {string} params.title      — notification title (Arabic)
 * @param {string} [params.body]     — notification body text
 * @param {string} [params.url]      — URL to open on click (e.g. '/tasks')
 * @param {string} [params.notifId]  — DB notification ID for dedup
 * @param {string} [params.tag]      — notification tag (replaces older notif with same tag)
 */
export async function triggerWebPush({ userId, title, body = '', url = '/', notifId, tag }) {
  try {
    const { error } = await supabase.functions.invoke(EDGE_FN, {
      body: { userId, title, body, url, notifId, tag },
    });

    if (error) {
      // Edge Function not deployed or VAPID not configured — fail silently
      console.warn('[webPush] Edge Function error:', error.message);
    }
  } catch (err) {
    // Network error — fail silently, in-app notification still works
    console.warn('[webPush] Failed to invoke Edge Function:', err.message);
  }
}

/**
 * Bulk push to multiple users at once.
 * @param {string[]} userIds
 * @param {object}   params — same as triggerWebPush (minus userId)
 */
export async function triggerWebPushBulk(userIds, params) {
  if (!userIds?.length) return;
  // Fire and forget — don't await in caller
  await Promise.allSettled(
    userIds.map((userId) => triggerWebPush({ userId, ...params }))
  );
}
