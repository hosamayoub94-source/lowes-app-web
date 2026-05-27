// =============================================================
// Lowe's Pro — Custom Service Worker
// Handles: Workbox precache + Web Push notifications + offline
// Mode: VitePWA injectManifest
// =============================================================
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute }           from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// ── Precache (injected by VitePWA) ─────────────────────────────
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

// ── Runtime caching ────────────────────────────────────────────

// Supabase REST — NetworkFirst (fresh data preferred)
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co') && url.pathname.includes('/rest/'),
  new NetworkFirst({
    cacheName:        'supabase-api',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 300 }),
    ],
  })
);

// Static assets (images, fonts) — CacheFirst
registerRoute(
  ({ request }) => ['image', 'font'].includes(request.destination),
  new CacheFirst({
    cacheName: 'assets',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
);

// ── Skip waiting immediately on install (force instant update) ──
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// ── Also handle manual SKIP_WAITING message ───────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Web Push — show system notification ───────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try   { payload = event.data.json(); }
  catch { payload = { title: 'إشعار جديد', body: event.data.text() }; }

  const {
    title  = 'لوز برو 🌿',
    body   = '',
    icon   = '/icons/icon-192.png',
    badge  = '/icons/icon-192.png',
    url    = '/',
    tag    = 'lowes-push',
    notifId,
  } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      dir:  'rtl',
      lang: 'ar',
      tag,
      renotify: true,
      data: { url, notifId },
      actions: [
        { action: 'open',    title: 'فتح التطبيق' },
        { action: 'dismiss', title: 'إغلاق'       },
      ],
    })
  );
});

// ── Notification click — open / focus the app ─────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((wins) => {
        // Focus existing tab if open at our origin
        const existing = wins.find((w) => new URL(w.url).origin === self.location.origin);
        if (existing) {
          existing.focus();
          return existing.navigate(targetUrl);
        }
        // Otherwise open new tab
        return clients.openWindow(targetUrl);
      })
  );
});

// ── Notification close (analytics hook — optional) ────────────
self.addEventListener('notificationclose', () => {
  // Future: track dismiss events
});
