// =============================================================
// useAuth — auth store accessor with the most-used selectors.
// Returns a STABLE object reference — actions are stable in
// Zustand, and the derived fields are memoized against `session`,
// so consumers can safely use the result in dependency arrays.
//
// `logout()` is the canonical sign-out path: it ends the Supabase
// session, which triggers AuthBoot's onAuthStateChange listener
// and clears the local store. `clearSession` is kept for tests /
// edge cases where you only want to drop client state.
// =============================================================
import { useCallback, useMemo } from 'react';
import { useAuthStore } from '@stores/authStore';
import { signOut } from '@services/authService';

export function useAuth() {
  const session = useAuthStore((s) => s.session);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const ready = useAuthStore((s) => s.ready);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);
  const updateSession = useAuthStore((s) => s.updateSession);

  const logout = useCallback(async () => {
    try {
      await signOut();
    } finally {
      // Defensive: clear local state even if signOut hits the network.
      clearSession();
    }
  }, [clearSession]);

  return useMemo(
    () => ({
      session,
      isAuthenticated,
      ready,
      name: session?.name || null,
      role: session?.role || null,
      team: session?.team || null,
      manager_scope: session?.manager_scope || null,
      avatar_url: session?.avatar_url || null,
      id:           session?.id           || null,
      order_role:   session?.order_role   || null,
      order_market: session?.order_market || null,
      setSession,
      clearSession,
      updateSession,
      logout,
    }),
    [session, isAuthenticated, ready, setSession, clearSession, updateSession, logout],
  );
}

export default useAuth;
