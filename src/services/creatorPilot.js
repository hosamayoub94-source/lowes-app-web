// Creator pilot — selection, evidence-based metrics, issue log and decision report (pure, node-testable).
// The pilot is a way to COLLECT EVIDENCE, not to judge segments: every rate carries its denominator and a small-sample flag,
// and the decision gate never looks at follower counts.
import * as L from './creatorLogic.js';
import * as V from './creatorReview.js';

export const MIN_SAMPLE = 10;               // below this a rate is descriptive only
export const PILOT_ALLOCATION = [
  { key: 'skincare_beauty', label: 'Beauty / Skincare', target: 10 },
  { key: 'lifestyle_women', label: 'Lifestyle / Women', target: 5 },
  { key: 'ugc_capable', label: 'UGC-capable', target: 5 },
  { key: 'expert', label: 'Experts', target: 5 },
  { key: 'hair_beauty', label: 'Hair / Beauty', target: 5 },
];
const FILL_ORDER = ['ugc_capable', 'expert', 'skincare_beauty', 'lifestyle_women', 'hair_beauty']; // scarce, cross-cutting groups first; each creator used once
const QUALIFIED = ['ugc_ready', 'pr_ready', 'expert', 'paid_inquiry'];
const PILOT_ELIGIBLE = ['ugc_ready', 'pr_ready', 'expert'];

// ───────────────────────── statistics ─────────────────────────
/** Wilson 95 % interval (in %) — honest about small samples. */
export function wilson(k, n, z = 1.96) {
  if (!n) return null;
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n);
  return [Math.max(0, +(((c - m) / d) * 100).toFixed(1)), Math.min(100, +(((c + m) / d) * 100).toFixed(1))];
}
export function rate(k, n) {
  return { k, n, pct: n ? +(k / n * 100).toFixed(1) : null, ci95: wilson(k, n), low_sample: n < MIN_SAMPLE, note: n === 0 ? 'no denominator' : n < MIN_SAMPLE ? `n=${n} < ${MIN_SAMPLE}: descriptive only, not a judgment` : null };
}
const days = (a, b) => (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
const mean = a => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null);
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return +(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(1); };
const firstAt = (m, st) => m.history.find(h => h.status === st)?.at || null;

// ───────────────────────── per-member facts ─────────────────────────
const responded = m => V.reachedStage(m, 'replied') || m.history.some(h => h.status === 'declined');
export function memberFacts(m) {
  const contactedAt = firstAt(m, 'contacted');
  const respAt = ['replied', 'interested', 'accepted', 'declined'].map(s => firstAt(m, s)).filter(Boolean).sort()[0] || null;
  return {
    contacted: V.reachedStage(m, 'contacted'), responded: V.reachedStage(m, 'contacted') && responded(m), positive: V.reachedStage(m, 'interested'), accepted: V.reachedStage(m, 'accepted'),
    address: V.reachedStage(m, 'address_received'), sent: V.reachedStage(m, 'product_sent'), received: V.reachedStage(m, 'received'), content: V.reachedStage(m, 'content_received'), posted: V.reachedStage(m, 'posted'),
    declined: m.history.some(h => h.status === 'declined') || m.status === 'declined', no_response: m.status === 'no_response' || m.history.some(h => h.status === 'no_response'), dnc: m.status === 'do_not_contact' || m.history.some(h => h.status === 'do_not_contact'),
    days_to_response: contactedAt && respAt ? days(contactedAt, respAt) : null,
    days_received_to_content: firstAt(m, 'received') && firstAt(m, 'content_received') ? days(firstAt(m, 'received'), firstAt(m, 'content_received')) : null,
    days_contact_to_content: contactedAt && firstAt(m, 'content_received') ? days(contactedAt, firstAt(m, 'content_received')) : null,
  };
}

