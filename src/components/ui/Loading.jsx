// =============================================================
// Loading — spinner + full-screen suspense boundary fallback.
// =============================================================
import { cn } from '@utils/classNames';

export function Spinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'w-4 h-4 border-2', md: 'w-6 h-6 border-2', lg: 'w-10 h-10 border-[3px]' };
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block rounded-full border-current border-t-transparent animate-spin text-teal',
        sizes[size] || sizes.md,
        className,
      )}
    />
  );
}

export function LoadingScreen({ label = 'جاري التحميل…' }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-muted">
      <Spinner size="lg" />
      <div className="text-sm">{label}</div>
    </div>
  );
}

/** Shown by AuthBoot when the first session read takes too long — never an endless spinner, never a silent logout. */
export function LoadingStuckScreen({ onRetry = () => window.location.reload() }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-center px-6" dir="rtl" role="alert" data-testid="boot-stuck">
      <div className="text-3xl" aria-hidden>⏱️</div>
      <div className="text-sm font-bold text-text">التطبيق يستغرق وقتاً أطول من المعتاد للتحميل.</div>
      <div className="text-xs text-muted">تأكد من الإنترنت ثم أعد المحاولة. جلستك محفوظة ولن تُسجَّل خروجاً.</div>
      <button type="button" onClick={onRetry} data-testid="boot-retry" className="text-xs font-bold px-4 py-2 rounded-xl bg-surface border border-border text-text">🔄 إعادة المحاولة</button>
    </div>
  );
}

export default Spinner;
