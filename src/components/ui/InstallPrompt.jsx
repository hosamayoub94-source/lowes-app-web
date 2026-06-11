// =============================================================
// InstallPrompt — PWA install banner for mobile employees
// Shows when the browser fires beforeinstallprompt (Android/Chrome)
// Also shows iOS instructions (Safari doesn't fire the event)
// =============================================================
import { useEffect, useState } from 'react';
import { useUiStore } from '@stores/uiStore';

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIOSHint, setShowIOSHint]       = useState(false);
  const [dismissed, setDismissed]           = useState(false);
  const setInstallPromptActive = useUiStore((s) => s.setInstallPromptActive);

  // أعلِم بقية الواجهة أن بنر التثبيت ظاهر → يُخفي بنر الإشعارات (واحد فقط)
  useEffect(() => {
    const visible = !dismissed && (!!deferredPrompt || showIOSHint);
    setInstallPromptActive(visible);
    return () => setInstallPromptActive(false);
  }, [deferredPrompt, showIOSHint, dismissed, setInstallPromptActive]);

  useEffect(() => {
    // Already installed — don't show
    if (isInStandaloneMode()) return;

    // Already dismissed before (remembered across sessions — less naggy)
    if (localStorage.getItem('pwa-prompt-dismissed')) {
      setDismissed(true);
      return;
    }

    // Android / Chrome: listen for install prompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS Safari: show manual instructions after short delay
    if (isIOS()) {
      setTimeout(() => setShowIOSHint(true), 3000);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setDismissed(true);
    }
  };

  const dismiss = () => {
    localStorage.setItem('pwa-prompt-dismissed', '1');
    setDeferredPrompt(null);
    setShowIOSHint(false);
    setDismissed(true);
  };

  if (dismissed) return null;

  // ── Android / Chrome install banner ─────────────────────────
  if (deferredPrompt) {
    return (
      <div
        role="banner"
        className="fixed bottom-20 inset-x-3 z-50 rounded-2xl shadow-2xl border border-border overflow-hidden"
        style={{ background: 'rgb(var(--color-surface))' }}
      >
        <div className="flex items-center gap-3 p-4">
          {/* App icon */}
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #0f1f3d, #0d7377)' }}
          >
            L
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-bold text-text text-sm leading-snug">ثبّت التطبيق على موبايلك 📲</p>
            <p className="text-muted text-xs mt-0.5">وصول أسرع — يعمل بدون إنترنت</p>
          </div>

          <button
            onClick={dismiss}
            className="text-muted text-xl leading-none px-1 flex-shrink-0"
            aria-label="إغلاق"
          >
            ×
          </button>
        </div>

        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={handleInstall}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold"
            style={{ background: 'linear-gradient(135deg, #0f1f3d, #0d7377)' }}
          >
            تثبيت الآن
          </button>
          <button
            onClick={dismiss}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-border text-muted"
          >
            لاحقاً
          </button>
        </div>
      </div>
    );
  }

  // ── iOS Safari hint ──────────────────────────────────────────
  if (showIOSHint) {
    return (
      <div
        role="banner"
        className="fixed bottom-20 inset-x-3 z-50 rounded-2xl shadow-2xl border border-border overflow-hidden"
        style={{ background: 'rgb(var(--color-surface))' }}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold text-text text-sm">ثبّت التطبيق على iPhone 📲</p>
            <button onClick={dismiss} className="text-muted text-xl leading-none px-1" aria-label="إغلاق">×</button>
          </div>
          <ol className="space-y-2 text-sm text-muted">
            <li className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-teal/10 text-teal flex items-center justify-center text-xs font-bold flex-shrink-0">١</span>
              اضغط على زر المشاركة <span className="text-base">⬆️</span> في Safari
            </li>
            <li className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-teal/10 text-teal flex items-center justify-center text-xs font-bold flex-shrink-0">٢</span>
              اختر <strong className="text-text">"إضافة إلى الشاشة الرئيسية"</strong>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-teal/10 text-teal flex items-center justify-center text-xs font-bold flex-shrink-0">٣</span>
              اضغط <strong className="text-text">"إضافة"</strong> في الزاوية اليمنى
            </li>
          </ol>
        </div>
      </div>
    );
  }

  return null;
}
