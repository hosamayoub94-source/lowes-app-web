// =============================================================
// Auth — PIN-based sign-in with Supabase Auth + manual fallback.
//
// Flow:
//   1. Fetch profile + PIN from profiles table (direct comparison)
//   2. Verify PIN locally (profiles.pin is the source of truth)
//   3. Try Supabase Auth signInWithPassword (for accounts that exist)
//   4. If Supabase Auth fails → store manual session in localStorage
//      (safe: all RLS policies are USING(true), so the anon-key JWT
//       has full DB access regardless of Supabase Auth state)
// =============================================================
import { supabase } from './supabase';
import { logActivityImmediate } from '@modules/audit/services/auditService';
import { ACTION_TYPE, ENTITY_TYPE } from '@modules/audit/types/audit.types';

const AUTH_DOMAIN = 'auth.lowes-pro.local';
export const MANUAL_SESSION_KEY = 'lowes_manual_session';

const synthEmail = (profileId) => `${profileId}@${AUTH_DOMAIN}`;
const derivePass  = (pin)       => `lp:${String(pin).trim()}`;

// -------------------------------------------------------------
// Profile lookup
// -------------------------------------------------------------

/** Fetch a single profile by employee_name (no PIN exposed). */
export async function getProfile(employeeName) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, employee_name, role_type, team, manager_scope, avatar_url, is_active, order_role, order_market')
    .eq('employee_name', employeeName)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Fetch a profile by ID. */
export async function getProfileById(profileId) {
  const { data } = await supabase
    .from('profiles')
    .select('id, employee_name, role_type, team, manager_scope, avatar_url, is_active, order_role, order_market')
    .eq('id', profileId)
    .maybeSingle();
  return data || null;
}

/** Profiles for the role/name picker. */
export async function listActiveProfiles({ roleType } = {}) {
  let q = supabase
    .from('profiles')
    .select('id, employee_name, role_type, team, manager_scope, avatar_url, is_active, order_role, order_market')
    .eq('is_active', true)
    .order('employee_name');
  if (roleType) q = q.eq('role_type', roleType);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// -------------------------------------------------------------
// Manual session helpers
// -------------------------------------------------------------

/** Read manual session from localStorage (expires after 7 days). */
export function getManualSession() {
  try {
    const raw = localStorage.getItem(MANUAL_SESSION_KEY);
    if (!raw) return null;
    const ms = JSON.parse(raw);
    if (Date.now() - ms.createdAt > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(MANUAL_SESSION_KEY);
      return null;
    }
    return ms;
  } catch {
    return null;
  }
}

function _storeManualSession(profile) {
  const ms = {
    profileId:    profile.id,
    employeeName: profile.employee_name,
    createdAt:    Date.now(),
    isManual:     true,
  };
  localStorage.setItem(MANUAL_SESSION_KEY, JSON.stringify(ms));
  return ms;
}

// -------------------------------------------------------------
// Sign-in / sign-out
// -------------------------------------------------------------

/**
 * PIN-based sign-in.
 * Returns { user, session, profile } on success.
 * session.manual === true when using localStorage fallback.
 */
export async function signInWithPin(employeeName, pin) {
  // ── Step 1: Fetch profile + PIN ──────────────────────────────
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, employee_name, role_type, team, manager_scope, avatar_url, is_active, order_role, order_market, pin')
    .eq('employee_name', employeeName)
    .limit(1)
    .maybeSingle();

  if (profileErr) throw new Error('خطأ في الاتصال بالخادم');
  if (!profile)   throw new Error('المستخدم غير موجود');

  // ── Step 2: Verify PIN directly ──────────────────────────────
  const storedPin  = String(profile.pin  ?? '').trim();
  const enteredPin = String(pin          ?? '').trim();

  if (!storedPin) {
    throw new Error('لم يتم تعيين PIN لهذا المستخدم — تواصل مع المدير');
  }
  if (storedPin !== enteredPin) {
    logActivityImmediate({
      actionType:  ACTION_TYPE.LOGIN_FAILED,
      entityType:  ENTITY_TYPE.AUTH,
      entityLabel: employeeName,
      userId:      profile.id || null,
      userName:    employeeName || null,
      metadata:    { reason: 'Wrong PIN' },
    }).catch(() => {});
    throw new Error('PIN غير صحيح');
  }

  // ── Step 3: Try Supabase Auth ─────────────────────────────────
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email:    synthEmail(profile.id),
      password: derivePass(pin),
    });
    if (!error && data?.session) {
      logActivityImmediate({
        actionType:  ACTION_TYPE.LOGIN,
        entityType:  ENTITY_TYPE.AUTH,
        entityLabel: employeeName,
        userId:      profile.id,
        userName:    profile.employee_name,
        sessionId:   data.session?.access_token?.slice(0, 20) || null,
      }).catch(() => {});
      // Return profile without the pin field
      const { pin: _pin, ...safeProfile } = profile;
      return { user: data.user, session: data.session, profile: safeProfile };
    }
  } catch { /* fall through */ }

  // ── Step 4: Manual session fallback ──────────────────────────
  // Supabase Auth account doesn't exist yet.
  // Since all RLS is USING(true), the anon JWT covers all DB ops.
  _storeManualSession(profile);

  logActivityImmediate({
    actionType:  ACTION_TYPE.LOGIN,
    entityType:  ENTITY_TYPE.AUTH,
    entityLabel: employeeName,
    userId:      profile.id,
    userName:    profile.employee_name,
    metadata:    { mode: 'manual_session' },
  }).catch(() => {});

  const syntheticSession = { manual: true, user: { id: profile.id } };
  const { pin: _pin, ...safeProfile } = profile;
  return { user: syntheticSession.user, session: syntheticSession, profile: safeProfile };
}

