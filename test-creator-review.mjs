// Review & Outreach Workbench: pure-logic tests (verdicts, evidence rules, waves, outreach funnel, storage, import/export).
import fs from 'node:fs';
// research data is kept out of git (public contact details): without it these integration checks are skipped, not failed
if (!["data/creators/syria/seed/creators_seed.json","data/creators/syria/seed/workbench_queue.json"].every(p => fs.existsSync(p))) { console.log('SKIPPED: research data files not present ('+"data/creators/syria/seed/creators_seed.json, data/creators/syria/seed/workbench_queue.json"+')'); process.exit(0); }
import * as V from './src/services/creatorReview.js';
import * as S from './src/services/creatorReviewStore.js';
import * as L from './src/services/creatorLogic.js';

let p = 0, f = 0;
const ok = (n, c) => { if (c) p++; else { f++; console.log('FAIL', n); } };
const now = new Date('2026-09-30T12:00:00Z');
const seed = JSON.parse(fs.readFileSync('data/creators/syria/seed/creators_seed.json', 'utf8')).records;
const queueFile = JSON.parse(fs.readFileSync('data/creators/syria/seed/workbench_queue.json', 'utf8'));

const base = (o = {}) => ({ ...V.emptyReview('C1', 'Rana', now), ...o });
const creator = { id: 'C1', display_name: 'Test', creator_type: null, contacts: [{ type: 'instagram_dm', value: 'u', source_url: 'https://instagram.com/x', is_public: true }], platforms: [{ platform: 'instagram', handle: 'x', profile_url: 'https://instagram.com/x', followers: 9000 }], follower_count: 9000, priority_score: 60, data_quality_score: 50, creator_status: 'discovered', pools: [] };
const pr = (o = {}) => base({ active: 'yes', last_post_seen: '2026-09-25', fit_lowes: 'yes', segment: 'skincare_beauty', skincare_fit: 'yes', action: 'gift', ...o });

// ───── validation ─────
ok('empty review is structurally valid except reviewer', V.validateReview(V.emptyReview('C1', 'Rana', now), now).ok);
ok('reviewer required', !V.validateReview(base({ reviewer: null }), now).ok);
ok('invalid enum rejected', V.validateReview(base({ active: 'maybe' }), now).errors.includes('active:invalid'));
ok('future last_post_seen rejected', V.validateReview(base({ last_post_seen: '2027-01-01' }), now).errors.includes('last_post_seen:future'));
ok('active=yes with a 200-day-old post is contradictory', V.validateReview(base({ active: 'yes', last_post_seen: '2026-01-01' }), now).errors.includes('active_yes_but_last_post_older_than_90d'));
ok('invalid video url rejected', V.validateReview(base({ video_urls: ['not a url'] }), now).errors.some(e => e.startsWith('video_urls')));
ok('human contact needs a source url', V.validateReview(base({ contacts: [{ type: 'email', value: 'a@b.com' }] }), now).errors.some(e => e.includes('source_url')));
ok('human contact: invalid email / phone rejected', V.validateReview(base({ contacts: [{ type: 'email', value: 'nope', source_url: 'https://x.com' }, { type: 'whatsapp', value: '12', source_url: 'https://x.com' }] }), now).errors.length >= 2);
ok('gifted_seen needs an evidence url', V.validateReview(base({ pr_signal: 'gifted_seen' }), now).errors.includes('pr_evidence_url:required_for_gifted_seen'));
ok('city must be a known key', !V.validateReview(base({ city: 'atlantis' }), now).ok && V.validateReview(base({ city: 'aleppo' }), now).ok);

