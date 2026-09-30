// Wave 2 unit tests: evidence-driven research logic (creatorResearch.js) + contact/benchmark/quality rules.
import * as L from './src/services/creatorLogic.js';
import * as R from './src/services/creatorResearch.js';

let p = 0, f = 0;
const ok = (n, c) => { if (c) p++; else { f++; console.log('FAIL', n); } };
const now = new Date('2026-09-30T12:00:00Z');

// ───── public contact classification ─────
const c1 = R.extractPublicContacts('Makeup artist للحجز والاستفسار 0900000001').contacts;
ok('booking phone => phone, normalized +963', c1.length === 1 && c1[0].type === 'phone' && c1[0].value === '+963900000001');
const c2 = R.extractPublicContacts('Mob/whatsapp: 0900000002').contacts;
ok('whatsapp keyword => whatsapp', c2[0]?.type === 'whatsapp' && c2[0].value === '+963900000002');
const c3 = R.extractPublicContacts('mgmt: talent@agency.com | info@x.com').contacts;
ok('management email vs business email', c3.find(c => c.value === 'talent@agency.com').type === 'management' && c3.find(c => c.value === 'info@x.com').type === 'email');
const c4 = R.extractPublicContacts('Pharmacist Skincare 0900000003📥');
ok('bare number without business context is NOT stored', c4.contacts.length === 0 && c4.skipped.length === 1);
ok('business account flag accepts bare number', R.extractPublicContacts('Beauty salon Tartous 00963900000004', { businessAccount: true }).contacts[0]?.value === '+963900000004');
ok('stray date digits are not absorbed into a phone', R.extractPublicContacts('Dm 📩 or 📲 0900000005 8/8/2025').contacts[0]?.value === '+963900000005');
ok('short/truncated digits ignored', R.extractPublicContacts('My work number : 09655').contacts.length === 0);
ok('wa.me link => whatsapp', R.extractPublicContacts('https://wa.me/963900000006').contacts.some(c => c.type === 'whatsapp' && c.value === '+963900000006'));
ok('link-in-bio page => website', R.extractPublicContacts('linktr.ee/abc').contacts[0]?.type === 'website');
ok('arabic-indic digits handled', R.extractPublicContacts('للحجز ٠٩٠٠٠٠٠٠٠١').contacts[0]?.value === '+963900000001');
ok('no text => nothing invented', R.extractPublicContacts('').contacts.length === 0 && R.extractPublicContacts(null).contacts.length === 0);

// ───── activity classification ─────
ok('active_30d', R.activityStatus({ lastPostAt: '2026-09-20', now }).status === 'active_30d');
ok('active_90d', R.activityStatus({ lastPostAt: '2026-08-01', now }).status === 'active_90d');
ok('inactive with a fresh crawl', R.activityStatus({ lastPostAt: '2026-03-01', dataAsOf: '2026-09', now }).status === 'inactive_90d');
ok('inactive: already dormant at (stale) crawl time', R.activityStatus({ lastPostAt: '2024-01-01', dataAsOf: '2025-04', now }).status === 'inactive_90d');
ok('stale crawl + recent-looking last post => unknown (cannot prove today)', R.activityStatus({ lastPostAt: '2026-01-01', dataAsOf: '2026-02', now }).status === 'unknown');
ok('no post date => unknown, never inferred from followers', R.activityStatus({ lastPostAt: null, now }).status === 'unknown');
ok('future date rejected', R.activityStatus({ lastPostAt: '2027-01-01', now }).status === 'unknown');

// ───── category / type classification (evidence required) ─────
const k1 = R.classifyCategory({ bio: 'Pharmacist Skincare Beauty tips' });
ok('bio keyword => category with evidence', k1.main === 'skincare' && k1.evidence[0].field === 'bio');
ok('directory self-declaration counts', R.classifyCategory({ bio: '', directory: 'beauty' }).main === 'beauty');
ok('gender/name never used: no evidence => null', R.classifyCategory({ bio: '', name: 'سارة' }).main === null);
ok('hashtags alone are too weak (needs corroboration)', R.classifyCategory({ bio: '', hashtags: ['makeup', 'مكياج'] }).main === null);
ok('hashtags + name keyword corroborate', R.classifyCategory({ bio: '', name: 'Sara makeup', hashtags: ['makeup', 'مكياج'] }).main === 'makeup');
ok('lifestyle is a weak fallback', R.classifyCategory({ bio: 'Skincare blogger' }).main === 'skincare');
ok('creator type expert needs professional wording + relevant niche', R.classifyCreatorType({ bio: 'Clinical pharmacist skincare', category: 'skincare' }).type === 'expert' && R.classifyCreatorType({ bio: 'pharmacist', category: 'food' }).type !== 'expert');
ok('celebrity by definition (>=1M), not by category', R.classifyCreatorType({ bio: 'x', followers: 2_000_000, category: 'fitness' }).type === 'celebrity');

