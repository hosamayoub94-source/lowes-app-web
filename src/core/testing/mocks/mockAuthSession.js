// =============================================================
// mockAuthSession — DEV/test helpers for injecting fake auth state
//
// makeMockUser(overrides)    — shaped to match authStore session
// makeMockSession(overrides) — Supabase-compatible session envelope
// injectMockSession(opts)    — pushes a mock session into authStore
//
// All helpers are safe to import in production — they become no-ops
// unless explicitly called.
// =============================================================

import { ROLES } from '@data/teams';

// ── Mock user factory ─────────────────────────────────────────

/**
 * Create a mock user shaped to match the authStore `session` object.
 * @param {object} overrides
 * @returns {{ id, name, role, team, manager_scope, avatar_url }}
 */
export function makeMockUser(overrides = {}) {
  return {
    id:            overrides.id            ?? 'mock_user_001',
    name:          overrides.name          ?? 'موظف تجريبي',
    role:          overrides.role          ?? ROLES?.EMPLOYEE ?? 'employee',
    team:          overrides.team          ?? 'ops',
    manager_scope: overrides.manager_scope ?? null,
    avatar_url:    overrides.avatar_url    ?? null,
    ...overrides,
  };
}

// ── Mock session factory ──────────────────────────────────────

/**
 * Create a Supabase-compatible mock session envelope.
 * @param {object} overrides
 * @returns {{ access_token, refresh_token, expires_at, user }}
 */
export function makeMockSession(overrides = {}) {
  const user = makeMockUser(overrides.user ?? {});
  return {
    access_token:  'mock_access_token_' + Date.now(),
    refresh_token: 'mock_refresh_token',
    expires_at:    Math.floor(Date.now() / 1000) + 3600,
    token_type:    'bearer',
    user: {
      id:    user.id,
      email: overrides.email ?? 'test@lowespro.com',
      user_metadata: {
        name:  user.name,
        role:  user.role,
        team:  user.team,
      },
      role:  'authenticated',
    },
    // Flattened profile (mirrors what authStore.setSession expects)
    ...user,
    ...overrides,
  };
}

// ── Inject into authStore ─────────────────────────────────────

/**
 * Directly push a mock session into the auth store.
 * Useful for E2E helpers and stress tests that need auth without
 * going through Supabase.
 *
 * @param {object} [opts]
 * @param {string} [opts.role]  — ROLES constant value, default 'employee'
 * @param {string} [opts.name]
 * @param {string} [opts.id]
 */
export function injectMockSession(opts = {}) {
  // Lazy import to avoid circular dep at module evaluation time
  import('@stores/authStore').then(({ useAuthStore }) => {
    const session = makeMockUser(opts);
    useAuthStore.getState().setSession(session);
  }).catch(() => {
    // Non-fatal — testing helper
  });
}
