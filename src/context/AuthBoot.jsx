// =============================================================
// AuthBoot — single mount point that:
//   1. Reads the existing Supabase session on cold start
//   2. Resolves the matching `profiles` row
//   3. Subscribes to onAuthStateChange and keeps the store in
//      sync for the rest of the app's lifetime
//   4. Renders nothing until `ready === true` to avoid a flicker
//      where ProtectedRoute redirects to /login while the JWT is
//      still loading from localStorage.
// =============================================================
import { useEffect } from 'react';
import {
  getCurrentSession,
  getMyProfile,
  onAuthStateChange,
} from '@services/authService';
import { useAuthStore } from '@stores/authStore';
import { LoadingScreen } from '@components/ui/Loading';

export function AuthBoot({ children }) {
  const ready = useAuthStore((s) => s.ready);
  const setReady = useAuthStore((s) => s.setReady);
  const setSupaSession = useAuthStore((s) => s.setSupaSession);

  useEffect(() => {
    let cancelled = false;

    // 1. Cold-start hydration
    (async () => {
      try {
        const session = await getCurrentSession();
        if (cancelled) return;
        if (session) {
          const profile = await getMyProfile();
          if (cancelled) return;
          setSupaSession(session, profile);
        } else {
          setSupaSession(null, null);
        }
      } catch {
        setSupaSession(null, null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    // 2. Live updates — sign in / sign out / token refresh.
    const unsubscribe = onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setSupaSession(null, null);
        return;
      }
      // After SIGNED_IN or TOKEN_REFRESHED — re-fetch profile so
      // role/team changes propagate without a full reload.
      try {
        const profile = await getMyProfile();
        setSupaSession(session, profile);
      } catch {
        setSupaSession(session, null);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [setReady, setSupaSession]);

  if (!ready) return <LoadingScreen />;
  return children;
}

export default AuthBoot;
