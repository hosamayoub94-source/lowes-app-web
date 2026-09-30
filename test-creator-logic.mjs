import * as L from './src/services/creatorLogic.js';

let p = 0, f = 0;
const ok = (n, c) => { if (c) p++; else { f++; console.log('FAIL', n); } };

// tiers
ok('tier unknown', L.tierOf(null) === null && L.tierKey('') === 'unknown');
ok('tier 999', L.tierKey(999) === 'under_1k');
ok('tier 1000', L.tierKey(1000) === '1k_5k');
ok('tier 11500', L.tierKey(11500) === '10k_25k');
ok('tier 1m', L.tierKey(1000000) === '1m_plus');
ok('tier string', L.tierKey('25,000') === '25k_50k');

// freshness
const now = new Date('2026-09-30');
ok('fresh', L.freshness('2026-09-20', now) === 'fresh');
ok('aged', L.freshness('2026-08-01', now) === 'aged');
ok('stale', L.freshness('2026-05-01', now) === 'stale');
ok('fresh unknown', L.freshness(null, now) === 'unknown');
ok('fresh cfg', L.freshness('2026-09-20', now, { freshDays: 5, agedDays: 90 }) === 'aged');

// url parsing
const u1 = L.parseProfileUrl('https://www.instagram.com/Some.User/');
ok('ig parse', u1.ok && u1.platform === 'instagram' && u1.handle === 'some.user');
ok('tiktok parse', L.parseProfileUrl('tiktok.com/@abc_1').handle === 'abc_1');
ok('yt parse', L.parseProfileUrl('https://youtube.com/@chan').handle === 'chan');
ok('invalid url', !L.parseProfileUrl('not a url ::').ok);
ok('unsupported host', L.parseProfileUrl('https://example.com/x').error === 'unsupported_host');
ok('post url rejected', L.parseProfileUrl('https://instagram.com/p/xyz').error === 'not_a_profile_url');
ok('empty url', L.parseProfileUrl('').error === 'empty_url');

// arabic names
ok('arabic sim same', L.nameSimilarity('مريم الأحمد', 'مريم الاحمد') === 1);
ok('arabic sim diff', L.nameSimilarity('مريم الأحمد', 'سارة خليل') < 0.5);

// duplicates
const base = { display_name: 'Maryam X', platforms: [{ platform: 'instagram', handle: 'maryam.x' }] };
ok('dup by handle', L.duplicateCheck({ display_name: 'مريم', platforms: [{ platform: 'instagram', profile_url: 'https://instagram.com/Maryam.X' }] }, base).decision === 'duplicate');
ok('name-only => manual_review', L.duplicateCheck({ display_name: 'Maryam X', platforms: [{ platform: 'tiktok', handle: 'other' }] }, base).decision === 'manual_review');
ok('distinct', L.duplicateCheck({ display_name: 'Sara K', platforms: [{ platform: 'tiktok', handle: 'sk' }] }, base).decision === 'distinct');
ok('dup by email', L.duplicateCheck({ display_name: 'A', platforms: [], contacts: [{ type: 'email', value: 'A@B.com' }] }, { display_name: 'B', platforms: [], contacts: [{ type: 'email', value: 'a@b.com' }] }).decision === 'duplicate');
ok('multi platform same creator', L.duplicateCheck({ display_name: 'M', platforms: [{ platform: 'instagram', handle: 'm1' }, { platform: 'tiktok', handle: 'm2' }] }, { display_name: 'Z', platforms: [{ platform: 'tiktok', handle: 'm2' }] }).decision === 'duplicate');

// verification
ok('ver A', L.verificationLevel([{ provider: 'web', source_url: 'https://a.com/1' }, { provider: 'modash', source_url: 'https://modash.io/x' }], true) === 'A');
ok('ver B', L.verificationLevel([{ provider: 'web', source_url: 'https://a.com/1' }], true) === 'B');
ok('ver C', L.verificationLevel([], true) === 'C');
ok('ver unknown', L.verificationLevel([], false) === 'Unknown');

// contactability
ok('contact 0', L.contactabilityScore([]) === 0);
ok('contact needs source', L.contactabilityScore([{ type: 'email' }]) === 0);
ok('contact hierarchy: email(90)+whatsapp => 95', L.contactabilityScore([{ type: 'email', source_url: 'x' }, { type: 'whatsapp', source_url: 'x' }]) === 95);
ok('contact hierarchy: management beats email', L.bestContact([{ type: 'email', source_url: 'x' }, { type: 'management', source_url: 'x' }]).rank === 1);
ok('contact hierarchy: DM-only is low', L.contactabilityScore([{ type: 'instagram_dm', source_url: 'x' }]) === 35 && L.contactabilityScore([{ type: 'tiktok_dm', source_url: 'x' }]) === 30 && L.contactabilityScore([{ type: 'facebook_messenger', source_url: 'x' }]) === 25);
ok('contact hierarchy order', ['management','email','whatsapp','phone','website','instagram_dm','tiktok_dm','facebook_messenger'].map(t => L.contactRank({ type: t })).every((r, k, a) => k === 0 || r >= a[k-1]));
ok('no contact => rank 9', L.bestContact([]).rank === 9);

