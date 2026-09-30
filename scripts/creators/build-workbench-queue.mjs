// Builds the human-review queue file for the Creator Review & Outreach Workbench from the Syria seed.
// Output: data/creators/syria/seed/workbench_queue.json  (load it in the workbench with "تحميل الطابور"; do NOT host it publicly).
import fs from 'node:fs';
import path from 'node:path';
import { buildQueue } from '../../src/services/creatorReview.js';

const seed = JSON.parse(fs.readFileSync(path.resolve('data/creators/syria/seed/creators_seed.json'), 'utf8'));
const queue = buildQueue(seed.records);
const tiers = { 1: 0, 2: 0, 3: 0 }; queue.forEach(q => { tiers[q.queue_tier]++; });
const out = {
  version: 1, generated_at: new Date().toISOString(), source_seed_generated_at: seed.generated_at, market: 'syria',
  tier_definitions: { 1: 'PR ∪ Expert ∪ UGC pools — review first', 2: 'remaining Paid pool (50K+ or known paid)', 3: 'other creators with a public business contact or a beauty category' },
  counts: { total: queue.length, ...tiers }, records: queue,
};
fs.writeFileSync(path.resolve('data/creators/syria/seed/workbench_queue.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.counts), 'bytes', fs.statSync(path.resolve('data/creators/syria/seed/workbench_queue.json')).size);
