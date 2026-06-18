// =============================================================
// PushPermissionPrompt — gentle banner to enable Web Push.
//
// Most employees never visited Profile to turn on notifications,
// so push_subscriptions stayed empty → no push when app is closed.
// This nudges them once (dismissible, remembered for 3 days).
// =============================================================
import { useEffect, useState } from 'react';
import { usePushNotifications } from '@hooks/usePushNotifications';
import { useUiStore } from '@stores/uiStore';

const DISMISS_KEY = 'lozy_push_prompt_dismissed';
const SNOOZE_MS   = 30 * 24 * 60 * 60 * 1000; // re-ask after 30 days (less naggy)

function recentlyDismissed() {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return t && (Date.now() - t) < SNOOZE_MS;
  } catch { return false; }
}

export function PushPermissionPrompt() {
  const { supported, vapidConfigured, permission, subscribed, loading, subscribe } = usePushNotifications();
  const installActive = useUiStore((s) => s.installPromptActive);
  const [show, setShow]       = useState(false);
  const [hidden, setHidden]   = useState(false);

  // Decide whether to show — only when push is usable but not yet enabled
  useEffect(() => {
    if (!supported || !vapidConfigured) return;
    if (subscribed || permission === 'denied') return;
    if (recentlyDismissed()) return;
    const t = setTimeout(() => setShow(true), 4000); // let the screen settle first
    return () => clearTimeout(t);
  }, [supported, vapidConfigured, subscribed, permission]);

  if (!show || hidden || subscribed || installActive) return null; // بنر واحد فقط: Install أولاً

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* تجاهل */ }
    setHidden(true);
  };

  const enable = async () => {
    await subscribe();
    setHidden(true);
  };

  return (
    <div className="fixed bottom-24 sm:bottom-6 inset-x-3 sm:inset-x-auto sm:start-6 z-[120] sm:max-w-sm animate-in slide-in-from-bottom-4 duration-300" dir="rtl">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-navy grid place-items-center text-xl shrink-0">🔔</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text">فعّل الإشعارات</p>
          <p className="text-xs text-muted mt-0.5 leading-relaxed">
            عشان توصلك المهام والرسائل والتنبيهات حتى والتطبيق مسكّر 📲
          </p>
          <div className="flex gap-2 mt-3">
            <button onClick={enable} disabled={loading}
              className="flex-1 py-2 rounded-xl bg-teal text-navy text-xs font-bold hover:bg-teal/90 disabled:opacity-50 transition">
              {loading ? '⏳ جارٍ التفعيل…' : '🔔 تفعيل'}
            </button>
            <button onClick={dismiss}
              className="px-3 py-2 rounded-xl border border-border text-muted text-xs font-semibold hover:text-text transition">
              لاحقاً
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PushPermissionPrompt;
