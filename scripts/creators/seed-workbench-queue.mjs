// One-off: load the review queue into the shared table creator_workbench_items (kind='queue'), idempotent upsert.
// usage: node scripts/creators/seed-workbench-queue.mjs [queue.json]   (default data/creators/syria/seed/workbench_queue.json)
// Uses the public publishable key through RLS (same as the app). Writes only kind='queue' rows. Re-running is safe.
import fs from 'node:fs';

const URL_ = 'https://fghdumrgimoeqsafdhhh.supabase.co';
const KEY = 'sb_publishable_iYn5Rc00ZmdLPUBH5_09fg_eLiok3UO';
const file = process.argv[2] || 'data/creators/syria/seed/workbench_queue.json';
const recs = JSON.parse(fs.readFileSync(file, 'utf8')).records;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Accept-Profile': 'public', 'Content-Profile': 'public' };

const probe = await fetch(`${URL_}/rest/v1/creator_workbench_items?select=kind&limit=1`, { headers: H });
if (!probe.ok) { console.error('table not reachable', probe.status, await probe.text()); process.exit(1); }

const rows = recs.map(r => ({ kind: 'queue', id: r.id, data: r, updated_by: 'seed-script' }));
for (let i = 0; i < rows.length; i += 50) {
  const res = await fetch(`${URL_}/rest/v1/creator_workbench_items?on_conflict=kind,id`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 50)) });
  if (!res.ok) { console.error('insert failed', res.status, await res.text()); process.exit(1); }
}
const cnt = await fetch(`${URL_}/rest/v1/creator_workbench_items?select=id&kind=eq.queue`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
console.log('queue rows in table:', cnt.headers.get('content-range'));
