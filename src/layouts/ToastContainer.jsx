// =============================================================
// ToastContainer — subscribes to the toast store and renders.
// Anchored bottom-end so it never collides with the BottomNav.
// =============================================================
import { useToastStore } from '@stores/toastStore';
import { Toast } from '@components/ui/Toast';

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (!toasts.length) return null;

  return (
    <div
      className="fixed z-[120] inset-x-0 bottom-20 md:bottom-6 md:end-6 md:start-auto md:w-auto"
      aria-live="polite"
    >
      <div className="flex flex-col items-center md:items-end gap-2 px-3">
        {toasts.map((t) => (
          <Toast key={t.id} kind={t.kind} message={t.message} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </div>
  );
}

export default ToastContainer;
