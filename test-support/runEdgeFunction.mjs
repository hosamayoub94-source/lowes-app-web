/* global process */
// Loads a REAL supabase/functions/<name>/index.ts in Node (esbuild bundle) with a fake Deno runtime and a fake
// @supabase/supabase-js. No network, no production data. Used by test-function-guards.mjs.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SERVICE = 'svc-key-for-tests';
export const CRON = 'cron-secret-for-tests';

/** world: { users: {bearer -> uid}, profiles: [..] } */
export function makeWorld() {
  const calls = { fetch: [], tables: [] };
  const world = {
    users: {}, profiles: [], calls,
    serviceJwt: null,
  };
  return world;
}

function fakeClientModule() {
  return `
    export function createClient(_url, apiKey) {
      const W = globalThis.__WORLD;
      const builder = (table) => {
        const st = { table, filters: {}, op: 'select' };
        const q = new Proxy({}, { get(_, prop) {
          if (prop === 'then') return (res, rej) => Promise.resolve(done()).then(res, rej);
          if (prop === 'eq') return (c, v) => { st.filters[c] = v; return q; };
          if (prop === 'maybeSingle' || prop === 'single') return () => { st.one = true; return q; };
          if (['insert', 'update', 'upsert', 'delete'].includes(prop)) return () => { st.op = prop; return q; };
          return () => q;
        } });
        const done = () => {
          if (table === 'profiles' && st.op === 'select') {
            const rows = W.profiles.filter((p) => Object.entries(st.filters).every(([c, v]) => p[c] === v));
            return { data: st.one ? (rows[0] ?? null) : rows, error: null };
          }
          // service-only table: only the genuine service JWT may read it (what the real probe relies on)
          if (table === 'app_role_permissions') return apiKey === W.serviceJwt ? { data: [{ role: 'x' }], error: null } : { data: null, error: { code: '42501', message: 'permission denied' } };
          W.calls.tables.push(table + ':' + st.op);
          return { data: st.one ? null : [], error: null, count: 0 };
        };
        return q;
      };
      return {
        auth: {
          getUser: async (t) => (W.users[t] ? { data: { user: { id: W.users[t] } }, error: null } : { data: { user: null }, error: { message: 'bad jwt' } }),
          admin: { getUserById: async () => ({ data: { user: null }, error: null }), updateUserById: async () => ({ error: null }), createUser: async () => ({ error: null }) },
        },
        from: builder,
        rpc: async (fn) => { W.calls.tables.push('rpc:' + fn); return { data: null, error: null }; },
        functions: { invoke: async () => ({ data: null, error: null }) },
      };
    }`;
}

/** returns async (Request) => Response for the function */
export async function loadFunction(name, world, env = {}) {
  const root = process.cwd();
  const entry = path.join(root, 'supabase', 'functions', name, 'index.ts');
  const out = path.join(root, `.tmp-fn-${name}-${process.pid}.mjs`);
  const fakePlugin = {
    name: 'fake-supabase',
    setup(b) {
      b.onResolve({ filter: /^(npm:@supabase\/supabase-js|https:\/\/esm\.sh\/@supabase\/supabase-js)/ }, () => ({ path: 'fake-supabase', namespace: 'fake' }));
      b.onResolve({ filter: /^(npm:|https?:|jsr:)/ }, (a) => ({ path: a.path, namespace: 'fake-npm' }));
      b.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ contents: fakeClientModule(), loader: 'js' }));
      b.onLoad({ filter: /.*/, namespace: 'fake-npm' }, () => ({ contents: 'export default {}; export const x = {};', loader: 'js' }));
    },
  };
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent', plugins: [fakePlugin],
    loader: { '.ts': 'ts' } });
  let handler = null;
  const fullEnv = { SUPABASE_URL: 'https://fake.supabase.co', SB_SECRET_KEY: SERVICE, SUPABASE_SERVICE_ROLE_KEY: SERVICE, ...env };
  globalThis.__WORLD = world;
  globalThis.Deno = { env: { get: (k) => fullEnv[k] }, serve: (h) => { handler = h; } };
  globalThis.fetch = async (...a) => { world.calls.fetch.push(String(a[0])); return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  try { await import(pathToFileURL(out).href + `?t=${Date.now()}${Math.random()}`); } finally { fs.unlinkSync(out); }
  if (!handler) throw new Error('function did not call Deno.serve: ' + name);
  return handler;
}