/** Legacy entry point — delegates to signInWithPin. */
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
  // Always clear manual session
  localStorage.removeItem(MANUAL_SESSION_KEY);

  // Best-effort: log the sign-out event
  try {
    const user = await getCurrentUser();
    if (user) {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('id, employee_name')
        .eq('id', user.id)
        .maybeSingle();
      logActivityImmediate({
        actionType: ACTION_TYPE.LOGOUT,
        entityType: ENTITY_TYPE.AUTH,
        userId:     profileRow?.id            || null,
        userName:   profileRow?.employee_name || null,
      }).catch(() => {});
    }
  } catch { /* best-effort */ }

  // Sign out from Supabase (ignore error if there's no Supabase session)
  await supabase.auth.signOut().catch(() => {});
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

/**
 * Fetch the profile for the currently signed-in Supabase user.
 * Tries user.id first, then falls back to email-based ID extraction.
 */
export async function getMyProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  // Primary: lookup by user.id
  const { data, error } = await supabase
    .from('profiles')
    .select('id, employee_name, role_type, team, manager_scope, avatar_url, is_active, order_role, order_market')
    .eq('id', user.id)
    .maybeSingle();
  if (!error && data) return data;

  // Fallback: extract profile ID from synthesized email
  // email format: ${profileId}@auth.lowes-pro.local
  if (user.email?.endsWith(`@${AUTH_DOMAIN}`)) {
    const profileId = user.email.split('@')[0];
    const { data: data2 } = await supabase
      .from('profiles')
      .select('id, employee_name, role_type, team, manager_scope, avatar_url, is_active, order_role, order_market')
      .eq('id', profileId)
      .maybeSingle();
    if (data2) return data2;
  }

  return null;
}

// -------------------------------------------------------------
// Self-service PIN change.
// Updates both profiles.pin (source of truth) and Supabase Auth
// password (if the user has an auth account).
// -------------------------------------------------------------
export async function changeMyPin(newPin) {
  if (!/^\d{4}$/.test(String(newPin))) {
    throw new Error('PIN يجب أن يكون 4 أرقام');
  }

  // Determine current profile ID (Supabase Auth or manual session)
  let profileId = null;
  try {
    const user = await getCurrentUser();
    profileId = user?.id;
  } catch { /* ignore */ }
  if (!profileId) {
    const ms = getManualSession();
    profileId = ms?.profileId;
  }

  if (!profileId) throw new Error('لم يتم التعرف على المستخدم');

  // Update profiles.pin (always works via anon key + USING(true) RLS)
  const { error: pinErr } = await supabase
    .from('profiles')
    .update({ pin: String(newPin).trim() })
    .eq('id', profileId);
  if (pinErr) throw new Error('فشل تحديث PIN');

  // Also update Supabase Auth password if there's an auth session
  try {
    await supabase.auth.updateUser({ password: derivePass(newPin) });
  } catch { /* ignore — no auth account */ }

  return true;
}
