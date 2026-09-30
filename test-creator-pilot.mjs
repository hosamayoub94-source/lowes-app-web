// Pilot tooling tests: strict completeness, evidence-based metrics, small-sample honesty, diversity selection, issue log, report.
// ALL data below is synthetic test data; nothing here is a real result.
import fs from 'node:fs';
// research data is kept out of git (public contact details): without it these integration checks are skipped, not failed
if (!["data/creators/syria/seed/workbench_queue.json"].every(p => fs.existsSync(p))) { console.log('SKIPPED: research data files not present ('+"data/creators/syria/seed/workbench_queue.json"+')'); process.exit(0); }
import * as V from './src/services/creatorReview.js';
import * as P from './src/services/creatorPilot.js';
import * as S from './src/services/creatorReviewStore.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('FAIL', n); } };
const now = new Date('2026-10-20T12:00:00Z');
const queueFile = JSON.parse(fs.readFileSync('data/creators/syria/seed/workbench_queue.json', 'utf8'));

// ───── strict completeness (all 8 questions) ─────
const full = { ...V.emptyReview('C', 'R', now), active: 'yes', last_post_seen: '2026-10-10', fit_lowes: 'yes', segment: 'skincare_beauty', face_on_camera: 'no', talks_to_camera: 'no', does_review: 'no', does_unboxing: 'no', ugc_quality: 'unsure', city: 'damascus', no_public_contact: true, pr_signal: 'none', skincare_fit: 'yes', action: 'gift' };
ok('complete review = 8/8', V.reviewCompleteness(full).complete && V.reviewCompleteness(full).done === 8);
ok('"unsure" is not an answer', !V.reviewCompleteness({ ...full, pr_signal: 'unsure' }).complete && V.reviewCompleteness({ ...full, pr_signal: 'unsure' }).missing.join() === 'q6');
ok('city left blank is unanswered; explicit "unknown" is an answer', !V.reviewCompleteness({ ...full, city: null }).answered.q4 && V.reviewCompleteness({ ...full, city: 'unknown' }).answered.q4);
ok('contact question needs a contact, a confirmation or an explicit "none"', !V.reviewCompleteness({ ...full, no_public_contact: false }).answered.q5 && V.reviewCompleteness({ ...full, no_public_contact: false, contact_confirmed: true }).answered.q5);
ok('any "yes" on camera/review needs quality AND a video url', !V.reviewCompleteness({ ...full, does_review: 'yes' }).answered.q3 && V.reviewCompleteness({ ...full, does_review: 'yes', ugc_quality: 'medium', video_urls: ['https://i.com/r/1'] }).answered.q3);
const creator = { id: 'C', contacts: [{ type: 'instagram_dm', value: 'u', source_url: 'https://i.com/x', is_public: true }], creator_type: null };
ok('strict: incomplete review of a plausible creator stays Needs Review, listing what is missing', (() => { const v = V.deriveVerdict({ ...full, pr_signal: 'unsure', city: null }, creator, { strict: true }); return v.primary === 'needs_review' && v.missing.includes('answer:q6') && v.missing.includes('answer:q4'); })());
ok('strict: complete review passes to a real label', V.deriveVerdict(full, creator, { strict: true }).labels.includes('pr_ready'));
ok('strict: a clear rejection needs no further answers', V.deriveVerdict({ ...V.emptyReview('C', 'R', now), fit_lowes: 'no', active: 'yes' }, creator, { strict: true }).primary === 'not_relevant');
ok('non-strict mode unchanged', V.deriveVerdict({ ...full, pr_signal: 'unsure', city: null }, creator).labels.includes('pr_ready'));
ok('feedback fields validated', V.validateReview({ ...full, slow_reason: 'nope' }, now).errors.includes('slow_reason:invalid') && V.validateReview({ ...full, hard_fields: ['q9'] }, now).errors.some(e => e.startsWith('hard_fields')) && V.validateReview({ ...full, slow_reason: 'profile_slow', helpful_source: 'sample_posts', hard_fields: ['q3'] }, now).ok);
ok('"no public contact" conflicts with entered contacts', V.validateReview({ ...full, contacts: [{ type: 'email', value: 'a@b.com', source_url: 'https://x.com' }] }, now).errors.includes('no_public_contact_conflicts_with_contacts'));

