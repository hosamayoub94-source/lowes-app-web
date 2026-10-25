// =============================================================
// verify-pin -- login gateway logic (audit F-03 + F-09). No imports: the Supabase client, limiter and hashing are injected
// so test-verify-pin-handler.mjs can run every branch in Node with fakes.
//
// Contract with the browser (authService.signInWithPin) -- unchanged responses for the old error cases:
//   { ok:false, error:'not_found'|'inactive'|'no_pin_set'|'wrong_pin' }            (HTTP 200)
//   throttled callers get the same { ok:false, error:'wrong_pin' } (no oracle); limiter outage once configured -> HTTP 503 server_error
//   { ok:true, profile, authIdentity:'exists'|'created'|'repaired'|'failed'|'banned', authPassword? }
// `authPassword` is only returned in auth_mode='derived': a per-user password that is NOT derived from the PIN, so a stolen/guessed PIN
// space cannot be attacked through the public Auth endpoint any more; it is handed out only after the (rate-limited) PIN check.
// =============================================================

export const PIN_PASSWORD = (pin: string) => `lp:${pin}`;

export interface Deps {
  // deno-lint-ignore no-explicit-any
  admin: any;                                                         // service-role client
  limiter: (employeeName: string) => Promise<{ allowed: boolean; reason?: string }>;
  hmacHex: (pepper: string, scope: string, value: string) => Promise<string>;
  log?: (msg: string) => void;
}

const res = (status: number, body: Record<string, unknown>) => ({ status, body });

async function readSecrets(deps: Deps, names: string[]): Promise<Record<string, string>> {
  const { data } = await deps.admin.from('internal_secrets').select('name, secret').in('name', names);
  const out: Record<string, string> = {};
  for (const r of data ?? []) out[r.name] = r.secret;
  return out;
}

function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// deno-lint-ignore no-explicit-any
export async function handleVerifyPin(deps: Deps, body: any) {
  const employeeName = String(body?.employeeName ?? '').trim();
  const pin = body?.pin == null ? '' : String(body.pin).trim();
  if (!employeeName || !pin) return res(400, { ok: false, error: 'employeeName and pin required' });

  // 1) attempt limiter. 'disabled' (migration not applied) = old behaviour. Once configured it FAILS CLOSED: a throttled caller sees
  //    exactly what a wrong PIN looks like (no oracle), and a limiter outage returns 503 rather than silently dropping protection.
  let lim: { allowed: boolean; reason?: string } = { allowed: false, reason: 'unavailable' };
  try { lim = await deps.limiter(employeeName); } catch { deps.log?.('limiter threw'); }
  if (!lim.allowed) {
    if (lim.reason === 'unavailable') { deps.log?.('rate limiter unavailable'); return res(503, { ok: false, error: 'server_error' }); }
    return res(200, { ok: false, error: 'wrong_pin' });
  }

  // 2) account + PIN
  const { data: profile, error } = await deps.admin.from('profiles')
    .select('id, employee_name, role_type, team, manager_scope, avatar_url, is_active, order_role, order_market, extra_permissions, denied_permissions, pin')
    .eq('employee_name', employeeName).limit(1).maybeSingle();
  if (error) return res(500, { ok: false, error: 'server_error' });
  if (!profile) return res(200, { ok: false, error: 'not_found' });
  if (profile.is_active === false) return res(200, { ok: false, error: 'inactive' });
  const stored = String(profile.pin ?? '').trim();
  if (!stored) return res(200, { ok: false, error: 'no_pin_set' });
  if (!safeEq(stored, pin)) return res(200, { ok: false, error: 'wrong_pin' });

  // 3) Auth identity: exists / created / repaired
  const secrets = await readSecrets(deps, ['auth_mode', 'auth_pw_pepper']);
  const derived = secrets.auth_mode === 'derived' && !!secrets.auth_pw_pepper;
  const password = derived ? await deps.hmacHex(secrets.auth_pw_pepper, 'authpw:v1', profile.id) : PIN_PASSWORD(pin);

  let authIdentity: 'exists' | 'created' | 'repaired' | 'failed' | 'banned' = 'failed';
  try {
    const { data: existing } = await deps.admin.auth.admin.getUserById(profile.id);
    if (existing?.user) {
      if (existing.user.banned_until && new Date(existing.user.banned_until).getTime() > Date.now()) {
        authIdentity = 'banned';
      } else {
        const { data: same } = await deps.admin.rpc('auth_password_matches', { p_user: profile.id, p_candidate: password });
        if (same === true) {
          authIdentity = 'exists';
        } else {
          const { error: upErr } = await deps.admin.auth.admin.updateUserById(profile.id, { password });
          authIdentity = upErr ? 'failed' : 'repaired';
          if (upErr) deps.log?.('auth repair failed');
        }
      }
    } else {
      const { error: createErr } = await deps.admin.auth.admin.createUser({
        id: profile.id,
        email: `${profile.id}@auth.lowes-pro.local`,
        password,
        email_confirm: true,
        user_metadata: { name: profile.employee_name, team: profile.team ?? null, role_type: profile.role_type ?? null },
      });
      authIdentity = createErr ? 'failed' : 'created';
      if (createErr) deps.log?.('auth provision failed');
    }
  } catch { deps.log?.('auth identity step threw'); }

  // 4) never return the PIN
  // deno-lint-ignore no-unused-vars
  const { pin: _omit, ...safeProfile } = profile;
  return res(200, { ok: true, profile: safeProfile, authIdentity, ...(derived ? { authPassword: password } : {}) });
}
