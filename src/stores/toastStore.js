// =============================================================
// Toast store — single source of truth for transient messages.
// Components fire toasts via `useToast()` hook; ToastContainer
// in the layout subscribes and renders.
// =============================================================
import { create } from 'zustand';

let counter = 0;
const nextId = () => `t_${Date.now()}_${(counter += 1)}`;

export const useToastStore = create((set, get) => ({
  toasts: [], // { id, kind: 'success'|'error'|'info', message, duration }

  show: (message, options = {}) => {
    const id = nextId();
    const toast = {
      id,
      kind: options.kind || 'success',
      message,
      duration: options.duration ?? 2800,
    };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    if (toast.duration > 0) {
      setTimeout(() => get().dismiss(id), toast.duration);
    }
    return id;
  },

  success: (message, opts) => get().show(message, { ...opts, kind: 'success' }),
  error: (message, opts) => get().show(message, { ...opts, kind: 'error' }),
  info: (message, opts) => get().show(message, { ...opts, kind: 'info' }),
  warning: (message, opts) => get().show(message, { ...opts, kind: 'warning' }),

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));
