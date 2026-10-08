/* eslint-env node */
// b2b-leads edge function (D-119) — runs the real index.ts in Node against an in-memory fake Supabase (no network, no real DB).
// Covers: the 4 access cases per action (admin / granted / granted-but-denied / no permission) + Syria-only user,
// country separation (a UAE user can never read or change a Syria row), Syria rows byte-identical after everything,
// the pre-migration mode (409, zero writes), duplicates, validation, and the research batch file.
// Run: node test-b2b-leads-fn.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { transformSync } from 'esbuild';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };
const webKey = (w) => (w ? String(w).replace(/^https?:\/\/(www\.)?|\/+$/g, '').toLowerCase() : null);

const PROFILES = [
  { id: 'u-admin', role_type: 'admin', is_active: true, employee_name: 'Admin Test' },
  { id: 'u-uae', role_type: 'employee', is_active: true, employee_name: 'UAE Staff', extra_permissions: ['view_uae_leads'], denied_permissions: [] },
  { id: 'u-den', role_type: 'employee', is_active: true, employee_name: 'Denied Staff', extra_permissions: ['view_uae_leads'], denied_permissions: ['view_uae_leads'] },
  { id: 'u-none', role_type: 'employee', is_active: true, employee_name: 'No Perm' },
  { id: 'u-sy', role_type: 'employee', is_active: true, employee_name: 'Syria Staff', extra_permissions: ['view_syria_leads'], denied_permissions: [] },
  { id: 'u-off', role_type: 'admin', is_active: false, employee_name: 'Inactive' },
];
const TOKENS = { 'admin-token': 'u-admin', 'uae-token': 'u-uae', 'den-token': 'u-den', 'none-token': 'u-none', 'sy-token': 'u-sy', 'off-token': 'u-off' };

// ---------- tiny fake of the supabase-js query builder ----------
// schema 'pre' = before migration 20261008 (no country column), 'post' = after.
function makeDb(schema, seed) {
  const tables = { syria_b2b_leads: seed.map((r) => ({ ...r })), profiles: PROFILES.map((p) => ({ ...p })) };
  const writes = [];
  class Q {
    constructor(t) { this.t = t; this.f = []; this.op = 'select'; this.lim = Infinity; this.one = null; }
    select(cols) { if (this.op === 'select') this.cols = cols; return this; }
    limit(n) { this.lim = n; return this; }
    order(c, o) { this.ord = [c, o?.ascending !== false]; return this; }
    eq(c, v) { this.f.push((r) => r[c] === v); return this; }
    insert(o) { this.op = 'insert'; this.payload = Array.isArray(o) ? o : [o]; return this; }
    update(o) { this.op = 'update'; this.payload = o; return this; }
    maybeSingle() { this.one = 'maybe'; return this; }
    run() {
      const rows = tables[this.t];
      const colErr = { data: null, error: { code: '42703', message: 'column does not exist' } };
      const usesCountry = (s) => schema === 'pre' && this.t === 'syria_b2b_leads' && s;
      if (this.op === 'select' && usesCountry(this.cols && this.cols.split(',').map((c) => c.trim()).includes('country'))) return colErr;
      let out;
      if (this.op === 'select') {
        out = rows.filter((r) => this.f.every((fn) => fn(r)));
        if (this.ord) { const [c, asc] = this.ord; out = [...out].sort((a, b) => ((a[c] ?? 0) - (b[c] ?? 0)) * (asc ? 1 : -1)); }
        out = out.slice(0, this.lim).map((r) => ({ ...r }));
      } else if (this.op === 'insert') {
        const sig = (o) => Object.keys(o).sort().join(',');
        if (this.payload.length > 1 && this.payload.some((p) => sig(p) !== sig(this.payload[0]))) return { data: null, error: { code: 'PGRST102' } };
        for (const p of this.payload) {
          if (usesCountry('country' in p)) return colErr;
          const w = webKey(p.website);
          if (w && rows.some((r) => webKey(r.website) === w)) return { data: null, error: { code: '23505' } };
          if (rows.some((r) => r.id === p.id)) return { data: null, error: { code: '23505' } };
        }
        out = this.payload.map((p) => ({ ...p }));
        rows.push(...out.map((r) => ({ ...r })));
        writes.push({ op: 'insert', n: out.length });
      } else {
        out = rows.filter((r) => this.f.every((fn) => fn(r)));
        out.forEach((r) => Object.assign(r, this.payload));
        out = out.map((r) => ({ ...r }));
        writes.push({ op: 'update', n: out.length });
      }
      if (this.one) return { data: out[0] ?? null, error: null };
      return { data: out, error: null };
    }
    then(res, rej) { try { res(this.run()); } catch (e) { rej(e); } }
  }
  return {
    tables, writes,
    client: {
      from: (t) => new Q(t),
      auth: { getUser: async (tok) => (TOKENS[tok] ? { data: { user: { id: TOKENS[tok] } }, error: null } : { data: null, error: { message: 'bad' } }) },
    },
  };
}