// ───── verdicts ─────
ok('unanswered => needs_review with missing list (never a guess)', (() => { const v = V.deriveVerdict(base(), creator); return v.primary === 'needs_review' && v.missing.includes('active') && v.missing.includes('fit_lowes') && v.missing.includes('action'); })());
ok('content does not fit => not_relevant', V.deriveVerdict(pr({ fit_lowes: 'no' }), creator).primary === 'not_relevant');
ok('inactive => not_relevant', V.deriveVerdict(pr({ active: 'no' }), creator).primary === 'not_relevant');
ok('reviewer says no collaboration => not_relevant', V.deriveVerdict(pr({ action: 'none' }), creator).primary === 'not_relevant');
ok('PR Ready: active + fit + skincare fit + gift + reachable', V.deriveVerdict(pr(), creator).labels.includes('pr_ready'));
ok('PR Ready needs skincare fit unless lifestyle/expert segment', V.deriveVerdict(pr({ skincare_fit: 'unsure' }), creator).primary === 'needs_review' && V.deriveVerdict(pr({ skincare_fit: 'no', segment: 'lifestyle_women' }), creator).labels.includes('pr_ready') && V.deriveVerdict(pr({ skincare_fit: 'no' }), creator).primary !== 'pr_ready');
ok('PR Ready requires a reachable contact (any rank<=8)', V.deriveVerdict(pr(), { ...creator, contacts: [] }).labels.includes('pr_ready') === false);
const ugc = { face_on_camera: 'yes', talks_to_camera: 'yes', ugc_quality: 'high', video_urls: ['https://instagram.com/reel/abc'], action: 'ugc' };
ok('UGC Ready needs face + talk/review/unboxing + quality + video evidence', V.deriveVerdict(pr(ugc), creator).labels.includes('ugc_ready') && V.deriveVerdict(pr(ugc), creator).primary === 'ugc_ready');
ok('UGC recommended without evidence => flagged missing, not ugc_ready', (() => { const v = V.deriveVerdict(pr({ ...ugc, video_urls: [] }), creator); return !v.labels.includes('ugc_ready') && v.missing.some(m => m.startsWith('ugc_evidence')); })());
ok('UGC quality "low" is not UGC Ready', !V.deriveVerdict(pr({ ...ugc, ugc_quality: 'low' }), creator).labels.includes('ugc_ready'));
ok('Paid Inquiry', V.deriveVerdict(pr({ action: 'paid' }), creator).labels.includes('paid_inquiry'));
ok('Expert label from creator type or segment', V.deriveVerdict(pr({ segment: 'expert', skincare_fit: 'yes' }), creator).labels.includes('expert') && V.deriveVerdict(pr(), { ...creator, creator_type: 'expert' }).labels.includes('expert'));
ok('labels can co-exist; primary order ugc > pr > expert > paid', (() => { const v = V.deriveVerdict(pr({ ...ugc, segment: 'expert' }), creator); return v.labels.includes('ugc_ready') && v.labels.includes('pr_ready') && v.labels.includes('expert') && v.primary === 'ugc_ready'; })());

// ───── applying a review ─────
const applied = V.applyReview(creator, pr({ ...ugc, city: 'aleppo', pr_signal: 'gifted_seen', pr_evidence_url: 'https://instagram.com/p/gift', contacts: [{ type: 'whatsapp', value: '0900000007', source_url: 'https://instagram.com/x' }], reviewed_at: now.toISOString(), seconds: 70 }), now);
ok('human review sets fresh activity with its basis', applied.activity_status === 'active_30d' && /human review by Rana/.test(applied.activity_basis));
ok('city gets a human source', applied.creator_city === 'aleppo' && /human review/.test(applied.city_source));
ok('human contact added as human_verified and improves best rank', applied.contacts.some(c => c.source_type === 'human_verified' && c.type === 'whatsapp') && applied.best_contact_rank === 3);
ok('UGC high only via visual review with evidence url', applied.ugc_potential === 'high' && applied.ugc_evidence_type === 'visual_review' && applied.ugc_evidence_url === 'https://instagram.com/reel/abc');
ok('accepts_gifting yes only with evidence url', applied.accepts_gifting === 'yes' && applied.gifting_evidence_url && V.applyReview(creator, pr({ pr_signal: 'open_to_collab' }), now).accepts_gifting !== 'yes');
ok('not relevant => rejected status, low fit, out of pools', (() => { const a = V.applyReview({ ...creator, pr_fit: 'high', pools: ['pr_pool'] }, pr({ fit_lowes: 'no' }), now); return a.creator_status === 'rejected' && a.pr_fit === 'low' && a.pools.length === 0; })());
ok('applied record enters ugc_pool and pr_pool via the pool rules', applied.pools.includes('ugc_pool') && applied.pools.includes('pr_pool'));
ok('inactive marked by human => inactive_90d', V.applyReview(creator, pr({ active: 'no', last_post_seen: null }), now).activity_status === 'inactive_90d');
ok('review time and reviewer stored', applied.review_seconds === 70 && applied.reviewed_by === 'Rana' && applied.human_reviewed === true);
ok('why text mentions the review reasons', /Review:/.test(applied.why_text));

