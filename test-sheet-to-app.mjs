// D-157 — sheet-to-app security/behaviour tests. Bundles the real Edge Function with
// esbuild, swaps the remote supabase-js import for a fake client and a fake Deno
// runtime. No network, no database, no real order.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const FAKE_CLIENT = `
export const calls = [];
export const state = { orders: [] };
class Q {
  constructor(t) { this.t = t; this.f = []; this.op = 'select'; }
  select() { return this; } eq(c, v) { this.f.push([c, v]); return this; }
  is() { return this; } or() { return this; } not() { return this; } in() { return this; }
  update(p) { this.op = 'update'; this.p = p; return this; }
  insert(p) { this.op = 'insert'; this.p = p; return this; }
  _row() { return this.t === 'orders' ? (state.orders.find(o => this.f.every(([c, v]) => o[c] === v)) ?? null) : null; }
  maybeSingle() { calls.push({ t: this.t, op: this.op }); return Promise.resolve({ data: this._row(), error: null }); }
  then(res, rej) { calls.push({ t: this.t, op: this.op, p: this.p }); return Promise.resolve({ data: [], error: null }).then(res, rej); }
}
export const createClient = () => ({
  from: (t) => new Q(t),
  rpc: (fn, a) => { calls.push({ rpc: fn, a }); return Promise.resolve({ data: { ok: true }, error: null }); },
});
`;

async function load(env) {
  let handler;
  globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
  globalThis.fetch = async () => new Response('{}');
  const out = await build({
    entryPoints: [path.join(here, 'supabase/functions/sheet-to-app/index.ts')],
    bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'error',
    plugins: [{
      name: 'fake-supabase',
      setup(b) {
        b.onResolve({ filter: /^https:\/\/esm\.sh\// }, () => ({ path: 'fake-supabase', namespace: 'fake' }));
        b.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ contents: FAKE_CLIENT, loader: 'js' }));
      },
    }],
  });
  const code = out.outputFiles[0].text;
  const mod = await import('data:text/javascript;base64,' + Buffer.from(code + '\nexport const __fake = { calls, state };\n// ' + Math.random()).toString('base64'));
  return { handler, fake: mod.__fake };
}
const post = (h, body) => h(new Request('http://x/', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));

let passed = 0;
const t = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok  ', name); }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); process.exitCode = 1; }
};

const ENV = { SUPABASE_URL: 'http://localhost', SB_SECRET_KEY: 'test-service-key', SHEET_SYNC_TOKEN: 'dummy-syria-token', TURKEY_SHEET_SYNC_TOKEN: 'dummy-turkey-token', UAE_SHEET_SYNC_TOKEN: 'dummy-uae-token' };

await t('invalid token → 403 and nothing is read or written', async () => {
  const { handler, fake } = await load(ENV);
  const r = await post(handler, { token: 'wrong', action: 'update', order_id: 'X1', status: 'shipped' });
  assert.equal(r.status, 403); assert.equal(fake.calls.length, 0);
});

await t('missing token, empty token and non-string token → 403', async () => {
  const { handler } = await load(ENV);
  for (const token of [undefined, '', 12345, null, {}]) {
    assert.equal((await post(handler, { token, action: 'update', order_id: 'X1' })).status, 403);
  }
});

await t('the old plaintext literals are no longer accepted', async () => {
  const { handler } = await load(ENV);
  for (const token of ['LOWES' + '-TURKEY-2026', 'LOWES' + '-SYRIA-2026']) {
    assert.equal((await post(handler, { token, action: 'update', order_id: 'X1' })).status, 403);
  }
});

await t('each sheet token (syria / turkey / uae) is accepted', async () => {
  const { handler } = await load(ENV);
  for (const token of [ENV.SHEET_SYNC_TOKEN, ENV.TURKEY_SHEET_SYNC_TOKEN, ENV.UAE_SHEET_SYNC_TOKEN]) {
    const r = await post(handler, { token, action: 'update', order_id: 'NOPE' });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).skipped, 'not_found_no_data');
  }
});

await t('token prefixes / near misses are rejected', async () => {
  const { handler } = await load(ENV);
  for (const token of [ENV.SHEET_SYNC_TOKEN.slice(0, -1), ENV.SHEET_SYNC_TOKEN + 'x', ENV.SHEET_SYNC_TOKEN.toUpperCase()]) {
    assert.equal((await post(handler, { token, action: 'update', order_id: 'X1' })).status, 403);
  }
});

await t('fails closed when the key or every token is missing', async () => {
  for (const env of [{ ...ENV, SB_SECRET_KEY: undefined }, { SUPABASE_URL: 'http://localhost', SB_SECRET_KEY: 'k' }]) {
    const { handler } = await load(env);
    const r = await post(handler, { token: 'anything', action: 'update', order_id: 'X1' });
    assert.equal(r.status, 500);
  }
});

await t('bad JSON → 400, unknown action → 400', async () => {
  const { handler } = await load(ENV);
  assert.equal((await post(handler, '{not json')).status, 400);
  assert.equal((await post(handler, { token: ENV.SHEET_SYNC_TOKEN, action: 'drop_everything' })).status, 400);
});

await t('valid payload for an unknown order changes nothing', async () => {
  const { handler, fake } = await load(ENV);
  const r = await post(handler, { token: ENV.TURKEY_SHEET_SYNC_TOKEN, action: 'update', order_id: 'NOPE', status: 'تم الشحن' });
  assert.equal(r.status, 200);
  assert.ok(fake.calls.every(c => c.op !== 'update' && c.op !== 'insert' && !c.rpc), JSON.stringify(fake.calls));
});

await t('reconcile_present with an empty list deletes nothing', async () => {
  const { handler, fake } = await load(ENV);
  const r = await post(handler, { token: ENV.TURKEY_SHEET_SYNC_TOKEN, action: 'reconcile_present', market: 'turkey', present_ids: [] });
  assert.equal((await r.json()).skipped, 'empty_present_list');
  assert.ok(fake.calls.every(c => c.op !== 'update'));
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