ok('declined / no_response are only possible after contact (do_not_contact anytime)', (() => { const m0 = V.newMember('W', 'X'); return !V.canAdvance({ ...m0, assigned_to: 'R', channel: 'whatsapp' }, 'declined').ok && !V.canAdvance(m0, 'no_response').ok && V.canAdvance(m0, 'do_not_contact').ok && V.canAdvance(V.advance({ ...m0, assigned_to: 'R', channel: 'whatsapp' }, 'contacted', 'R'), 'no_response').ok; })());

// ───── statistics ─────
ok('wilson interval sane and wide for tiny n', (() => { const w = P.wilson(3, 5); return w[0] > 15 && w[1] < 95 && w[1] - w[0] > 40; })());
ok('rate flags n<10 as descriptive only', P.rate(2, 5).low_sample && /descriptive only/.test(P.rate(2, 5).note) && !P.rate(6, 12).low_sample && P.rate(0, 0).pct === null);

// ───── metrics on a synthetic pilot (12 creators) ─────
const T = (d, h = 10) => `2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00Z`;
const mem = (id, slot, attrs, steps, extra = {}) => {
  let m = { ...V.newMember('W', id, { segment: slot === 'ugc_capable' ? 'skincare_beauty' : slot, kind: 'gift', slot, attrs }), assigned_to: 'Rana', channel: extra.channel || 'instagram_dm', ...extra };
  steps.forEach(([st, d, patch]) => { m = V.advance(m, st, 'Rana', T(d), patch || {}); });
  return m;
};
const A = (o = {}) => ({ creator_type: 'beauty_creator', follower_tier: '5k_10k', platform: 'instagram', pilot_group: 'pr', ...o });
const members = [
  mem('1', 'skincare_beauty', A(), [['assigned', 1], ['contacted', 2], ['replied', 4], ['interested', 4], ['accepted', 5], ['address_received', 6], ['product_sent', 8], ['received', 12], ['content_received', 15, { content_url: 'https://x.com/c', content_kind: 'post' }], ['posted', 16]]),
  mem('2', 'skincare_beauty', A({ follower_tier: '10k_25k' }), [['assigned', 1], ['contacted', 2], ['replied', 3], ['declined', 3]]),
  mem('3', 'skincare_beauty', A(), [['assigned', 1], ['contacted', 2], ['no_response', 12]]),
  mem('4', 'ugc_capable', A({ pilot_group: 'ugc', platform: 'tiktok' }), [['assigned', 1], ['contacted', 3], ['accepted', 6], ['address_received', 7], ['product_sent', 9], ['received', 13]], { channel: 'whatsapp' }),
  mem('5', 'expert', A({ creator_type: 'expert', pilot_group: 'expert' }), [['assigned', 1], ['contacted', 3]], { channel: 'email' }),
  mem('6', 'lifestyle_women', A({ follower_tier: '1k_5k' }), [['assigned', 1]]),
];
const M = P.pilotMetrics(members);
ok('counts: contacted 5 (member 6 never contacted)', M.counts.contacted === 5 && M.selected === 6);
ok('a decline is a response; skipping "replied" (accepted directly) still counts as replied + interested', M.counts.replied === 3 && M.counts.interested === 2 && M.counts.accepted === 2 && M.counts.declined === 1);
ok('funnel deeper counts', M.counts.address_received === 2 && M.counts.product_sent === 2 && M.counts.product_received === 2 && M.counts.content_received === 1 && M.counts.posted === 1);
ok('rates use the right denominators', M.rates.contact_response_rate.pct === 60 && M.rates.positive_response_rate.pct === 40 && M.rates.gift_acceptance_rate.pct === 40 && M.rates.address_completion_rate.pct === 100 && M.rates.content_completion_rate.pct === 50 && M.rates.posting_rate.pct === 100 && M.rates.no_response_rate.pct === 20);
ok('every rate carries n and a small-sample flag', Object.values(M.rates).every(r => 'n' in r && typeof r.low_sample === 'boolean') && M.rates.contact_response_rate.low_sample);
ok('avg days to response (contact → first reply/decline)', M.days.avg_days_to_response.n === 3 && M.days.avg_days_to_response.mean === 2);
ok('avg days to content = product received → content received', M.days.avg_days_to_content.n === 1 && M.days.avg_days_to_content.mean === 3);
ok('still open = contacted, no reply, not closed (member 5)', M.counts.still_open === 1);
const bs = P.breakdown(members, 'slot'), bt = P.breakdown(members, 'follower_tier'), bp = P.breakdown(members, 'platform'), bc = P.breakdown(members, 'contact_method'), bg = P.breakdown(members, 'pilot_group'), bty = P.breakdown(members, 'creator_type');
ok('breakdown by segment/slot', bs.skincare_beauty.contacted === 3 && bs.skincare_beauty.accepted === 1 && bs.lifestyle_women.contacted === 0);
ok('breakdown by follower tier', bt['5k_10k'].contacted === 4 && bt['10k_25k'].contacted === 1 && bt['1k_5k'].contacted === 0);
ok('breakdown values', bp.tiktok.accepted === 1 && bc.whatsapp.accepted === 1 && bc.email.contacted === 1 && bg.ugc.contacted === 1 && bg.expert.contacted === 1 && bty.expert.selected === 1);
ok('every group in a tiny pilot is labelled descriptive only', [bs, bt, bp, bc, bg, bty].every(b => Object.values(b).every(g => g.low_sample && /descriptive only/.test(g.interpretation))));
ok('no group is ever called successful/unsuccessful', !JSON.stringify([bs, bt, bp, bc, bg]).match(/successful|unsuccessful|winner|loser/i));