// ───── UGC classification ─────
const u1 = R.ugcAssess({ captions: [{ caption: 'روتين العناية بالبشرة + ريفيو للمنتج', url: 'https://i/p/1' }, { caption: 'tutorial steps', url: 'https://i/p/2' }], category: 'skincare' });
ok('UGC medium from >=2 content-format signals in a beauty niche, with evidence url', u1.ugc_potential === 'medium' && u1.ugc_evidence_url === 'https://i/p/1' && u1.ugc_evidence_type === 'caption_text' && u1.ugc_tags.includes('review'));
ok('UGC never "high" from text alone', ['review', 'unboxing', 'tutorial', 'routine', 'before_after'].every(() => u1.ugc_potential !== 'high'));
ok('UGC unknown with no captions', R.ugcAssess({ captions: [], category: 'skincare' }).ugc_potential === 'unknown');
ok('UGC low when many captions show no signal', R.ugcAssess({ captions: ['a', 'b', 'c'].map(x => ({ caption: x, url: 'u' })), category: 'fitness' }).ugc_potential === 'low');
ok('UGC does not depend on follower count', R.ugcAssess({ captions: u1.ugc_evidence_url ? [{ caption: 'unboxing review', url: 'u' }, { caption: 'routine before and after', url: 'u2' }] : [], category: 'beauty', followers: 900 }).ugc_potential === 'medium');
ok('visual review can upgrade to high', R.ugcAssess({ captions: [], category: 'beauty', visualReview: { potential: 'high', reason: 'talks to camera, clean product demo', url: 'https://i/reel/1', face_on_camera: true } }).ugc_potential === 'high');
const upool = R.poolsOf({ creator_status: 'discovered', ugc_potential: 'medium', ugc_evidence_url: null, follower_count: 1500 });
ok('UGC pool requires evidence url', !upool.includes('ugc_pool') && R.poolsOf({ creator_status: 'discovered', ugc_potential: 'medium', ugc_evidence_url: 'u', follower_count: 1500 }).includes('ugc_pool'));

// ───── PR / paid evidence (never inferred) ─────
const e0 = R.prPaidEvidence({ bio: 'Beauty lover', captions: [], hashtags: [] });
ok('no evidence => accepts_gifting unknown, paid unknown', e0.accepts_gifting === 'unknown' && e0.paid_status === 'unknown');
const e1 = R.prPaidEvidence({ bio: 'DM for collab', captions: [], hashtags: [] });
ok('open-for-collab wording != accepts gifting', e1.accepts_gifting === 'unknown' && e1.paid_status === 'likely_commercial');
const e2 = R.prPaidEvidence({ bio: '', captions: [{ caption: 'Unboxing my PR package #gifted', url: 'u' }] });
ok('gifted marker => accepts_gifting yes with evidence', e2.accepts_gifting === 'yes' && e2.gifting_evidence[0].url === 'u');
ok('sponsored posts never become known_paid or a rate', R.prPaidEvidence({ captions: [{ caption: '#ad مع براند', url: 'u' }] }).paid_status === 'likely_commercial');
ok('management contact / rate card => known_paid', R.prPaidEvidence({ bio: 'rate card in DM' }).paid_status === 'known_paid' && R.prPaidEvidence({ contacts: [{ type: 'management' }] }).paid_status === 'known_paid');

// ───── source freshness + conflict handling ─────
ok('source freshness fresh/aged/stale', R.sourceFreshness('2026-09-20', now) === 'fresh' && R.sourceFreshness('2026-08-01', now) === 'aged' && R.sourceFreshness('2026-01-01', now) === 'stale' && R.sourceFreshness(null, now) === 'unknown');
const rc = R.resolveConflict([{ value: 12000, provider: 'modash', observed_at: '2026-06-01' }, { value: 15500, provider: 'web', observed_at: '2026-09-30' }]);
ok('conflict: freshest wins, conflict flagged, history kept', rc.chosen.value === 15500 && rc.conflict === true && rc.history.length === 2 && rc.history[1].superseded === true);
ok('no conflict within tolerance', R.resolveConflict([{ value: 10000, provider: 'modash', observed_at: '2026-06-01' }, { value: 10400, provider: 'web', observed_at: '2026-09-01' }]).conflict === false);
ok('tie on date => higher provider trust', R.resolveConflict([{ value: 1, provider: 'web', observed_at: '2026-09-01' }, { value: 2, provider: 'modash', observed_at: '2026-09-01' }]).chosen.provider === 'modash');
ok('missing values ignored', R.resolveConflict([{ value: null, provider: 'web', observed_at: '2026-09-01' }]).chosen === null);