// ---------- load index.ts with the two remote imports swapped for the fakes ----------
const root = process.cwd();
const src = fs.readFileSync(path.join(root, 'supabase/functions/b2b-leads/index.ts'), 'utf8');
const shared = pathToFileURL(path.join(root, 'supabase/functions/_shared/countries.js')).href;
let js = transformSync(src, { loader: 'ts', format: 'esm' }).code;
js = js.replace(/import\s*\{\s*serve\s*\}\s*from\s*"[^"]+";/, 'const serve = (h) => { globalThis.__handler = h; };')
  .replace(/import\s*\{\s*createClient\s*\}\s*from\s*"[^"]+";/, 'const createClient = () => globalThis.__db.client;')
  .replace('"../_shared/countries.js"', JSON.stringify(shared));
const tmp = path.join(root, '.tmp-b2b-fn.mjs');
fs.writeFileSync(tmp, js);
globalThis.Deno = { env: { get: () => 'x' } };
const origErr = console.error; console.error = (...a) => { if (a[0] !== 'b2b-leads') origErr(...a); };
try { await import(pathToFileURL(tmp).href + `?t=${Date.now()}`); } finally { fs.unlinkSync(tmp); }
const handler = globalThis.__handler;

async function post(body, token = 'admin-token') {
  const req = new Request('http://x/fn', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) });
  const res = await handler(req);
  return { status: res.status, ...(await res.json()) };
}

// ---------- fake data (clearly fake) ----------
const SY = (o) => ({ country: 'SY', lead_type: 'physical', status: 'not_contacted', lowes_presence: 'not_listed', score: 50, priority: 'B', website: null, notes: null, ...o });
const AE = (o) => ({ country: 'AE', lead_type: 'online', status: 'not_contacted', lowes_presence: 'unverified', score: 40, priority: 'C', website: null, notes: null, ...o });
const seedPost = [
  SY({ id: 'SYR-DAM-0001', province: 'Damascus', name: 'صيدلية تجريبية (وهمي)', phone: '0999000001' }),
  SY({ id: 'SYR-ONL-0001', province: 'Nationwide', name: 'Fake Syria Store', lead_type: 'online', website: 'https://fake-syria-store.example' }),
  AE({ id: 'UAE-ONL-T-001', province: 'Dubai', name: 'Fake Dubai Beauty', website: 'https://fake-dubai-beauty.example' }),
  AE({ id: 'UAE-PHY-T-002', province: 'Abu Dhabi', city: 'Al Ain', name: 'Fake Al Ain Pharmacy', lead_type: 'physical' }),
];
const seedPre = seedPost.filter((r) => r.country === 'SY').map(({ country: _c, ...r }) => r);
const syriaSnapshot = (db) => JSON.stringify(db.tables.syria_b2b_leads.filter((r) => r.country === 'SY' || !('country' in r)));

// ================= auth =================
globalThis.__db = makeDb('post', seedPost);
ok((await post({ action: 'list', country: 'AE' }, null)).status === 401, 'no token -> 401');
ok((await post({ action: 'list', country: 'AE' }, 'bogus')).status === 401, 'bad token -> 401');
ok((await post({ action: 'list', country: 'AE' }, 'off-token')).status === 403, 'inactive profile -> 403');
ok((await post({ action: 'list', country: 'SY' })).error === 'country_not_served', 'SY is never served here (stays on the old path), even for admin');
ok((await post({ action: 'list', country: 'TR' })).error === 'country_not_served', 'disabled country refused');
ok((await post({ action: 'list' })).error === 'country_not_served', 'missing country refused');