// ───── pilot selection ─────
const mk = (i, over = {}) => {
  const tiers = ['1k_5k', '5k_10k', '10k_25k', '25k_50k'];
  return { creator: { id: 'c' + i, queue_tier: 1, priority_score: 90 - i, tier: over.tier || '5k_10k', platforms: [{ platform: over.platform || 'instagram' }], contacts: [{ type: over.contact || 'instagram_dm', source_url: 'https://x.com', is_public: true }], creator_city: over.city || 'damascus', creator_status: 'discovered', follower_count: 5000 + i },
    review: { segment: over.segment || 'skincare_beauty' }, verdict: { labels: over.labels || ['pr_ready'], primary: (over.labels || ['pr_ready'])[0] }, _t: tiers };
};
// 24 skincare creators: top-scored ones all share tier/platform/contact/city, lower-scored ones are more varied
const skin = [];
for (let i = 0; i < 12; i++) skin.push(mk(i, {}));
for (let i = 12; i < 24; i++) skin.push(mk(i, { tier: ['1k_5k', '10k_25k', '25k_50k'][i % 3], platform: i % 2 ? 'tiktok' : 'instagram', contact: ['whatsapp', 'email', 'phone'][i % 3], city: ['aleppo', 'homs', 'latakia'][i % 3] }));
const life = [30, 31, 32].map(i => mk(i, { segment: 'lifestyle_women' }));
const exp = [40, 41, 42, 43, 44, 45].map(i => mk(i, { segment: 'skincare_beauty', labels: ['expert', 'pr_ready'] }));
const ugc = [50, 51].map(i => mk(i, { labels: ['ugc_ready', 'pr_ready'] }));
const hair = [mk(60, { segment: 'hair_beauty' }), mk(61, { segment: 'hair_beauty' })];
const notQ = [mk(70, { labels: ['needs_review'] }), mk(71, { labels: ['not_relevant'] }), { ...mk(72, {}), creator: { ...mk(72, {}).creator, queue_tier: 2 } }, mk(73, { labels: ['paid_inquiry'] })];
const items = [...skin, ...life, ...exp, ...ugc, ...hair, ...notQ];
const plan = P.buildPilot(items);
const ids = plan.slots.flatMap(s => s.selected);
ok('pilot never exceeds 30 and each creator appears once', plan.total <= 30 && new Set(ids).size === ids.length);
ok('only tier-1 human-reviewed & pilot-eligible labels enter (no needs_review / not_relevant / tier 2 / paid-only)', !ids.some(id => ['c70', 'c71', 'c72', 'c73'].includes(id)));
ok('paid-inquiry qualified are reported, not silently dropped', plan.paid_inquiry_qualified.includes('c73'));
const slotOf = k => plan.slots.find(s => s.key === k);
ok('UGC slot only has 2 qualified => shortage 3, not filled from elsewhere', slotOf('ugc_capable').count === 2 && slotOf('ugc_capable').shortage === 3);
ok('lifestyle slot has 3 of 5, hair 2 of 5 => shortages reported', slotOf('lifestyle_women').shortage === 2 && slotOf('hair_beauty').shortage === 3);
ok('expert slot filled to target from 6 candidates; 1 leftover qualified expert is reported, not moved', slotOf('expert').count === 5 && plan.leftovers_qualified_not_selected.length > 0);
ok('skincare slot filled to 10', slotOf('skincare_beauty').count === 10);
ok('shortage total and message are explicit', plan.shortage === 30 - plan.total && /Nothing was added to fill the gap/.test(plan.message) && plan.total === 22);
const naive = [...skin].sort((a, b) => b.creator.priority_score - a.creator.priority_score).slice(0, 10).map(x => x.creator.id);
ok('selection is NOT simply the top scores: diversity changes who is picked', slotOf('skincare_beauty').selected.join() !== naive.join() && new Set(slotOf('skincare_beauty').selected.map(id => items.find(x => x.creator.id === id).creator.tier)).size >= 3);
ok('selection is deterministic', JSON.stringify(P.buildPilot(items).slots.map(s => s.selected)) === JSON.stringify(plan.slots.map(s => s.selected)));
ok('every pick keeps its reasons (score, penalties, attributes)', plan.slots.every(s => s.selected.every(id => s.why[id] && 'base' in s.why[id] && s.why[id].attrs)));
ok('excluded ids (earlier waves) stay out', !P.buildPilot(items, P.PILOT_ALLOCATION, { excludeIds: ['c0'] }).slots.flatMap(s => s.selected).includes('c0'));
ok('suggested channel follows the best public contact', P.bestChannel([{ type: 'instagram_dm', source_url: 'x' }, { type: 'whatsapp', source_url: 'x' }]) === 'whatsapp' && P.bestChannel([]) === null);

