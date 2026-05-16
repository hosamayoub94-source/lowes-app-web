// =============================================================
// ThemeBoot — applies persisted theme + lang to <html> on first
// render. Uses the UI store as the source of truth so reload and
// runtime toggles share the same code path.
// =============================================================
import { useEffect } from 'react';
import { useUiStore } from '@stores/uiStore';

export function ThemeBoot({ children }) {
  const theme = useUiStore((s) => s.theme);
  const lang = useUiStore((s) => s.lang);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  return children;
}

export default ThemeBoot;