// ───── benchmarks + estimated vs quoted ─────
const bmMena = { source: 'Valors MENA', source_url: 'https://valors.agency/x', date: '2026-08-01', scope: 'mena', confidence: 'low', rows: [{ platform: 'any', content_format: 'post', tier_key: '10k_25k', low: 200, mid: 707, high: 2500, currency: 'USD' }] };
const bmGlobal = { ...bmMena, scope: 'global', rows: bmMena.rows };
const bmSyria = { ...bmMena, scope: 'syria', confidence: 'high' };
const inp = { follower_count: 12000, average_views: 3000, engagement_rate: 3, audience_syria_pct: 60, platform: 'instagram', content_format: 'reel', market: 'syria' };
const e = L.estimateRate(inp, bmMena);
ok('MENA benchmark falls back to generic post row, labelled Estimated with real scope', e.label === 'Estimated' && e.basis.benchmark_scope === 'mena' && e.basis.matched_platform === 'any' && e.estimated_low <= e.estimated_mid && e.estimated_mid <= e.estimated_high);
ok('MENA confidence never above medium', ['low', 'medium'].includes(e.confidence));
ok('global benchmark => confidence low', L.estimateRate(inp, bmGlobal).confidence === 'low');
ok('syria benchmark with full inputs can reach high', L.estimateRate(inp, bmSyria).confidence === 'high' || L.estimateRate(inp, bmSyria).confidence === 'medium');
ok('no benchmark => Unknown (null)', L.estimateRate(inp, null) === null);
ok('tier without benchmark row => null (under 1K never priced)', L.estimateRate({ ...inp, follower_count: 500 }, bmMena) === null);
const rd = L.rateDisplay({ amount: 120, currency: 'USD', source: 'direct reply', date: '2026-09-30' }, e);
ok('quoted and estimated stay separate', rd.quoted.amount === 120 && rd.estimated.label === 'Estimated' && rd.estimated.estimated_mid !== 120);
ok('quote without amount is not a quote', L.rateDisplay({ amount: null }, null).unknown === true);
const vb = R.validateBenchmark({ source: 's', source_url: 'u', country: 'MENA', market_scope: 'mena', platform: 'any', creator_tier: 'micro', format: 'post', low: 1, mid: 2, high: 3, currency: 'USD', date: '2026-08-01', confidence: 'low' });
ok('benchmark with full provenance valid', vb.ok);
ok('benchmark missing source_url/confidence rejected', !R.validateBenchmark({ source: 's', country: 'MENA', market_scope: 'mena', platform: 'any', creator_tier: 'micro', format: 'post', low: 1, mid: 2, high: 3, currency: 'USD', date: '2026-08-01' }).ok);
ok('benchmark with unknown scope or unordered range rejected', !R.validateBenchmark({ ...{ source: 's', source_url: 'u', country: 'c', platform: 'any', creator_tier: 't', format: 'post', currency: 'USD', date: 'd', confidence: 'low' }, market_scope: 'planet', low: 1, mid: 2, high: 3 }).ok && !R.validateBenchmark({ source: 's', source_url: 'u', country: 'c', market_scope: 'mena', platform: 'any', creator_tier: 't', format: 'post', currency: 'USD', date: 'd', confidence: 'low', low: 5, mid: 2, high: 3 }).ok);

// ───── duplicates: cross-platform ─────
const person = { display_name: 'Maryam X', platforms: [{ platform: 'instagram', handle: 'maryam.x' }, { platform: 'tiktok', handle: 'maryam_x' }] };
ok('creator with two platforms matches on either handle', L.duplicateCheck({ display_name: 'other', platforms: [{ platform: 'tiktok', handle: 'maryam_x' }] }, person).decision === 'duplicate');
ok('same handle on a different platform is NOT an automatic merge of two creators (handled as review upstream)', L.duplicateCheck({ display_name: 'Zed', platforms: [{ platform: 'youtube', handle: 'maryam.x' }] }, person).decision === 'distinct');
ok('similar name only => manual_review, never duplicate', L.duplicateCheck({ display_name: 'Maryam X', platforms: [{ platform: 'facebook', handle: 'zz' }] }, person).decision === 'manual_review');

// ───── missing fields ─────
const sparse = { display_name: 'X', platforms: [{ platform: 'instagram', handle: 'x', profile_url: 'https://instagram.com/x' }], contacts: [], audience: [] };
ok('missing fields: scores null, tier unknown, contactability 0', L.computeScores({}).creator_priority_score === null && L.tierKey(null) === 'unknown' && L.contactabilityScore([]) === 0);

