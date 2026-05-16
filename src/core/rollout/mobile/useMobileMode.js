// =============================================================
// useMobileMode — Mobile detection + preferences
//
// Detects: touch device, viewport width, standalone PWA mode.
// Persists: user's preference to force mobile/desktop mode.
// Returns: isMobile, isTablet, isStandalone, preferences setters.
// =============================================================
import { useState, useEffect, useCallback } from 'react';

const MOBILE_PREF_KEY = '__lw_mobile_pref';

function _readPref() {
  try { return JSON.parse(localStorage.getItem(MOBILE_PREF_KEY) ?? 'null'); } catch { return null; }
}
function _writePref(v) {
  try { localStorage.setItem(MOBILE_PREF_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

function _detectMobile() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function _detectTablet() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= 768 && window.innerWidth < 1024;
}

function _detectStandalone() {
  return window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator?.standalone === true;
}

function _detectTouch() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function useMobileMode() {
  const [state, setState] = useState(() => ({
    isMobile:     _detectMobile(),
    isTablet:     _detectTablet(),
    isStandalone: _detectStandalone(),
    isTouch:      _detectTouch(),
    viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
    preference:   _readPref(),  // null | 'mobile' | 'desktop'
  }));

  // Effective mobile mode: user preference overrides auto-detect
  const effectiveMobile = state.preference === 'mobile'
    ? true
    : state.preference === 'desktop'
    ? false
    : state.isMobile;

  // Recalculate on resize
  useEffect(() => {
    const handler = () => {
      setState((prev) => ({
        ...prev,
        isMobile:      _detectMobile(),
        isTablet:      _detectTablet(),
        viewportWidth: window.innerWidth,
      }));
    };
    const throttled = () => {
      clearTimeout(throttled._t);
      throttled._t = setTimeout(handler, 150);
    };
    window.addEventListener('resize', throttled);
    return () => window.removeEventListener('resize', throttled);
  }, []);

  const setPreference = useCallback((pref) => {
    _writePref(pref);
    setState((s) => ({ ...s, preference: pref }));
  }, []);

  const clearPreference = useCallback(() => {
    _writePref(null);
    setState((s) => ({ ...s, preference: null }));
  }, []);

  return {
    // Auto-detected
    isMobile:       state.isMobile,
    isTablet:       state.isTablet,
    isStandalone:   state.isStandalone,
    isTouch:        state.isTouch,
    viewportWidth:  state.viewportWidth,

    // Preference-aware
    preference:     state.preference,
    effectiveMobile,
    isDesktopForced: state.preference === 'desktop',
    isMobileForced:  state.preference === 'mobile',

    // Setters
    setPreference,
    clearPreference,
    forceMobile:  () => setPreference('mobile'),
    forceDesktop: () => setPreference('desktop'),
  };
}

export default useMobileMode;