// ================= the 4 cases (+ Syria-only) per action =================
const cases = [
  ['admin', 'admin-token', { list: 200, add: 200, update_status: 200, update_presence: 200, import: 200 }],
  ['granted view_uae_leads', 'uae-token', { list: 200, add: 200, update_status: 200, update_presence: 200, import: 403 }],
  ['granted but denied', 'den-token', { list: 403, add: 403, update_status: 403, update_presence: 403, import: 403 }],
  ['no permission', 'none-token', { list: 403, add: 403, update_status: 403, update_presence: 403, import: 403 }],
  ['syria-only permission', 'sy-token', { list: 403, add: 403, update_status: 403, update_presence: 403, import: 403 }],
];
const matrix = [];
for (const [label, tok, expect] of cases) {
  globalThis.__db = makeDb('post', seedPost);
  const before = syriaSnapshot(globalThis.__db);
  const got = {
    list: (await post({ action: 'list', country: 'AE' }, tok)).status,
    add: (await post({ action: 'add', country: 'AE', row: { name: `Fake Add ${label}`, province: 'Sharjah' } }, tok)).status,
    update_status: (await post({ action: 'update_status', country: 'AE', id: 'UAE-ONL-T-001', status: 'contacted', notes: 'fake' }, tok)).status,
    update_presence: (await post({ action: 'update_presence', country: 'AE', id: 'UAE-ONL-T-001', lowes_presence: 'in_talks' }, tok)).status,
    import: (await post({ action: 'import', country: 'AE', rows: [{ name: 'X', province: 'Dubai', lead_type: 'online', source_urls: 'https://a.example', last_verified_at: '2026-10-08' }] }, tok)).status,
  };
  for (const a of Object.keys(expect)) ok(got[a] === expect[a], `${label}: ${a} -> ${got[a]} (expected ${expect[a]})`);
  ok(syriaSnapshot(globalThis.__db) === before, `${label}: Syria rows untouched`);
  if (expect.list === 403) ok(globalThis.__db.writes.length === 0, `${label}: zero writes when refused`);
  matrix.push({ persona: label, ...got });
}
console.table(matrix);

// ================= country separation =================
globalThis.__db = makeDb('post', seedPost);
const syBefore = syriaSnapshot(globalThis.__db);
let r = await post({ action: 'list', country: 'AE' }, 'uae-token');
ok(r.ok && r.rows.length === 2 && r.rows.every((x) => x.country === 'AE'), 'list AE returns AE rows only');
r = await post({ action: 'update_status', country: 'AE', id: 'SYR-DAM-0001', status: 'customer' }, 'uae-token');
ok(r.status === 404, 'UAE user cannot change a Syria row by id (404)');
r = await post({ action: 'update_presence', country: 'AE', id: 'SYR-ONL-0001', lowes_presence: 'listed' }, 'admin-token');
ok(r.status === 404, 'even admin cannot touch a Syria row through the AE door');
r = await post({ action: 'add', country: 'AE', row: { name: 'Fake Cross', province: 'Dubai', country: 'SY' } }, 'uae-token');
ok(r.ok && r.row.country === 'AE', 'row.country in the body is ignored — stored under the requested country');
r = await post({ action: 'add', country: 'AE', row: { name: 'Fake Bad Region', province: 'Damascus' } }, 'uae-token');
ok(r.status === 400, 'a Syrian province is not a valid emirate');
r = await post({ action: 'import', country: 'AE', rows: [{ country: 'SY', name: 'Fake', province: 'Dubai', lead_type: 'online', source_urls: 'https://b.example', last_verified_at: '2026-10-08' }], dry_run: true });
ok(r.ok && r.summary.invalid === 1, 'import refuses rows labelled with another country');
ok(syriaSnapshot(globalThis.__db) === syBefore, 'Syria rows byte-identical after the whole separation suite');

// ================= behaviour =================
globalThis.__db = makeDb('post', seedPost);
r = await post({ action: 'update_status', country: 'AE', id: 'UAE-ONL-T-001', status: 'interested', notes: 'fake note', status_updated_by: 'hacker' }, 'uae-token');
ok(r.ok && r.row.status_updated_by === 'UAE Staff' && r.row.notes === 'fake note', 'actor comes from the session profile, not the body');
ok((await post({ action: 'update_status', country: 'AE', id: 'UAE-ONL-T-001', status: 'bogus' }, 'uae-token')).status === 400, 'invalid status 400');
r = await post({ action: 'update_presence', country: 'AE', id: 'UAE-ONL-T-001', lowes_presence: 'listed', lowes_listing_url: 'https://fake-dubai-beauty.example/lowes' }, 'uae-token');
ok(r.ok && r.row.lowes_presence === 'listed' && r.row.presence_updated_by === 'UAE Staff', 'presence update');
ok((await post({ action: 'update_presence', country: 'AE', id: 'UAE-ONL-T-001', lowes_presence: 'listed', lowes_listing_url: 'javascript:alert(1)' }, 'uae-token')).status === 400, 'non-http listing url refused');
r = await post({ action: 'add', country: 'AE', row: { name: 'Fake Ajman Shop', province: 'عجمان', city: 'العين', whatsapp: '0501234567', lead_type: 'online', website: 'https://fake-ajman.example' } }, 'uae-token');
ok(r.ok && r.row.province === 'Ajman' && r.row.city === 'Al Ain' && r.row.whatsapp_link === 'https://wa.me/971501234567', `Arabic region/city normalised + 971 WhatsApp (${r.row?.whatsapp_link})`);
ok(r.row.lowes_presence === 'unverified' && r.row.verified === 'manual_team_entry' && r.row.priority === 'B' && r.row.added_by === 'UAE Staff', 'manual add defaults: unverified, B at most, added_by from session');
ok(/^UAE-ONA-/.test(r.row.id), 'UAE id prefix');
r = await post({ action: 'add', country: 'AE', row: { name: 'Other Name', province: 'Dubai', website: 'http://www.FAKE-SYRIA-STORE.example/' } }, 'uae-token');
ok(r.status === 409, 'duplicate website (even a Syria store) refused — same rule as the DB unique index');
r = await post({ action: 'add', country: 'AE', row: { name: 'fake dubai beauty', province: 'Dubai' } }, 'uae-token');
ok(r.status === 409, 'duplicate name in the same emirate refused');
r = await post({ action: 'add', country: 'AE', row: { name: 'Fake Dubai Beauty', province: 'Sharjah' } }, 'uae-token');
ok(r.ok, 'same name in another emirate allowed');
ok((await post({ action: 'add', country: 'AE', row: { province: 'Dubai' } }, 'uae-token')).status === 400, 'name required');
ok((await post({ action: 'add', country: 'AE', row: { name: 'X', province: 'Dubai', website: 'not a url' } }, 'uae-token')).status === 400, 'bad website refused');