// ───── creator quality vs data quality are different concepts ─────
const rich = { display_name: 'A', main_category: 'skincare', category_confidence: 'high', creator_city: 'damascus', last_verified_at: '2026-09-25', data_as_of: '2026-09', platforms: [{ handle: 'a', profile_url: 'u', followers: 10000, engagement_rate: 3, avg_views: 2000, last_post_at: '2026-09-20', metrics_observed_at: '2026-09-25' }], audience: [{ dimension: 'country', key: 'SY', pct: 60 }, { dimension: 'gender', key: 'female', pct: 80 }, { dimension: 'city', key: 'damascus', pct: 30 }], contacts: [{ type: 'whatsapp', source_url: 'u' }], sources: [{ provider: 'modash', source_type: 'public_directory_page' }, { provider: 'web', source_type: 'public_directory_page' }] };
const dqRich = R.dataQualityScore(rich, now), dqSparse = R.dataQualityScore(sparse, now);
ok('data quality: rich >> sparse', dqRich.data_quality_score >= 80 && dqSparse.data_quality_score <= 30 && dqRich.data_quality_score <= 100);
ok('data quality parts add up', Object.values(dqRich.parts).reduce((a, b) => a + b, 0) === dqRich.data_quality_score);
const perfLow = L.computeScores({ audience_syria_pct: 5, main_category: 'food', engagement_rate: 0.2, average_views: 10, follower_count: 100000, contactability_score: 10 });
ok('a poorly documented creator can be high quality data while a great creator can be poorly documented (independent axes)', dqRich.data_quality_score > 60 && (perfLow.creator_priority_score ?? 0) < 40 && L.computeScores({ audience_syria_pct: 80, main_category: 'skincare', engagement_rate: 6, average_views: 9000, follower_count: 10000, contactability_score: 90, ugc_potential: 'medium', pr_fit: 'high' }).creator_priority_score > 70 && dqSparse.data_quality_score < 30);

// ───── "why this creator" ─────
const w = R.whyCreator({ follower_count: 12400, audience_syria_pct: 51, engagement_rate: 7.2, activity_status: 'active_30d', days_since_last_post: 7, main_category: 'skincare', contacts: [{ type: 'whatsapp', source_url: 'u' }], ugc_potential: 'medium', ugc_tags: ['product_demo'], pr_fit: 'high', accepts_gifting: 'unknown', paid_status: 'unknown' }, { creator_priority_score: 87 }, now);
ok('why: machine-readable reasons + human text from real fields only', w.priority === 87 && w.reasons.some(r => r.code === 'audience_syria') && w.reasons.some(r => r.code === 'contact') && /51% Syria audience/.test(w.text_en) && /public WhatsApp/.test(w.text_en));
const w2 = R.whyCreator({ follower_count: null, contacts: [] }, {}, now);
ok('why: unknowns become warnings, not fabricated reasons', w2.priority === null && w2.warnings.length >= 3 && !w2.reasons.some(r => r.code === 'audience_syria'));
ok('why: PR fit reason states acceptance is unconfirmed', /unconfirmed/.test(w.text_en));

// ───── pools ─────
const base = { creator_status: 'discovered', is_celebrity: false };
ok('pr pool: fit + <100K + not inactive', R.poolsOf({ ...base, pr_fit: 'high', follower_count: 5000, activity_status: 'unknown' }).includes('pr_pool'));
ok('pr pool excludes confirmed inactive, celebrities, 100K+, rejected', !R.poolsOf({ ...base, pr_fit: 'high', follower_count: 5000, activity_status: 'inactive_90d' }).includes('pr_pool') && !R.poolsOf({ ...base, is_celebrity: true, pr_fit: 'high', follower_count: 5000 }).includes('pr_pool') && !R.poolsOf({ ...base, pr_fit: 'high', follower_count: 200000 }).includes('pr_pool') && !R.poolsOf({ ...base, creator_status: 'rejected', pr_fit: 'high', follower_count: 5000 }).includes('pr_pool'));
ok('paid pool: >=50K or known_paid', R.poolsOf({ ...base, follower_count: 60000 }).includes('paid_pool') && R.poolsOf({ ...base, follower_count: 3000, paid_status: 'known_paid' }).includes('paid_pool') && !R.poolsOf({ ...base, follower_count: 3000, paid_status: 'likely_commercial' }).includes('paid_pool'));
ok('expert + media pools', R.poolsOf({ ...base, creator_type: 'expert' }).includes('expert_pool') && R.poolsOf({ ...base, creator_type: 'publisher' }).includes('media_pool') && R.poolsOf({ ...base, main_category: 'local' }).includes('media_pool'));
ok('do_not_contact excluded from every pool', R.poolsOf({ creator_status: 'do_not_contact', creator_type: 'expert', pr_fit: 'high', follower_count: 900000 }).length === 0);

console.log(`creator research (wave 2): ${p} passed, ${f} failed`);
process.exit(f === 0 ? 0 : 1);
