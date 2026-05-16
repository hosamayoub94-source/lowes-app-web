// =============================================================
// Auth — Supabase Auth flow.
// UX: role → name → 4-digit PIN. Internally each PIN check is a
// `signInWithPassword` call against a synthesized email derived
// from the profile id. The PIN itself becomes the password
// (prefixed with "lp:" to clear Supabase's 6-char minimum).
//
// Anyone with the anon key can list active profiles for the
// picker — that's protected by RLS column-level grants in
// 0002_auth_supabase.sql (the `pin` column is locked down).
// =============================================================
import { supabase } from './supabase';
import { logActivityImmediate } from '@modules/audit/services/auditService';
import { ACTION_TYPE, ENTITY_TYPE } from '@modules/audit/types/audit.types';

const AUTH_DOMAIN = 'auth.lowes-pro.local';

const synthEmail = (profileId) => `${profileId}@${AUTH_DOMAIN}`;
const derivePass = (pin) => `lp:${String(pin).trim()}`;

// -------------------------------------------------------------
// Profile lookup
// -------------------------------------------------------------

/** Fetch a single profile by employee_name. */
export async function getProfile(employeeName) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, employee_name, role_type, team, manager_scope, avatar_url, is_active')
    .eq('employee_name', employeeName)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Profiles for the role/name picker. PIN column is intentionally
 *  excluded — RLS revokes select on that column from anon. */
export async function listActiveProfiles({ roleType } = {}) {
  let q = supabase
    .from('profiles')
    .select('id, employee_name, role_type, team, manager_scope, avatar_url, is_active')
    .eq('is_active', true)
    .order('employee_name');
  if (roleType) q = q.eq('role_type', roleType);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// -------------------------------------------------------------
// Sign-in / sign-out
// -------------------------------------------------------------

/**
 * PIN-based sign-in. Resolves to the authenticated profile, throws
 * with a friendly Arabic message on bad PIN / unknown name.
 */
export async function signInWithPin(employeeName, pin) {
  const profile = await getProfile(employeeName);
  if (!profile) throw new Error('المستخدم غير موجود');

  const { data, error } = await supabase.auth.signInWithPassword({
    email: synthEmail(profile.id),
    password: derivePass(pin),
  });

  if (error) {
    // Log failed attempt before re-throwing (use profile.id as best-effort userId)
    logActivityImmediate({
      actionType:  ACTION_TYPE.LOGIN_FAILED,
      entityType:  ENTITY_TYPE.AUTH,
      entityLabel: employeeName,
      userId:      profile?.id  || null,
      userName:    employeeName || null,
      metadata:    { reason: error.message },
    }).catch(() => {});

    // Map Supabase's generic "Invalid login credentials" to Arabic.
    if (/invalid/i.test(error.message)) throw new Error('PIN غير صحيح');
    throw error;
  }

  // Log successful login
  logActivityImmediate({
    actionType:  ACTION_TYPE.LOGIN,
    entityType:  ENTITY_TYPE.AUTH,
    entityLabel: employeeName,
    userId:      profile.id,
    userName:    profile.employee_name,
    sessionId:   data.session?.access_token?.slice(0, 20) || null,
  }).catch(() => {});

  // Pair the Supabase user with the profile row for downstream consumers.
  return { user: data.user, session: data.session, profile };
}

/** Legacy entry point kept so existing screens continue to compile.
 *  Delegates to signInWithPin and returns the profile (or null on
 *  bad PIN, matching the old contract). */
export async function verifyPin(employeeName, pin) {
  try {
    const { profile } = await signInWithPin(employeeName, pin);
    return profile;
  } catch (e) {
    if (/PIN/i.test(e?.message)) return null;
    throw e;
  }
}

export async function signOut() {
  // Capture who is signing out before the session is cleared
  try {
    const user = await getCurrentUser();
    if (user) {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('id, employee_name')
        .eq('id', user.id)
        .maybeSingle();
      logActivityImmediate({
        actionType:  ACTION_TYPE.LOGOUT,
        entityType:  ENTITY_TYPE.AUTH,
        userId:      profileRow?.id            || null,
        userName:    profileRow?.employee_name || null,
      }).catch(() => {});
    }
  } catch { /* best-effort — never block sign-out */ }

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// -------------------------------------------------------------
// Session helpers
// -------------------------------------------------------------

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data?.user || null;
}

/** Subscribe to auth-state changes. Returns an unsubscribe fn. */
export function onAuthStateChange(handler) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    handler(event, session);
  });
  return () => data?.subscription?.unsubscribe();
}

/** Fetch the profile for the currently signed-in user. */
export async function getMyProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, employee_name, role_type, team, manager_scope, avatar_url, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// -------------------------------------------------------------
// Self-service PIN change.
// User must be authenticated. The new PIN replaces the auth
// password — the legacy `profiles.pin` column is intentionally
// not touched (it's read-only from the client now).
// -------------------------------------------------------------
export async function changeMyPin(newPin) {
  if (!/^\d{4}$/.test(String(newPin))) {
    throw new Error('PIN يجب أن يكون 4 أرقام');
  }
  const { error } = await supabase.auth.updateUser({
    password: derivePass(newPin),
  });
  if (error) throw error;
  return true;
}