ok('a creator who is Expert AND recommended for a paid inquiry stays out of the gifting pilot but is reported', (() => { const pl = P.buildPilot([mk(74, { labels: ['expert', 'paid_inquiry'] })]); return pl.total === 0 && pl.paid_inquiry_qualified.includes('c74'); })());

// ───── decision gate: follower count is never an input; small pilots cannot pass ─────
const gate = P.decisionGate(M, bs);
ok('30-creator-style pilot does not pass the gate', !gate.ready && gate.reasons.length >= 2 && /Follower count is not an input/.test(gate.rule));
const big = Array.from({ length: 40 }, (_, i) => mem('b' + i, i % 2 ? 'skincare_beauty' : 'lifestyle_women', A(), [['assigned', 1], ['contacted', 2], ['replied', 3], ['accepted', 4], ['address_received', 5], ['product_sent', 6], ['received', 8], ['content_received', 10, { content_url: 'https://x.com/c' }], ['posted', 11]]));
const bigM = P.pilotMetrics(big); const gate2 = P.decisionGate(bigM, P.breakdown(big, 'slot'));
ok('with enough contacted creators across ≥2 groups and no open items the gate opens', gate2.ready);
ok('gate states it is a sample-size check, not a success signal', /not a success signal/.test(gate.meaning) && /not a success signal/.test(gate2.meaning));
ok('gate result is identical when follower counts differ (not an input)', JSON.stringify(P.decisionGate(bigM, P.breakdown(big.map(m => ({ ...m, attrs: { ...m.attrs, follower_tier: '1m_plus' } })), 'slot'))) === JSON.stringify(gate2));

// ───── issue log ─────
const iss = P.newIssue({ type: 'ui_bug', text: 'date picker hides on mobile', by: 'Rana', at: now });
ok('issue log validation', P.validateIssue(iss).ok && !P.validateIssue({ type: 'nope', text: '', by: null }).ok);
const stI = S.createLocalStore((() => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; })());
ok('store: issues saved once per id, invalid rejected', stI.saveIssue(iss).ok && stI.saveIssue(iss).ok && stI.loadIssues().length === 1 && !stI.saveIssue({ type: 'x' }).ok);
ok('store: issues survive export/merge (deduped by id)', S.mergeExports([stI.exportAll(), stI.exportAll()]).issues.length === 1);

