// «صناع المحتوى» v2 — search / synonyms / score / filters (shared by the edge function and the screen).
// Run: node test-creator-match.mjs
import {
  normalizeText, normalizeHandle, parseQuery, matchRow, scoreCreator, searchCreators, isUgc, isSkincare, skeleton, statusOf, V1_STATUS, STATUSES,
} from './supabase/functions/_shared/creatorMatch.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };
const NOW = Date.parse('2026-10-06T12:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 864e5).toISOString().slice(0, 10);

// ---- fixtures (fake, test only) ----
const A = { id: 'a', handle: 'reem.skin', handle_key: 'reem.skin', name: 'Reem Skin', platform: 'instagram', country: 'SY', governorate: 'damascus', location_confidence: 'high', creator_type: 'skincare', content_types: ['ugc', 'unboxing', 'reels'], skincare_focus: ['serums', 'sunscreen'], followers: 8400, engagement_pct: 4.1, last_active_at: daysAgo(5), source: 'Google Search', status: 'verified' };
const B = { id: 'b', handle: 'lana_reviews', handle_key: 'lana_reviews', name: 'لانا', platform: 'instagram', country: 'SY', governorate: 'damascus', location_confidence: 'medium', creator_type: 'reviewer', content_types: ['review', 'ugc'], skincare_focus: [], followers: 3200, engagement_pct: 2.0, last_active_at: daysAgo(40), source: 'Instagram', status: 'needs_review' };
const C = { id: 'c', handle: 'big_fashion', handle_key: 'big_fashion', name: 'Big Fashion', platform: 'instagram', country: 'SY', governorate: 'damascus', location_confidence: 'medium', creator_type: 'general', category: 'fashion', content_types: ['reels'], skincare_focus: [], followers: 250000, engagement_pct: 0.5, source: 'Modash', status: 'needs_review', bio: 'fashion and food' };
const D = { id: 'd', handle: 'halab.beauty', handle_key: 'halab.beauty', name: 'حلا', platform: 'instagram', country: 'SY', governorate: 'aleppo', location_confidence: 'medium', creator_type: 'beauty', content_types: ['unboxing'], skincare_focus: ['face_care'], followers: 15000, engagement_pct: null, source: 'Manual', status: 'discovered' };
const E = { id: 'e', handle: 'old_row', handle_key: 'old_row', name: 'Old Row', platform: 'instagram', followers: null, engagement_pct: null, status: 'new', category: 'beauty', notes: 'عندها UGC حسب الريفرال' };
const F = { id: 'f', handle: 'dr.hiba.derm', handle_key: 'dr.hiba.derm', name: 'Dr. Hiba', platform: 'instagram', country: 'SY', governorate: 'latakia', location_confidence: 'low', creator_type: 'expert', content_types: [], skincare_focus: [], followers: 60000, engagement_pct: 25.2, source: 'Google Search', status: 'needs_review' };
const ALL = [A, B, C, D, E, F];

// ---- normalisation ----
ok(normalizeText('العِنايةُ بالبشرة') === 'العنايه بالبشره', 'tashkeel + ة');
ok(normalizeText('إدلب') === 'ادلب', 'hamza alef');
ok(normalizeHandle('@Creator') === 'creator', '@handle');
ok(normalizeHandle('creator') === 'creator', 'bare handle');
ok(normalizeHandle('https://instagram.com/creator/') === 'creator', 'url handle');
ok(normalizeHandle('https://www.instagram.com/Creator/?hl=en') === 'creator', 'url with query + case');
ok(normalizeHandle('instagram.com/creator') === 'creator', 'url without scheme');
ok(normalizeHandle('two words') === null, 'spaces invalid');
ok(skeleton('ريم') === skeleton('Reem'), `skeleton ريم/Reem ${skeleton('ريم')} ${skeleton('Reem')}`);
ok(skeleton('حنين') === skeleton('Hanin'), 'skeleton حنين/Hanin');
ok(skeleton('ياسمين') === skeleton('Yasmin'), 'skeleton ياسمين/Yasmin');
ok(skeleton('سارة') === skeleton('Sarah'), 'skeleton سارة/Sarah');

// ---- parseQuery: the three requests from the brief ----
const p1 = parseQuery('بدي UGC Skincare بدمشق');
ok(p1.concepts.map((c) => c.key).join() === 'ugc,skincare,geo:damascus' && p1.words.length === 0, `p1 ${JSON.stringify(p1.concepts.map((c) => c.key))} ${p1.words}`);
const p2 = parseQuery('بدي بنت تصور Unboxing لمنتجات العناية بالبشرة بحلب');
ok(['unboxing', 'skincare', 'geo:aleppo'].every((k) => p2.concepts.some((c) => c.key === k)) && p2.words.length === 0, `p2 ${JSON.stringify(p2.concepts.map((c) => c.key))} ${p2.words}`);
const p3 = parseQuery('بدي Micro Creator في سوريا عنده محتوى Skincare');
ok(['micro', 'country:SY', 'skincare'].every((k) => p3.concepts.some((c) => c.key === k)) && p3.words.length === 0, `p3 ${JSON.stringify(p3.concepts.map((c) => c.key))} ${p3.words}`);
ok(parseQuery('ريف دمشق').concepts[0]?.key === 'geo:rif_dimashq', 'phrase beats single word');
ok(parseQuery('@reem.skin').handles[0] === 'reem.skin', '@ handle query');
ok(parseQuery('سيروم').concepts[0]?.key === 'serums', 'سيروم -> serums');
ok(parseQuery('Serum').concepts[0]?.key === 'serums', 'Serum -> serums');
ok(parseQuery('عناية بالبشرة').concepts[0]?.key === 'skincare', 'عناية بالبشرة -> skincare');
ok(parseQuery('Aleppo').concepts[0]?.key === 'geo:aleppo' && parseQuery('حلب').concepts[0]?.key === 'geo:aleppo', 'aleppo AR/EN');

// ---- search behaviour ----
const ids = (res) => res.rows.map((r) => r.id).join(',');
const s = (q, extra = {}) => searchCreators(ALL, { q, now: NOW, ...extra });
ok(s('ugc').rows.some((r) => r.id === 'e'), 'ugc finds the text-only mention (notes)');
ok(s('ugc').rows[0].id !== 'e', 'text-only UGC ranks below proven UGC');
ok(!s('ugc').rows.some((r) => r.id === 'c'), 'ugc excludes fashion row');
const dm = s('UGC دمشق');
ok(dm.rows.map((r) => r.id).join() === 'a,b', `UGC دمشق -> a,b (${ids(dm)})`);
ok(s('سيروم').rows[0].id === 'a', 'سيروم: exact focus first');
ok(s('سيروم').rows.some((r) => r.id === 'f'), 'سيروم also surfaces skincare experts');
ok(!s('سيروم').rows.some((r) => r.id === 'c'), 'سيروم excludes fashion');
ok(s('ريم').rows[0]?.id === 'a', 'Arabic name finds Latin name (ريم -> Reem)');
ok(s('@REEM.SKIN').rows.length === 1, '@handle case-insensitive');
ok(s('reem').rows[0]?.id === 'a', 'English name');
ok(s('دكتور').rows.some((r) => r.id === 'f'), 'دكتور -> expert');
ok(s('Aleppo').rows.map((r) => r.id).join() === 'd', 'Aleppo geo');
ok(s('micro').rows.map((r) => r.id).sort().join() === 'd,f', 'micro = 10K–100K with known followers only');
ok(s('instagram').total === ALL.length, 'instagram platform');
ok(s('zzzz').total === 0, 'nonsense returns nothing');

// ---- strict filters ----
ok(isUgc(A) && isUgc(B) && isUgc(D) && !isUgc(C) && !isUgc(E), 'UGC filter = proven by fields only (not bio/notes)');
ok(isSkincare(A) && isSkincare(D) && isSkincare(F) && !isSkincare(B) && !isSkincare(C) && !isSkincare(E), 'Skincare filter excludes fashion/beauty-only');
ok(s('', { filters: { ugcOnly: true } }).rows.map((r) => r.id).sort().join() === 'a,b,d', 'ugcOnly');
ok(s('', { filters: { skincareOnly: true } }).rows.map((r) => r.id).sort().join() === 'a,d,f', 'skincareOnly');
ok(s('', { filters: { governorate: 'damascus' } }).total === 3, 'governorate filter');
ok(s('', { filters: { status: 'needs_review' } }).rows.some((r) => r.id === 'e'), 'legacy status "new" counts as needs_review');
ok(s('', { filters: { content_types: ['ugc', 'unboxing'] } }).rows.map((r) => r.id).join() === 'a', 'content types = all selected');
const cnt = s('').counts;
ok(cnt.ugc === 3 && cnt.skincare === 3 && cnt.governorate.damascus === 3, `counts ${JSON.stringify(cnt)}`);

// ---- score ----
const sa = scoreCreator(A, NOW);
ok(sa.score === 30 + 25 + 5 + 10 + 10 + 5 + 5 && sa.badge === 'excellent', `A score ${sa.score}`);
const sc = scoreCreator(C, NOW);
ok(sc.score < 45 && sc.badge === 'low', `C (250K fashion) low priority ${sc.score}`);
ok(scoreCreator(B, NOW).score > sc.score, 'small UGC reviewer beats big general influencer');
const se = scoreCreator(E, NOW);
ok(se.parts.activity === 0 && se.parts.engagement === 0 && se.parts.location === 0, 'unknown fields give 0 points');
ok(se.missing.includes('التفاعل غير متوفر') && se.missing.includes('عدد المتابعين غير متوفر') && se.missing.includes('الدولة غير متحقَّقة'), 'unknown fields listed as missing');
ok(scoreCreator(F, NOW).missing.some((m) => m.includes('غير اعتيادي')), '25% engagement flagged, not rewarded');
ok(scoreCreator({ ...A, status: 'rejected' }, NOW).badge === 'unfit', 'rejected -> unfit badge');
ok(!s('').rows.some((r) => r.followers === 0 && r.id === 'e'), 'no invented follower count');
ok(sa.reasons.some((x) => x.includes('UGC')) && sa.reasons.some((x) => x.includes('دمشق')), 'reasons built from fields');
ok(s('', { sort: 'followers' }).rows[0].id === 'c' && s('', { sort: 'followers' }).rows.at(-1).id === 'e', 'most followers, unknown last');
ok(s('', { sort: 'small' }).rows[0].id === 'b' && s('', { sort: 'small' }).rows.at(-1).id === 'e', 'small creators first, unknown last');
ok(s('', { sort: 'best' }).rows[0].id === 'a', 'best match default');
ok(s('', { pageSize: 2, page: 2 }).rows.length === 2 && s('', { pageSize: 2, page: 2 }).total === 6, 'pagination');

// ---- statuses ----
ok(statusOf('new') === 'needs_review' && statusOf('approved') === 'verified' && statusOf('posted') === 'collaborating', 'legacy -> v2');
ok(STATUSES.every((st) => V1_STATUS[st]), 'every v2 status has a v1 fallback');
ok(matchRow(A, parseQuery('')) === 1, 'empty query matches');

// ---- discovery helpers ----
const { parsePastedCandidates, buildDiscoveryQueries, discoveryHashtags } = await import('./src/services/creatorDiscovery.js');
const pc = parsePastedCandidates('https://www.instagram.com/Demo_One/\n@demo_one\nhttps://www.instagram.com/p/abc123/\ndemo.two, https://example.com/x');
ok(pc.candidates.map((c) => c.handle.toLowerCase()).join() === 'demo_one,demo.two', `paste dedupe ${JSON.stringify(pc)}`);
ok(pc.invalid.length === 2, 'post link + non-social URL rejected');
const dq = buildDiscoveryQueries();
ok(dq.length > 100 && dq.every((x) => x.url.startsWith('https://www.google.com/search?q=site%3Ainstagram.com')), 'queries: Google site:instagram.com links');
ok(buildDiscoveryQueries({ governorate: 'aleppo' }).every((x) => x.group === 'حلب'), 'governorate-scoped queries');
ok(discoveryHashtags('SY').length > 0 && discoveryHashtags('TR').length === 0, 'hashtags per country');

console.log(`creator-match: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
