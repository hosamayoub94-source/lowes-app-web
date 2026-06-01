// =============================================================
// Auth store — backed by Supabase Auth.
//
// The Supabase JS client is the single source of truth for the
// JWT/session. This store mirrors that into Zustand so React
// components have a stable reactive shape, and adds the resolved
// `profile` row (employee_name, role_type, team, ...) which the
// JWT alone doesn't carry.
//
// We DO NOT persist to sessionStorage — the Supabase client
// already persists the JWT to localStorage by default and
// re-issues a fresh session on cold start. Persisting twice is a
// recipe for stale state.
// =============================================================
import { create } from 'zustand';

export const useAuthStore = create()((set) => ({
  // Supabase session (jwt, user, expires_at, etc.)
  supaSession: null,
  // Resolved app profile (employee_name, role_type, team, ...)
  // Shaped to match the legacy `session` object so existing screens
  // keep working without churn.
  session: null,
  isAuthenticated: false,
  ready: false, // false during initial getSession() bootstrap

  setReady: (ready) => set({ ready }),

  // Called by AuthBoot whenever Supabase emits an auth state change.
  setSupaSession: (supaSession, profile) =>
    set({
      supaSession,
      session: supaSession && profile ? mapProfileToSession(profile) : null,
      isAuthenticated: !!supaSession && !!profile,
    }),

  // Manual session set (e.g. immediately after signInWithPin returns
  // a profile, before the AuthBoot subscriber fires).
  setSession: (session) => set({ session, isAuthenticated: !!session }),

  clearSession: () =>
    set({ supaSession: null, session: null, isAuthenticated: false }),

  updateSession: (patch) =>
    set((state) => ({
      session: state.session ? { ...state.session, ...patch } : null,
    })),
}));

// -------------------------------------------------------------
// Selectors
// -------------------------------------------------------------
export const selectIsAuth = (s) => s.isAuthenticated;
export const selectRole   = (s) => s.session?.role || null;
export const selectName   = (s) => s.session?.name || null;
export const selectReady  = (s) => s.ready;

// -------------------------------------------------------------
// Internal — map a profile row into the legacy session shape.
// -------------------------------------------------------------
function mapProfileToSession(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    name: profile.employee_name,
    role: profile.role_type,
    team: profile.team,
    manager_scope: profile.manager_scope,
    avatar_url: profile.avatar_url,
    order_role:   profile.order_role   ?? null,
    order_market: profile.order_market ?? null,
    extra_permissions:  profile.extra_permissions  ?? [],
    denied_permissions: profile.denied_permissions ?? [],
  };
}