// ───── queue ─────
const q = V.buildQueue(seed);
ok('queue tier 1 = union of PR/Expert/UGC pools (46)', q.filter(x => x.queue_tier === 1).length === new Set(seed.filter(r => r.pools.some(pl => ['pr_pool', 'expert_pool', 'ugc_pool'].includes(pl))).map(r => r.id)).size);
ok('queue ordered by tier then contact then priority', q.every((x, i) => i === 0 || q[i - 1].queue_tier <= x.queue_tier));
ok('queue carries sample post links for 60–90s review', q.filter(x => x.queue_tier === 1 && x.sample_posts.length).length >= 30 && q.every(x => x.platforms.every(pl => /^https?:/.test(pl.profile_url))));
ok('queue file matches builder', queueFile.records.length === q.length);
const asg = V.assignReviewers(q, ['A', 'B', 'C']);
ok('reviewer assignment balanced within 1', (() => { const c = {}; Object.values(asg).forEach(n => { c[n] = (c[n] || 0) + 1; }); const v = Object.values(c); return Math.max(...v) - Math.min(...v) <= 1; })());
const rm = new Map([[q[0].id, { ...pr(), creator_id: q[0].id, seconds: 60 }], [q[1].id, { ...pr({ fit_lowes: 'no' }), creator_id: q[1].id, seconds: 120 }]]);
const prog = V.queueProgress(q, rm, (r, item) => V.deriveVerdict(r, item));
ok('progress: counts, verdict mix, time target', prog.reviewed === 2 && prog.verdicts.not_relevant === 1 && prog.median_seconds === 120 && prog.within_target === 1 && prog.by_tier[1].reviewed === 2);

// ───── waves ─────
const mk = (id, seg, labels, ps) => ({ creator: { id, priority_score: ps, data_quality_score: 50, creator_status: 'discovered' }, review: { segment: seg }, verdict: { labels, primary: labels[0] } });
const items = [
  mk('u1', 'skincare_beauty', ['ugc_ready', 'pr_ready'], 90), mk('u2', 'lifestyle_women', ['ugc_ready'], 80),
  mk('e1', 'expert', ['expert', 'pr_ready'], 70), mk('s1', 'skincare_beauty', ['pr_ready'], 85), mk('s2', 'skincare_beauty', ['pr_ready'], 60),
  mk('l1', 'lifestyle_women', ['pr_ready'], 50), mk('h1', 'hair_beauty', ['paid_inquiry'], 40), mk('n1', 'skincare_beauty', ['not_relevant'], 99), mk('r1', 'skincare_beauty', ['needs_review'], 99),
];
const wave = V.buildWave(items, V.DEFAULT_WAVE_QUOTAS);
ok('wave fills UGC slot first and uses each creator once', wave.slots[0].selected.join() === 'u1,u2' && new Set(wave.slots.flatMap(s => s.selected)).size === wave.total);
ok('wave never includes not_relevant / needs_review', !wave.slots.flatMap(s => s.selected).some(id => ['n1', 'r1'].includes(id)));
ok('wave reports shortfall per slot and a message, no padding', wave.total === 7 && wave.target === 50 && wave.shortfall === 43 && /Only 7 of 50/.test(wave.message) && wave.slots.find(s => s.key === 'skincare_beauty').count === 2);
ok('expert slot picks the expert; other slots skip already used', wave.slots.find(s => s.key === 'expert').selected.join() === 'e1' && !wave.slots.find(s => s.key === 'skincare_beauty').selected.includes('u1'));
ok('prior-wave creators excluded', !V.buildWave(items, V.DEFAULT_WAVE_QUOTAS, { excludeIds: ['u1'] }).slots.flatMap(s => s.selected).includes('u1'));
ok('default Wave 01 quotas = 50 (20/10/5/5/10)', V.DEFAULT_WAVE_QUOTAS.reduce((a, x) => a + x.target, 0) === 50 && V.DEFAULT_WAVE_QUOTAS.find(x => x.key === 'skincare_beauty').target === 20);

