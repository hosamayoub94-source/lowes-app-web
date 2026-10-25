/* global process, Buffer */
// Every sensitive Edge Function must authenticate its caller BEFORE doing anything (audit F-07).
// Runs the REAL index.ts of each function (esbuild + fake Deno/supabase-js, no network) and checks the gate:
//   public key / no header / inactive user / unknown user  -> 401, and NOTHING downstream is touched
//   authenticated but not allowed (per policy)             -> 403
//   allowed user / service key / (cron secret where used)  -> passes the gate
// run: node test-function-guards.mjs
import fs from 'node:fs';
import { makeWorld, loadFunction, SERVICE, CRON } from './test-support/runEdgeFunction.mjs';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };

const PROFILES = [
  { id: 'u-admin', role_type: 'admin', is_active: true, order_role: null, extra_permissions: [], denied_permissions: [], employee_name: 'A' },
  { id: 'u-mgr', role_type: 'manager', is_active: true, order_role: null, extra_permissions: [], denied_permissions: [], employee_name: 'M' },
  { id: 'u-sales', role_type: 'sales_manager', is_active: true, order_role: null, extra_permissions: [], denied_permissions: [], employee_name: 'S' },
  { id: 'u-emp', role_type: 'employee', is_active: true, order_role: null, extra_permissions: [], denied_permissions: [], employee_name: 'E' },
  { id: 'u-ful', role_type: 'employee', is_active: true, order_role: 'fulfillment', extra_permissions: [], denied_permissions: [], employee_name: 'F' },
  { id: 'u-ord', role_type: 'employee', is_active: true, order_role: null, extra_permissions: ['manage_orders'], denied_permissions: [], employee_name: 'O' },
  { id: 'u-prod', role_type: 'employee', is_active: true, order_role: null, extra_permissions: ['manage_products'], denied_permissions: [], employee_name: 'P' },
  { id: 'u-mb', role_type: 'media_buyer', is_active: true, order_role: null, extra_permissions: [], denied_permissions: ['manage_orders'], employee_name: 'MB' },
  { id: 'u-gone', role_type: 'admin', is_active: false, order_role: null, extra_permissions: [], denied_permissions: [], employee_name: 'G' },
];
const TOKENS = { 'jwt-admin': 'u-admin', 'jwt-mgr': 'u-mgr', 'jwt-sales': 'u-sales', 'jwt-emp': 'u-emp', 'jwt-ful': 'u-ful', 'jwt-ord': 'u-ord', 'jwt-prod': 'u-prod', 'jwt-mb': 'u-mb', 'jwt-gone': 'u-gone', 'jwt-nobody': 'u-nobody' };

const OPERATOR = { allow: ['jwt-admin', 'jwt-mgr', 'jwt-sales', 'jwt-ful', 'jwt-ord'], deny: ['jwt-emp', 'jwt-mb', 'jwt-prod'] };
const ANY_USER = { allow: ['jwt-admin', 'jwt-mgr', 'jwt-sales', 'jwt-emp', 'jwt-ful', 'jwt-mb'], deny: [] };
const MANAGERS = { allow: ['jwt-admin', 'jwt-mgr'], deny: ['jwt-sales', 'jwt-emp', 'jwt-ful', 'jwt-mb'] };
const PRICES = { allow: ['jwt-admin', 'jwt-mgr', 'jwt-sales', 'jwt-prod'], deny: ['jwt-emp', 'jwt-ful', 'jwt-mb'] };

