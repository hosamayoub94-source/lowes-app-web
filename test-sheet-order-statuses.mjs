/* global process */
// sheet-order-statuses (supabase/functions/sheet-order-statuses/handler.ts) -- read-only status list for the Apps Script guard.
// run: node test-sheet-order-statuses.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const out = path.join(process.cwd(), `.tmp-sos-${process.pid}.mjs`);
await build({ entryPoints: ['supabase/functions/sheet-order-statuses/handler.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
let m; try { m = await import(pathToFileURL(out).href + `?t=${Date.now()}`); } finally { fs.unlinkSync(out); }
const { handleOrderStatuses } = m;

let pass = 0; let fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL:', msg); } };

const GOOD = 'good-token-123';
const tokenOk = (t) => t === GOOD;

function mkOrders(n, market = 'turkey') {
  return Array.from({ length: n }, (_, i) => ({
    order_id: `T${String(i).padStart(5, '0')}`, status: i % 7 === 0 ? 'returning' : 'shipped', market,
    deleted_at: null, archived: i % 11 === 0 ? true : (i % 5 === 0 ? false : null),
    customer_name: 'SECRET NAME', phone_1: '0500000000', amount: 99,
  }));
}

function fakeAdmin(rows, { error = null } = {}) {
  const seen = { selects: [], eq: {}, calls: 0 };
  const admin = {
    from(table) {
      seen.table = table;
      const f = { eq: {}, isNull: [], orArchived: false, range: null };
      const q = {
        select(c) { seen.selects.push(c); return q; },
        eq(c, v) { f.eq[c] = v; seen.eq[c] = v; return q; },
        is(c, v) { f.isNull.push([c, v]); return q; },
        or(expr) { f.orArchived = expr === 'archived.is.null,archived.eq.false'; return q; },
        order() { return q; },
        range(a, b) {
          seen.calls++;
          if (error) return Promise.resolve({ data: null, error });
          const cols = seen.selects.at(-1).split(',').map((s) => s.trim());
          const data = rows
            .filter((r) => Object.entries(f.eq).every(([c, v]) => r[c] === v))
            .filter((r) => f.isNull.every(([c]) => r[c] == null))
            .filter((r) => !f.orArchived || r.archived == null || r.archived === false)
            .slice(a, b + 1)
            .map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
          return Promise.resolve({ data, error: null });
        },
      };
      return q;
    },
  };
  return { admin, seen };
}

// 1. token gate: missing / wrong token never reaches the database
for (const bad of [undefined, null, '', 'nope', 123]) {
  const { admin, seen } = fakeAdmin(mkOrders(3));
  const r = await handleOrderStatuses({ admin, tokenOk }, { token: bad });
  ok(r.status === 403 && r.body.error === 'invalid token', `bad token ${JSON.stringify(bad)} → 403`);
  ok(seen.calls === 0, `bad token ${JSON.stringify(bad)} makes no query`);
}
{
  const r = await handleOrderStatuses({ admin: fakeAdmin([]).admin, tokenOk }, null);
  ok(r.status === 400, 'null body → 400');
}

// 2. happy path: turkey by default, open orders only, ONLY order_id + status
{
  const rows = [...mkOrders(40), { order_id: 'GONE1', status: 'shipped', market: 'turkey', deleted_at: '2026-10-01', archived: null },
    { order_id: 'SY1', status: 'shipped', market: 'syria', deleted_at: null, archived: null }];
  const { admin, seen } = fakeAdmin(rows);
  const r = await handleOrderStatuses({ admin, tokenOk }, { token: GOOD });
  ok(r.status === 200 && r.body.ok && r.body.market === 'turkey', 'default market turkey');
  ok(seen.table === 'orders' && seen.eq.market === 'turkey', 'queries orders for turkey');
  const ids = r.body.rows.map((x) => x.order_id);
  ok(!ids.includes('GONE1'), 'soft-deleted order excluded');
  ok(!ids.includes('SY1'), 'other market excluded');
  const expected = mkOrders(40).filter((o) => o.archived !== true).length;
  ok(r.body.count === expected && ids.length === expected, `archived=true excluded, null/false kept (${expected})`);
  for (const x of r.body.rows) ok(JSON.stringify(Object.keys(x).sort()) === '["order_id","status"]', `only order_id+status for ${x.order_id}`);
  ok(!/SECRET NAME|0500000000|amount|phone/.test(JSON.stringify(r.body)), 'no customer data leaks');
  ok(!/\b(customer|phone|amount|address)/.test(seen.selects.join(',')), 'query never selects personal columns');
  ok(r.body.rows.find((x) => x.order_id === 'T00007').status === 'returning', 'terminal-like status passed through for the guard');
}

// 3. pagination: > 1000 rows are all returned (PostgREST caps one request at 1000)
{
  const { admin, seen } = fakeAdmin(mkOrders(2300).map((o) => ({ ...o, archived: null })));
  const r = await handleOrderStatuses({ admin, tokenOk }, { token: GOOD, market: 'turkey' });
  ok(r.status === 200 && r.body.count === 2300, 'all 2300 rows returned across pages');
  ok(seen.calls === 3, `3 pages fetched (got ${seen.calls})`);
}
{ // exactly one full page → must still ask for the next page and stop on the empty one
  const { admin, seen } = fakeAdmin(mkOrders(1000).map((o) => ({ ...o, archived: null })));
  const r = await handleOrderStatuses({ admin, tokenOk }, { token: GOOD });
  ok(r.body.count === 1000 && seen.calls === 2, 'exact page boundary handled');
}

// 4. never a truncated guard list: ceiling → server_error, not partial data
{
  const { admin } = fakeAdmin(mkOrders(10500).map((o) => ({ ...o, archived: null })));
  const logs = [];
  const r = await handleOrderStatuses({ admin, tokenOk, log: (x) => logs.push(x) }, { token: GOOD });
  ok(r.status === 500 && r.body.error === 'server_error' && !('rows' in r.body), 'over ceiling → 500, no partial rows');
  ok(logs.length === 1, 'ceiling logged');
}

// 5. market validation + other markets work
{
  const r = await handleOrderStatuses({ admin: fakeAdmin([]).admin, tokenOk }, { token: GOOD, market: "turkey' or 1=1" });
  ok(r.status === 400 && r.body.error === 'invalid market', 'unknown market rejected');
  const s = await handleOrderStatuses({ admin: fakeAdmin(mkOrders(3, 'syria').map((o) => ({ ...o, archived: null }))).admin, tokenOk }, { token: GOOD, market: 'syria' });
  ok(s.status === 200 && s.body.count === 3 && s.body.market === 'syria', 'syria works');
}

// 6. db error → generic 500, code logged, no raw text
{
  const logs = [];
  const { admin } = fakeAdmin([], { error: { code: '42501', message: 'permission denied for table orders' } });
  const r = await handleOrderStatuses({ admin, tokenOk, log: (x) => logs.push(x) }, { token: GOOD });
  ok(r.status === 500 && r.body.error === 'server_error' && !JSON.stringify(r.body).includes('permission'), 'db error hidden');
  ok(logs.length === 1 && logs[0].includes('42501'), 'db error code logged');
}

// 7. config + script wiring
{
  const cfg = fs.readFileSync('supabase/config.toml', 'utf8');
  ok(/\[functions\.sheet-order-statuses\]\s*\r?\nverify_jwt = false/.test(cfg), 'config.toml pins verify_jwt=false (sheet-order-statuses)');
  ok(/\[functions\.login-directory\]\s*\r?\nverify_jwt = false/.test(cfg), 'config.toml pins verify_jwt=false (login-directory)');
  const gs = fs.readFileSync('google-apps-script/yurtici-public-tracker.gs', 'utf8');
  ok(/sheet-order-statuses/.test(gs), 'script calls sheet-order-statuses');
  ok(!/rest\/v1\/orders/.test(gs), 'script no longer reads orders through the public REST endpoint');
}

console.log(`sheet-order-statuses: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
