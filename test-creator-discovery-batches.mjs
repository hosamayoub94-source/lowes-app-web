// Discovery batches: tier order, category balance, review flags kept apart, no duplicates, no padding. Run: node test-creator-discovery-batches.mjs
import { planBatches, balanceTier, bucketOf, tierOf, splitReviewFlags, poolRowToQueueRecord } from './src/services/creatorDiscoveryBatches.js';
import { assignReviewers } from './src/services/creatorReview.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };
const R = (platform, username, followers, topics = [], extra = {}) => ({ platform, username, followers, provider_topics: topics, category: null, city: null, syria_signal: 'medium', needs_verification: false, discovery: { url: 'u', evidence: 'e', searched_at: '2026-10-01' }, ...extra });

// tiers
ok(tierOf(500).key === 't1_500_2500' && tierOf(2499).key === 't1_500_2500' && tierOf(2500).key === 't2_2500_5000', 'tier boundaries');
ok(tierOf(10000).key === 't4_10000_25000' && tierOf(25000).key === 't5_25000_plus' && tierOf(499).key === 't6_under_500' && tierOf(null).key === 't7_unknown', 'tier edges incl. unknown');

// buckets: own confirmed category wins, then provider topic, never invented
ok(bucketOf(R('instagram', 'a', 1000, ['Food'], { category: 'skincare' })) === 'beauty', 'own category first');
ok(bucketOf(R('instagram', 'a', 1000, ['Travel'])) === 'travel_lifestyle' && bucketOf(R('instagram', 'a', 1000, [])) === 'unclassified', 'topic mapping / unclassified');

// balance: 30 beauty + 3 food + 2 home in one tier -> first 6 picks contain all three buckets
const rows = [...Array.from({ length: 30 }, (_, i) => R('instagram', `b${i}`, 1000, ['Beauty and Self Care'])), ...Array.from({ length: 3 }, (_, i) => R('instagram', `f${i}`, 1000, ['Food'])), ...Array.from({ length: 2 }, (_, i) => R('instagram', `h${i}`, 1000, ['Home and Garden']))];
const bal = balanceTier(rows);
ok(bal.length === 35, 'balance keeps every row');
const first6 = new Set(bal.slice(0, 6).map(bucketOf)); ok(first6.size === 3, 'first picks cover all buckets: ' + [...first6]);
ok(bal.slice(0, 9).filter(r => bucketOf(r) === 'beauty').length <= 4, 'beauty does not flood the start');

// review flags are kept apart, never dropped
const pool = [R('instagram', 'shop_x', 1000, [], { possible_non_creator: true }), R('instagram', 'same', 1500), R('tiktok', 'same', 1500), R('instagram', 'ok1', 1200), R('tiktok', 'ok2', 3000), R('instagram', 'big', 80000), R('instagram', 'nofol', null)];
const split = splitReviewFlags(pool);
ok(split.needsReview.length === 3 && split.eligible.length === 4, 'non-creator + cross-platform pair go to needs_review');
ok(split.needsReview.find(r => r.username === 'shop_x').review_reasons.includes('possible_non_creator'), 'reason recorded');

// plan: one tier per batch, ordered small -> large, no duplicates, totals add up
const plan = planBatches(pool, { size: 2 });
ok(plan.totals.pool === 7 && plan.totals.eligible + plan.totals.needs_review === 7, 'nothing lost');
ok(plan.batches.every(b => new Set(b.rows.map(r => tierOf(r.followers ?? null).key)).size === 1), 'a batch never mixes tiers');
const order = plan.batches.map(b => b.tier); ok(JSON.stringify(order) === JSON.stringify([...order].sort()), 'tiers served small -> large, unknown last: ' + order);
ok(plan.batches[0].rows[0].username === 'ok1', 'first account is from the 500-2.5K tier');
const all = plan.batches.flatMap(b => b.rows.map(r => `${r.platform}:${r.username}`)); ok(new Set(all).size === all.length, 'no duplicate across batches');
ok(plan.notes.some(n => n.includes('500–2.5K')), 'shortage in the smallest tier is reported, not padded');

// deterministic
ok(JSON.stringify(planBatches(pool, { size: 2 }).batches.map(b => b.rows.map(r => r.username))) === JSON.stringify(plan.batches.map(b => b.rows.map(r => r.username))), 'deterministic');

// pool row -> queue record: separate cohort, nothing invented, deterministic id
const pr = R('instagram', 'Some.User', 1800, ['Beauty and Self Care'], { profile_url: 'https://www.instagram.com/some.user', display_name: 'Some User', city: 'aleppo' });
const rec = poolRowToQueueRecord(pr, { batch: 'B001', now: new Date('2026-10-01T10:00:00Z') });
ok(rec.id === 'CRT-DSC-IN-some.user' && rec.cohort === 'discovery' && rec.batch === 'B001' && rec.queue_tier === 5, 'discovery record: id/cohort/batch/tier 5 (never tier 1 = pilot)');
ok(rec.main_category === null && rec.contacts.length === 0 && rec.audience_syria_pct === null && rec.verification_level === 'C' && rec.needs_manual_review === true, 'nothing invented; review mandatory');
ok(rec.creator_city === 'aleppo' && rec.follower_count === 1800 && rec.tier === '1k_5k' && rec.platforms[0].handle === 'some.user', 'known facts carried, handle normalised');
ok(poolRowToQueueRecord(R('tiktok', 'x', null, []), {}).follower_count === null && poolRowToQueueRecord(R('tiktok', 'x', null, []), {}).tier === 'unknown', 'unknown followers stay null');
ok(rec.sources[0].provider === 'discovery' && rec.sources[0].note === 'e', 'discovery source kept as evidence');
const recs = [1, 2, 3, 4, 5, 6].map(i => poolRowToQueueRecord(R('instagram', 'u' + i, 1000, []), { batch: 'B001' }));
const am = assignReviewers(recs, ['A', 'B', 'C']); ok(Object.keys(am).length === 6 && ['A', 'B', 'C'].every(n => Object.values(am).filter(v => v === n).length === 2), 'batch spreads evenly over the team');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
