/* global process */
// Generates the REAL role × screen / permission matrix from the code (not from documentation):
//   - default permissions per role     (src/data/permissions.js)
//   - nav items visible per role       (src/data/navigation.js)
//   - route guard per path             (src/routes/AppRoutes.jsx, parsed)
// run: node scripts/security/role-matrix.mjs [--json]
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const out = path.join(root, `.tmp-role-matrix-${process.pid}.mjs`);
await build({
  stdin: {
    contents: `
      export * as nav from './src/data/navigation.js';
      export * as perms from './src/data/permissions.js';
      export * as teams from './src/data/teams.js';
      export * as paths from './src/routes/paths.js';`,
    resolveDir: root, loader: 'js',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
});
let m;
try { m = await import(pathToFileURL(out).href + `?t=${Date.now()}`); } finally { fs.unlinkSync(out); }
const { nav, perms, teams, paths } = m;
const R = teams.ROLES;
const ROLE_LIST = Object.values(R);

// ── constants declared at the top of AppRoutes.jsx (copied by evaluating the source lines) ──
const src = fs.readFileSync('src/routes/AppRoutes.jsx', 'utf8');
const consts = {};
consts.ALL_ROLES = Object.values(R);
for (const mm of src.matchAll(/^const (MANAGEMENT|FINANCE_ROLES|PAYROLL_ROLES|SALES_ROLES|MGMT_POSITIONS)\s*=\s*(\[[^;]*?\]);/gms)) {
  // eslint-disable-next-line no-new-func
  consts[mm[1]] = new Function('ROLES', 'ALL_ROLES', 'MANAGEMENT', 'SALES_ROLES', `return ${mm[2]};`)(R, consts.ALL_ROLES, consts.MANAGEMENT, consts.SALES_ROLES);
}
const evalExpr = (expr) => {
  // eslint-disable-next-line no-new-func
  return new Function('ROLES', 'P', ...Object.keys(consts), `return ${expr};`)(R, perms.PERMISSIONS, ...Object.values(consts));
};

// ── parse <Route ...> blocks ──
const routes = [];
const body = src.slice(src.indexOf('<Routes>'));
for (const chunk of body.split('<Route').slice(1)) {
  const pm = chunk.match(/path=(?:\{ROUTES\.([A-Z0-9_]+)\}|"([^"]+)")/);
  if (!pm) continue;
  const p = pm[1] ? paths.ROUTES[pm[1]] : pm[2];
  const head = chunk.slice(0, chunk.indexOf('/Route') > 0 ? Math.min(chunk.length, 700) : 700);
  const pr = head.match(/<ProtectedRoute([^>]*)>/);
  let roles = null; let perm = null; let blockMedia = false;
  if (pr) {
    const rm = pr[1].match(/roles=\{(.+?)\}(?=\s+(?:perm|blockMediaStaff)|\s*$)/s);
    if (rm) roles = evalExpr(rm[1]);
    const pm2 = pr[1].match(/perm=\{(.+?)\}/s);
    if (pm2) perm = evalExpr(pm2[1]);
    blockMedia = /blockMediaStaff/.test(pr[1]);
  }
  routes.push({ path: p, guarded: !!pr, roles, perm, blockMedia });
}

const defaultPerms = Object.fromEntries(ROLE_LIST.map((r) => [r, [...perms.resolvePermissions({ role: r })].sort()]));
const navByRole = Object.fromEntries(ROLE_LIST.map((r) => [r, nav.navItemsForRole(r, perms.resolvePermissions({ role: r })).map((i) => i.id)]));
// A route is reachable for a role when: unguarded, OR role listed, OR role's default perms contain `perm`.
const routeAccess = Object.fromEntries(ROLE_LIST.map((r) => {
  const ps = perms.resolvePermissions({ role: r });
  return [r, routes.filter((x) => !x.guarded || !x.roles || x.roles.includes(r) || (x.perm && ps.has(x.perm))).map((x) => x.path)];
}));

const result = { roles: ROLE_LIST, defaultPerms, navByRole, routes, routeAccess };
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 1));
} else {
  console.log('ROLES:', ROLE_LIST.join(', '));
  for (const r of ROLE_LIST) {
    console.log(`\n== ${r}\n  perms(${defaultPerms[r].length}): ${defaultPerms[r].join(', ') || '-'}\n  nav(${navByRole[r].length}): ${navByRole[r].join(', ')}`);
  }
  console.log('\nUNGUARDED routes (any signed-in user):', routes.filter((x) => !x.guarded).map((x) => x.path).join(' '));
}
