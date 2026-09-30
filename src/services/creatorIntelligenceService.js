// =============================================================
// creatorIntelligenceService — Creator Intelligence (صناع المحتوى)
// Tables: creator_* (migration 20260930_creator_intelligence.sql)
// Pure logic lives in creatorLogic.js (node-testable). Here: data access only.
// Rule: unknown = null. Nothing is inferred or invented in this layer.
// =============================================================
import { supabase } from './supabase';
import {
  contactabilityScore, computeScores, verificationLevel, findDuplicates, parseProfileUrl,
  validateImportRow, normalizeHandle, estimateRate, toNum,
} from './creatorLogic';

export * from './creatorLogic';

const PAGE = 1000;
async function fetchAll(table, select = '*', build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (build) q = build(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

const groupBy = (rows, key) => rows.reduce((m, r) => { (m[r[key]] ||= []).push(r); return m; }, {});

/** All creators, enriched with platforms/contacts/audience — derived fields computed here, never stored. */
export async function listCreators() {
  const [profiles, plats, contacts, audience, members] = await Promise.all([
    fetchAll('creator_profiles'),
    fetchAll('creator_platform_profiles'),
    fetchAll('creator_contacts'),
    fetchAll('creator_audience_metrics', '*', q => q.eq('dimension', 'country').eq('key', 'SY')),
    fetchAll('creator_campaign_members', 'creator_id,campaign_id,campaign_status'),
  ]);
  const P = groupBy(plats, 'creator_id'), C = groupBy(contacts, 'creator_id'), M = groupBy(members, 'creator_id');
  const A = {};
  audience.sort((a, b) => new Date(a.observed_at) - new Date(b.observed_at)).forEach(a => { A[a.creator_id] = a; }); // latest wins
  return profiles.map(p => {
    const platforms = (P[p.id] || []).map(x => ({ ...x }));
    const followers = platforms.map(x => toNum(x.followers)).filter(v => v !== null);
    const follower_count = followers.length ? Math.max(...followers) : null; // highest platform; not a sum (audiences overlap)
    const main = [...platforms].sort((a, b) => (toNum(b.followers) ?? -1) - (toNum(a.followers) ?? -1))[0];
    const contactsList = C[p.id] || [];
    const contactability_score = contactabilityScore(contactsList);
    const row = {
      ...p,
      city: p.creator_city,
      platforms, contacts: contactsList,
      follower_count,
      average_views: main ? toNum(main.avg_views) : null,
      engagement_rate: main ? toNum(main.engagement_rate) : null,
      last_post_at: platforms.map(x => x.last_post_at).filter(Boolean).sort().pop() || null,
      audience_syria_pct: A[p.id] ? toNum(A[p.id].pct) : null,
      contactability_score,
      campaign_ids: (M[p.id] || []).map(m => m.campaign_id),
    };
    return { ...row, ...computeScores(row) };
  });
}

export async function getCreatorDetail(id) {
  const [sources, audience, rates, collabs, snapshots, members] = await Promise.all([
    supabase.from('creator_sources').select('*').eq('creator_id', id).order('observed_at', { ascending: false }),
    supabase.from('creator_audience_metrics').select('*').eq('creator_id', id),
    supabase.from('creator_rate_history').select('*').eq('creator_id', id).order('created_at', { ascending: false }),
    supabase.from('creator_collab_history').select('*').eq('creator_id', id).order('content_date', { ascending: false }),
    supabase.from('creator_metrics_snapshots').select('*').eq('creator_id', id).order('captured_at'),
    supabase.from('creator_campaign_members').select('*, creator_campaigns(name)').eq('creator_id', id),
  ]);
  for (const r of [sources, audience, rates, collabs, snapshots, members]) if (r.error) throw r.error;
  return { sources: sources.data, audience: audience.data, rates: rates.data, collabs: collabs.data, snapshots: snapshots.data, memberships: members.data };
}

/** Benchmark sets grouped by source, best scope first (syria > mena > global). A set carries its own real scope. */
const SCOPE_RANK = { syria: 0, mena: 1, global: 2 };
export async function listBenchmarks(market = 'syria') {
  const { data, error } = await supabase.from('creator_benchmarks').select('*').eq('market', market);
  if (error) throw error;
  if (!data?.length) return null;
  const bySource = {};
  data.forEach(r => { (bySource[r.benchmark_source] ||= []).push(r); });
  return Object.values(bySource).map(rows => ({
    source: rows[0].benchmark_source, source_url: rows[0].source_url, date: rows[0].benchmark_date,
    scope: rows[0].market_scope || rows[0].benchmark_scope, confidence: rows[0].confidence, id: rows[0].id,
    rows: rows.map(r => ({ platform: r.platform, content_format: r.content_format, tier_key: r.tier_key, low: +r.low, mid: +r.mid, high: +r.high, currency: r.currency })),
  })).sort((a, b) => (SCOPE_RANK[a.scope] ?? 9) - (SCOPE_RANK[b.scope] ?? 9));
}

/** Estimated rate for a creator row. `benchmarks` = one set or the sorted list from listBenchmarks(). Unknown (null) when no set has a matching tier row. */
export function estimateForCreator(row, benchmarks, content_format = 'reel', extra = {}) {
  const p = [...(row.platforms || [])].sort((a, b) => (toNum(b.followers) ?? -1) - (toNum(a.followers) ?? -1))[0];
  if (!p) return null;
  const input = {
    follower_count: p.followers, average_views: p.avg_views, engagement_rate: p.engagement_rate,
    audience_syria_pct: row.audience_syria_pct, platform: p.platform, content_format, market: row.market, ...extra,
  };
  for (const set of [].concat(benchmarks || [])) {
    const est = estimateRate(input, set);
    if (est) return est;
  }
  return null;
}

/** Latest quoted rate (real price) for a creator, from rate history. */
export function latestQuoted(rates = []) {
  const q = rates.filter(r => r.kind === 'quoted').sort((a, b) => new Date(b.quoted_date) - new Date(a.quoted_date))[0];
  return q ? { amount: +q.quoted_rate, currency: q.currency, date: q.quoted_date, source: q.quoted_source, platform: q.platform, format: q.format } : null;
}

// ---------- writes (team-owned / research-owned kept separate) ----------
const nowIso = () => new Date().toISOString();

export async function updateCreatorFields(id, fields, by) {
  const { error } = await supabase.from('creator_profiles').update({ ...fields, updated_at: nowIso() }).eq('id', id);
  if (error) throw error;
  return by;
}

export async function assignCreators(ids, assignee) {
  const { error } = await supabase.from('creator_profiles').update({ assigned_to: assignee || null, updated_at: nowIso() }).in('id', ids);
  if (error) throw error;
}

export async function addQuotedRate(creatorId, { amount, currency, platform, format, date, source }) {
  if (toNum(amount) === null || !source || !date) throw new Error('السعر المؤكَّد يحتاج مبلغ + مصدر + تاريخ');
  const { error } = await supabase.from('creator_rate_history').insert({
    creator_id: creatorId, kind: 'quoted', quoted_rate: amount, currency, platform, format, quoted_date: date, quoted_source: source,
  });
  if (error) throw error;
}

// ---------- campaigns ----------
export async function listCampaigns() {
  const [c, m] = await Promise.all([
    supabase.from('creator_campaigns').select('*').order('created_at', { ascending: false }),
    fetchAll('creator_campaign_members', 'campaign_id,campaign_status,assigned_to'),
  ]);
  if (c.error) throw c.error;
  const G = groupBy(m, 'campaign_id');
  return (c.data || []).map(x => ({ ...x, members: G[x.id] || [] }));
}

export async function createCampaign({ name, kind, product, target_count, filter_json }, by) {
  const id = `CMP-${Date.now().toString(36)}`;
  const { error } = await supabase.from('creator_campaigns').insert({ id, name, kind, product, target_count, filter_json, created_by: by, status: 'draft' });
  if (error) throw error;
  return id;
}

/** Adds selected creators; assignments = { assigneeName: [creatorIds] } */
export async function addCampaignMembers(campaignId, assignments, by) {
  const rows = [];
  Object.entries(assignments).forEach(([assignee, ids]) => ids.forEach(cid => rows.push({
    campaign_id: campaignId, creator_id: cid, campaign_status: assignee ? 'assigned' : 'selected', assigned_to: assignee || null, updated_by: by,
  })));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('creator_campaign_members').upsert(rows.slice(i, i + 500), { onConflict: 'campaign_id,creator_id', ignoreDuplicates: true });
    if (error) throw error;
  }
  return rows.length;
}

export async function listCampaignMembers(campaignId) {
  return fetchAll('creator_campaign_members', '*, creator_profiles(display_name,creator_city,main_category)', q => q.eq('campaign_id', campaignId));
}

export async function updateMemberOutreach(memberId, patch, by) {
  const upd = { ...patch, updated_at: nowIso(), updated_by: by };
  if (patch.campaign_status === 'contacted') { upd.last_contacted_at = nowIso(); }
  const { error } = await supabase.from('creator_campaign_members').update(upd).eq('id', memberId);
  if (error) throw error;
}

// ---------- import (validated + deduped; never inserts junk) ----------
/** Dry-run: classify each CSV row as new / duplicate / manual_review / invalid. Writes nothing. */
export function planImport(rows, existing, ctx = {}) {
  const plan = { new: [], duplicate: [], manual_review: [], invalid: [] };
  const seen = [];
  rows.forEach((raw, i) => {
    const v = validateImportRow(raw, ctx);
    if (!v.ok) { plan.invalid.push({ line: i + 2, errors: v.errors, raw }); return; }
    const cand = {
      display_name: v.value.display_name,
      platforms: [{ platform: v.value.platform, handle: v.value.handle, profile_url: v.value.profile_url }],
      contacts: [v.value.email && { type: 'email', value: v.value.email }, v.value.whatsapp && { type: 'whatsapp', value: v.value.whatsapp }].filter(Boolean),
    };
    const dups = findDuplicates(cand, [...existing, ...seen]);
    if (dups[0]?.decision === 'duplicate') plan.duplicate.push({ line: i + 2, value: v.value, matched: dups[0].existing.id || dups[0].existing.display_name });
    else if (dups[0]?.decision === 'manual_review') { plan.manual_review.push({ line: i + 2, value: v.value, matched: dups[0].existing.id || dups[0].existing.display_name }); seen.push(cand); }
    else { plan.new.push({ line: i + 2, value: v.value }); seen.push(cand); }
  });
  return plan;
}

/** Commits plan.new (+ manual_review flagged for review). Every row gets a creator_sources evidence row. */
export async function commitImport(plan, ctx, by) {
  const items = [...plan.new.map(x => ({ ...x, review: false })), ...plan.manual_review.map(x => ({ ...x, review: true }))];
  let n = 0;
  for (const it of items) {
    const v = it.value;
    const id = `CRT-${v.market.slice(0, 3).toUpperCase()}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const observed = ctx.observed_at || nowIso();
    const { error: e1 } = await supabase.from('creator_profiles').insert({
      id, market: v.market, display_name: v.display_name, username: v.handle, main_category: v.category, creator_city: v.city,
      needs_manual_review: it.review, created_by: by, last_verified_at: observed, source_count: 1, notes: v.notes,
      verification_level: verificationLevel([{ provider: v.source_provider, source_url: v.source_url }], true),
      data_confidence: ctx.confidence || 'low',
    });
    if (e1) throw e1;
    const { error: e2 } = await supabase.from('creator_platform_profiles').insert({
      creator_id: id, platform: v.platform, handle: v.handle, profile_url: v.profile_url, followers: v.followers,
      engagement_rate: v.engagement_rate, avg_views: v.average_views, metrics_observed_at: v.followers !== null ? observed : null,
    });
    if (e2) throw e2;
    const src = { creator_id: id, provider: v.source_provider, source_type: ctx.source_type || 'public_profile', source_url: v.source_url, observed_at: observed, confidence: ctx.confidence || 'low' };
    const evid = [{ ...src, field: 'profile' }];
    if (v.followers !== null) evid.push({ ...src, field: 'followers', value_text: String(v.followers) });
    const { error: e3 } = await supabase.from('creator_sources').insert(evid);
    if (e3) throw e3;
    const contacts = [
      v.email && { type: 'email', value: v.email }, v.whatsapp && { type: 'whatsapp', value: v.whatsapp },
    ].filter(Boolean).map(c => ({ creator_id: id, ...c, source_url: v.source_url, source_type: ctx.source_type || 'public_profile', verified_at: observed }));
    if (contacts.length) { const { error: e4 } = await supabase.from('creator_contacts').insert(contacts); if (e4) throw e4; }
    n++;
  }
  return n;
}

export { parseProfileUrl, normalizeHandle };
