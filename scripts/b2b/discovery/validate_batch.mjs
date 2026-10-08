// Dry-runs a batch file through the real supabase/functions/b2b-leads/index.ts (fake in-memory DB, no network, no writes anywhere real).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const WT = 'C:/Users/LOQ/Desktop/lowes-uae-b2b';
const require = createRequire(path.join(WT, 'package.json'));
const { transformSync } = require('esbuild');
const batchFiles = process.argv.slice(2);

const existing = [];       // pretend DB: batch1 already imported as AE rows + a Syria row
const b1 = JSON.parse(fs.readFileSync(path.join(WT, 'data/b2b/uae/uae_batch1_2026-10-08.json'), 'utf8')).rows;
b1.forEach((r, i) => existing.push({ id: `UAE-B1-${i}`, country: 'AE', province: r.province, name: r.name, website: r.website || null }));
// every website already used by the Syria seed (global unique index!)
const syria = fs.readdirSync(path.join(WT, 'supabase/data')).filter((f) => f.endsWith('.sql')).map((f) => fs.readFileSync(path.join(WT, 'supabase/data', f), 'utf8')).join('\n');
const syriaSites = [...new Set([...syria.matchAll(/'(https?:\/\/[^'\s]+)'/g)].map((m) => m[1]))];
syriaSites.forEach((w, i) => existing.push({ id: `SYR-X-${i}`, country: 'SY', province: 'Nationwide', name: `syria-site-${i}`, website: w }));

const tables = { syria_b2b_leads: existing.map((r) => ({ ...r })), profiles: [{ id: 'u-admin', role_type: 'admin', is_active: true, employee_name: 'Validator' }] };
class Q { constructor(t) { this.t = t; this.f = []; this.op = 'select'; } select() { return this; } limit() { return this; } order() { return this; } eq(c, v) { this.f.push((r) => r[c] === v); return this; } maybeSingle() { this.one = 1; return this; } insert() { throw new Error('WRITE ATTEMPT — validator must be dry-run only'); } update() { throw new Error('WRITE ATTEMPT'); }
  then(res) { const rows = tables[this.t].filter((r) => this.f.every((fn) => fn(r))); res({ data: this.one ? rows[0] ?? null : rows, error: null }); } }
const db = { from: (t) => new Q(t), auth: { getUser: async () => ({ data: { user: { id: 'u-admin' } }, error: null }) } };
globalThis.__db = { client: db };

const src = fs.readFileSync(path.join(WT, 'supabase/functions/b2b-leads/index.ts'), 'utf8');
let js = transformSync(src, { loader: 'ts', format: 'esm' }).code;
js = js.replace(/import\s*\{\s*serve\s*\}\s*from\s*"[^"]+";/, 'const serve = (h) => { globalThis.__handler = h; };').replace(/import\s*\{\s*createClient\s*\}\s*from\s*"[^"]+";/, 'const createClient = () => globalThis.__db.client;').replace('"../_shared/countries.js"', JSON.stringify(pathToFileURL(path.join(WT, 'supabase/functions/_shared/countries.js')).href));
const tmp = path.join(WT, '.tmp-validate-fn.mjs'); fs.writeFileSync(tmp, js);
globalThis.Deno = { env: { get: () => 'x' } };
try { await import(pathToFileURL(tmp).href + `?t=${Date.now()}`); } finally { fs.unlinkSync(tmp); }

for (const f of batchFiles) {
  const rows = JSON.parse(fs.readFileSync(f, 'utf8')).rows;
  const res = await globalThis.__handler(new Request('http://x/fn', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify({ action: 'import', country: 'AE', rows, dry_run: true }) }));
  const j = await res.json();
  console.log(path.basename(f), '→ HTTP', res.status, JSON.stringify(j.summary));
  (j.invalid || []).forEach((x) => console.log('  INVALID line', x.line, x.name, '—', x.error));
  (j.duplicate_existing || []).forEach((x) => console.log('  DUP existing line', x.line, x.name, '=', x.existing?.name, `(${x.existing?.country})`));
  (j.duplicate_in_file || []).forEach((x) => console.log('  DUP in file line', x.line, x.name));
}
console.log('(Syria websites loaded for the global-unique check:', syriaSites.length + ')');
