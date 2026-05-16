// =============================================================
// useMediaQuery — subscribe to a CSS media query.
// Defaults work for SSR (false until mounted).
// =============================================================
import { useEffect, useState } from 'react';

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [query]);

  return matches;
}

// Convenience: matches the Tailwind `md` breakpoint (≥768px).
export const useIsDesktop = () => useMediaQuery('(min-width: 768px)');

export default useMediaQuery;
