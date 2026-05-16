// =============================================================
// useTheme — read/toggle the theme via the UI store.
// Side-effect of syncing data-theme attr lives in the store.
// =============================================================
import { useUiStore } from '@stores/uiStore';

export function useTheme() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  return { theme, setTheme, toggleTheme, isDark: theme === 'dark' };
}

export default useTheme;
