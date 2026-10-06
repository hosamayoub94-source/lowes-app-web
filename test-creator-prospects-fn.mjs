// creator-prospects edge function — runs the real index.ts in Node against an in-memory fake Supabase (no network, no real DB).
// Checks both schemas: v1 (production today, before migration v2) and v2 (after). Run: node test-creator-prospects-fn.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { transformSync } from 'esbuild';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };

const V2_COLS = ['country', 'governorate', 'city', 'location_confidence', 'creator_type', 'content_types', 'skincare_focus', 'tags', 'bio', 'email', 'phone', 'preferred_contact', 'other_platforms', 'source_url', 'last_verified_at', 'last_active_at', 'verification_status', 'saved'];
const keyOf = (h) => String(h).trim().replace(/^@+/, '').toLowerCase();

// ---------- tiny fake of the supabase-js query builder ----------
function makeDb(schema, seed) {
  const tables = { creator_prospects: seed.map((r) => ({ ...r })), creator_prospect_audit: [], profiles: [{ id: 'u-admin', role_type: 'admin', is_active: true, employee_name: 'Tester' }, { id: 'u-staff', role_type: 'employee', is_active: true }] };
  let seq = 1000;
  class Q {
    constructor(t) { this.t = t; this.f = []; this.op = 'select'; this.lim = Infinity; this.one = null; this.ret = false; }
    select(cols) { if (this.op === 'select') this.cols = cols; else this.ret = true; return this; }
    limit(n) { this.lim = n; return this; }
    order() { return this; }
    is(c, v) { this.f.push((r) => (r[c] ?? null) === v); return this; }
    not(c, _op, v) { this.f.push((r) => (r[c] ?? null) !== v); return this; }
    eq(c, v) { this.f.push((r) => r[c] === v); return this; }
    in(c, vs) { this.f.push((r) => vs.includes(r[c])); return this; }
    insert(o) { this.op = 'insert'; this.payload = Array.isArray(o) ? o : [o]; return this; }
    update(o) { this.op = 'update'; this.payload = o; return this; }
    upsert(o, opt) { this.op = 'upsert'; this.payload = o; this.opt = opt; return this; }
    maybeSingle() { this.one = 'maybe'; return this; }
    single() { this.one = 'single'; return this; }
    badCol(obj) { return schema === 'v1' && Object.keys(obj).some((k) => V2_COLS.includes(k)); }
    run() {
      const rows = tables[this.t];
      const colErr = { data: null, error: { code: '42703', message: 'column does not exist' } };
      if (this.op === 'select' && schema === 'v1' && this.cols && this.cols.split(',').some((c) => V2_COLS.includes(c.trim()))) return colErr;
      let out;
      if (this.op === 'select') out = rows.filter((r) => this.f.every((fn) => fn(r))).slice(0, this.lim);
      else if (this.op === 'insert' || this.op === 'upsert') {
        out = [];
        for (const p of this.payload) {
          if (this.badCol(p)) return colErr;
          if (this.t === 'creator_prospects') {
            const dup = rows.find((r) => r.platform === (p.platform || 'instagram') && r.handle_key === keyOf(p.handle));
            if (dup) { if (this.op === 'upsert' && this.opt?.ignoreDuplicates) continue; return { data: null, error: { code: '23505' } }; }
            const def = schema === 'v2' ? { status: 'discovered', verification_status: 'unverified', saved: false, content_types: [], skincare_focus: [], tags: [] } : { status: 'new' };
            const row = { id: `id-${seq++}`, platform: 'instagram', verified: false, deleted_at: null, ...def, ...p, handle_key: keyOf(p.handle) };
            rows.push(row); out.push(row);
          } else rows.push(p);
        }
      } else {
        if (this.badCol(this.payload)) return colErr;
        out = rows.filter((r) => this.f.every((fn) => fn(r)));
        out.forEach((r) => { Object.assign(r, this.payload); if (this.payload.handle) r.handle_key = keyOf(this.payload.handle); });
      }
      if (this.one) {
        if (this.one === 'single' && out.length !== 1) return { data: null, error: { code: 'PGRST116' } };
        return { data: out[0] ?? null, error: null };
      }
      return { data: out, error: null };
    }
    then(res, rej) { try { res(this.run()); } catch (e) { rej(e); } }
  }
  return {
    tables,
    client: {
      from: (t) => new Q(t),
      auth: { getUser: async (tok) => (tok === 'admin-token' ? { data: { user: { id: 'u-admin' } }, error: null } : tok === 'staff-token' ? { data: { user: { id: 'u-staff' } }, error: null } : { data: null, error: { message: 'bad' } }) },
    },
  };
}