// ───────────────────────── metrics ─────────────────────────
export function pilotMetrics(members) {
  const f = members.map(memberFacts);
  const c = k => f.filter(x => x[k]).length;
  const contacted = c('contacted'), resp = c('responded');
  const open = f.filter(x => x.contacted && !x.responded && !x.no_response && !x.dnc).length;
  const dr = f.map(x => x.days_to_response).filter(v => v !== null), dc = f.map(x => x.days_received_to_content).filter(v => v !== null), dcc = f.map(x => x.days_contact_to_content).filter(v => v !== null);
  return {
    selected: members.length,
    counts: { contacted, replied: resp, interested: c('positive'), accepted: c('accepted'), address_received: c('address'), product_sent: c('sent'), product_received: c('received'), content_received: c('content'), posted: c('posted'), declined: c('declined'), no_response: c('no_response'), do_not_contact: c('dnc'), still_open: open },
    rates: {
      contact_response_rate: rate(resp, contacted),
      positive_response_rate: rate(c('positive'), contacted),
      gift_acceptance_rate: rate(c('accepted'), contacted),
      acceptance_among_responders: rate(c('accepted'), resp),
      address_completion_rate: rate(c('address'), c('accepted')),
      content_completion_rate: rate(c('content'), c('received')),
      posting_rate: rate(c('posted'), c('content')),
      posted_of_contacted: rate(c('posted'), contacted),
      no_response_rate: rate(c('no_response'), contacted),
    },
    days: {
      avg_days_to_response: { mean: mean(dr), median: median(dr), n: dr.length },
      avg_days_to_content: { mean: mean(dc), median: median(dc), n: dc.length, from: 'product received → content received' },
      avg_days_contact_to_content: { mean: mean(dcc), median: median(dcc), n: dcc.length },
    },
  };
}

export const pilotGroupOf = (slot, kind) => (slot === 'ugc_capable' ? 'ugc' : slot === 'expert' ? 'expert' : kind === 'paid' ? 'paid' : 'pr');
export const DIMENSIONS = {
  slot: m => m.slot || 'unknown', segment: m => m.segment || 'unknown', creator_type: m => m.attrs?.creator_type || 'unknown', follower_tier: m => m.attrs?.follower_tier || 'unknown',
  platform: m => m.attrs?.platform || 'unknown', pilot_group: m => m.attrs?.pilot_group || pilotGroupOf(m.slot, m.kind), contact_method: m => m.channel || 'none',
};
/** Descriptive breakdown. Every group is flagged low_sample when contacted < MIN_SAMPLE (which is expected in a 30-creator pilot). */
export function breakdown(members, dim) {
  const fn = typeof dim === 'function' ? dim : DIMENSIONS[dim];
  const groups = {}; members.forEach(m => { (groups[fn(m)] ||= []).push(m); });
  return Object.fromEntries(Object.entries(groups).map(([k, ms]) => {
    const x = pilotMetrics(ms);
    return [k, { selected: x.selected, ...x.counts, contact_response_rate: x.rates.contact_response_rate, positive_response_rate: x.rates.positive_response_rate, gift_acceptance_rate: x.rates.gift_acceptance_rate, posted_of_contacted: x.rates.posted_of_contacted, no_response_rate: x.rates.no_response_rate, avg_days_to_response: x.days.avg_days_to_response, low_sample: x.counts.contacted < MIN_SAMPLE, interpretation: x.counts.contacted < MIN_SAMPLE ? 'descriptive only — sample too small to call this group good or bad' : 'directional (n ≥ 10) — still confirm with more waves' }];
  }));
}

// ───────────────────────── pilot selection ─────────────────────────
const CHANNEL_OF = { whatsapp: 'whatsapp', email: 'email', management: 'email', agency: 'email', phone: 'phone', website: 'other', instagram_dm: 'instagram_dm', tiktok_dm: 'tiktok_dm', facebook_messenger: 'other' };
export function bestChannel(contacts = []) {
  const ok = contacts.filter(c => c && c.is_public !== false && L.contactRank(c) !== null).sort((a, b) => L.contactRank(a) - L.contactRank(b));
  return ok.length ? (CHANNEL_OF[ok[0].type] || 'other') : null;
}
/** items: [{creator, review, verdict}] — human-reviewed only. Not "top N by score": inside each slot a greedy pick trades priority against
 *  repeating a follower tier / platform / contact method / city already chosen, so the pilot covers the space instead of clustering.
 *  A slot that cannot be filled reports its shortage; leftovers are NOT moved into other slots. */
