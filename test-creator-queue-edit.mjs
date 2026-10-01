// Queue editing: add by hand / soft-remove / restore + merge of concurrent edits. Run: node test-creator-queue-edit.mjs
import { buildManualRecord, removeFromQueue, restoreToQueue, findInQueue, recordStamp } from './src/services/creatorQueueEdit.js';
import { createLocalStore } from './src/services/creatorReviewStore.js';
import { createSyncedStore } from './src/services/creatorWorkbenchSync.js';
import { deriveVerdict, queueProgress, latestReviews, emptyReview } from './src/services/creatorReview.js';
import { pilotReport } from './src/services/creatorPilot.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };
const base = { id: 'c1', display_name: 'Existing', queue_tier: 1, platforms: [{ platform: 'instagram', handle: 'existing_one', profile_url: 'https://instagram.com/existing_one' }] };
const good = { display_name: 'سارة', profile_url: 'https://www.instagram.com/Sara.Beauty/', followers: '12,500', main_category: 'skincare', city: 'damascus', source: 'https://example.com/post/1', note: '' };

// --- add ---
const a = buildManualRecord(good, [base], 'hosam ayoub', new Date('2026-10-01T10:00:00Z'));
ok(a.ok, 'valid add: ' + (a.errors || ''));
const r = a.record;
ok(r.platforms[0].handle === 'sara.beauty' && r.platforms[0].platform === 'instagram', 'handle/platform parsed from the URL');
ok(r.follower_count === 12500 && r.tier === '10k_25k', 'followers parsed, tier computed');
ok(r.added_manually && r.added_by === 'hosam ayoub' && r.added_at === '2026-10-01T10:00:00.000Z', 'who/when recorded');
ok(r.sources[0].provider === 'manual' && r.sources[0].source_url === 'https://example.com/post/1', 'source kept as evidence');
ok(r.contacts.length === 0 && r.audience_syria_pct === null && r.verification_level === 'C', 'nothing invented: no contacts, unknown audience, level C');
ok(r.queue_tier === 1 && /^CRT-MAN-/.test(r.id), 'queue 1 + manual id');
ok(buildManualRecord({ ...good, followers: '' }, [], 'x').record.follower_count === null, 'unknown followers stay null');
ok(buildManualRecord({ ...good, source: 'تعرّفت عليها بالمعرض' }, [], 'x').record.sources[0].note === 'تعرّفت عليها بالمعرض', 'text source stored as note');

// --- validation / duplicates ---
const bad = (patch, why) => ok(!buildManualRecord({ ...good, ...patch }, [base], 'x').ok, why);
bad({ display_name: ' ' }, 'name required'); bad({ profile_url: 'not a url' }, 'bad url'); bad({ profile_url: 'https://example.com/a' }, 'unsupported host');
bad({ source: '' }, 'source required'); bad({ followers: 'abc' }, 'bad followers'); bad({ main_category: 'cars' }, 'bad category'); bad({ city: 'paris' }, 'bad city');
const dup = buildManualRecord({ ...good, profile_url: 'instagram.com/EXISTING_ONE' }, [base], 'x');
ok(!dup.ok && dup.duplicate_of === 'c1', 'duplicate handle blocked (case-insensitive)');

// --- remove / restore ---
const removed = removeFromQueue(base, 'hosam ayoub', 'مكرر', new Date('2026-10-01T11:00:00Z'));
ok(removed.removed.reason === 'مكرر' && removed.id === 'c1' && removed.display_name === 'Existing', 'soft remove keeps the record');
ok(findInQueue([removed], 'instagram', 'existing_one') && !buildManualRecord({ ...good, profile_url: 'instagram.com/existing_one' }, [removed], 'x').ok, 'a removed creator cannot be re-added (restore instead)');
const restored = restoreToQueue(removed);
ok(!restored.removed && restored.restored_at, 'restore clears removed');

// --- removed creators leave pilot numbers; their reviews are kept ---
const reviews = latestReviews([{ ...emptyReview('c1', 'A'), active: 'no' }]);
const inScope = [base, r].filter(q => !q.removed); const afterRemove = [removed, r].filter(q => !q.removed);
ok(queueProgress(inScope, reviews, (rv, q) => deriveVerdict(rv, q, { strict: true })).total === 2 && queueProgress(afterRemove, reviews, (rv, q) => deriveVerdict(rv, q, { strict: true })).total === 1, 'removed creator leaves the progress denominator');
const rep = pilotReport({ queue: [r], reviews: [], members: [], issues: [], mergeRejected: 0, strict: true });
ok(rep.data.manually_added === 1 && rep.data.scope_total === 1, 'report counts manually added creators');

// --- concurrency: the later add/remove/restore wins in the sync merge ---
const rm2 = removeFromQueue(base, 'x', 'مكرر', new Date(Date.now() - 1000));
ok(recordStamp(rm2) > recordStamp(base) && recordStamp(restoreToQueue(rm2)) > recordStamp(rm2), 'stamps order edits');
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };
const table = new Map();
const client = { async fetchAll() { return { rows: [...table.values()].map(x => JSON.parse(JSON.stringify(x))) }; }, async upsert(rows) { rows.forEach(x => table.set(`${x.kind}|${x.id}`, { kind: x.kind, id: x.id, data: JSON.parse(JSON.stringify(x.data)) })); return {}; } };
const tick = () => new Promise(res => setTimeout(res, 5));
table.set('queue|c1', { kind: 'queue', id: 'c1', data: base });
const A = createSyncedStore(createLocalStore(mem()), client, 'A'); const B = createSyncedStore(createLocalStore(mem()), client, 'B');
await A.sync(); await B.sync();
A.saveQueue(A.loadQueue().map(q => removeFromQueue(q, 'A', 'مكرر', new Date(Date.now() + 1000)))); await tick();
await B.sync();
ok(B.loadQueue()[0].removed?.by === 'A', 'B sees the removal made by A');
B.saveQueue(B.loadQueue().map(q => ({ ...restoreToQueue(q), restored_at: new Date(Date.now() + 5000).toISOString() }))); await tick();
await A.sync();
ok(!A.loadQueue()[0].removed, 'a later restore by B wins on A');
B.saveQueue([...B.loadQueue(), r]); await tick(); await A.sync();
ok(A.loadQueue().length === 2 && A.loadQueue().some(q => q.id === r.id), 'a manually added creator reaches the other browser');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
