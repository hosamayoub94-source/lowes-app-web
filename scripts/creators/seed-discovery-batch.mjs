// Loads ONE discovery batch (e.g. B001) into the shared workbench table as a separate cohort ('discovery'), idempotent.
// usage: node scripts/creators/seed-discovery-batch.mjs B001 [--dry]
// Mandatory final dedup against the live table (kind='queue', every cohort, removed ones included) by profile URL, then platform+username.
// Writes only kind='queue' rows (new ids) and kind='assign' rows (new ids, spread over the shared team). Never touches the pilot queue,
// reviews, waves or members. Uses the public publishable key through RLS, exactly like the app.
import fs from 'node:fs';
import path from 'node:path';
import { poolRowToQueueRecord } from '../../src/services/creatorDiscoveryBatches.js';
import { assignReviewers } from '../../src/services/creatorReview.js';
import { parseProfileUrl, normalizeHandle } from '../../src/services/creatorLogic.js';

const [batchId, flag] = process.argv.slice(2);
if (!/^B\d{3}$/.test(batchId || '')) { console.error('usage: seed-discovery-batch.mjs B001 [--dry]'); process.exit(1); }
const dry = flag === '--dry';
const URL_ = 'https://fghdumrgimoeqsafdhhh.supabase.co';
const KEY = 'sb_publishable_iYn5Rc00ZmdLPUBH5_09fg_eLiok3UO';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Accept-Profile': 'public', 'Content-Profile': 'public' };
const DIR = path.resolve('data/creators/syria/discovery');

const plan = JSON.parse(fs.readFileSync(path.join(DIR, 'batches/batch_plan.json'), 'utf8'));
const b = plan.batches.find(x => x.id === batchId);
if (!b) { console.error('batch not in plan'); process.exit(1); }
const pool = new Map(JSON.parse(fs.readFileSync(path.join(DIR, 'discovery_pool.json'), 'utf8')).rows.map(r => [`${r.platform}:${r.username}`, r]));
const rows = b.accounts.map(k => pool.get(k)).filter(Boolean);
if (rows.length !== b.accounts.length) { console.error('plan/pool mismatch'); process.exit(1); }

async function fetchAll(kind) {
  const out = []; for (let from = 0; ; from += 1000) {
    const res = await fetch(`${URL_}/rest/v1/creator_workbench_items?select=id,data&kind=eq.${kind}&order=id`, { headers: { ...H, Range: `${from}-${from + 999}` } });
    if (!res.ok) throw new Error(`${kind} read failed ${res.status} ${await res.text()}`);
    const page = await res.json(); out.push(...page); if (page.length < 1000) break;
  } return out;
}
const existingQueue = await fetchAll('queue');
const known = new Set(); const knownIds = new Set(existingQueue.map(r => r.id));
for (const r of existingQueue) for (const p of r.data.platforms || []) { known.add(`${p.platform}:${normalizeHandle(p.handle)}`); const u = parseProfileUrl(p.profile_url || ''); if (u.ok) known.add(`${u.platform}:${u.handle}`); }

const fresh = []; const skipped = [];
for (const r of rows) {
  const k = `${r.platform}:${normalizeHandle(r.username)}`; const u = parseProfileUrl(r.profile_url); const k2 = u.ok ? `${u.platform}:${u.handle}` : k;
  if (known.has(k) || known.has(k2)) skipped.push(k); else fresh.push(r);
}
const records = fresh.map(r => poolRowToQueueRecord(r, { batch: batchId }));
const team = ((await fetchAll('meta')).find(x => x.id === 'team')?.data?.names) || [];
if (!team.length) { console.error('no shared team configured — set it in the workbench Data tab first'); process.exit(1); }
const assignMap = assignReviewers(records, team);
console.log(JSON.stringify({ batch: batchId, in_batch: rows.length, new: records.length, skipped_already_in_database: skipped.length, team, per_reviewer: team.map(n => [n, Object.values(assignMap).filter(v => v === n).length]), dry }));
if (dry || !records.length) process.exit(0);

const now = new Date().toISOString();
const items = [...records.map(r => ({ kind: 'queue', id: r.id, data: r, updated_by: 'discovery-seed', updated_at: now })), ...records.map(r => ({ kind: 'assign', id: r.id, data: { to: assignMap[r.id] }, updated_by: 'discovery-seed', updated_at: now }))]
  .filter(i => !(i.kind === 'queue' && knownIds.has(i.id)));
for (let i = 0; i < items.length; i += 50) {
  const res = await fetch(`${URL_}/rest/v1/creator_workbench_items?on_conflict=kind,id`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(items.slice(i, i + 50)) });
  if (!res.ok) { console.error('insert failed', res.status, await res.text()); process.exit(1); }
}
const cnt = await fetch(`${URL_}/rest/v1/creator_workbench_items?select=id&kind=eq.queue`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
console.log('queue rows in table now:', cnt.headers.get('content-range'));