// ───── outreach ─────
let m = V.newMember('W1', 'C1', { segment: 'skincare_beauty', kind: 'gift' });
ok('cannot contact before an owner is assigned', !V.canAdvance(m, 'contacted').ok);
ok('cannot mark contacted without recording the contact method', !V.canAdvance({ ...m, assigned_to: 'Rana' }, 'contacted').ok && /channel/.test(V.canAdvance({ ...m, assigned_to: 'Rana' }, 'contacted').reason));
m = { ...m, assigned_to: 'Rana' }; m = V.advance(m, 'assigned', 'admin', '2026-09-30');
m = V.advance(m, 'contacted', 'Rana', '2026-09-30T10:00:00Z', { channel: 'instagram_dm' });
ok('contacted stamps last_contact_at', m.last_contact_at === '2026-09-30T10:00:00.000Z' && m.history.length === 2);
ok('cannot skip to product_sent without accepted + address', !V.canAdvance(m, 'product_sent').ok);
ok('cannot go backwards', !V.canAdvance(m, 'assigned').ok);
ok('posted requires a content url', !V.canAdvance({ ...m, status: 'content_received' }, 'posted').ok && V.canAdvance({ ...m, status: 'content_received', content_url: 'https://x.com/p' }, 'posted').ok);
ok('terminal states are final', !V.canAdvance(V.advance(m, 'declined', 'Rana', '2026-10-01'), 'replied').ok);
ok('follow-up due after 3 days, then second, then no-response suggestion', (() => {
  const a = V.nextActions([m], new Date('2026-10-04T10:00:00Z')).map(x => x.action);
  const m2 = V.logFollowup(m, 'Rana', '2026-10-03T10:00:00Z'); const b = V.nextActions([m2], new Date('2026-10-08T10:00:00Z')).map(x => x.action);
  const m3 = V.logFollowup(m2, 'Rana', '2026-10-08T10:00:00Z'); const c = V.nextActions([m3], new Date('2026-10-13T10:00:00Z')).map(x => x.action);
  return a.join() === 'followup_1' && b.join() === 'followup_2' && c.join() === 'mark_no_response' && V.nextActions([m], new Date('2026-09-30T20:00:00Z')).length === 0;
})());
const mem = ['A', 'B', 'C', 'D'].map((x, i) => ({ ...V.newMember('W1', x, { segment: i < 2 ? 'skincare_beauty' : 'expert' }), assigned_to: 'Rana', channel: 'instagram_dm' }));
let ma = mem[0]; ma = V.advance(ma, 'assigned', 'a'); ma = V.advance(ma, 'contacted', 'a'); ma = V.advance(ma, 'replied', 'a'); ma = V.advance(ma, 'accepted', 'a'); ma = V.advance(ma, 'address_received', 'a'); ma = V.advance(ma, 'product_sent', 'a'); ma = V.advance(ma, 'received', 'a'); ma = V.advance(ma, 'content_received', 'a', now, { content_url: 'https://x.com/p', content_kind: 'ugc' }); ma = V.advance(ma, 'posted', 'a');
let mb = mem[1]; mb = V.advance(mb, 'assigned', 'a'); mb = V.advance(mb, 'contacted', 'a'); mb = V.advance(mb, 'replied', 'a'); mb = V.advance(mb, 'declined', 'a');
let mc = mem[2]; mc = V.advance(mc, 'assigned', 'a'); mc = V.advance(mc, 'contacted', 'a');
const fn = V.funnel([ma, mb, mc, mem[3]]);
ok('funnel counts and rates', fn.total === 4 && fn.contacted === 3 && fn.replied === 2 && fn.accepted === 1 && fn.posted === 1 && fn.rates.replied.vs_contacted === 66.7 && fn.interested === 1 && fn.rates.interested.vs_prev === 50 && fn.rates.accepted.vs_prev === 100 && fn.ugc_content === 1 && fn.declined === 1);
ok('funnel by segment', fn.by_segment.skincare_beauty.contacted === 2 && fn.by_segment.expert.contacted === 1 && fn.by_segment.skincare_beauty.posted === 1);

// ───── message helper is a template only ─────
const msg = V.outreachMessage({ name: 'ريما | Rima', kind: 'gift' });
ok('gift message: no payment promised, no obligation stated, name inserted', /بدون أي التزام/.test(msg) && !/\$|دولار|أجر|مدفوع/.test(msg) && /ريما/.test(msg));
ok('paid message asks for the creator’s own rates (no price offered)', /الأسعار/.test(V.outreachMessage({ name: 'x', kind: 'paid' })) && !/\d/.test(V.outreachMessage({ name: 'x', kind: 'paid' })));

