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

export default Spinner;
