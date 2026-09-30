// Integration checks: the generated Syria seed (wave 1 + 2) run through the real logic layer.
import fs from 'node:fs';
// research data is kept out of git (public contact details): without it these integration checks are skipped, not failed
if (!["data/creators/syria/seed/creators_seed.json","data/creators/syria/raw/benchmarks.json"].every(p => fs.existsSync(p))) { console.log('SKIPPED: research data files not present ('+"data/creators/syria/seed/creators_seed.json, data/creators/syria/raw/benchmarks.json"+')'); process.exit(0); }
import * as L from './src/services/creatorLogic.js';
import * as R from './src/services/creatorResearch.js';

let p = 0, f = 0;
const ok = (n, c) => { if (c) p++; else { f++; console.log('FAIL', n); } };
const seed = JSON.parse(fs.readFileSync('data/creators/syria/seed/creators_seed.json', 'utf8')).records;
const bench = JSON.parse(fs.readFileSync('data/creators/syria/raw/benchmarks.json', 'utf8'));
const now = new Date('2026-09-30T12:00:00Z');
const dmType = t => /_dm$|messenger/.test(t);

ok('seed loaded', seed.length >= 200);
ok('every record: >=1 source with URL + type + observed date + confidence', seed.every(r => r.sources.length >= 1 && r.sources.every(s => s.source_url && s.source_type && s.observed_at && s.confidence)));
ok('every platform profile URL parses and matches its handle', seed.every(r => r.platforms.every(x => { const q = L.parseProfileUrl(x.profile_url); return q.ok && q.handle === x.handle.toLowerCase() && q.platform === x.platform; })));
ok('no duplicate ids or platform+handle across creators', new Set(seed.map(r => r.id)).size === seed.length && new Set(seed.flatMap(r => r.platforms.map(x => x.platform + ':' + x.handle.toLowerCase()))).size === seed.flatMap(r => r.platforms).length);
ok('contacts: public, sourced, dated; non-DM contacts carry classification context', seed.every(r => r.contacts.every(c => c.is_public === true && c.source_url && c.verified_at && c.type)) && seed.every(r => r.contacts.filter(c => !dmType(c.type) && c.type !== 'website').every(c => c.context && /\[/.test(c.context))));
ok('phones are normalized international format', seed.every(r => r.contacts.filter(c => ['phone', 'whatsapp'].includes(c.type)).every(c => /^\+\d{9,15}$/.test(c.value))));
ok('DM channels never claimed as "open"', seed.every(r => r.contacts.filter(c => dmType(c.type)).every(c => /NOT verified/.test(c.context))));
ok('gifting acceptance only with evidence', seed.every(r => r.accepts_gifting === 'unknown' || (r.pr_evidence.gifting || []).length > 0));
ok('accepts_product_exchange never guessed', seed.every(r => r.accepts_product_exchange === 'unknown'));
ok('known_paid only with rate-card/management basis', seed.every(r => r.paid_status !== 'known_paid' || /rate-card|management/.test(r.paid_basis || '')));
ok('paid_collaboration=yes only when known_paid', seed.every(r => (r.paid_collaboration === 'yes') === (r.paid_status === 'known_paid')));
ok('UGC medium/high always has evidence url + type + reviewed_at', seed.filter(r => ['medium', 'high'].includes(r.ugc_potential)).every(r => r.ugc_evidence_url && r.ugc_evidence_type && r.ugc_reviewed_at));
ok('UGC never high without visual review', seed.every(r => r.ugc_potential !== 'high' || r.ugc_evidence_type === 'visual_review'));
ok('category present => has evidence; absent => coverage_gap says why', seed.every(r => (r.main_category ? (r.category_evidence || []).length > 0 : /category/.test(r.coverage_gap || ''))));
ok('city only with a stated source', seed.every(r => r.creator_city === null || r.city_source));
ok('audience only from a provider that states it (Modash)', seed.every(r => r.audience.length === 0 || r.providers.includes('modash')));
ok('creator country vs audience are separate fields', seed.every(r => 'creator_country' in r && 'audience_syria_pct' in r));
ok('activity status is one of the allowed values and never inferred without a date', seed.every(r => ['active_30d', 'active_90d', 'inactive_90d', 'unknown'].includes(r.activity_status) && (r.last_post_at || r.activity_status === 'unknown')));
ok('inactive only when justified by a stated basis', seed.every(r => r.activity_status !== 'inactive_90d' || /fresh crawl|already dormant/.test(r.activity_basis)));
ok('tier is computed from followers', seed.every(r => r.tier === L.tierKey(r.follower_count)));
ok('unknown followers stay unknown', seed.filter(r => r.follower_count === null).every(r => r.tier === 'unknown'));
ok('scores are null (not 0) when inputs are missing', seed.filter(r => r.audience_syria_pct === null && r.platforms[0].engagement_rate === null).every(r => r.scores.audience_fit_score === null));
ok('data quality score in range and independent of priority', seed.every(r => r.data_quality_score >= 0 && r.data_quality_score <= 100) && new Set(seed.map(r => r.data_quality_score)).size > 10);
ok('data quality parts sum to score', seed.every(r => Object.values(r.data_quality_parts).reduce((a, b) => a + b, 0) === r.data_quality_score));
ok('every record has a why (machine + human)', seed.every(r => r.why && Array.isArray(r.why.reasons) && typeof r.why.text_en === 'string' && r.why.text_en.length > 10));
ok('cross-platform same-handle => flagged for manual review, never merged', seed.filter(r => r.duplicate_group).every(r => r.needs_manual_review && r.duplicate_confidence < 0.7));
ok('multi-platform creators come only from self-declared links', seed.filter(r => r.platforms.length > 1).every(r => r.providers.includes('influencer_sy')));
ok('pools recomputed from fields match stored pools', seed.every(r => JSON.stringify(R.poolsOf({ ...r })) === JSON.stringify(r.pools)));
ok('pr pool members satisfy the documented rule', seed.filter(r => r.pools.includes('pr_pool')).every(r => ['high', 'medium'].includes(r.pr_fit) && r.follower_count < 100000 && !r.is_celebrity && r.activity_status !== 'inactive_90d'));
ok('benchmarks: none is Syria-scoped (none exists); every one has full provenance', bench.sources.every(s => s.market_scope !== 'syria' && R.validateBenchmark({ source: s.source, source_url: s.source_url, country: s.country, market_scope: s.market_scope, platform: s.platform, creator_tier: s.tiers[0].creator_tier, format: s.format, low: s.tiers[0].low, mid: Math.round(Math.sqrt(s.tiers[0].low * s.tiers[0].high)), high: s.tiers[0].high, currency: s.currency, date: s.date, confidence: s.confidence }).ok));

// estimator against the real benchmark files: estimate only, honest scope, never for tiers without a row
const rows = bench.sources[0].tiers.flatMap(t => t.tier_keys.map(k => ({ platform: 'any', content_format: 'post', tier_key: k, low: t.low, mid: Math.round(Math.sqrt(t.low * t.high)), high: t.high, currency: 'USD' })));
const mena = { source: bench.sources[0].source, source_url: bench.sources[0].source_url, date: bench.sources[0].date, scope: 'mena', confidence: 'low', rows };
const priced = seed.map(r => ({ r, e: L.estimateRate({ follower_count: r.follower_count, average_views: r.platforms[0].avg_views, engagement_rate: r.platforms[0].engagement_rate, audience_syria_pct: r.audience_syria_pct, platform: r.platforms[0].platform, content_format: 'reel', market: 'syria' }, mena) }));
ok('estimates exist only where a benchmark tier row exists', priced.every(({ r, e }) => (e === null) === (r.tier === 'unknown' || r.tier === 'under_1k')));
ok('all estimates are labelled Estimated with scope=mena and confidence <= medium', priced.filter(x => x.e).every(({ e }) => e.label === 'Estimated' && e.basis.benchmark_scope === 'mena' && ['low', 'medium'].includes(e.confidence)));

// campaign workflow on the real PR pool
const flat = seed.map(r => ({ ...r, city: r.creator_city, creator_priority_score: r.priority_score, campaign_ids: [] }));
const pr = L.applyFilters(flat, { market: 'syria', tier: ['under_1k', '1k_5k', '5k_10k', '10k_25k', '25k_50k'], pr_fit: ['high', 'medium'] }, now);
const sel = L.selectForCampaign(pr, 300);
ok('PR selection reports the true shortfall, no padding', sel.selected.length === pr.length && sel.shortfall === 300 - pr.length && /Only \d+ qualified/.test(sel.message));
ok('recently-active filter uses real dates only', L.applyFilters(flat, { recentlyActiveDays: 30 }, now).every(r => r.last_post_at && (now - new Date(r.last_post_at)) / 864e5 <= 30));
ok('assignment covers everyone exactly once', (() => { const d = L.distributeAssignments(sel.selected.map(r => r.id), ['A', 'B', 'C', 'D']); const all = Object.values(d).flat(); return all.length === sel.selected.length && new Set(all).size === all.length; })());
const csv = L.toCsv(flat.map(r => ({ ...r, follower_count: r.follower_count })));
ok('csv roundtrip keeps count and Arabic names', L.parseCsv(csv).length === flat.length && L.parseCsv(csv).some(r => /[؀-ۿ]/.test(r.Name)));

console.log(`creator seed integration: ${p} passed, ${f} failed`);
console.log(`PR candidates 1K–50K (pr_fit high/medium): ${pr.length}`);
process.exit(f === 0 ? 0 : 1);
