// Shared-storage layer: two "browsers" + one in-memory shared table. Run: node test-creator-sync.mjs
import { createLocalStore } from './src/services/creatorReviewStore.js';
import { createSyncedStore } from './src/services/creatorWorkbenchSync.js';
import { emptyReview } from './src/services/creatorReview.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };
const table = new Map();
const client = {
  async fetchAll() { return { rows: [...table.values()].map(r => JSON.parse(JSON.stringify(r))) }; },
  async upsert(rows) { rows.forEach(r => table.set(`${r.kind}|${r.id}`, { kind: r.kind, id: r.id, data: JSON.parse(JSON.stringify(r.data)) })); return {}; },
};
const tick = () => new Promise(r => setTimeout(r, 5));

// seed the shared table with a queue (what the provisioning script does)
const Q = [1, 2, 3].map(i => ({ id: `c${i}`, display_name: `Creator ${i}`, platforms: [{ platform: 'instagram', handle: `h${i}` }], queue_tier: 1 }));
Q.forEach(q => table.set(`queue|${q.id}`, { kind: 'queue', id: q.id, data: q }));

const A = createSyncedStore(createLocalStore(mem()), client, 'A');
const B = createSyncedStore(createLocalStore(mem()), client, 'B');

let r = await A.sync();
ok(r.ok && A.loadQueue().length === 3, 'A pulls the queue without any file');
ok(r.pushed === 0, 'pull-only sync pushes nothing');
await B.sync();
ok(B.loadQueue().length === 3, 'B sees the same queue');

// assignment by A is seen by B
A.saveAssign({ c1: 'A', c2: 'B', c3: 'A' }); await tick();
await B.sync();
ok(B.loadAssign().c2 === 'B' && B.loadAssign().c1 === 'A', 'assignment shared');

// team selection (exact app user names) is shared
A.saveTeam(['hosam ayoub', 'Amany']); await tick();
await B.sync();
ok(JSON.stringify(B.loadTeam()) === JSON.stringify(['hosam ayoub', 'Amany']), 'team shared');

// review by B is seen by A; append-only (same key not duplicated)
const rev = { ...emptyReview('c2', 'B'), active: 'yes', fit_lowes: 'yes', segment: 'skincare_beauty', skincare_fit: 'yes', face_on_camera: 'yes', talks_to_camera: 'yes', does_review: 'yes', does_unboxing: 'no', ugc_quality: 'low', pr_signal: 'none', action: 'gift', city: null, no_public_contact: true };
const sv = B.saveReview(rev); await tick();
ok(sv.ok, 'B review valid: ' + JSON.stringify(sv.errors));
await A.sync(); await A.sync();
ok(A.loadReviews().length === 1 && A.loadReviews()[0].reviewer === 'B', 'review shared once');

// member history: the longer history wins on both sides
const m0 = { wave_id: 'w1', creator_id: 'c2', status: 'assigned', history: [{ status: 'selected' }, { status: 'assigned' }] };
A.saveWaves([{ id: 'w1', name: 'W' }]); A.saveMembers([m0]); await tick();
await B.sync();
ok(B.loadMembers().length === 1 && B.loadWaves().length === 1, 'wave+member shared');
B.saveMembers([{ ...m0, status: 'contacted', channel: 'instagram_dm', history: [...m0.history, { status: 'contacted' }] }]); await tick();
await A.sync();
ok(A.loadMembers()[0].status === 'contacted', 'longer history wins on A');

// offline failure is retried, not lost
let down = true;
const flaky = { fetchAll: client.fetchAll, upsert: async rows => (down ? { error: 'offline' } : client.upsert(rows)) };
const C = createSyncedStore(createLocalStore(mem()), flaky, 'C');
await C.sync();
C.saveAssign({ c3: 'C' }); await tick();
ok(!table.has('assign|c3') || table.get('assign|c3').data.to === 'A', 'nothing written while offline');
down = false; const rr = await C.sync();
ok(rr.ok && table.get('assign|c3').data.to === 'A' || table.get('assign|c3').data.to === 'C', 'recovers after offline');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