export function buildPilot(items, allocation = PILOT_ALLOCATION, { maxTotal = 30, onlyTier = 1, excludeIds = [] } = {}) {
  const used = new Set(excludeIds), chosen = [];
  const inScope = items.filter(x => (onlyTier == null || x.creator.queue_tier === onlyTier));
  // a reviewer's PAID recommendation moves the creator to the separate paid track, even if they also carry an Expert/UGC label
  const eligible = inScope.filter(x => PILOT_ELIGIBLE.some(l => x.verdict.labels.includes(l)) && !x.verdict.labels.includes('paid_inquiry') && (x.creator.creator_status || 'discovered') !== 'do_not_contact');
  const slotTest = (key, x) => {
    const l = x.verdict.labels;
    if (key === 'ugc_capable') return l.includes('ugc_ready');
    if (key === 'expert') return l.includes('expert');
    return x.review.segment === key && (l.includes('pr_ready') || l.includes('ugc_ready'));
  };
  const attr = x => ({ tier: x.creator.tier || L.tierKey(x.creator.follower_count), platform: x.creator.platforms?.[0]?.platform, channel: bestChannel(x.creator.contacts), city: x.creator.creator_city || null });
  const scoreOf = x => {
    const a = attr(x); const cnt = f => chosen.filter(c => f(attr(c))).length;
    const pen = { tier: 10 * cnt(o => o.tier === a.tier), platform: 6 * cnt(o => o.platform === a.platform), channel: 6 * cnt(o => o.channel && o.channel === a.channel), city: a.city ? 4 * cnt(o => o.city === a.city) : 0 };
    const base = x.creator.priority_score ?? 0;
    return { score: base - pen.tier - pen.platform - pen.channel - pen.city, base, penalties: pen };
  };
  const slots = [];
  const byKey = Object.fromEntries(allocation.map(a => [a.key, a]));
  for (const key of FILL_ORDER.filter(k => byKey[k])) {
    const a = byKey[key]; const picked = []; const why = {};
    const room = () => Math.min(a.target - picked.length, maxTotal - chosen.length);
    while (room() > 0) {
      const pool = eligible.filter(x => !used.has(x.creator.id) && slotTest(key, x));
      if (!pool.length) break;
      const ranked = pool.map(x => ({ x, s: scoreOf(x) })).sort((p, q) => (q.s.score - p.s.score) || (p.x.creator.id < q.x.creator.id ? -1 : 1));
      const top = ranked[0]; used.add(top.x.creator.id); chosen.push(top.x); picked.push(top.x.creator.id);
      why[top.x.creator.id] = { ...top.s, attrs: attr(top.x) };
    }
    slots.push({ key, label: a.label, target: a.target, selected: picked, count: picked.length, shortage: Math.max(0, a.target - picked.length), why });
  }
  const total = chosen.length, target = Math.min(maxTotal, allocation.reduce((s, a) => s + a.target, 0));
  const leftovers = eligible.filter(x => !used.has(x.creator.id)).map(x => x.creator.id);
  const paidOnly = inScope.filter(x => x.verdict.labels.includes('paid_inquiry') && !used.has(x.creator.id)).map(x => x.creator.id);
  return {
    slots, total, target, shortage: target - total, leftovers_qualified_not_selected: leftovers, paid_inquiry_qualified: paidOnly,
    counts_in_scope: { reviewed: inScope.length, qualified: inScope.filter(x => QUALIFIED.some(l => x.verdict.labels.includes(l))).length },
    message: total < target ? `Only ${total} of the ${target} target pilot places are genuinely qualified (${slots.filter(s => s.shortage).map(s => `${s.label}: ${s.count}/${s.target}`).join(', ') || 'none'}). Nothing was added to fill the gap.` : null,
  };
}

