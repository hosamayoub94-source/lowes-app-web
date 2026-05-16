// =============================================================
// useKeyboardShortcuts — global keyboard productivity layer
// ─────────────────────────────────────────────────────────────
// Shortcuts:
//   Ctrl+K / ⌘K   → Command Palette
//   /              → Open Command Palette (from anywhere)
//   G → H          → Go Home
//   G → T          → Go to Tasks
//   G → A          → Go to Attendance
//   G → P          → Go to Profile
//   G → E          → Go to Team (equipo)
//   Escape         → Close any overlay
//   ?              → Show shortcuts help
// =============================================================
import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useWorkspaceStore from '../store/useWorkspaceStore';
import { ROUTES }        from '@routes/paths';

export function useKeyboardShortcuts({ enabled = true } = {}) {
  const navigate = useNavigate();

  const openCommandPalette  = useWorkspaceStore((s) => s.openCommandPalette);
  const closeCommandPalette = useWorkspaceStore((s) => s.closeCommandPalette);
  const toggleFocusMode     = useWorkspaceStore((s) => s.toggleFocusMode);

  // Track "G" chord — after G is pressed, next key triggers navigation
  const gPressedRef  = useRef(false);
  const gTimerRef    = useRef(null);

  const resetGChord = useCallback(() => {
    gPressedRef.current = false;
    clearTimeout(gTimerRef.current);
  }, []);

  const activateGChord = useCallback(() => {
    gPressedRef.current = true;
    // Auto-reset after 1.5s if no second key
    gTimerRef.current = setTimeout(resetGChord, 1500);
  }, [resetGChord]);

  useEffect(() => {
    if (!enabled) return;

    const handler = (e) => {
      // Ignore when typing in inputs/textareas
      const tag = document.activeElement?.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.contentEditable === 'true';

      // ── Ctrl+K / ⌘K — command palette ─────────────────────────
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openCommandPalette();
        resetGChord();
        return;
      }

      // ── Escape ─────────────────────────────────────────────────
      if (e.key === 'Escape') {
        closeCommandPalette();
        resetGChord();
        return;
      }

      // Skip remaining shortcuts if in an input
      if (isEditable) return;

      // ── / — open command palette ───────────────────────────────
      if (e.key === '/') {
        e.preventDefault();
        openCommandPalette();
        resetGChord();
        return;
      }

      // ── ? — show shortcut reference ────────────────────────────
      if (e.key === '?') {
        e.preventDefault();
        openCommandPalette();
        resetGChord();
        return;
      }

      // ── F — toggle focus mode ───────────────────────────────────
      if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        toggleFocusMode();
        resetGChord();
        return;
      }

      // ── G chord — navigation ────────────────────────────────────
      if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
        if (gPressedRef.current) {
          // Second G — ignore (gg doesn't do anything here)
          resetGChord();
        } else {
          activateGChord();
        }
        return;
      }

      if (gPressedRef.current) {
        resetGChord();
        e.preventDefault();

        switch (e.key.toLowerCase()) {
          case 'h': navigate(ROUTES.HOME);       break;
          case 't': navigate(ROUTES.TASKS);      break;
          case 'a': navigate(ROUTES.ATTENDANCE); break;
          case 'p': navigate(ROUTES.PROFILE);    break;
          case 'e': navigate(ROUTES.TEAM);       break;
          case 'l': navigate(ROUTES.HOLIDAYS);   break;
          default:  break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      clearTimeout(gTimerRef.current);
    };
  }, [enabled, navigate, openCommandPalette, closeCommandPalette, toggleFocusMode, activateGChord, resetGChord]);

  // ── Shortcut reference map (for help UI) ──────────────────────
  const shortcutMap = [
    { keys: 'Ctrl+K',  description: 'فتح لوحة الأوامر' },
    { keys: '/',        description: 'بحث سريع' },
    { keys: 'G → H',   description: 'الرئيسية' },
    { keys: 'G → T',   description: 'المهام' },
    { keys: 'G → A',   description: 'الحضور' },
    { keys: 'G → P',   description: 'الملف الشخصي' },
    { keys: 'G → E',   description: 'الفريق' },
    { keys: 'F',        description: 'وضع التركيز' },
    { keys: 'ESC',      description: 'إغلاق / إلغاء' },
  ];

  return { shortcutMap };
}

export default useKeyboardShortcuts;
