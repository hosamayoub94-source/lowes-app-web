/* global process */
// verify-pin login gateway logic (supabase/functions/verify-pin/handler.ts) -- every branch, with fakes (no network, no real DB).
// run: node test-verify-pin-handler.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const out = path.join(process.cwd(), `.tmp-vp-${process.pid}.mjs`);
await build({ entryPoints: ['supabase/functions/verify-pin/handler.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
let m; try { m = await import(pathToFileURL(out).href + `?t=${Date.now()}`); } finally { fs.unlinkSync(out); }
const { handleVerifyPin, PIN_PASSWORD } = m;

let pass = 0; let fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL:', msg); } };

const hmacHex = async (pepper, scope, value) => `h(${pepper}|${scope}|${value})`.padEnd(64, '0');

function world({ mode = 'compat', profiles, auth = {}, limiter } = {}) {
  const w = { calls: [], profileLookups: 0, auth: { ...auth }, secrets: { auth_mode: mode, auth_pw_pepper: 'pepper-for-tests' }, log: [] };
  w.profiles = profiles ?? [
    { id: 'u1', employee_name: 'Ann', role_type: 'employee', team: 'ميديا', is_active: true, pin: '1234', extra_permissions: [], denied_permissions: [] },
    { id: 'u2', employee_name: 'Bob', role_type: 'manager', team: null, is_active: true, pin: '5678', extra_permissions: [], denied_permissions: [] },
    { id: 'u3', employee_name: 'Gone', role_type: 'employee', team: null, is_active: false, pin: '1111', extra_permissions: [], denied_permissions: [] },
    { id: 'u4', employee_name: 'NoPin', role_type: 'employee', team: null, is_active: true, pin: null, extra_permissions: [], denied_permissions: [] },
  ];
  const admin = {
    from(table) {
      const st = { table, filters: {}, inList: null };
      const q = {
        select: () => q,
        eq: (c, v) => { st.filters[c] = v; return q; },
        in: (c, v) => { st.inList = [c, v]; return q; },
        limit: () => q,
        maybeSingle: async () => { if (table === 'profiles') w.profileLookups++; const rows = table === 'profiles' ? w.profiles.filter((p) => Object.entries(st.filters).every(([c, v]) => p[c] === v)) : []; return { data: rows[0] ?? null, error: null }; },
        then: (res, rej) => Promise.resolve(table === 'internal_secrets'
          ? { data: Object.entries(w.secrets).filter(([k]) => st.inList[1].includes(k)).map(([name, secret]) => ({ name, secret })), error: null }
          : { data: [], error: null }).then(res, rej),
      };
      return q;
    },
    rpc: async (fn, args) => { w.calls.push(['rpc', fn]); if (fn === 'auth_password_matches') return { data: w.auth[args.p_user]?.password === args.p_candidate, error: null }; return { data: null, error: null }; },
    auth: { admin: {
      getUserById: async (id) => ({ data: { user: w.auth[id] ? { id, banned_until: w.auth[id].banned_until ?? null } : null } }),
      createUser: async (o) => { w.calls.push(['create', o.id, o.email, o.password]); if (w.failCreate) return { error: { message: 'x' } }; w.auth[o.id] = { password: o.password }; return { error: null }; },
      updateUserById: async (id, o) => { w.calls.push(['update', id, o.password]); if (w.failUpdate) return { error: { message: 'x' } }; w.auth[id].password = o.password; return { error: null }; },
    } },
  };
  w.deps = { admin, hmacHex, log: (s) => w.log.push(s), limiter: limiter ?? (async () => ({ allowed: true, reason: 'allowed' })) };
  return w;
}
const run = (w, body) => handleVerifyPin(w.deps, body);

// ── input + limiter ──
{
  const w = world();
  ok((await run(w, {})).status === 400, 'missing fields -> 400');
  ok((await run(w, { employeeName: 'Ann' })).status === 400, 'missing pin -> 400');
  ok(w.profileLookups === 0, 'no DB lookup for malformed input');
}
{
  const w = world({ limiter: async () => ({ allowed: false, reason: 'limited' }) });
  const r = await run(w, { employeeName: 'Ann', pin: '1234' });
  ok(r.status === 200 && r.body.error === 'wrong_pin' && r.body.ok === false, 'throttled caller sees a plain wrong_pin (even with the CORRECT pin) - no oracle');
  ok(w.profileLookups === 0 && w.calls.length === 0, 'throttled: no profile lookup, no auth work');
}
{
  for (const lim of [async () => ({ allowed: false, reason: 'unavailable' }), async () => { throw new Error('boom'); }]) {
    const w = world({ limiter: lim });
    const r = await run(w, { employeeName: 'Ann', pin: '1234' });
    ok(r.status === 503 && r.body.error === 'server_error', 'limiter outage (configured) -> 503, fail closed');
    ok(w.profileLookups === 0, 'limiter outage: nothing proceeds');
  }
  const w = world({ limiter: async () => ({ allowed: true, reason: 'disabled' }) });
  ok((await run(w, { employeeName: 'Ann', pin: '1234' })).body.ok === true, 'limiter disabled (migration not applied) -> login works as before');
}

// ── credential outcomes (contract with authService.js) ──
{
  const w = world();
  ok((await run(w, { employeeName: 'Nobody', pin: '1' })).body.error === 'not_found', 'unknown name -> not_found');
  ok((await run(w, { employeeName: 'Gone', pin: '1111' })).body.error === 'inactive', 'inactive account refused even with the right pin');
  ok((await run(w, { employeeName: 'NoPin', pin: '0' })).body.error === 'no_pin_set', 'no pin set');
  ok((await run(w, { employeeName: 'Ann', pin: '9999' })).body.error === 'wrong_pin', 'wrong pin');
  ok((await run(w, { employeeName: 'Ann', pin: '1235' })).body.error === 'wrong_pin', 'same-length near miss is wrong');
  ok((await run(w, { employeeName: 'Ann', pin: '5678' })).body.error === 'wrong_pin', "another user's pin does not open this account");
  ok(w.calls.length === 0, 'no auth side effects on any failed attempt');
}

// ── compat mode: password = lp:<pin> ──
{
  const w = world({ auth: { u1: { password: 'lp:1234' } } });
  const r = await run(w, { employeeName: 'Ann', pin: '1234' });
  ok(r.status === 200 && r.body.ok && r.body.authIdentity === 'exists', 'consistent identity -> exists');
  ok(!('authPassword' in r.body), 'compat mode never hands out a password');
  ok(!w.calls.some((c) => c[0] === 'update' || c[0] === 'create'), 'consistent identity: no writes');
  ok(!JSON.stringify(r.body).includes('1234') && !('pin' in r.body.profile), 'the PIN is never in the response');
  ok(r.body.profile.employee_name === 'Ann' && r.body.profile.role_type === 'employee', 'profile returned');
}
{
  const w = world({ auth: { u1: { password: 'lp:0000' } } }); // drifted
  const r = await run(w, { employeeName: 'Ann', pin: '1234' });
  ok(r.body.authIdentity === 'repaired', 'drifted password is repaired');
  ok(w.calls.some((c) => c[0] === 'update' && c[1] === 'u1' && c[2] === PIN_PASSWORD('1234')), 'repair sets lp:<pin>');
  ok((await run(w, { employeeName: 'Ann', pin: '1234' })).body.authIdentity === 'exists', 'second login: nothing left to repair');
}
{
  const w = world({ auth: {} });
  const r = await run(w, { employeeName: 'Ann', pin: '1234' });
  ok(r.body.authIdentity === 'created', 'missing identity is created');
  const c = w.calls.find((x) => x[0] === 'create');
  ok(c[1] === 'u1' && c[2] === 'u1@auth.lowes-pro.local' && c[3] === 'lp:1234', 'created with the profile id, the synthetic email and lp:<pin>');
}
{
  const w = world({ auth: { u1: { password: 'lp:1234', banned_until: '2999-01-01T00:00:00Z' } } });
  const r = await run(w, { employeeName: 'Ann', pin: '1234' });
  ok(r.body.authIdentity === 'banned' && !w.calls.some((c) => c[0] === 'update'), 'banned identity is reported and never "repaired"');
  const w2 = world({ auth: { u1: { password: 'lp:1234', banned_until: '2001-01-01T00:00:00Z' } } });
  ok((await run(w2, { employeeName: 'Ann', pin: '1234' })).body.authIdentity === 'exists', 'an expired ban counts as active');
}
{
  const w = world({ auth: { u1: { password: 'lp:0000' } } }); w.failUpdate = true;
  const r = await run(w, { employeeName: 'Ann', pin: '1234' });
  ok(r.status === 200 && r.body.ok === true && r.body.authIdentity === 'failed', 'a failed repair is reported but does not break the PIN check');
  const w2 = world({ auth: {} }); w2.failCreate = true;
  ok((await run(w2, { employeeName: 'Ann', pin: '1234' })).body.authIdentity === 'failed', 'a failed create is reported');
}

// ── derived mode: Auth password independent of the PIN ──
{
  const w = world({ mode: 'derived', auth: { u1: { password: 'lp:1234' }, u2: { password: 'lp:5678' } } });
  const a = await run(w, { employeeName: 'Ann', pin: '1234' });
  ok(a.body.authIdentity === 'repaired' && typeof a.body.authPassword === 'string' && a.body.authPassword.length >= 32, 'derived: first login migrates the password and returns the new one');
  ok(!a.body.authPassword.includes('1234') && a.body.authPassword !== PIN_PASSWORD('1234'), 'derived password has nothing to do with the PIN');
  ok(w.auth.u1.password === a.body.authPassword, 'derived password is what Auth now holds');
  const a2 = await run(w, { employeeName: 'Ann', pin: '1234' });
  ok(a2.body.authIdentity === 'exists' && a2.body.authPassword === a.body.authPassword, 'derived: stable across logins, no rewrite');
  const b = await run(w, { employeeName: 'Bob', pin: '5678' });
  ok(b.body.authPassword !== a.body.authPassword, 'derived: different per user');
  ok(w.auth.u1.password !== 'lp:1234', 'the PIN-derived password no longer opens the public Auth endpoint');
  ok(!JSON.stringify(a.body).includes('"pin"'), 'derived: still no PIN in the response');
  // a PIN change does not require touching Auth at all: login with the new PIN keeps the same derived password
  w.profiles[0].pin = '4321';
  const a3 = await run(w, { employeeName: 'Ann', pin: '4321' });
  ok(a3.body.authIdentity === 'exists' && a3.body.authPassword === a.body.authPassword, 'derived: PIN change cannot desync Auth');
  ok((await run(w, { employeeName: 'Ann', pin: '1234' })).body.error === 'wrong_pin', 'old PIN rejected after change');
}
{
  const w = world({ mode: 'derived', auth: {} }); w.secrets.auth_pw_pepper = '';
  const r = await run(w, { employeeName: 'Ann', pin: '1234' });
  ok(!('authPassword' in r.body) && r.body.authIdentity === 'created' && w.calls.find((c) => c[0] === 'create')[3] === 'lp:1234', 'derived mode without a pepper degrades to compat instead of creating a weak/empty password');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
