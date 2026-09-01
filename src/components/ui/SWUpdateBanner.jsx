// =============================================================
// SWUpdateBanner — يظهر فقط لما نسخة جديدة من التطبيق تصير جاهزة
// بالخلفية (راجع src/core/swUpdate.js). لا يعمل أي Reload من تلقاء
// نفسه إلا لو المستخدم ضغط "تحديث الآن"، أو صار خامل لفترة طويلة.
// =============================================================
import { useEffect, useState } from 'react';
import { applyPendingSWUpdate } from '@/core/swUpdate';

export function SWUpdateBanner() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onReady = () => setReady(true);
    window.addEventListener('sw-update-ready', onReady);
    return () => window.removeEventListener('sw-update-ready', onReady);
  }, []);

  if (!ready) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#0f1f3d', color: '#fff',
      padding: '10px 16px', fontSize: '13px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
      zIndex: 10000, direction: 'rtl', fontFamily: 'Tajawal, sans-serif',
      boxShadow: '0 -2px 8px rgba(0,0,0,0.15)',
    }}>
      <span>🔄 يتوفر تحديث جديد للتطبيق</span>
      <button
        onClick={applyPendingSWUpdate}
        style={{
          background: '#22c55e', color: '#fff', border: 'none',
          borderRadius: '6px', padding: '6px 14px', fontSize: '13px',
          cursor: 'pointer', fontWeight: 700,
        }}
      >
        تحديث الآن
      </button>
    </div>
  );
}

export default SWUpdateBanner;
