// =============================================================
// Analytics — StateBox
// One look for loading / empty / error / unavailable, with the reason and
// (optionally) the action that fixes it. Replaces ad-hoc "لا توجد بيانات".
// =============================================================
import { memo } from 'react';

const TONES = {
  loading:     { icon: '⏳', cls: 'text-muted' },
  empty:       { icon: '📭', cls: 'text-muted' },
  unavailable: { icon: 'ℹ️', cls: 'text-muted' },
  error:       { icon: '⚠️', cls: '', color: '#dc2626' },
};

function StateBox({ kind = 'empty', title, reason, action, compact = false, style = {} }) {
  const tone = TONES[kind] ?? TONES.empty;
  const heading = title ?? (kind === 'loading' ? 'جارٍ التحميل…' : kind === 'error' ? 'تعذّر تحميل البيانات' : kind === 'unavailable' ? 'غير متوفر' : 'لا توجد بيانات');
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
      className="bg-surface-alt border border-border"
      style={{
        borderRadius: 12,
        padding: compact ? '14px 12px' : '24px 16px',
        textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        ...style,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: compact ? 18 : 24 }}>{tone.icon}</span>
      <div className={`${tone.cls} font-semibold`} style={{ fontSize: 13, color: tone.color }}>{heading}</div>
      {reason && <div className="text-muted" style={{ fontSize: 12, maxWidth: 420, lineHeight: 1.6 }}>{reason}</div>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}

export default memo(StateBox);