// rate
const bm = { source: 'test-benchmark', date: '2026-09-01', scope: 'syria', rows: [{ platform: 'instagram', content_format: 'reel', tier_key: '10k_25k', low: 20, mid: 35, high: 50, currency: 'USD' }] };
ok('rate null without benchmark', L.estimateRate({ follower_count: 12000, platform: 'instagram', content_format: 'reel' }, null) === null);
ok('rate null without inputs', L.estimateRate({ platform: 'instagram', content_format: 'reel' }, bm) === null);
ok('rate null no row', L.estimateRate({ follower_count: 900000, platform: 'instagram', content_format: 'reel' }, bm) === null);
const est = L.estimateRate({ follower_count: 12000, platform: 'instagram', content_format: 'reel' }, bm);
ok('rate estimated label', est && est.label === 'Estimated' && est.estimated_mid === 35 && est.basis.benchmark_source === 'test-benchmark' && est.confidence === 'low');
ok('rate exclusivity mult', L.estimateRate({ follower_count: 12000, platform: 'instagram', content_format: 'reel', exclusivity: true }, bm).estimated_mid === 46);
ok('rate display unknown', L.rateDisplay(null, null).unknown === true);
const rd = L.rateDisplay({ amount: 60, currency: 'USD', source: 'direct reply', date: '2026-09-30' }, est);
ok('quoted separate from estimated', rd.quoted.amount === 60 && rd.estimated.estimated_mid === 35 && !rd.unknown);

// scores
const s0 = L.computeScores({});
ok('scores all null', s0.creator_priority_score === null && s0.audience_fit_score === null && s0.paid_score === null);
const s1 = L.computeScores({ audience_syria_pct: 70, main_category: 'skincare', subcategories: ['beauty'], engagement_rate: 4, average_views: 2000, follower_count: 10000, ugc_potential: 'high', pr_fit: 'medium', contactability_score: 50 });
ok('scores computed', s1.audience_fit_score === 70 && s1.creator_priority_score > 0 && s1.authenticity_score === null);

// growth
ok('growth unknown', L.growthStatus([{ followers: 100, captured_at: '2026-09-01' }]).growth_status === 'unknown');
ok('growth rising', L.growthStatus([{ followers: 1000, captured_at: '2026-08-01' }, { followers: 1300, captured_at: '2026-09-01' }]).growth_status === 'rising');

// filters
const rows = [
  { id: '1', display_name: 'مريم', market: 'syria', main_category: 'skincare', follower_count: 12000, city: 'damascus', audience_syria_pct: 70, pr_fit: 'high', last_verified_at: '2026-09-25', creator_status: 'qualified', platforms: [{ platform: 'instagram', handle: 'm' }] },
  { id: '2', display_name: 'Sara', market: 'syria', main_category: 'fashion', follower_count: 80000, city: 'aleppo', platforms: [{ platform: 'tiktok', handle: 's' }] },
  { id: '3', display_name: 'X', market: 'turkey', main_category: 'skincare', follower_count: null, platforms: [] },
];
ok('filter market', L.applyFilters(rows, { market: 'syria' }, now).length === 2);
ok('filter tier', L.applyFilters(rows, { tier: ['10k_25k'] }, now).length === 1);
ok('filter unknown tier', L.applyFilters(rows, { tier: ['unknown'] }, now).length === 1);
ok('filter audience unknown excluded', L.applyFilters(rows, { minAudienceSyria: 50 }, now).length === 1);
ok('filter arabic search', L.applyFilters(rows, { q: 'مريم' }, now).length === 1);
ok('filter platform', L.applyFilters(rows, { platform: ['tiktok'] }, now).length === 1);
ok('filter freshness', L.applyFilters(rows, { freshness: ['fresh'] }, now).length === 1);

// campaign selection
const sel = L.selectForCampaign([{ id: 'a', creator_priority_score: 50 }, { id: 'b', creator_priority_score: 80 }, { id: 'c', creator_status: 'do_not_contact' }], 300);
ok('shortfall not padded', sel.selected.length === 2 && sel.shortfall === 298 && /Only 2 qualified/.test(sel.message) && sel.selected[0].id === 'b');
const d = L.distributeAssignments(['1', '2', '3', '4', '5'], ['A', 'B']);
ok('distribute', d.A.length === 3 && d.B.length === 2);

// csv
const csv = L.toCsv([{ display_name: 'مريم, "x"', follower_count: 12000, platforms: [{ platform: 'instagram', handle: 'm', profile_url: 'https://instagram.com/m' }], contacts: [{ type: 'email', value: 'a@b.com' }], estimate: est }]);
const back = L.parseCsv(csv);
ok('csv roundtrip arabic+quotes', back.length === 1 && back[0].Name === 'مريم, "x"' && back[0].Tier === '10K–25K' && back[0].Email === 'a@b.com');
ok('csv estimate labelled', /Estimated/.test(back[0]['Estimated Rate']));
const good = L.validateImportRow({ Name: 'A', URL: 'https://instagram.com/aa', Followers: '5000', source_url: 'https://x.com/s', source_provider: 'web' });
ok('import good', good.ok && good.value.handle === 'aa');
ok('import junk url', !L.validateImportRow({ Name: 'A', URL: 'foo', source_url: 'x', source_provider: 'web' }).ok);
ok('import missing source', L.validateImportRow({ Name: 'A', URL: 'https://instagram.com/aa', source_provider: 'web' }).errors.includes('missing_source_url'));
ok('import bad followers', L.validateImportRow({ Name: 'A', URL: 'https://instagram.com/aa', Followers: 'abc', source_url: 'x', source_provider: 'web' }).errors.includes('invalid_followers'));
ok('import bad provider', L.validateImportRow({ Name: 'A', URL: 'https://instagram.com/aa', source_url: 'x', source_provider: 'zzz' }).errors.includes('invalid_or_missing_provider'));

// coverage
const cm = L.coverageMatrix(rows, ['skincare', 'fashion'], ['10k_25k', '50k_100k']);
ok('coverage', cm.skincare['10k_25k'] === 1 && cm.fashion['50k_100k'] === 1);

console.log(`creator logic: ${p} passed, ${f} failed`);
process.exit(f === 0 ? 0 : 1);