// ---------- load index.ts with the two remote imports swapped for the fakes ----------
const root = process.cwd();
const src = fs.readFileSync(path.join(root, 'supabase/functions/creator-prospects/index.ts'), 'utf8');
const shared = pathToFileURL(path.join(root, 'supabase/functions/_shared/creatorMatch.js')).href;
let js = transformSync(src, { loader: 'ts', format: 'esm' }).code;
js = js.replace(/import\s*\{\s*serve\s*\}\s*from\s*"[^"]+";/, 'const serve = (h) => { globalThis.__handler = h; };')
  .replace(/import\s*\{\s*createClient\s*\}\s*from\s*"[^"]+";/, 'const createClient = () => globalThis.__db.client;')
  .replace('"../_shared/creatorMatch.js"', JSON.stringify(shared));
const tmp = path.join(root, '.tmp-creator-fn.mjs');
fs.writeFileSync(tmp, js);
globalThis.Deno = { env: { get: () => 'x' } };
try { await import(pathToFileURL(tmp).href + `?t=${Date.now()}`); } finally { fs.unlinkSync(tmp); }
const handler = globalThis.__handler;

async function post(body, token = 'admin-token') {
  const req = new Request('http://x/fn', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) });
  const res = await handler(req);
  return { status: res.status, ...(await res.json()) };
}

const seedV1 = [
  { id: 'r1', platform: 'instagram', handle: 'skin.by.sama', handle_key: 'skin.by.sama', name: 'Sama', location: 'damascus', followers: 98200, engagement_pct: 0.44, category: 'skincare', status: 'new', verified: false, deleted_at: null, source: 'legacy' },
  { id: 'r2', platform: 'instagram', handle: 'fashion.big', handle_key: 'fashion.big', name: 'Big', location: null, followers: 500000, engagement_pct: null, category: 'fashion', status: 'new', verified: false, deleted_at: null, source: 'legacy' },
];
const seedV2 = seedV1.map((r) => ({ ...r, status: 'needs_review', country: 'SY', governorate: r.location === 'damascus' ? 'damascus' : null, location_confidence: r.location ? 'medium' : 'low', content_types: [], skincare_focus: [], tags: [], saved: false, verification_status: 'unverified' }));

// ================= auth =================
globalThis.__db = makeDb('v2', seedV2);
ok((await post({ action: 'search' }, null)).status === 401, 'no token -> 401');
ok((await post({ action: 'search' }, 'staff-token')).status === 403, 'non-admin -> 403');

// ================= v1 schema (today) =================
globalThis.__db = makeDb('v1', seedV1);
let r = await post({ action: 'search', q: 'skincare' });
ok(r.ok && r.schema === 'v1' && r.total === 1 && r.rows[0].handle === 'skin.by.sama', `v1 search works (${JSON.stringify(r).slice(0, 120)})`);
ok(typeof r.rows[0].score === 'number' && Array.isArray(r.rows[0].reasons), 'v1 search returns score + reasons');
r = await post({ action: 'list' });
ok(r.ok && r.rows.length === 2 && r.schema === 'v1', 'v1 list unchanged');
r = await post({ action: 'update', id: 'r1', patch: { saved: true } });
ok(r.status === 409 && r.error === 'migration_required', 'v1: v2 field write refused with migration_required');
r = await post({ action: 'update', id: 'r1', patch: { status: 'needs_review' } });
ok(r.status === 409, 'v1: v2-only status refused');
r = await post({ action: 'update', id: 'r1', patch: { status: 'approved', notes: 'ok' } });
ok(r.ok && r.row.status === 'approved' && r.row.notes === 'ok', 'v1: old statuses still writable');
r = await post({ action: 'add', row: { handle: '@newone' } });
ok(r.status === 400 && r.error === 'source_required', 'add without source refused');
r = await post({ action: 'add', row: { handle: 'https://instagram.com/NewOne/', source: 'Google Search' } });
ok(r.ok && r.row.status === 'new' && r.row.handle === 'NewOne', 'v1 add with source -> status new');
r = await post({ action: 'add', row: { handle: '@newone', source: 'x' } });
ok(r.status === 409 && r.error === 'duplicate', 'dedupe: URL vs @handle vs case');
r = await post({ action: 'import', rows: [{ handle: 'a1', content_types: 'ugc', source: 's' }, { handle: '@A1' }, { handle: 'skin.by.sama' }], dry_run: true });
ok(r.ok && r.summary.new === 1 && r.summary.duplicate_in_file === 1 && r.summary.duplicate_existing === 1 && r.summary.dropped_v2_fields === 1, `v1 import preview ${JSON.stringify(r.summary)}`);