const FUNCS = {
  'create-yurtici-shipment': { ...OPERATOR, body: { orderId: 'o1' } },
  'create-babel-shipment': { ...OPERATOR, body: { orderId: 'o1' } },
  'import-yurtici-report': { ...OPERATOR, body: { updates: [] } },
  'import-yurtici-labels': { ...OPERATOR, body: { labels: [] } },
  'import-babel-shipments': { ...OPERATOR, body: { shipments: [] } },
  'track-yurtici': { ...ANY_USER, body: { manual: true } },
  'track-babel': { ...ANY_USER, body: { manual: true } },
  'track-ptt': { ...ANY_USER, body: { manual: true } },
  'track-karam': { ...ANY_USER, body: { manual: true } },
  'send-push': { ...ANY_USER, body: { userId: 'u-emp', title: 't' } },
  'social-content': { ...ANY_USER, body: { mode: 'caption', product: 'x' } },
  'generate-quiz': { ...ANY_USER, body: {} },
  // sync-prices keeps its legacy body check too; take a value it accepts from its own source so the test needs no literal
  'sync-prices': { ...PRICES, body: { token: (fs.readFileSync('supabase/functions/sync-prices/index.ts', 'utf8').match(/VALID_TOKENS = \[[\s\S]*?'([^'(]*-[^']*)'/) || [])[1] } },
  'lozy-kpi-coach': { ...MANAGERS, body: {} },
  'daily-analytics-snapshot': { ...MANAGERS, body: {} },
  'shift-report-reminder': { ...MANAGERS, body: {} },
  'retry-failed-syncs': { ...MANAGERS, body: {} },
  'sync-order-to-sheet': { ...ANY_USER, body: { orderId: 'o1' } },
};

const call = async (h, headers, body, method = 'POST') => {
  try { return await h(new Request('https://fake.local/fn', { method, headers: { 'Content-Type': 'application/json', ...headers }, body: method === 'POST' ? JSON.stringify(body) : undefined })); }
  catch (e) { return new Response(String(e), { status: 599 }); }
};
const gated = (r) => r.status === 401 || r.status === 403;

for (const [name, spec] of Object.entries(FUNCS)) {
  const world = makeWorld();
  world.users = TOKENS; world.profiles = PROFILES;
  const h = await loadFunction(name, world);
  const bearer = (t) => ({ Authorization: `Bearer ${t}` });
  const untouched = () => world.calls.fetch.length === 0 && world.calls.tables.length === 0;

  // preflight must keep working (browsers send it without credentials)
  const pre = await call(h, {}, null, 'OPTIONS');
  ok(pre.status === 200, `${name}: OPTIONS preflight ok`);

  for (const [label, headers] of [['no header', {}], ['public/anon key', bearer('sb_publishable_public')], ['unknown jwt', bearer('jwt-nobody')],
    ['inactive admin', bearer('jwt-gone')], ['garbage bearer', bearer('x')]]) {
    world.calls.fetch.length = 0; world.calls.tables.length = 0;
    const r = await call(h, headers, spec.body);
    ok(r.status === 401, `${name}: ${label} -> 401 (got ${r.status})`);
    ok(untouched(), `${name}: ${label} -> nothing downstream touched`);
  }
  for (const t of spec.deny) {
    world.calls.fetch.length = 0; world.calls.tables.length = 0;
    const r = await call(h, bearer(t), spec.body);
    ok(r.status === 403, `${name}: ${t} -> 403 (got ${r.status})`);
    ok(untouched(), `${name}: ${t} denied before any work`);
  }
  for (const t of spec.allow) {
    const r = await call(h, bearer(t), spec.body);
    ok(!gated(r), `${name}: ${t} passes the gate (got ${r.status})`);
  }
  ok(!gated(await call(h, bearer(SERVICE), spec.body)), `${name}: service key passes`);
  ok((await call(h, { 'x-cron-secret': CRON }, spec.body)).status === 401, `${name}: a cron-style header is not a credential`);
  // Vault copy of the service key (differs from env after rotation): a genuine service-role JWT passes; forged / anon JWTs do not
  const jwt = (role, sig) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.${sig}`;
  world.serviceJwt = jwt('service_role', 'REAL');
  ok(!gated(await call(h, bearer(world.serviceJwt), spec.body)), `${name}: genuine service-role JWT (vault copy) passes`);
  world.calls.fetch.length = 0; world.calls.tables.length = 0;
  const forged = await call(h, bearer(jwt('service_role', 'FORGED')), spec.body);
  ok(forged.status === 401 && untouched(), `${name}: forged service-role JWT rejected before any work (got ${forged.status})`);
  const anonJwt = await call(h, bearer(jwt('anon', 'REAL')), spec.body);
  ok(anonJwt.status === 401 && untouched(), `${name}: anon-role JWT rejected (got ${anonJwt.status})`);
  world.serviceJwt = null;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
