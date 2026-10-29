/* global process */
// login-directory (supabase/functions/login-directory/handler.ts) -- login screen name list without a session.
// Guards the security contract: active staff only, picker fields only, NEVER the profile id (Auth e-mail = <id>@domain).
// run: node test-login-directory.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const out = path.join(process.cwd(), `.tmp-ld-${process.pid}.mjs`);
await build({ entryPoints: ['supabase/functions/login-directory/handler.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
let m; try { m = await import(pathToFileURL(out).href + `?t=${Date.now()}`); } finally { fs.unlinkSync(out); }
const { handleLoginDirectory, pickRoleTypes, LOGIN_ROLE_TYPES } = m;

let pass = 0; let fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL:', msg); } };

const ROWS = [
  { id: 'u1', employee_name: 'Ann',  role_type: 'employee',   avatar_url: 'a.png', is_active: true,  pin: '1234', extra_permissions: ['x'] },
  { id: 'u2', employee_name: 'Bob',  role_type: 'manager',    avatar_url: null,    is_active: true,  pin: '5678' },
  { id: 'u3', employee_name: 'Gone', role_type: 'employee',   avatar_url: null,    is_active: false, pin: '1111' },
  { id: 'u4', employee_name: 'Hr',   role_type: 'hr_manager', avatar_url: null,    is_active: true,  pin: '2222' },
  { id: 'u5', employee_name: '',     role_type: 'employee',   avatar_url: null,    is_active: true,  pin: '3333' },
];

function fakeAdmin({ rows = ROWS, error = null } = {}) {
  const seen = { selects: [], table: null };
  const admin = {
    from(table) {
      seen.table = table;
      const f = { eq: {}, in: null };
      const q = {
        select(cols) { seen.selects.push(cols); return q; },
        eq(c, v) { f.eq[c] = v; return q; },
        in(c, v) { f.in = [c, v]; return q; },
        order() {
          if (error) return Promise.resolve({ data: null, error });
          const cols = seen.selects.at(-1).split(',').map((s) => s.trim());
          const data = rows
            .filter((r) => Object.entries(f.eq).every(([c, v]) => r[c] === v))
            .filter((r) => !f.in || f.in[1].includes(r[f.in[0]]))
            .map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
          return Promise.resolve({ data, error: null });
        },
      };
      return q;
    },
  };
  return { admin, seen };
}

// 1. default (no roleTypes) → every login role, active only, sorted call made on profiles
{
  const { admin, seen } = fakeAdmin();
  const r = await handleLoginDirectory({ admin }, {});
  ok(r.status === 200 && r.body.ok === true, 'default call succeeds');
  const names = r.body.profiles.map((p) => p.employee_name);
  ok(names.includes('Ann') && names.includes('Bob') && names.includes('Hr'), 'active staff listed');
  ok(!names.includes('Gone'), 'inactive profile hidden');
  ok(!names.includes(''), 'blank name dropped');
  ok(seen.table === 'profiles', 'reads profiles');
}

// 2. security contract: only picker fields; never id / pin / permissions
{
  const { admin, seen } = fakeAdmin();
  const r = await handleLoginDirectory({ admin }, { roleTypes: ['employee'] });
  ok(!/\bid\b|pin|permission|avatar/.test(seen.selects.join(',')), 'query never selects id/pin/permissions/avatar');
  for (const p of r.body.profiles) {
    ok(JSON.stringify(Object.keys(p).sort()) === JSON.stringify(['employee_name', 'role_type']), `only picker fields for ${p.employee_name}`);
    ok(!('id' in p) && !('pin' in p) && !('avatar_url' in p), `no id/pin/avatar (avatar files are named by id) for ${p.employee_name}`);
  }
  ok(r.body.profiles.length === 1 && r.body.profiles[0].employee_name === 'Ann', 'role filter applied');
}

// 3. role list sanitising: unknown / non-string values ignored, all-unknown → empty list without querying
ok(JSON.stringify(pickRoleTypes(['employee', "x');drop", 7, 'employee'])) === '["employee"]', 'unknown roles dropped, deduped');
ok(pickRoleTypes(null).length === LOGIN_ROLE_TYPES.length, 'missing roleTypes = all login roles');
{
  const { admin, seen } = fakeAdmin();
  const r = await handleLoginDirectory({ admin }, { roleTypes: ['superuser'] });
  ok(r.status === 200 && r.body.profiles.length === 0 && seen.table === null, 'only-unknown roles → empty, no query');
}

// 4. DB error → generic 500, no raw text
{
  const logs = [];
  const { admin } = fakeAdmin({ error: { code: '42501', message: 'permission denied for table profiles' } });
  const r = await handleLoginDirectory({ admin, log: (m) => logs.push(m) }, {});
  ok(r.status === 500 && r.body.error === 'server_error' && !JSON.stringify(r.body).includes('permission'), 'db error hidden from caller');
  ok(logs.length === 1 && logs[0].includes('42501'), 'db error code logged');
}

// 5. the login screen uses the function, not the anon profiles read
{
  const login = fs.readFileSync('src/screens/LoginScreen.jsx', 'utf8');
  ok(/listLoginProfiles\(/.test(login) && !/listActiveProfiles\(/.test(login), 'LoginScreen uses listLoginProfiles');
  ok(!/key=\{p\.id\}/.test(login), 'LoginScreen does not depend on profile id');
  const svc = fs.readFileSync('src/services/authService.js', 'utf8');
  ok(/functions\.invoke\('login-directory'/.test(svc), 'authService calls login-directory');
}

console.log(`login-directory: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