// ───── report ─────
const emptyRep = P.pilotReport({ queue: queueFile.records.filter(q => q.queue_tier === 1), reviews: [], members: [], issues: [], now });
const emptyMd = P.pilotReportMarkdown(emptyRep);
ok('report on an empty pilot is honest: zero everywhere, no invented rates, gate says not enough evidence', emptyRep.data.scope_total === 46 && emptyRep.data.reviewed === 0 && emptyRep.outreach.contacted === 0 && /no denominator/.test(emptyMd) && /Not enough evidence yet/.test(emptyMd) && /— no data yet/.test(emptyMd));
for (const h of ['## DATA', '## OUTREACH', '## CONTENT', '## PILOT SUCCESS METRICS', '## SEGMENT RESULTS', '## OPERATIONAL FINDINGS', '## SYSTEM ISSUES', '## DECISION GATE']) ok('report has section ' + h, emptyMd.includes(h));
const q1 = queueFile.records.filter(q => q.queue_tier === 1);
const revs = q1.slice(0, 6).map((q, i) => ({ ...full, creator_id: q.id, reviewer: 'Rana', reviewed_at: T(3 + i), seconds: 60 + i * 20, slow_reason: i === 0 ? 'profile_slow' : null, hard_fields: i < 2 ? ['q3'] : [], helpful_source: i % 2 ? 'sample_posts' : 'profile', ...(i === 5 ? { pr_signal: 'unsure' } : {}), ...(i === 4 ? { fit_lowes: 'no' } : {}) }));
const rep = P.pilotReport({ queue: q1, reviews: revs, members, issues: [iss, P.newIssue({ type: 'source_useful', text: 'sample post links saved time', by: 'Dima', at: now })], mergeRejected: 2, now });
const md = P.pilotReportMarkdown(rep);
ok('report DATA: reviewed / needs review / rejected computed from reviews (strict)', rep.data.reviewed === 6 && rep.data.rejected === 1 && rep.data.needs_review >= 1 && rep.data.complete_8_of_8 === 5);
ok('report ops: slow reasons, hard fields, helpful sources, review time', rep.operational.slowed_reviewers.profile_slow === 1 && rep.operational.fields_hard_to_verify.flagged_by_reviewers.q3 === 2 && rep.operational.helpful_sources.sample_posts === 3 && rep.data.review_seconds.over_90s === 4);
ok('report system issues include logged bugs and merge rejections', rep.system.ui_bugs.length === 1 && rep.system.merge_rejected_rows === 2 && /date picker/.test(md) && /Rows rejected while merging: 2/.test(md));
ok('report never states a segment is successful/unsuccessful', !/(is|was) (a )?(successful|unsuccessful)/i.test(md) && /descriptive only/.test(md));
ok('report lists metric 1–9 with denominators', ['Contact response rate', 'Positive response rate', 'Gift acceptance rate', 'Address completion rate', 'Content completion rate', 'Posting rate', 'Average days to response', 'Average days to content', 'No-response rate'].every(t => md.includes(t)) && /60% \(3\/5, n<10\)/.test(md));

const paidRev = ['p1'].map(() => ({ ...full, creator_id: q1[10].id, reviewer: 'Rana', reviewed_at: T(4), action: 'paid', city: 'aleppo' }));
const repPaid = P.pilotReport({ queue: q1, reviews: paidRev, members: [], issues: [], now });
ok('paid-inquiry creators stay in the system as a separate track with the reason, and are not in the gifting plan', repPaid.paid_inquiry_track.length === 1 && repPaid.paid_inquiry_track[0].in_gifting_pilot === false && /separate track/.test(repPaid.paid_inquiry_track[0].reason_not_in_gifting_pilot) && /PAID INQUIRY TRACK/.test(P.pilotReportMarkdown(repPaid)) && repPaid.pilot_plan_from_reviews.slots.every(s => s.count === 0));
ok('markdown gate wording is not a success claim', /not a verdict of success|Not enough evidence yet/.test(emptyMd) && /not a success signal/.test(emptyMd));

console.log(`creator pilot tooling: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