// ───── export / import / storage ─────
const items2 = [{ creator, review: pr({ notes: 'مرحبا, "x"' }), verdict: V.deriveVerdict(pr(), creator) }];
const csv = V.reviewsToCsv(items2); const back = L.parseCsv(csv);
ok('reviews csv roundtrip keeps Arabic + quotes', back.length === 1 && back[0].notes === 'مرحبا, "x"' && back[0].verdict === 'pr_ready');
const im = V.importReviews(JSON.stringify([pr({ reviewed_at: '2026-09-29T00:00:00Z' }), { creator_id: 'C2' }]), [], now);
ok('import validates: bad rows reported, good rows merged', im.ok && im.added === 1 && im.rejected.length === 1 && im.reviews.length === 1);
ok('import of non-json rejected without losing existing', !V.importReviews('{{', [pr()]).ok);
const mem2 = new Map(); const fake = { getItem: k => mem2.has(k) ? mem2.get(k) : null, setItem: (k, v) => mem2.set(k, v), removeItem: k => mem2.delete(k) };
const st = S.createLocalStore(fake);
ok('store: rejects invalid review, saves valid one', st.saveReview({ creator_id: 'X' }).ok === false && st.saveReview(pr({ reviewed_at: '2026-09-29T00:00:00Z' })).ok && st.loadReviews().length === 1);
st.saveReview(pr({ reviewed_at: '2026-09-30T00:00:00Z', action: 'ugc' }));
ok('store: history kept, latest per creator wins', st.loadReviews().length === 2 && V.latestReviews(st.loadReviews()).get('C1').action === 'ugc');
const exp = st.exportAll(); const st2 = S.createLocalStore({ getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} });
ok('store: storage failure does not throw (returns false)', st2.saveWaves([]) === false && st2.loadQueue().length === 0);
const st3 = S.createLocalStore(new Map([]).set ? { getItem: () => null, setItem() {}, removeItem() {} } : fake);
ok('store: import of export merges reviews; wrong version rejected', S.createLocalStore(fake, 'other:').importAll(exp).ok && !st3.importAll({ version: 99 }).ok);
ok('store: members merge keeps the longer history', (() => { const a = S.createLocalStore(fake, 'm:'); a.saveMembers([{ wave_id: 'W', creator_id: 'C', status: 'contacted', history: [{}, {}] }]); a.importAll({ version: 1, members: [{ wave_id: 'W', creator_id: 'C', status: 'replied', history: [{}, {}, {}] }] }); return a.loadMembers()[0].status === 'replied'; })());

// ───── admin merge of several reviewers' exports + verified leads ─────
const qr = queueFile.records;
const rv = (c, t, rev, o = {}) => ({ ...V.emptyReview(c.id, rev, now), reviewed_at: `2026-10-01T0${t}:00:00Z`, active: 'yes', last_post_seen: '2026-09-25', fit_lowes: 'yes', segment: 'skincare_beauty', skincare_fit: 'yes', action: 'gift', ...o });
const mg = S.mergeExports([
  { version: 1, reviews: [rv(qr[0], 1, 'A'), rv(qr[1], 2, 'A', { fit_lowes: 'no' })], waves: [{ id: 'W1' }], members: [{ wave_id: 'W1', creator_id: qr[0].id, status: 'contacted', history: [{}, {}] }], assign: { x: 'A' } },
  { version: 1, reviews: [rv(qr[0], 3, 'B', { action: 'paid' }), { creator_id: 'bad' }], waves: [{ id: 'W1' }], members: [{ wave_id: 'W1', creator_id: qr[0].id, status: 'replied', history: [{}, {}, {}] }], assign: { y: 'B' } },
  { version: 7, reviews: [] },
]);
ok('merge: valid reviews kept, invalid + wrong-version reported', mg.reviews.length === 3 && mg.rejected.length === 2 && mg.waves.length === 1 && Object.keys(mg.assign).length === 2);
ok('merge: longer member history wins', mg.members.length === 1 && mg.members[0].status === 'replied');
const leads = V.verifiedLeads(qr, mg.reviews);
ok('verified leads: latest review per creator decides; not_relevant excluded', leads.length === 1 && leads[0].verdict.primary === 'paid_inquiry' && leads[0].review.reviewer === 'B');
const lcsv = L.parseCsv(V.leadsToCsv(leads));
ok('leads csv has contact + source + reviewer for every lead', lcsv.length === 1 && lcsv[0]['Contact source'].startsWith('http') && lcsv[0].Reviewer === 'B' && lcsv[0]['Best contact']);

console.log(`creator review workbench: ${p} passed, ${f} failed`);
process.exit(f === 0 ? 0 : 1);
