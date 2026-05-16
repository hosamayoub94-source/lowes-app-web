// =============================================================
// HelpLayer — Contextual tooltips + quick guides
//
// Components:
//   • HelpTooltip — inline tooltip on any element
//   • ContextualHelp — floating ? button with panel
//   • ShortcutHint — kbd shortcut badge
//   • OnboardingHint — dismissible tip card
// =============================================================
import { useState, useRef, useEffect, useCallback, memo, createContext, useContext } from 'react';

// ── Help visibility context ────────────────────────────────────
const HelpCtx = createContext({ showHelp: true });
export const useHelpVisible = () => useContext(HelpCtx);

export function HelpProvider({ children }) {
  const [showHelp, setShowHelp] = useState(() => {
    try { return JSON.parse(localStorage.getItem('__lw_show_help') ?? 'true'); } catch { return true; }
  });

  const toggle = useCallback(() => {
    setShowHelp((v) => {
      const next = !v;
      localStorage.setItem('__lw_show_help', String(next));
      return next;
    });
  }, []);

  return (
    <HelpCtx.Provider value={{ showHelp, toggle }}>
      {children}
    </HelpCtx.Provider>
  );
}

// ── HelpTooltip ────────────────────────────────────────────────
export const HelpTooltip = memo(({ content, children, position = 'top', icon = '?' }) => {
  const { showHelp } = useHelpVisible();
  const [visible, setVisible]  = useState(false);
  const timerRef = useRef(null);

  if (!showHelp) return children;

  const show = () => { timerRef.current = setTimeout(() => setVisible(true), 600); };
  const hide = () => { clearTimeout(timerRef.current); setVisible(false); };

  const posClasses = {
    top:    'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    right:  'right-full mr-2 top-1/2 -translate-y-1/2',
    left:   'left-full ml-2 top-1/2 -translate-y-1/2',
  }[position] ?? 'bottom-full mb-2 left-1/2 -translate-x-1/2';

  return (
    <span className="relative inline-block" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <div className={`absolute ${posClasses} z-50 w-48 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-xl p-2.5 shadow-xl pointer-events-none`} dir="rtl">
          {content}
          <div className="absolute w-2 h-2 bg-gray-900 dark:bg-gray-800 rotate-45 left-1/2 -translate-x-1/2 -bottom-1" />
        </div>
      )}
    </span>
  );
});

// ── ShortcutHint ───────────────────────────────────────────────
export const ShortcutHint = memo(({ keys = [], label, className = '' }) => (
  <span className={`inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 ${className}`} dir="ltr">
    {keys.map((k, i) => (
      <kbd key={i} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-[10px] font-mono shadow-sm">
        {k}
      </kbd>
    ))}
    {label && <span className="text-gray-400 mr-1">{label}</span>}
  </span>
));

// ── OnboardingHint ─────────────────────────────────────────────
export function OnboardingHint({ id, icon = '💡', title, children, className = '' }) {
  const { showHelp } = useHelpVisible();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(`__lw_hint_${id}`) === '1'; } catch { return false; }
  });

  if (!showHelp || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(`__lw_hint_${id}`, '1'); } catch { /* ignore */ }
  };

  return (
    <div className={`flex gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/40 ${className}`} dir="rtl">
      <span className="text-xl flex-shrink-0 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        {title && <div className="font-semibold text-sm text-blue-800 dark:text-blue-300 mb-0.5">{title}</div>}
        <div className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">{children}</div>
      </div>
      <button
        onClick={dismiss}
        className="text-blue-300 hover:text-blue-500 dark:hover:text-blue-300 transition-colors flex-shrink-0"
        aria-label="إغلاق"
      >
        ✕
      </button>
    </div>
  );
}

// ── ContextualHelp panel ───────────────────────────────────────
export function ContextualHelp({ title = 'مساعدة', guides = [], shortcuts = [] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (open && ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref} dir="rtl">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm font-bold transition-colors"
        aria-label="مساعدة"
      >
        ?
      </button>

      {open && (
        <div className="absolute left-0 top-10 w-72 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 z-50 p-4">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-white mb-3">{title}</h3>

          {guides.length > 0 && (
            <div className="space-y-2 mb-3">
              {guides.map(({ icon, text }, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <span>{icon}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          )}

          {shortcuts.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
              <div className="text-xs text-gray-400 mb-2">اختصارات لوحة المفاتيح</div>
              <div className="space-y-1.5">
                {shortcuts.map(({ keys, label }, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
                    <ShortcutHint keys={keys} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