// ================= v2 schema (after migration) =================
globalThis.__db = makeDb('v2', seedV2);
r = await post({ action: 'search', q: 'سكين كير دمشق' });
ok(r.ok && r.schema === 'v2' && r.total === 1, `v2 Arabic search ${r.total}`);
r = await post({ action: 'search', filters: { skincareOnly: true } });
ok(r.total === 1 && r.counts.skincare === 1, 'v2 skincareOnly');
r = await post({ action: 'search', filters: { ugcOnly: true } });
ok(r.total === 0, 'v2 ugcOnly: nothing proven yet');
r = await post({ action: 'update', id: 'r1', patch: { content_types: ['ugc', 'reels'], creator_type: 'skincare', skincare_focus: 'serums, sunscreen', saved: true, verification_status: 'verified', governorate: 'دمشق' } });
ok(r.ok && r.row.saved === true && r.row.content_types.join() === 'ugc,reels' && r.row.skincare_focus.join() === 'serums,sunscreen' && r.row.governorate === 'damascus' && !!r.row.last_verified_at, `v2 update ${JSON.stringify(r).slice(0, 200)}`);
r = await post({ action: 'search', filters: { ugcOnly: true } });
// 30 skincare + 25 ugc + 5 reels + 0 activity (no date) + 3 location + 1 engagement (0.44%) = 64 -> «مناسب», not «ممتاز» (no invented activity)
ok(r.total === 1 && r.rows[0].score === 64 && r.rows[0].badge === 'good' && r.rows[0].missing.includes('آخر نشاط على Instagram غير متوفر'), `after evidence -> good (${r.rows[0]?.score})`);
r = await post({ action: 'update', id: 'r1', patch: { content_types: ['dance'] } });
ok(r.status === 400, 'unknown content type rejected');
r = await post({ action: 'update', id: 'r1', patch: { governorate: 'Narnia' } });
ok(r.status === 400, 'unknown governorate rejected');
r = await post({ action: 'update', id: 'r1', patch: { followers: '' } });
ok(r.ok && r.row.followers === null, 'empty followers -> null (unknown), not 0');
r = await post({ action: 'add', row: { handle: '@fresh_ugc', source: 'Instagram', source_url: 'https://www.google.com/search?q=x', country: 'SY', governorate: 'aleppo' } });
ok(r.ok && r.row.status === 'discovered' && r.row.verification_status === 'unverified', 'v2 add -> discovered + unverified');
r = await post({ action: 'search', q: 'حلب', filters: { status: 'discovered' } });
ok(r.total === 1, 'search new discovered in Aleppo');
r = await post({ action: 'import', rows: [{ handle: 'imp1', content_types: 'ugc,unboxing', governorate: 'homs', source: 'Influencer Directory' }, { handle: 'skin.by.sama', bio: 'serum lover' }], dry_run: false, merge: true });
ok(r.ok && r.inserted === 1 && r.merged === 1, `v2 import insert + merge ${JSON.stringify(r.summary)}`);
const imp = globalThis.__db.tables.creator_prospects.find((x) => x.handle === 'imp1');
ok(imp && imp.status === 'discovered' && imp.content_types.join() === 'ugc,unboxing' && imp.governorate === 'homs', 'imported row normalised');
ok(globalThis.__db.tables.creator_prospects.find((x) => x.id === 'r1').bio === 'serum lover', 'merge fills empty bio only');
r = await post({ action: 'bulk_update', ids: ['r1', 'r2'], patch: { status: 'contacted', saved: true } });
ok(r.ok && r.updated === 2, 'bulk update v2');
r = await post({ action: 'search', page: 1, page_size: 1 });
ok(r.rows.length === 1 && r.total >= 4, 'server pagination');
ok(globalThis.__db.tables.creator_prospect_audit.length > 0, 'audit written');

// import-ready discovery batches must pass the import validation as-is (headers = field names).
// discovery_master_* is a review-only dataset (includes existing + excluded rows) and is not an import file.
const discDir = path.join(root, 'data/creators/syria');
for (const f of (fs.existsSync(discDir) ? fs.readdirSync(discDir) : []).filter((n) => /^discovery_\d{4}-\d{2}-\d{2}(-v\d+)?\.csv$/.test(n))) {
  const csvPath = path.join(discDir, f);
  const XLSX = (await import('xlsx')).default;
  const wb = XLSX.read(fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, ''), { type: 'string' });
  const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
  const rows = sheet.map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== '')));
  r = await post({ action: 'import', rows, dry_run: true });
  ok(r.ok && r.summary.invalid === 0 && r.summary.new === rows.length, `${f} imports cleanly ${JSON.stringify(r.summary)} ${JSON.stringify(r.invalid)}`);
}

console.log(`creator-prospects fn: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
