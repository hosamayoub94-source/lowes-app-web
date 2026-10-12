/* eslint-env node */
// ليدز B2B — حالات الفشل: 401/403/404/409/اتصال/timeout/بيانات فارغة + عدم وجود retry تلقائي (منطق نقي + b2bLeadsApi بعميل Supabase وهمي).
// Run: node test-b2b-errors.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };
const root = process.cwd();
const out = path.join(root, '.tmp-b2b-errors.mjs');
const entry = `
  export * as errs from './src/services/b2bErrors.js';
  export * as api from './src/services/b2bLeadsApi.js';
`;
const stubSupabase = { name: 'stub-supabase', setup(b) {
  b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => (a.importer.includes('services') ? { path: 'stub', namespace: 'stub-sb' } : undefined));
  b.onResolve({ filter: /^@services\/supabase$/ }, () => ({ path: 'stub', namespace: 'stub-sb' }));
  b.onLoad({ filter: /.*/, namespace: 'stub-sb' }, () => ({ contents: 'export const supabase = new Proxy({}, { get: (_, k) => globalThis.__sb[k] });', loader: 'js' }));
} };
await build({ stdin: { contents: entry, resolveDir: root, loader: 'js' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
  alias: { '@services': path.join(root, 'src/services') }, plugins: [stubSupabase], define: { 'import.meta.env': '{}' } });
let m;
try { m = await import(pathToFileURL(out).href + `?t=${Date.now()}`); } finally { fs.unlinkSync(out); }
const { errs, api } = m;

// ── classification ──
const c = errs.classifyB2bFailure;
ok(c({ status: 401 }) === 'session', '401 -> session');
ok(c({ status: 401, code: 'authenticated user session required' }) === 'session', '401 body -> session');
ok(c({ status: 403 }) === 'forbidden', '403 -> forbidden');
ok(c({ status: 404 }) === 'not_deployed', '404 without body -> function not deployed');
ok(c({ status: 404, code: 'not_found' }) === 'server', '404 with a business body (row not found) is NOT "not deployed"');
ok(c({ status: 409, code: 'migration_required' }) === 'migration', '409 migration_required -> migration');
ok(c({ code: 'migration_required' }) === 'migration', 'migration code alone');
ok(c({ network: true }) === 'network', 'network flag');
ok(c({}) === 'network', 'no status and no code -> network');
ok(c({ timeout: true }) === 'timeout', 'timeout flag');
ok(c({ status: 500, code: 'server error' }) === 'server', '500 -> server');
// user-facing text has no jargon
for (const k of errs.ERROR_KINDS) {
  const e = new errs.B2bError(k);
  ok(!/edge function|jwt|supabase|http|stack|undefined|null|\b\d{3}\b/i.test(e.message + ' ' + e.hint), `${k}: no technical text (${e.message})`);
  ok(typeof e.retryable === 'boolean' && e.hint.length > 5, `${k}: has hint + retryable flag`);
}
ok(new errs.B2bError('session').retryable === false && new errs.B2bError('forbidden').retryable === false, 'session/forbidden are not retryable (retry cannot fix them)');
ok(new errs.B2bError('timeout').retryable === true && new errs.B2bError('network').retryable === true, 'timeout/network are retryable');
ok(errs.toB2bError(new Error('JWT expired')).kind === 'session', 'JWT expired -> session');
ok(errs.toB2bError({ message: 'Failed to fetch' }).kind === 'network', 'Failed to fetch -> network');
ok(errs.toB2bError({ status: 403, message: 'x' }).kind === 'forbidden', 'PostgREST-style status 403');
const same = new errs.B2bError('timeout'); ok(errs.toB2bError(same) === same, 'toB2bError idempotent');

// ── withTimeout ──
const t0 = Date.now();
let timedOut = null;
try { await errs.withTimeout(new Promise(() => {}), 60, 'list'); } catch (e) { timedOut = e; }
ok(timedOut?.kind === 'timeout' && Date.now() - t0 < 1000, 'a never-settling call is cut by the timeout');
ok(await errs.withTimeout(Promise.resolve(7), 1000) === 7, 'fast call passes through');

// ── safe logging: only kind/status/action ──
const logged = []; errs.logB2bError(new errs.B2bError('session', { status: 401, action: 'list', detail: 'SECRET-BODY' }), 'list', { warn: (...a) => logged.push(a) });
const dump = JSON.stringify(logged);
ok(/session/.test(dump) && /401/.test(dump) && !/SECRET-BODY/.test(dump) && !/Bearer|token|phone|email/i.test(dump), 'console log carries kind/status/action only');

// ── callB2b through a fake Supabase client ──
const reply = (status, body) => ({ data: null, error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: { status, clone: () => ({ json: async () => { if (body === undefined) throw new Error('no json'); return body; } }) } } });
let calls = 0;
const setInvoke = (fn) => { calls = 0; globalThis.__sb = { functions: { invoke: async (...a) => { calls += 1; return fn(...a); } } }; };
const run = async (fn, action = 'list') => { setInvoke(fn); return api.callB2b(action, { country: 'AE' }, { timeoutMs: 80 }); };