// ───────────────────────── issue log ─────────────────────────
export const ISSUE_TYPES = ['ui_bug', 'workflow_bug', 'missing_field', 'persistence', 'export_merge', 'slow', 'hard_to_verify', 'source_useful', 'hard_category', 'contact_method_worked', 'other'];
export const ISSUE_TYPE_AR = { ui_bug: 'مشكلة واجهة', workflow_bug: 'مشكلة في سير العمل', missing_field: 'حقل ناقص', persistence: 'مشكلة حفظ', export_merge: 'مشكلة تصدير/دمج', slow: 'شيء أبطأني', hard_to_verify: 'صعب التحقق', source_useful: 'مصدر مفيد', hard_category: 'فئة صعبة الإيجاد', contact_method_worked: 'وسيلة تواصل نجحت', other: 'أخرى' };
export function newIssue({ type, text, by, creator_id = null, at = new Date() }) {
  return { id: `${new Date(at).getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, at: new Date(at).toISOString(), by, type, text: String(text || '').trim(), creator_id };
}
export function validateIssue(i) {
  const e = [];
  if (!ISSUE_TYPES.includes(i?.type)) e.push('type:invalid');
  if (!String(i?.text || '').trim()) e.push('text:missing');
  if (!i?.by) e.push('by:missing');
  return { ok: e.length === 0, errors: e };
}

// ───────────────────────── decision gate ─────────────────────────
/** Never uses follower counts. A pilot of ~30 spread over 5 groups normally CANNOT pass — by design. */
export function decisionGate(metrics, bySlot, { minContacted = 30, minGroupContacted = 10, minGroups = 2 } = {}) {
  const c = metrics.counts.contacted;
  const groupsOk = Object.values(bySlot).filter(g => g.contacted >= minGroupContacted).length;
  const reasons = [];
  if (c < minContacted) reasons.push(`only ${c} contacted (need ≥ ${minContacted}) — not enough to judge the pilot`);
  if (groupsOk < minGroups) reasons.push(`${groupsOk} group(s) with ≥ ${minGroupContacted} contacted (need ≥ ${minGroups}) — group rates are descriptive only`);
  if (metrics.counts.still_open > 0) reasons.push(`${metrics.counts.still_open} contacted creator(s) still open (no reply, no closure) — wait for follow-ups before reading response rates`);
  if (metrics.counts.product_sent > metrics.counts.content_received) reasons.push('sent products are still waiting for content — content and posting rates are provisional');
  return {
    ready: reasons.length === 0, reasons,
    meaning: 'Passing the gate only means the sample is large enough to READ the results. It is not a success signal: "30 contacted" is a sample size, not 30 messages sent and not a good outcome.',
    rule: 'Decide from response and content behaviour (reply, acceptance, address, content, post), per group with n ≥ 10. Follower count is not an input.',
    next: reasons.length ? 'Keep collecting: finish follow-ups, wait for content, then re-run the report; add a second pilot batch only for groups that show real replies.' : 'Compare groups on reply → acceptance → content → post; scale only the groups where those behaviours are observed.',
  };
}

// ───────────────────────── report ─────────────────────────
const countBy = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); if (k === null || k === undefined) return m; m[k] = (m[k] || 0) + 1; return m; }, {});
/** ctx: { queue (scoped), reviews (all), members, issues, allocation, mergeRejected, strict } */
export function pilotReport({ queue = [], reviews = [], members = [], issues = [], allocation = PILOT_ALLOCATION, mergeRejected = 0, strict = true, now = new Date() } = {}) {
  const inQ = new Set(queue.map(q => q.id));
  const latest = V.latestReviews(reviews.filter(r => inQ.has(r.creator_id)));
  const rows = queue.filter(q => latest.has(q.id)).map(q => { const r = latest.get(q.id); return { q, r, v: V.deriveVerdict(r, q, { strict }), comp: V.reviewCompleteness(r) }; });
  const primary = countBy(rows, x => x.v.primary);
  const labels = countBy(rows.flatMap(x => x.v.labels), x => x);
  const qualified = rows.filter(x => QUALIFIED.includes(x.v.primary)).length;
  const secs = rows.map(x => x.r.seconds).filter(s => s !== null && s !== undefined).sort((a, b) => a - b);
  const data = {
    scope_total: queue.length, manually_added: queue.filter(q => q.added_manually).length, reviewed: rows.length, not_yet_reviewed: queue.length - rows.length, complete_8_of_8: rows.filter(x => x.comp.complete).length,
    qualified, needs_review: primary.needs_review || 0, rejected: primary.not_relevant || 0, by_primary: primary, by_label: labels,
    review_seconds: { median: secs.length ? secs[Math.floor(secs.length / 2)] : null, over_90s: secs.filter(s => s > 90).length, timed: secs.length },
  };
  const metrics = pilotMetrics(members);
  const bySlot = breakdown(members, 'slot');
  const dims = Object.fromEntries(['slot', 'segment', 'creator_type', 'follower_tier', 'platform', 'pilot_group', 'contact_method'].map(d => [d, breakdown(members, d)]));
  const gate = decisionGate(metrics, bySlot);
  // operational findings
  const missingQ = countBy(rows.filter(x => !x.comp.complete).flatMap(x => x.comp.missing), q => q);
  const hard = countBy(rows.flatMap(x => x.r.hard_fields || []), q => q);
  const cat = {}; rows.forEach(x => { const k = x.q.main_category || 'unknown'; (cat[k] ||= { reviewed: 0, qualified: 0 }); cat[k].reviewed++; if (QUALIFIED.includes(x.v.primary)) cat[k].qualified++; });
  const items = rows.map(x => ({ creator: { ...x.q, id: x.q.id }, review: x.r, verdict: x.v }));
  const pilotPlan = buildPilot(items, allocation, { onlyTier: null });
  const paidTrack = rows.filter(x => x.v.labels.includes('paid_inquiry')).map(x => ({ id: x.q.id, name: x.q.display_name, followers: x.q.follower_count, best_contact: (V.deriveVerdict(x.r, x.q, { strict }).contact_rank), reviewer: x.r.reviewer, in_gifting_pilot: false, reason_not_in_gifting_pilot: 'reviewer recommended a PAID inquiry — separate track (rate, negotiation, expected return); kept out so it does not distort the gifting/PR pilot' }));
  const issuesBy = countBy(issues, i => i.type);
  const listOf = t => issues.filter(i => i.type === t).map(i => ({ text: i.text, by: i.by, at: i.at, creator_id: i.creator_id }));
  const ops = {
    slowed_reviewers: countBy(rows, x => x.r.slow_reason), fields_hard_to_verify: { flagged_by_reviewers: hard, left_unanswered: missingQ },
    helpful_sources: countBy(rows, x => x.r.helpful_source), hardest_categories: { qualified_by_category: cat, pilot_shortage: pilotPlan.slots.filter(s => s.shortage).map(s => ({ slot: s.label, have: s.count, target: s.target })) },
    contact_methods: dims.contact_method, notes_from_team: { slow: listOf('slow'), hard_to_verify: listOf('hard_to_verify'), source_useful: listOf('source_useful'), hard_category: listOf('hard_category'), contact_method_worked: listOf('contact_method_worked') },
  };
  const system = { counts: issuesBy, ui_bugs: listOf('ui_bug'), workflow_bugs: listOf('workflow_bug'), missing_fields: listOf('missing_field'), persistence: listOf('persistence'), export_merge: listOf('export_merge'), merge_rejected_rows: mergeRejected };
  return { generated_at: new Date(now).toISOString(), data, outreach: metrics.counts, rates: metrics.rates, days: metrics.days, content: { product_sent: metrics.counts.product_sent, content_received: metrics.counts.content_received, posted: metrics.counts.posted }, by_slot: bySlot, dimensions: dims, operational: ops, system, gate, paid_inquiry_track: paidTrack, pilot_plan_from_reviews: { total: pilotPlan.total, shortage: pilotPlan.shortage, slots: pilotPlan.slots.map(s => ({ label: s.label, count: s.count, target: s.target, shortage: s.shortage })) } };
}

const pct = r => (r.n ? `${r.pct}% (${r.k}/${r.n}${r.low_sample ? ', n<10' : ''})` : '— (no denominator)');
const tbl = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');
const kv = o => (Object.keys(o).length ? Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(' · ') : 'none recorded');
export function pilotReportMarkdown(rep) {
  const d = rep.data, o = rep.outreach, r = rep.rates, dy = rep.days;
  const dimTable = name => tbl([name, 'selected', 'contacted', 'replied', 'interested', 'accepted', 'sent', 'content', 'posted', 'declined', 'no resp.', 'reply rate', 'note'],
    Object.entries(rep.dimensions[name]).map(([k, g]) => [k, g.selected, g.contacted, g.replied, g.interested, g.accepted, g.product_sent, g.content_received, g.posted, g.declined, g.no_response, pct(g.contact_response_rate), g.low_sample ? 'descriptive only' : 'directional']));
  return `# Creator pilot — decision report
Generated ${rep.generated_at}. **The pilot is evidence collection, not a verdict on any segment.** Every rate shows its denominator; groups with fewer than ${MIN_SAMPLE} contacted creators are descriptive only. Follower count is not a decision input.

## DATA
- Queue in scope: ${d.scope_total}${d.manually_added ? ` (of which ${d.manually_added} added manually by the team after the pilot started — research data for them is not available)` : ''} · Reviewed: **${d.reviewed}** (8/8 answered: ${d.complete_8_of_8}) · Not yet reviewed: ${d.not_yet_reviewed}
- Qualified (PR Ready / UGC Ready / Expert / Paid Inquiry): **${d.qualified}** · Needs Review: **${d.needs_review}** · Rejected (Not Relevant): **${d.rejected}**
- Labels (a creator can hold several): ${kv(d.by_label)}
- Review time: median ${d.review_seconds.median ?? '—'} s, ${d.review_seconds.over_90s} of ${d.review_seconds.timed} timed reviews over 90 s

## OUTREACH
Contacted **${o.contacted}** · Replied **${o.replied}** · Interested **${o.interested}** · Accepted **${o.accepted}** · Declined **${o.declined}** · No response **${o.no_response}** · Do not contact ${o.do_not_contact} · Still open ${o.still_open}

## CONTENT
Address received ${o.address_received} · Product Sent **${o.product_sent}** · Product Received ${o.product_received} · Content Received **${o.content_received}** · Posted **${o.posted}**

## PILOT SUCCESS METRICS
${tbl(['metric', 'value'], [
    ['1. Contact response rate (replied or declined / contacted)', pct(r.contact_response_rate)],
    ['2. Positive response rate (interested or beyond / contacted)', pct(r.positive_response_rate)],
    ['3. Gift acceptance rate (accepted / contacted)', pct(r.gift_acceptance_rate)],
    ['   … among responders', pct(r.acceptance_among_responders)],
    ['4. Address completion rate (address / accepted)', pct(r.address_completion_rate)],
    ['5. Content completion rate (content / product received)', pct(r.content_completion_rate)],
    ['6. Posting rate (posted / content received)', pct(r.posting_rate)],
    ['   … posted / contacted', pct(r.posted_of_contacted)],
    ['7. Average days to response', dy.avg_days_to_response.n ? `${dy.avg_days_to_response.mean} (median ${dy.avg_days_to_response.median}, n=${dy.avg_days_to_response.n})` : '— no data yet'],
    ['8. Average days to content (product received → content)', dy.avg_days_to_content.n ? `${dy.avg_days_to_content.mean} (median ${dy.avg_days_to_content.median}, n=${dy.avg_days_to_content.n})` : '— no data yet'],
    ['   … contact → content', dy.avg_days_contact_to_content.n ? `${dy.avg_days_contact_to_content.mean} (n=${dy.avg_days_contact_to_content.n})` : '— no data yet'],
    ['9. No-response rate (closed no-response / contacted)', pct(r.no_response_rate)],
  ])}

## SEGMENT RESULTS
${dimTable('slot')}

## BREAKDOWNS (descriptive)
${['segment', 'creator_type', 'follower_tier', 'platform', 'pilot_group', 'contact_method'].map(n => `### by ${n}\n${dimTable(n)}`).join('\n\n')}

## OPERATIONAL FINDINGS
- What slowed reviewers down: ${kv(rep.operational.slowed_reviewers)}
- Fields flagged hard to verify: ${kv(rep.operational.fields_hard_to_verify.flagged_by_reviewers)} · questions left unanswered: ${kv(rep.operational.fields_hard_to_verify.left_unanswered)}
- Most useful evidence: ${kv(rep.operational.helpful_sources)}
- Hardest categories to find: ${rep.operational.hardest_categories.pilot_shortage.length ? rep.operational.hardest_categories.pilot_shortage.map(s => `${s.slot} ${s.have}/${s.target}`).join(' · ') : 'no shortage recorded'} · qualified by category: ${Object.entries(rep.operational.hardest_categories.qualified_by_category).map(([k, v]) => `${k} ${v.qualified}/${v.reviewed}`).join(' · ') || 'none'}
- Contact methods (descriptive, tiny n): see “by contact_method” above
- Team notes: ${Object.entries(rep.operational.notes_from_team).map(([k, v]) => `${k}: ${v.length ? v.map(i => i.text).join(' / ') : '—'}`).join(' | ')}

## SYSTEM ISSUES
UI bugs: ${rep.system.ui_bugs.map(i => i.text).join(' / ') || 'none logged'} · Workflow bugs: ${rep.system.workflow_bugs.map(i => i.text).join(' / ') || 'none logged'} · Missing fields: ${rep.system.missing_fields.map(i => i.text).join(' / ') || 'none logged'} · Persistence: ${rep.system.persistence.map(i => i.text).join(' / ') || 'none logged'} · Export/merge: ${rep.system.export_merge.map(i => i.text).join(' / ') || 'none logged'} · Rows rejected while merging: ${rep.system.merge_rejected_rows}

## PAID INQUIRY TRACK (outside the gifting pilot)
${rep.paid_inquiry_track.length ? rep.paid_inquiry_track.map(p => `- ${p.name} — ${p.reason_not_in_gifting_pilot}`).join('\n') : '- none identified yet'}

## DECISION GATE
${rep.gate.ready ? '**Enough evidence to READ the results (not a verdict of success).**' : '**Not enough evidence yet — do not scale or write off any segment.**'}
${rep.gate.meaning}
${rep.gate.reasons.map(x => `- ${x}`).join('\n') || '- all gate conditions met'}
Rule: ${rep.gate.rule}
Next: ${rep.gate.next}
`;
}
