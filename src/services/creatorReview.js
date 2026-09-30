// Creator Review & Outreach Workbench — pure logic (node-testable, no supabase, no DOM).
// Purpose: turn researched records into HUMAN-VERIFIED commercial leads.
//   queue  -> a person reviews a creator in ~60–90 s (8 questions) -> verdict labels -> wave shortlist -> operational outreach tracking.
// Rules: nothing here contacts anyone. Nothing is guessed: a human answer or "unsure" is stored; UGC "high" exists only via a visual review.
import * as L from './creatorLogic.js';
import * as R from './creatorResearch.js';

// ───────────────────────── enums ─────────────────────────
export const TRI = ['yes', 'no', 'unsure'];
export const FIT = ['yes', 'partial', 'no', 'unsure'];
export const SKIN_FIT = ['yes', 'maybe', 'no', 'unsure'];
export const UGC_QUALITY = ['high', 'medium', 'low', 'unsure'];
export const PR_SIGNAL = ['none', 'open_to_collab', 'gifted_seen', 'unsure'];
export const ACTIONS = ['gift', 'ugc', 'paid', 'none', 'unsure'];
export const SEGMENTS = ['skincare_beauty', 'lifestyle_women', 'hair_beauty', 'expert', 'other'];
export const CONTACT_TYPES = ['management', 'agency', 'email', 'whatsapp', 'phone', 'website', 'instagram_dm', 'tiktok_dm', 'facebook_messenger'];
export const VERDICTS = ['ugc_ready', 'pr_ready', 'expert', 'paid_inquiry', 'needs_review', 'not_relevant'];
export const VERDICT_LABEL_AR = { ugc_ready: 'UGC Ready', pr_ready: 'PR Ready', expert: 'Expert', paid_inquiry: 'Paid Inquiry', needs_review: 'Needs Review', not_relevant: 'Not Relevant' };
export const REVIEW_SECONDS_TARGET = 90;

