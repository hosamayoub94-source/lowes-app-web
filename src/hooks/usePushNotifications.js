// =============================================================
// usePushNotifications — Web Push subscription management
//
// Flow:
//   1. request browser permission
//   2. subscribe via PushManager (VAPID)
//   3. save endpoint + keys to Supabase push_subscriptions table
//   4. unsubscribe removes from both browser + DB
//
// VAPID public key must be set in .env:
//   VITE_VAPID_PUBLIC_KEY=<base64url key>
//
// Generate a pair with:  npx web-push generate-vapid-keys
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { useAuth }  from '@hooks/useAuth';
import { supabase } from '@services/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';
const TABLE            = 'push_subscriptions';

/** Convert VAPID base64url string → Uint8Array for PushManager */
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64     = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** True when browser supports Web Push */
function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'Notification'  in window &&
    'serviceWorker' in navigator &&
    'PushManager'   in window
  );
}

// ─────────────────────────────────────────────────────────────

export function usePushNotifications() {
  const { id: userId } = useAuth();

  const [supported,  setSupported]  = useState(false);
  const [permission, setPermission] = useState('default');
  const [subscribed, setSubscribed] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  // ── Check support + current state on mount ──────────────────
  useEffect(() => {
    const ok = isPushSupported();
    setSupported(ok);
    if (!ok) return;

    setPermission(Notification.permission);

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, []);

  // ── Subscribe ────────────────────────────────────────────────
  const subscribe = useCallback(async () => {
    if (!supported || !userId) return;

    if (!VAPID_PUBLIC_KEY) {
      setError('VITE_VAPID_PUBLIC_KEY غير مضبوط في .env — شغّل: npx web-push generate-vapid-keys');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setError('لم يتم منح إذن الإشعارات من المتصفح');
        return;
      }

      // 2. Get SW registration
      const reg = await navigator.serviceWorker.ready;

      // 3. Subscribe (or reuse existing)
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      // 4. Persist to Supabase
      const { endpoint, keys } = sub.toJSON();
      const { error: dbErr } = await supabase
        .from(TABLE)
        .upsert(
          {
            user_id:    userId,
            endpoint,
            p256dh:     keys?.p256dh ?? null,
            auth:       keys?.auth   ?? null,
            user_agent: navigator.userAgent.slice(0, 250),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,endpoint' }
        );

      if (dbErr) throw dbErr;
      setSubscribed(true);
    } catch (err) {
      setError(err.message ?? 'فشل الاشتراك في الإشعارات');
    } finally {
      setLoading(false);
    }
  }, [supported, userId]);

  // ── Unsubscribe ──────────────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    if (!supported || !userId) return;
    setLoading(true);
    setError(null);

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();

      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();

        await supabase
          .from(TABLE)
          .delete()
          .eq('user_id', userId)
          .eq('endpoint', endpoint);
      }
      setSubscribed(false);
    } catch (err) {
      setError(err.message ?? 'فشل إلغاء الاشتراك');
    } finally {
      setLoading(false);
    }
  }, [supported, userId]);

  // ── Show LOCAL system notification (app open but backgrounded) ─
  const showLocalNotification = useCallback((title, body, url = '/') => {
    if (!supported || Notification.permission !== 'granted') return;
    navigator.serviceWorker.ready
      .then((reg) =>
        reg.showNotification(title, {
          body,
          icon:  '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          dir:   'rtl',
          lang:  'ar',
          data:  { url },
        })
      )
      .catch(() => {});
  }, [supported]);

  return {
    supported,
    permission,
    subscribed,
    loading,
    error,
    subscribe,
    unsubscribe,
    showLocalNotification,
  };
}

export default usePushNotifications;
