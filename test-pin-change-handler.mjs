/* global process */
// pin-change handler (recovered from production v6) + the new 'derived' auth_mode branch. Fakes only, no network.
// run: node test-pin-change-handler.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const out = path.join(process.cwd(), `.tmp-pc-${process.pid}.mjs`);
await build({ entryPoints: ['supabase/functions/pin-change/handler.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
let m; try { m = await import(pathToFileURL(out).href + `?t=${Date.now()}`); } finally { fs.unlinkSync(out); }
const { handlePinChange } = m;

let pass = 0; let fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL:', msg); } };

const U1 = '00000000-0000-4000-8000-000000000001'; const U2 = '00000000-0000-4000-8000-000000000002'; const ADM = '00000000-0000-4000-8000-0000000000aa'; const ADM2 = '00000000-0000-4000-8000-0000000000ab';

function world({ authMode = 'compat', authUsers = { [U1]: 'lp:1111' }, failAuthUpdate = false, raceOnProfile = false } = {}) {
  const w = { authCalls: [], audits: [], profiles: [
    { id: U1, employee_name: 'Ann', pin: '1111', is_active: true }, { id: U2, employee_name: 'Bob', pin: '2222', is_active: true },
    { id: ADM, employee_name: 'Adm', pin: '9999', is_active: true }, { id: ADM2, employee_name: 'Adm2', pin: '8888', is_active: true } ],
    pinAdmins: [ADM, ADM2], authUsers: { ...authUsers } };
  const admin = {
    from(table) {
      const st = { f: {}, upd: null, ins: null, isNull: null };
      const q = {
        select: () => q, limit: () => q,
        eq: (c, v) => { st.f[c] = v; return q; },
        is: (c) => { st.isNull = c; return q; },
        insert: (o) => { st.ins = o; if (table === 'network_audit') w.audits.push(o); return Promise.resolve({ error: null }); },
        update: (o) => { st.upd = o; return q; },
        maybeSingle: async () => {
          if (table === 'internal_secrets') return { data: { secret: authMode }, error: null };
          if (table === 'pin_admins') return { data: w.pinAdmins.includes(st.f.profile_id) ? { profile_id: st.f.profile_id } : null, error: null };
          if (table === 'profiles') { const r = w.profiles.find((p) => Object.entries(st.f).every(([c, v]) => p[c] === v)); return { data: r ?? null, error: null }; }
          return { data: null, error: null };
        },
        then: (res, rej) => {
          if (table === 'profiles' && st.upd) {
            if (raceOnProfile) return Promise.resolve({ data: [], error: null }).then(res, rej);
            const rows = w.profiles.filter((p) => Object.entries(st.f).every(([c, v]) => p[c] === v) && (st.isNull ? p[st.isNull] == null : true));
            rows.forEach((r) => Object.assign(r, st.upd));
            return Promise.resolve({ data: rows.map((r) => ({ id: r.id })), error: null }).then(res, rej);
          }
          return Promise.resolve({ data: [], error: null }).then(res, rej);
        },
      };
      return q;
    },
    auth: {
      getUser: async (t) => (t === 'adm-jwt' ? { data: { user: { id: ADM } } } : { data: { user: null } }),
      admin: {
        getUserById: async (id) => (w.authUsers[id] ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { status: 404, code: 'user_not_found' } }),
        updateUserById: async (id, o) => { w.authCalls.push([id, o.password]); if (failAuthUpdate) return { error: { message: 'x' } }; w.authUsers[id] = o.password; return { error: null }; },
      },
    },
  };
  w.admin = admin; return w;
}
const self = (w, over = {}) => handlePinChange(w.admin, { mode: 'self', employee_name: 'Ann', current_pin: '1111', new_pin: '2468', ...over }, null);
const adminMode = (w, over = {}) => handlePinChange(w.admin, { mode: 'admin', target_id: U1, new_pin: '2468', ...over }, 'Bearer adm-jwt');

// ── validation and identity ──
{
  const w = world();
  ok((await self(w, { new_pin: '12' })).status === 400, 'pin too short');
  ok((await self(w, { new_pin: 'abcd' })).status === 400, 'pin must be digits');
  ok((await self(w, { new_pin: '1234567' })).status === 400, 'pin too long');
  ok((await handlePinChange(w.admin, { mode: 'x', new_pin: '1234' }, null)).status === 400, 'unknown mode');
  ok((await self(w, { current_pin: '0000' })).body.error === 'wrong_pin', 'wrong current pin');
  ok((await self(w, { employee_name: 'Nobody' })).body.error === 'wrong_pin', 'unknown user looks identical to a wrong pin');
  ok(w.authCalls.length === 0 && w.profiles[0].pin === '1111', 'no change on any rejected request');
  ok((await handlePinChange(w.admin, { mode: 'admin', target_id: U1, new_pin: '2468' }, null)).status === 401, 'admin mode without a session -> 401');
  ok((await handlePinChange(w.admin, { mode: 'admin', target_id: U1, new_pin: '2468' }, 'Bearer anon-public-key')).status === 401, 'admin mode with the public key -> 401');
  ok((await adminMode(w, { target_id: ADM2 })).body.error === 'protected_target', 'cannot change another pin_admin');
  ok((await adminMode(w, { target_id: ADM })).body.error === 'use_self_mode', 'admin changes their own pin through self mode');
  ok((await adminMode(w, { target_id: 'not-a-uuid' })).status === 400, 'bad target id');
}
// ── compat mode: Auth first, then profile, with compensation ──
{
  const w = world();
  const r = await self(w);
  ok(r.status === 200 && r.body.auth_synced === true, 'compat: self change ok + synced');
  ok(w.authUsers[U1] === 'lp:2468' && w.profiles[0].pin === '2468', 'compat: both sides updated');
  ok(!JSON.stringify(r.body).includes('2468') && !JSON.stringify(w.audits).includes('2468'), 'pin never in the response or audit');
}
{
  const w = world({ failAuthUpdate: true });
  const r = await self(w);
  ok(r.status === 502 && w.profiles[0].pin === '1111', 'compat: Auth failure aborts before the profile changes');
}
{
  const w = world({ raceOnProfile: true });
  const r = await self(w);
  ok(r.status === 409 && w.authUsers[U1] === 'lp:1111', 'compat: concurrent change -> Auth password restored to the current pin');
}
{
  const w = world({ authUsers: {} });
  const r = await adminMode(w);
  ok(r.status === 200 && r.body.auth_synced === false && w.profiles[0].pin === '2468' && w.authCalls.length === 0, 'compat: no Auth identity -> profile only, nothing created');
}
// ── derived mode ──
{
  const w = world({ authMode: 'derived', authUsers: { [U1]: 'derived-secret-value' } });
  const r = await self(w);
  ok(r.status === 200 && r.body.auth_synced === false, 'derived: success without touching Auth');
  ok(w.authCalls.length === 0 && w.authUsers[U1] === 'derived-secret-value', 'derived: Auth password untouched (cannot desync)');
  ok(w.profiles[0].pin === '2468', 'derived: profile pin updated');
  ok(w.audits.some((a) => a.action === 'pin_change' && a.details.auth_mode === 'derived'), 'derived: audited');
  const w2 = world({ authMode: 'derived', raceOnProfile: true });
  ok((await self(w2)).status === 409, 'derived: concurrent change refused');
  const w3 = world({ authMode: 'derived' });
  ok((await self(w3, { new_pin: '1111' })).body.unchanged === true, 'same pin -> unchanged');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