const DAY = 86400000;
const isUrl = u => { try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:'; } catch { return false; } };
const daysBetween = (a, b) => (new Date(a).getTime() - new Date(b).getTime()) / DAY;

// ───────────────────────── review record ─────────────────────────
export function emptyReview(creatorId, reviewer = null, now = new Date()) {
  return {
    creator_id: creatorId, reviewer, reviewed_at: new Date(now).toISOString(), seconds: null,
    active: 'unsure', last_post_seen: null,
    fit_lowes: 'unsure', segment: null, skincare_fit: 'unsure',
    face_on_camera: 'unsure', talks_to_camera: 'unsure', does_review: 'unsure', does_unboxing: 'unsure',
    ugc_quality: 'unsure', video_urls: [],
    city: null, contacts: [], no_public_contact: false, contact_confirmed: false,
    pr_signal: 'unsure', pr_evidence_url: null,
    action: 'unsure', notes: '',
    slow_reason: null, hard_fields: [], helpful_source: null, // operational feedback for the pilot report
  };
}

export const SLOW_REASONS = ['profile_slow', 'private_or_locked', 'no_recent_posts', 'hard_to_judge_quality', 'contact_hidden', 'language_or_dialect', 'many_platforms', 'other'];
export const SLOW_REASON_AR = { profile_slow: 'البروفايل بطيء/لا يفتح', private_or_locked: 'حساب خاص/مقفول', no_recent_posts: 'لا منشورات حديثة', hard_to_judge_quality: 'صعب أحكم على الجودة', contact_hidden: 'التواصل مخفي', language_or_dialect: 'لغة/لهجة', many_platforms: 'منصات كثيرة', other: 'غير ذلك' };
export const HARD_FIELDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'];
export const QUESTION_AR = { q1: 'النشاط', q2: 'ملاءمة LOWE\'S والقطاع', q3: 'وجه/كلام/ريفيو/أنبوكسينغ/جودة', q4: 'المدينة', q5: 'التواصل العام', q6: 'إشارة PR/تعاون', q7: 'ملاءمة السكين كير/الريتينول', q8: 'القرار' };
export const HELPFUL_SOURCES = ['profile', 'sample_posts', 'bio', 'contact_card', 'why_text', 'none'];

/** Which of the 8 pilot questions are genuinely answered ("unsure" and blanks are NOT answers). */
export function reviewCompleteness(r = {}) {
  const tri = ['face_on_camera', 'talks_to_camera', 'does_review', 'does_unboxing'];
  const anyYes = tri.some(k => r[k] === 'yes');
  const answered = {
    q1: !!r.active && r.active !== 'unsure',
    q2: !!r.fit_lowes && r.fit_lowes !== 'unsure' && !!r.segment,
    q3: tri.every(k => r[k] && r[k] !== 'unsure') && (!anyYes || (!!r.ugc_quality && r.ugc_quality !== 'unsure' && (r.video_urls || []).length >= 1)),
    q4: !!r.city,
    q5: (r.contacts || []).length > 0 || r.no_public_contact === true || r.contact_confirmed === true,
    q6: !!r.pr_signal && r.pr_signal !== 'unsure',
    q7: !!r.skincare_fit && r.skincare_fit !== 'unsure',
    q8: !!r.action && r.action !== 'unsure',
  };
  const missing = Object.keys(answered).filter(k => !answered[k]);
  return { answered, missing, complete: missing.length === 0, done: 8 - missing.length };
}

export function validateReview(r, now = new Date()) {
  const errors = [];
  const inSet = (v, set, name) => { if (!set.includes(v)) errors.push(`${name}:invalid`); };
  if (!r || !r.creator_id) return { ok: false, errors: ['creator_id:missing'] };
  if (!r.reviewer) errors.push('reviewer:missing');
  if (!r.reviewed_at || Number.isNaN(new Date(r.reviewed_at).getTime())) errors.push('reviewed_at:invalid');
  inSet(r.active, TRI, 'active'); inSet(r.fit_lowes, FIT, 'fit_lowes'); inSet(r.skincare_fit, SKIN_FIT, 'skincare_fit');
  ['face_on_camera', 'talks_to_camera', 'does_review', 'does_unboxing'].forEach(k => inSet(r[k], TRI, k));
  inSet(r.ugc_quality, UGC_QUALITY, 'ugc_quality'); inSet(r.pr_signal, PR_SIGNAL, 'pr_signal'); inSet(r.action, ACTIONS, 'action');
  if (r.segment !== null && r.segment !== undefined && !SEGMENTS.includes(r.segment)) errors.push('segment:invalid');
  if (r.city !== null && r.city !== undefined && !L.SYRIA_CITIES.includes(r.city)) errors.push('city:invalid');
  if (r.last_post_seen) {
    const t = new Date(r.last_post_seen).getTime();
    if (Number.isNaN(t)) errors.push('last_post_seen:invalid');
    else if (t > new Date(now).getTime() + DAY) errors.push('last_post_seen:future');
    else if (r.active === 'yes' && daysBetween(r.reviewed_at || now, r.last_post_seen) > 90) errors.push('active_yes_but_last_post_older_than_90d');
  }
  (r.video_urls || []).forEach((u, i) => { if (!isUrl(u)) errors.push(`video_urls[${i}]:invalid_url`); });
  (r.contacts || []).forEach((c, i) => {
    if (!CONTACT_TYPES.includes(c.type)) errors.push(`contacts[${i}].type:invalid`);
    if (!String(c.value || '').trim()) errors.push(`contacts[${i}].value:missing`);
    if (!isUrl(c.source_url)) errors.push(`contacts[${i}].source_url:required_url`);
    if (c.type === 'email' && !L.normalizeEmail(c.value)) errors.push(`contacts[${i}].value:invalid_email`);
    if (['whatsapp', 'phone'].includes(c.type) && !R.normalizeSyrianOrIntl(c.value)) errors.push(`contacts[${i}].value:invalid_phone`);
  });
  if (r.pr_signal === 'gifted_seen' && !isUrl(r.pr_evidence_url)) errors.push('pr_evidence_url:required_for_gifted_seen');
  if (r.slow_reason && !SLOW_REASONS.includes(r.slow_reason)) errors.push('slow_reason:invalid');
  if (r.helpful_source && !HELPFUL_SOURCES.includes(r.helpful_source)) errors.push('helpful_source:invalid');
  (r.hard_fields || []).forEach(h => { if (!HARD_FIELDS.includes(h)) errors.push(`hard_fields:${h}:invalid`); });
  if (r.no_public_contact === true && (r.contacts || []).length) errors.push('no_public_contact_conflicts_with_contacts');
  if (r.seconds !== null && r.seconds !== undefined && !(Number(r.seconds) >= 0)) errors.push('seconds:invalid');
  return { ok: errors.length === 0, errors };
}

// ───────────────────────── verdict ─────────────────────────
/** Derives labels from a human review. Labels can co-exist (e.g. pr_ready + expert). Missing answers => needs_review, never a guess. */
export function deriveVerdict(review, creator = {}, { strict = false } = {}) {
  const r = review || {};
  const reasons = [], missing = [];
  const strictComp = strict ? reviewCompleteness(r) : null;
  if (!r.active || r.active === 'unsure') missing.push('active');
  if (!r.fit_lowes || r.fit_lowes === 'unsure') missing.push('fit_lowes');
  if (!r.action || r.action === 'unsure') missing.push('action');
  const needsSkin = r.segment !== 'lifestyle_women' && r.segment !== 'expert';
  if (needsSkin && (!r.skincare_fit || r.skincare_fit === 'unsure')) missing.push('skincare_fit');

  if (r.fit_lowes === 'no') reasons.push('content does not fit LOWE\'S');
  if (r.active === 'no') reasons.push('account not active');
  if (r.action === 'none') reasons.push('reviewer recommends no collaboration');
  if (reasons.length) return { labels: ['not_relevant'], primary: 'not_relevant', reasons, missing: [], contact_rank: null };

  // pilot (strict) mode: a creator who is not clearly rejected must have all 8 questions answered, otherwise the label stays Needs Review
  if (strictComp && !strictComp.complete) {
    return { labels: ['needs_review'], primary: 'needs_review', reasons: reasons.concat([`pilot review incomplete: ${strictComp.done}/8 answered`]), missing: [...new Set([...missing, ...strictComp.missing.map(q => `answer:${q}`)])], contact_rank: null, completeness: strictComp };
  }
  const contacts = [...(creator.contacts || []), ...(r.contacts || []).map(c => ({ ...c, is_public: true }))];
  const best = L.bestContact(contacts);
  const contactRank = best.rank;
  const labels = [];
  const ugcCriteria = r.face_on_camera === 'yes' && (r.talks_to_camera === 'yes' || r.does_review === 'yes' || r.does_unboxing === 'yes')
    && ['high', 'medium'].includes(r.ugc_quality) && (r.video_urls || []).length >= 1;
  if (ugcCriteria) { labels.push('ugc_ready'); reasons.push(`on-camera ${r.ugc_quality} quality, evidence ${r.video_urls.length} video(s)`); }
  else if (r.action === 'ugc') missing.push('ugc_evidence (face on camera + talks/review/unboxing + quality + video url)');

  const skinOk = !needsSkin || ['yes', 'maybe'].includes(r.skincare_fit);
  if (r.active === 'yes' && ['yes', 'partial'].includes(r.fit_lowes) && skinOk && ['gift', 'ugc'].includes(r.action) && contactRank <= 8) {
    labels.push('pr_ready'); reasons.push('active, fits LOWE\'S, gifting recommended, reachable');
  }
  if (r.action === 'paid') { if (contactRank <= 8) { labels.push('paid_inquiry'); reasons.push('reviewer recommends a paid inquiry'); } else missing.push('contact'); }
  if ((creator.creator_type === 'expert' || r.segment === 'expert') && ['yes', 'partial'].includes(r.fit_lowes)) { labels.push('expert'); reasons.push('professional / expert profile'); }

  if (missing.length && !labels.length) return { labels: ['needs_review'], primary: 'needs_review', reasons, missing, contact_rank: contactRank };
  if (!labels.length) return { labels: ['needs_review'], primary: 'needs_review', reasons: reasons.concat(['answers do not meet any label criteria']), missing, contact_rank: contactRank };
  const primary = VERDICTS.find(v => labels.includes(v));
  return { labels, primary, reasons, missing, contact_rank: contactRank };
}

/** Effective creator after a human review (activity, city, contacts, UGC, gifting evidence, pools, quality, why). Pure. */
export function applyReview(creator, review, now = new Date(), opts = {}) {
  const at = review.reviewed_at || new Date(now).toISOString();
  const out = { ...creator };
  // activity: a human looking today is a fresh observation
  if (review.last_post_seen) {
    const a = R.activityStatus({ lastPostAt: review.last_post_seen, dataAsOf: at.slice(0, 7), now: at });
    out.activity_status = a.status === 'unknown' ? (review.active === 'no' ? 'inactive_90d' : 'unknown') : a.status;
    out.activity_basis = `human review by ${review.reviewer} (${at.slice(0, 10)}): last post ${review.last_post_seen}`;
    out.last_post_at = review.last_post_seen; out.days_since_last_post = a.days_since_last_post;
  } else if (review.active === 'no') { out.activity_status = 'inactive_90d'; out.activity_basis = `human review by ${review.reviewer}: marked inactive`; }
  else if (review.active === 'yes') { out.activity_status = 'active_90d'; out.activity_basis = `human review by ${review.reviewer}: marked active (no date recorded)`; }
  if (review.city) { out.creator_city = review.city; out.city_source = `human review by ${review.reviewer}`; }
  // contacts
  const human = (review.contacts || []).map(c => ({ type: c.type, value: c.value, is_public: true, source_url: c.source_url, source_type: 'human_verified', verified_at: at, context: `verified by ${review.reviewer}` }));
  const seen = new Set((creator.contacts || []).map(c => c.type + ':' + c.value));
  out.contacts = [...(creator.contacts || []), ...human.filter(c => !seen.has(c.type + ':' + c.value))];
  out.contactability_score = L.contactabilityScore(out.contacts);
  out.best_contact_rank = L.bestContact(out.contacts).rank;
  // UGC via visual review (only place "high" can appear)
  const tags = new Set(out.ugc_tags || []);
  if (review.face_on_camera === 'yes') tags.add('face_on_camera');
  if (review.talks_to_camera === 'yes') tags.add('talking_head');
  if (review.does_review === 'yes') tags.add('review');
  if (review.does_unboxing === 'yes') tags.add('unboxing');
  const verdict = deriveVerdict(review, creator, opts);
  if ((review.video_urls || []).length && review.ugc_quality !== 'unsure') {
    const ready = verdict.labels.includes('ugc_ready');
    out.ugc_potential = ready ? (review.ugc_quality === 'high' ? 'high' : 'medium') : 'low';
    out.ugc_reason = `visual review by ${review.reviewer}: face ${review.face_on_camera}, talks ${review.talks_to_camera}, review ${review.does_review}, unboxing ${review.does_unboxing}, quality ${review.ugc_quality}`;
    out.ugc_evidence_url = review.video_urls[0]; out.ugc_evidence_type = 'visual_review'; out.ugc_reviewed_at = at;
  }
  out.ugc_tags = [...tags];
  // gifting: only with an evidence URL
  if (review.pr_signal === 'gifted_seen' && isUrl(review.pr_evidence_url)) { out.accepts_gifting = 'yes'; out.gifting_evidence_url = review.pr_evidence_url; }
  // fit
  if (verdict.primary === 'not_relevant') out.pr_fit = 'low';
  else if (verdict.labels.includes('pr_ready')) out.pr_fit = review.skincare_fit === 'yes' ? 'high' : 'medium';
  if (review.segment) out.lowes_segment = review.segment;
  out.human_reviewed = true; out.reviewed_by = review.reviewer; out.reviewed_at = at; out.review_seconds = review.seconds ?? null;
  out.verdict = verdict.primary; out.verdict_labels = verdict.labels; out.verdict_reasons = verdict.reasons; out.verdict_missing = verdict.missing;
  out.creator_status = verdict.primary === 'not_relevant' ? 'rejected' : (['ugc_ready', 'pr_ready', 'expert', 'paid_inquiry'].includes(verdict.primary) ? 'qualified' : (creator.creator_status || 'discovered'));
  out.pools = R.poolsOf({ ...out, follower_count: creator.follower_count });
  out.data_quality_score = R.dataQualityScore({
    display_name: out.display_name, main_category: out.main_category, category_confidence: out.category_confidence, creator_city: out.creator_city,
    last_verified_at: at, data_as_of: null, platforms: (creator.platforms || []).map(p => ({ handle: p.handle, profile_url: p.profile_url, followers: p.followers, engagement_rate: p.engagement_rate, avg_views: p.avg_views ?? p.reels_avg_views, last_post_at: out.last_post_at ?? p.last_post_at, metrics_observed_at: p.metrics_observed_at })),
    audience: creator.audience || (creator.audience_syria_pct != null ? [{ dimension: 'country', key: 'SY', pct: creator.audience_syria_pct }] : []), contacts: out.contacts, sources: [...(creator.sources || []), { provider: 'manual', source_type: 'human_review' }],
  }, at).data_quality_score;
  out.why = R.whyCreator({ ...out, follower_count: creator.follower_count }, { creator_priority_score: creator.priority_score ?? null });
  out.why_text = out.why.text_en + (verdict.reasons.length ? ' | Review: ' + verdict.reasons.join('; ') : '');
  return out;
}

/** Latest review per creator (history kept elsewhere). */
export function latestReviews(list = []) {
  const m = new Map();
  list.forEach(r => { const p = m.get(r.creator_id); if (!p || new Date(r.reviewed_at) > new Date(p.reviewed_at)) m.set(r.creator_id, r); });
  return m;
}
/** Merge two review lists (e.g. two reviewers' exports): union by (creator_id, reviewer, reviewed_at). */
export function mergeReviewSets(a = [], b = []) {
  const k = r => `${r.creator_id}|${r.reviewer}|${r.reviewed_at}`;
  const m = new Map(); [...a, ...b].forEach(r => m.set(k(r), r));
  return [...m.values()].sort((x, y) => new Date(x.reviewed_at) - new Date(y.reviewed_at));
}

// ───────────────────────── queue ─────────────────────────
const BEAUTY_CATS = new Set(['skincare', 'beauty', 'makeup', 'hair']);
/** Seed records -> review queue. Tier 1 = PR ∪ Expert ∪ UGC pool; tier 2 = remaining Paid pool; tier 3 = other creators with a business contact or a beauty category. */
export function buildQueue(records, { includeTier3 = true } = {}) {
  const inT1 = r => (r.pools || []).some(p => ['pr_pool', 'expert_pool', 'ugc_pool'].includes(p));
  const inT2 = r => (r.pools || []).includes('paid_pool');
  const inT3 = r => (r.best_contact_rank != null && r.best_contact_rank <= 5) || BEAUTY_CATS.has(r.main_category);
  const rows = [];
  records.forEach(r => {
    const tier = inT1(r) ? 1 : inT2(r) ? 2 : (includeTier3 && inT3(r) ? 3 : null);
    if (tier === null) return;
    rows.push({
      id: r.id, queue_tier: tier, display_name: r.display_name, bio: r.bio, platforms: r.platforms.map(p => ({ platform: p.platform, handle: p.handle, profile_url: p.profile_url, followers: p.followers })),
      follower_count: r.follower_count, tier: r.tier, main_category: r.main_category, subcategories: r.subcategories, creator_type: r.creator_type, creator_city: r.creator_city,
      audience_syria_pct: r.audience_syria_pct, activity_status: r.activity_status, activity_basis: r.activity_basis, last_post_at: r.last_post_at,
      pools: r.pools, pr_fit: r.pr_fit, ugc_potential: r.ugc_potential, accepts_gifting: r.accepts_gifting, paid_status: r.paid_status,
      contacts: (r.contacts || []).map(c => ({ type: c.type, value: c.value, source_url: c.source_url, source_type: c.source_type, verified_at: c.verified_at, is_public: true })),
      best_contact_rank: r.best_contact_rank, priority_score: r.priority_score, data_quality_score: r.data_quality_score, why_text: r.why?.text_en || null,
      warnings: (r.why?.warnings || []).map(w => w.text_en), sample_posts: r.sample_posts || [], hashtags: r.hashtags || [], verification_level: r.verification_level,
      needs_manual_review: r.needs_manual_review || false, duplicate_group: r.duplicate_group || null,
      growth_status: r.growth_status, is_celebrity: r.is_celebrity, creator_status: r.creator_status,
      sources: (r.sources || []).map(s => ({ provider: s.provider_name || s.provider, source_type: s.source_type, source_url: s.source_url, observed_at: s.observed_at })).slice(0, 4),
      audience_top: (r.audience || []).filter(a => a.dimension === 'country').sort((x, y) => y.pct - x.pct).slice(0, 3).map(a => `${a.key} ${a.pct}%`),
    });
  });
  rows.sort((a, b) => (a.queue_tier - b.queue_tier) || ((b.best_contact_rank != null && b.best_contact_rank <= 5) - (a.best_contact_rank != null && a.best_contact_rank <= 5)) || ((b.priority_score ?? -1) - (a.priority_score ?? -1)) || ((b.data_quality_score ?? 0) - (a.data_quality_score ?? 0)));
  return rows;
}

/** Balanced round-robin: each reviewer gets the same mix of tiers (queue order preserved inside a reviewer). */
export function assignReviewers(queue, reviewers) {
  const out = {}; if (!reviewers.length) return out;
  queue.forEach((q, i) => { out[q.id] = reviewers[i % reviewers.length]; });
  return out;
}

export function queueProgress(queue, reviewsMap, verdictOf = v => v) {
  const total = queue.length; const done = queue.filter(q => reviewsMap.has(q.id));
  const byTier = {}; [1, 2, 3].forEach(t => { const all = queue.filter(q => q.queue_tier === t); byTier[t] = { total: all.length, reviewed: all.filter(q => reviewsMap.has(q.id)).length }; });
  const verdicts = {}; done.forEach(q => { const v = verdictOf(reviewsMap.get(q.id), q).primary; verdicts[v] = (verdicts[v] || 0) + 1; });
  const secs = done.map(q => reviewsMap.get(q.id).seconds).filter(s => s !== null && s !== undefined && s >= 0).sort((a, b) => a - b);
  return {
    total, reviewed: done.length, remaining: total - done.length, pct: total ? Math.round(done.length / total * 100) : 0, by_tier: byTier, verdicts,
    median_seconds: secs.length ? secs[Math.floor(secs.length / 2)] : null, within_target: secs.filter(s => s <= REVIEW_SECONDS_TARGET).length, timed: secs.length,
  };
}

// ───────────────────────── waves ─────────────────────────
export const DEFAULT_WAVE_QUOTAS = [
  { key: 'ugc_capable', label: 'UGC-capable', target: 10 },
  { key: 'expert', label: 'Experts', target: 5 },
  { key: 'skincare_beauty', label: 'Beauty / Skincare', target: 20 },
  { key: 'lifestyle_women', label: 'Lifestyle / Women', target: 10 },
  { key: 'hair_beauty', label: 'Hair / Beauty', target: 5 },
];
/** items: [{creator, review, verdict}] for HUMAN-REVIEWED creators. Fill order = quotas order; a creator is used once.
 *  Never pads: each slot reports its own shortfall. */
export function buildWave(items, quotas = DEFAULT_WAVE_QUOTAS, { excludeIds = [] } = {}) {
  const used = new Set(excludeIds);
  const eligible = items.filter(x => x.verdict.primary !== 'not_relevant' && x.verdict.primary !== 'needs_review'
    && (x.creator.creator_status || 'discovered') !== 'do_not_contact' && (x.creator.contacts_ok !== false));
  const rank = (a, b) => ((b.creator.priority_score ?? -1) - (a.creator.priority_score ?? -1)) || ((b.creator.data_quality_score ?? 0) - (a.creator.data_quality_score ?? 0));
  const inSlot = (key, x) => {
    const l = x.verdict.labels;
    if (key === 'ugc_capable') return l.includes('ugc_ready');
    if (key === 'expert') return l.includes('expert');
    const seg = x.review.segment;
    return seg === key && (l.includes('pr_ready') || l.includes('ugc_ready') || l.includes('paid_inquiry'));
  };
  const slots = quotas.map(q => {
    const pool = eligible.filter(x => !used.has(x.creator.id) && inSlot(q.key, x)).sort(rank);
    const picked = pool.slice(0, q.target); picked.forEach(x => used.add(x.creator.id));
    return { key: q.key, label: q.label, target: q.target, selected: picked.map(x => x.creator.id), count: picked.length, shortfall: Math.max(0, q.target - picked.length) };
  });
  const total = slots.reduce((a, s) => a + s.count, 0), target = quotas.reduce((a, q) => a + q.target, 0);
  return { slots, total, target, shortfall: target - total, message: total < target ? `Only ${total} of ${target} slots can be filled from human-reviewed creators (${slots.filter(s => s.shortfall).map(s => `${s.label}: ${s.count}/${s.target}`).join(', ')}).` : null };
}

// ───────────────────────── outreach tracking (operational only — nothing is sent from here) ─────────────────────────
export const OUTREACH_STAGES = ['selected', 'assigned', 'contacted', 'replied', 'interested', 'accepted', 'address_received', 'product_sent', 'received', 'content_received', 'posted'];
export const OUTREACH_TERMINALS = ['declined', 'no_response', 'do_not_contact'];
export const OUTREACH_LABEL_AR = { selected: 'مختار', assigned: 'موزَّع', contacted: 'تم التواصل', replied: 'ردّ', interested: 'مهتم', accepted: 'وافق', address_received: 'وصل العنوان', product_sent: 'أُرسل المنتج', received: 'استلم', content_received: 'وصل المحتوى', posted: 'نُشر', declined: 'رفض', no_response: 'بلا رد', do_not_contact: 'لا تتواصل' };
export const CHANNELS = ['instagram_dm', 'tiktok_dm', 'whatsapp', 'email', 'phone', 'other'];

export function newMember(waveId, creatorId, { segment = null, kind = 'gift', slot = null, attrs = {} } = {}) {
  // attrs = snapshot of the creator at selection time (creator_type, follower_tier, platform, pilot_group) so results can be broken down later
  return { wave_id: waveId, creator_id: creatorId, status: 'selected', segment, kind, slot, attrs, assigned_to: null, channel: null, followups: 0, last_contact_at: null, content_url: null, content_kind: null, notes: '', history: [] };
}
export function canAdvance(m, to) {
  if (OUTREACH_TERMINALS.includes(m.status)) return { ok: false, reason: `already ${m.status}` };
  if (OUTREACH_TERMINALS.includes(to)) {
    if (to !== 'do_not_contact' && !reachedStage(m, 'contacted')) return { ok: false, reason: `${to}: the creator must be contacted first` };
    return { ok: true };
  }
  const i = OUTREACH_STAGES.indexOf(to), c = OUTREACH_STAGES.indexOf(m.status);
  if (i < 0) return { ok: false, reason: 'unknown status' };
  if (i <= c) return { ok: false, reason: 'cannot move backwards' };
  const reached = new Set(m.history.map(h => h.status).concat(m.status));
  if (to === 'contacted' && !m.assigned_to) return { ok: false, reason: 'assign an owner first' };
  if (to === 'contacted' && !m.channel) return { ok: false, reason: 'record the contact method (channel) first' };
  if (to === 'product_sent' && !reached.has('accepted')) return { ok: false, reason: 'creator must accept first' };
  if (to === 'product_sent' && !reached.has('address_received')) return { ok: false, reason: 'address must be received first' };
  if (to === 'posted' && !m.content_url) return { ok: false, reason: 'content url required' };
  return { ok: true };
}
export function advance(m, to, by, at = new Date(), patch = {}) {
  const chk = canAdvance({ ...m, ...patch, history: m.history, status: m.status }, to); if (!chk.ok) throw new Error(chk.reason);
  const iso = new Date(at).toISOString();
  const next = { ...m, ...patch, status: to, history: [...m.history, { status: to, at: iso, by }] };
  if (to === 'contacted') { next.last_contact_at = iso; if (m.status === 'contacted') next.followups = m.followups + 1; }
  return next;
}
export function logFollowup(m, by, at = new Date()) {
  if (m.status !== 'contacted') throw new Error('follow-up only while status = contacted');
  const iso = new Date(at).toISOString();
  return { ...m, followups: m.followups + 1, last_contact_at: iso, history: [...m.history, { status: 'followup', at: iso, by }] };
}
/** A stage counts as reached if the member is at, or ever passed through, it OR any later path stage (accepted implies replied + interested). */
export function reachedStage(m, st) {
  const i = OUTREACH_STAGES.indexOf(st);
  if (i < 0) return m.status === st || m.history.some(h => h.status === st);
  const seen = new Set(m.history.map(h => h.status).concat(m.status));
  return OUTREACH_STAGES.slice(i).some(s => seen.has(s));
}
/** Conversion vs previous stage and vs contacted. */
export function funnel(members) {
  const reached = st => members.filter(m => reachedStage(m, st)).length;
  const stages = ['contacted', 'replied', 'interested', 'accepted', 'address_received', 'product_sent', 'received', 'content_received', 'posted'];
  const counts = Object.fromEntries(stages.map(s => [s, reached(s)]));
  const base = counts.contacted;
  const rates = {}; stages.forEach((s, i) => { rates[s] = { count: counts[s], vs_prev: i === 0 ? null : (counts[stages[i - 1]] ? +(counts[s] / counts[stages[i - 1]] * 100).toFixed(1) : null), vs_contacted: i === 0 || !base ? null : +(counts[s] / base * 100).toFixed(1) }; });
  const ugcContent = members.filter(m => (m.status === 'content_received' || m.status === 'posted' || m.history.some(h => h.status === 'content_received')) && m.content_kind === 'ugc').length;
  const has = (m, st) => reachedStage(m, st);
  const bySeg = {}; members.forEach(m => { const k = m.segment || 'unknown'; (bySeg[k] ||= { total: 0, contacted: 0, accepted: 0, posted: 0 }); bySeg[k].total++; if (has(m, 'contacted')) bySeg[k].contacted++; if (has(m, 'accepted')) bySeg[k].accepted++; if (has(m, 'posted')) bySeg[k].posted++; });
  return { total: members.length, ...counts, rates, ugc_content: ugcContent, declined: members.filter(m => m.status === 'declined').length, no_response: members.filter(m => m.status === 'no_response').length, do_not_contact: members.filter(m => m.status === 'do_not_contact').length, by_segment: bySeg };
}
/** Suggestions only. */
export function nextActions(members, now = new Date()) {
  const out = []; const n = new Date(now).getTime();
  const age = iso => (n - new Date(iso).getTime()) / DAY;
  const lastAt = m => m.history.length ? m.history[m.history.length - 1].at : null;
  members.forEach(m => {
    if (OUTREACH_TERMINALS.includes(m.status) || m.status === 'posted') return;
    if (m.status === 'assigned') out.push({ creator_id: m.creator_id, action: 'send_first_message', due: true, note: 'assigned, not contacted yet' });
    if (m.status === 'contacted' && m.last_contact_at) {
      const d = age(m.last_contact_at);
      if (m.followups === 0 && d >= 3) out.push({ creator_id: m.creator_id, action: 'followup_1', due: true, note: `${Math.floor(d)}d without reply` });
      else if (m.followups === 1 && d >= 4) out.push({ creator_id: m.creator_id, action: 'followup_2', due: true, note: `${Math.floor(d)}d since follow-up 1` });
      else if (m.followups >= 2 && d >= 4) out.push({ creator_id: m.creator_id, action: 'mark_no_response', due: true, note: `${Math.floor(d)}d since last follow-up` });
    }
    if (m.status === 'accepted' && lastAt(m) && age(lastAt(m)) >= 3) out.push({ creator_id: m.creator_id, action: 'ask_address', due: true, note: 'accepted, no address after 3d' });
    if (m.status === 'product_sent' && lastAt(m) && age(lastAt(m)) >= 10) out.push({ creator_id: m.creator_id, action: 'check_delivery', due: true, note: 'sent 10d ago, not confirmed received' });
    if (m.status === 'received' && lastAt(m) && age(lastAt(m)) >= 7) out.push({ creator_id: m.creator_id, action: 'remind_content', due: true, note: 'received 7d ago, no content' });
  });
  return out;
}

/** Copy-paste helper for a HUMAN to send. Never sent automatically. Honest: gift has no obligation; no payment promised unless kind = paid and a real budget exists. */
export function outreachMessage({ name, kind = 'gift', product = 'سيروم الريتينول', sender = 'فريق LOWE\'S professional' }) {
  const first = String(name || '').split(/[|(]/)[0].trim();
  if (kind === 'ugc') return `أهلاً ${first} 🌿\nمتابعين شغلك بمحتوى العناية بالبشرة وعجبنا أسلوبك بعرض المنتجات.\nنحن ${sender} وعم نطلق ${product}. بيسعدنا نرسللك المنتج هدية لتجربيه، وإذا عجبك وحبيتي تصوري عنه فيديو (تجربة صادقة) منتناقش الشروط سوا — بدون أي التزام.\nإذا مهتمة، بس قوليلي وبنرتب الشحن.`;
  if (kind === 'paid') return `أهلاً ${first} 🌿\nنحن ${sender} وبدنا نتعاون مع مبدعين بمجال العناية بالبشرة. ممكن تشاركينا تفاصيل التعاون المدفوع (الأسعار والصيغ المتاحة)؟`;
  return `أهلاً ${first} 🌿\nمتابعين محتواك وحبينا أسلوبك. نحن ${sender} وعم نطلق ${product}، وبيسعدنا نرسللك المنتج هدية لتجربيه — بدون أي التزام بالنشر.\nإذا مهتمة، بس قوليلي وبنرتب الشحن.`;
}

// ───────────────────────── export / import ─────────────────────────
const csvCell = v => L.csvEscape(v === undefined ? null : (Array.isArray(v) ? v.join(' | ') : v));
export const REVIEW_CSV_COLUMNS = ['creator_id', 'name', 'reviewer', 'reviewed_at', 'seconds', 'verdict', 'labels', 'active', 'last_post_seen', 'fit_lowes', 'segment', 'skincare_fit', 'face_on_camera', 'talks_to_camera', 'does_review', 'does_unboxing', 'ugc_quality', 'video_urls', 'city', 'contacts', 'pr_signal', 'pr_evidence_url', 'action', 'notes'];
export function reviewsToCsv(items) {
  const lines = [REVIEW_CSV_COLUMNS.join(',')];
  items.forEach(({ creator, review, verdict }) => lines.push(REVIEW_CSV_COLUMNS.map(c => {
    if (c === 'name') return csvCell(creator?.display_name); if (c === 'verdict') return csvCell(verdict.primary); if (c === 'labels') return csvCell(verdict.labels);
    if (c === 'contacts') return csvCell((review.contacts || []).map(x => `${x.type}:${x.value}`)); return csvCell(review[c]);
  }).join(',')));
  return lines.join('\r\n');
}
export const WAVE_CSV_COLUMNS = ['Wave', 'Slot', 'Name', 'Platform', 'Handle', 'URL', 'Followers', 'Segment', 'Verdict', 'City', 'Best contact', 'Contact value', 'Owner', 'Status', 'Channel', 'Notes'];
export function waveToCsv(waveName, members, byId) {
  const lines = [WAVE_CSV_COLUMNS.join(',')];
  members.forEach(m => {
    const c = byId[m.creator_id] || {}; const p = (c.platforms || [])[0] || {};
    const best = (c.contacts || []).filter(x => L.contactRank(x) !== null).sort((a, b) => L.contactRank(a) - L.contactRank(b))[0] || {};
    lines.push([waveName, m.slot || m.segment, c.display_name, p.platform, p.handle, p.profile_url, c.follower_count, m.segment, c.verdict, c.creator_city, best.type, best.value, m.assigned_to, m.status, m.channel, m.notes].map(csvCell).join(','));
  });
  return lines.join('\r\n');
}
/** Validated JSON import of reviews: invalid rows are reported, never silently accepted. */
export function importReviews(json, existing = [], now = new Date()) {
  let arr; try { arr = typeof json === 'string' ? JSON.parse(json) : json; } catch { return { ok: false, error: 'invalid json', reviews: existing }; }
  const list = Array.isArray(arr) ? arr : arr?.reviews;
  if (!Array.isArray(list)) return { ok: false, error: 'expected an array or {reviews:[]}', reviews: existing };
  const good = [], bad = [];
  list.forEach((r, i) => { const v = validateReview(r, now); (v.ok ? good : bad).push(v.ok ? r : { index: i, errors: v.errors }); });
  return { ok: true, added: good.length, rejected: bad, reviews: mergeReviewSets(existing, good) };
}

// ───────────────────────── verified leads (admin output) ─────────────────────────
export const LEAD_CSV_COLUMNS = ['Name', 'Verdict', 'Labels', 'Segment', 'Platform', 'Handle', 'URL', 'Followers', 'City', 'Best contact', 'Contact value', 'Contact source', 'Active (human)', 'Last post seen', 'UGC evidence', 'Gifting evidence', 'Priority', 'Data quality', 'Reviewer', 'Reviewed at', 'Notes'];
/** Human-reviewed creators that earned a commercial label, ready for outreach (contact + source always shown). */
export function verifiedLeads(queue, reviewsList, opts = {}) {
  const latest = latestReviews(reviewsList);
  return queue.filter(q => latest.has(q.id)).map(q => {
    const review = latest.get(q.id); const verdict = deriveVerdict(review, q, opts); const eff = applyReview(q, review, new Date(), opts);
    return { creator: eff, review, verdict };
  }).filter(x => x.verdict.primary !== 'not_relevant' && x.verdict.primary !== 'needs_review');
}
export function leadsToCsv(leads) {
  const lines = [LEAD_CSV_COLUMNS.join(',')];
  leads.forEach(({ creator: c, review: r, verdict: v }) => {
    const p = (c.platforms || [])[0] || {};
    const best = (c.contacts || []).filter(x => L.contactRank(x) !== null).sort((a, b) => L.contactRank(a) - L.contactRank(b))[0] || {};
    lines.push([c.display_name, V_LABEL(v.primary), v.labels.map(V_LABEL), r.segment, p.platform, p.handle, p.profile_url, c.follower_count, c.creator_city, best.type, best.value, best.source_url, r.active, r.last_post_seen, c.ugc_evidence_url, c.gifting_evidence_url, c.priority_score, c.data_quality_score, r.reviewer, r.reviewed_at, r.notes].map(csvCell).join(','));
  });
  return lines.join('\r\n');
}
const V_LABEL = k => VERDICT_LABEL_AR[k] || k;
