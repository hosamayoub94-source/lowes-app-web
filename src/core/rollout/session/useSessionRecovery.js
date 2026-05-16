// =============================================================
// useSessionRecovery — React hook for session restore
//
// Call once in DailyWorkspacePage or app shell.
// Returns helpers for saving/restoring per-page state.
// =============================================================
import { useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate }        from 'react-router-dom';
import {
  restoreSession, setActiveSection,
  saveScrollPosition, getScrollPosition,
  saveFilters, getFilters, clearFilters,
  saveDraft, getDraft, clearDraft,
  saveWidgetVisibility, getWidgetVisibility,
  saveCompactMode, getCompactMode,
  getPendingActions,
} from './sessionRecovery';

export function useSessionRecovery() {
  const location     = useLocation();
  const navigate     = useNavigate();
  const restoredRef  = useRef(false);

  // ── Restore once on mount ──────────────────────────────────
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const session = restoreSession();

    // Restore scroll position for current route
    const scroll = getScrollPosition(location.pathname);
    if (scroll > 0) {
      requestAnimationFrame(() => window.scrollTo(0, scroll));
    }
  }, []);

  // ── Track active section ───────────────────────────────────
  useEffect(() => {
    setActiveSection(location.pathname);
  }, [location.pathname]);

  // ── Save scroll on scroll ──────────────────────────────────
  useEffect(() => {
    const key = location.pathname;
    const handler = () => saveScrollPosition(key, window.scrollY);
    const throttled = () => {
      clearTimeout(throttled._t);
      throttled._t = setTimeout(handler, 300);
    };
    window.addEventListener('scroll', throttled, { passive: true });
    return () => window.removeEventListener('scroll', throttled);
  }, [location.pathname]);

  // ── Helpers ────────────────────────────────────────────────
  const filterHelpers = useCallback((moduleKey) => ({
    save:  (filters)  => saveFilters(moduleKey, filters),
    get:   ()         => getFilters(moduleKey),
    clear: ()         => clearFilters(moduleKey),
  }), []);

  const draftHelpers = useCallback((draftId) => ({
    save:  (content)  => saveDraft({ id: draftId, type: 'generic', content }),
    get:   ()         => getDraft(draftId)?.content ?? null,
    clear: ()         => clearDraft(draftId),
  }), []);

  const widgetHelpers = useCallback((widgetKey, defaultVisible = true) => ({
    save:    (v) => saveWidgetVisibility(widgetKey, v),
    get:     ()  => getWidgetVisibility(widgetKey, defaultVisible),
  }), []);

  return {
    // Raw accessors
    filters:          filterHelpers,
    draft:            draftHelpers,
    widget:           widgetHelpers,

    // Compact mode
    compactMode:      getCompactMode(),
    setCompactMode:   saveCompactMode,

    // Pending actions (for recovery display)
    pendingActions:   getPendingActions(),
  };
}

export default useSessionRecovery;
