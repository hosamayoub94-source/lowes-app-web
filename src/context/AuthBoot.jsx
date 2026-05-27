// =============================================================
// AuthBoot — single mount point that:
//   1. Reads the existing Supabase session on cold start
//   2. Falls back to a localStorage manual session (for profiles
//      that were inserted via SQL without creating auth.users)
//   3. Resolves the matching `profiles` row either way
//   4. Subscribes to onAuthStateChange for live token refresh
//   5. Renders nothing until `ready === true` (no flicker)
// =============================================================
import { useEffect } from 'react';
import {
  getCurrentSession,
  getMyProfile,
  getManualSession,
  getProfileById,
  onAuthStateChange,
  MANUAL_SESSION_KEY,
} from '@services/authService';
import { useAuthStore } from '@stores/authStore';
import { LoadingScreen } from '@components/ui/Loading';
import { initUsageTracker, shutdownUsageTracker } from '@/core/operations/tracking/usageTracker';
import { initFrictionTracker }                    from '@/core/operations/tracking/frictionTracker';

export function AuthBoot({ children }) {
  const ready        = useAuthStore((s) => s.ready);
  const setReady     = useAuthStore((s) => s.setReady);
  const setSupaSession = useAuthStore((s) => s.setSupaSession);

  useEffect(() => {
    let cancelled = false;

    // ── 1. Cold-start hydration ───────────────────────────────
    (async () => {
      try {
        const session = await getCurrentSession();
        if (cancelled) return;

        if (session) {
          // Normal Supabase Auth session
          const profile = await getMyProfile();
          if (cancelled) return;
          setSupaSession(session, profile);
          initUsageTracker(session.user?.id ?? 'anonymous');
          initFrictionTracker(session.user?.id ?? 'anonymous');
        } else {
          // No Supabase session — check for manual session in localStorage
          const ms = getManualSession();
          if (ms?.profileId) {
            const profile = await getProfileById(ms.profileId);
            if (cancelled) return;
            if (profile) {
              // Synthetic session: truthy so isAuthenticated === true
              const syntheticSession = { manual: true, user: { id: profile.id } };
              setSupaSession(syntheticSession, profile);
              initUsageTracker(profile.id);
              initFrictionTracker(profile.id);
            } else {
              // Profile deleted — clear stale manual session
              localStorage.removeItem(MANUAL_SESSION_KEY);
              setSupaSession(null, null);
            }
          } else {
            setSupaSession(null, null);
          }
        }
      } catch {
        setSupaSession(null, null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    // ── 2. Live updates for real Supabase Auth users ──────────
    const unsubscribe = onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        shutdownUsageTracker();
        setSupaSession(null, null);
        return;
      }
      // SIGNED_IN or TOKEN_REFRESHED — re-fetch profile
      try {
        const profile = await getMyProfile();
        setSupaSession(session, profile);
        if (event === 'SIGNED_IN') {
          initUsageTracker(session.user?.id ?? 'anonymous');
          initFrictionTracker(session.user?.id ?? 'anonymous');
        }
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