let r = await run(async () => reply(401, { ok: false, error: 'authenticated user session required' }));
ok(r.ok === false && r.kind === 'session' && r.status === 401 && !/401|authenticated/.test(r.error), '401 -> session, friendly text');
r = await run(async () => reply(403, { ok: false, error: 'no permission', message: 'ما عندك صلاحية ليدز الإمارات' }));
ok(r.kind === 'forbidden' && r.error === 'ما عندك صلاحية ليدز الإمارات', '403 keeps the specific Arabic message of the server');
r = await run(async () => reply(403, undefined));
ok(r.kind === 'forbidden' && r.error.length > 5, '403 without body -> generic forbidden copy');
r = await run(async () => reply(404, undefined));
ok(r.kind === 'not_deployed', '404 (no body) -> function not deployed');
r = await run(async () => reply(409, { ok: false, error: 'migration_required', message: 'تقني: migration 20261008' }));
ok(r.kind === 'migration' && !/20261008|migration/i.test(r.error), '409 -> migration kind, no technical text shown');
r = await run(async () => reply(409, { ok: false, error: 'duplicate', message: 'موجود مسبقاً: متجر' }));
ok(r.code === 'duplicate' && r.error.startsWith('موجود مسبقاً') && r.kind === undefined, 'duplicate stays a business answer, not a load error');
r = await run(async () => ({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function', context: new TypeError('x') } }));
ok(r.kind === 'network' && !/Edge Function/.test(r.error), 'network failure -> network, no jargon');
r = await run(() => new Promise(() => {}));
ok(r.kind === 'timeout' && calls === 1, 'hanging function -> timeout after exactly one attempt (no retry loop)');
r = await run(async () => ({ data: { ok: true, rows: [] }, error: null }));
ok(r.ok === true && Array.isArray(r.rows) && r.rows.length === 0, 'empty data is a success (the screen shows the empty state)');
ok(calls === 1, 'success makes exactly one call');

// list() through leadsApiFor('AE'): throws B2bError with kind; empty -> []
setInvoke(async () => ({ data: { ok: true, rows: [] }, error: null }));
ok((await api.leadsApiFor('AE').list()).length === 0, 'AE list(): empty array');
setInvoke(async () => reply(403, { ok: false, error: 'no permission' }));
let thrown = null; try { await api.leadsApiFor('AE').list(); } catch (e) { thrown = e; }
ok(thrown?.name === 'B2bError' && thrown.kind === 'forbidden', 'AE list(): 403 throws B2bError(forbidden)');
setInvoke(async () => reply(404, undefined));
thrown = null; try { await api.leadsApiFor('AE').list(); } catch (e) { thrown = e; }
ok(thrown?.kind === 'not_deployed' && calls === 1, 'AE list(): 404 throws not_deployed, one call');

// Syria direct path: expired JWT is classified; empty data is []
globalThis.__sb = { from: () => ({ select: () => ({ order: async () => ({ data: null, error: { message: 'JWT expired', code: 'PGRST301', status: 401 } }) }) }) };
thrown = null; try { await api.leadsApiFor('SY').list(); } catch (e) { thrown = e; }
ok(thrown?.kind === 'session', 'SY list(): expired JWT -> session (friendly)');
globalThis.__sb = { from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }) }) };
ok((await api.leadsApiFor('SY').list()).length === 0, 'SY list(): empty data -> []');

console.log(`b2b-errors: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