// ================= pre-migration mode =================
globalThis.__db = makeDb('pre', seedPre);
const preBefore = syriaSnapshot(globalThis.__db);
for (const body of [{ action: 'list' }, { action: 'add', row: { name: 'X', province: 'Dubai' } }, { action: 'update_status', id: 'SYR-DAM-0001', status: 'customer' }, { action: 'import', rows: [{ name: 'X' }] }]) {
  r = await post({ ...body, country: 'AE' });
  ok(r.status === 409 && r.error === 'migration_required', `pre-migration ${body.action} -> 409`);
}
ok(globalThis.__db.writes.length === 0 && syriaSnapshot(globalThis.__db) === preBefore, 'pre-migration: zero writes, Syria untouched');

// ================= import =================
const batch = JSON.parse(fs.readFileSync(path.join(root, 'data/b2b/uae/uae_batch1_2026-10-08.json'), 'utf8'));
globalThis.__db = makeDb('post', seedPost);
r = await post({ action: 'import', country: 'AE', rows: batch.rows });
ok(r.ok && r.dry_run === true && r.inserted === 0 && globalThis.__db.writes.length === 0, 'import is a dry run by default');
ok(r.summary.invalid === 0 && r.summary.new === batch.rows.length, `research batch validates cleanly ${JSON.stringify(r.summary)} ${JSON.stringify(r.invalid)}`);
r = await post({ action: 'import', country: 'AE', rows: batch.rows, dry_run: false });
ok(r.ok && r.inserted === batch.rows.length, `research batch real insert on fake DB (${r.inserted})`);
const imported = globalThis.__db.tables.syria_b2b_leads.filter((x) => x.discovery_source?.startsWith('research:'));
ok(imported.every((x) => x.country === 'AE' && x.lowes_presence === 'unverified' && x.source_urls && x.last_verified_at && x.status === 'not_contacted'), 'every imported row: AE + unverified + source + verified date + team fields untouched');
ok(imported.every((x) => ['C', 'D'].includes(x.priority)), 'no row claims A/B from single sources');
r = await post({ action: 'import', country: 'AE', rows: batch.rows });
ok(r.summary.duplicate_existing === batch.rows.length && r.summary.new === 0, 're-import finds every row as existing (no duplicates)');
r = await post({ action: 'import', country: 'AE', dry_run: true, rows: [
  { name: 'No Source', province: 'Dubai', lead_type: 'online', last_verified_at: '2026-10-08' },
  { name: 'A One Source', province: 'Dubai', lead_type: 'online', priority: 'A', source_urls: 'https://a.example', last_verified_at: '2026-10-08' },
  { name: 'Claims Listed', province: 'Dubai', lead_type: 'online', lowes_presence: 'listed', source_urls: 'https://a.example', last_verified_at: '2026-10-08' },
  { name: 'No Date', province: 'Dubai', lead_type: 'online', source_urls: 'https://a.example' },
  { name: 'Twice', province: 'Dubai', lead_type: 'online', source_urls: 'https://a.example', last_verified_at: '2026-10-08' },
  { name: 'twice', province: 'Dubai', lead_type: 'online', source_urls: 'https://b.example', last_verified_at: '2026-10-08' },
] });
ok(r.summary.invalid === 4 && r.summary.new === 1 && r.summary.duplicate_in_file === 1, `import rules: source, A needs 2 sources, listed needs evidence, date required, in-file dedupe ${JSON.stringify(r.summary)}`);

console.log(`b2b-leads fn: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
