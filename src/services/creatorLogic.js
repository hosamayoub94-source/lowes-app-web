// Creator Intelligence — pure logic (no supabase import, node-testable).
// Rule: unknown stays null. Nothing here invents a number; every estimate is labelled.

export const MARKETS = ['syria', 'turkey', 'uae', 'lebanon', 'jordan', 'iraq', 'saudi', 'kuwait', 'libya', 'other'];
export const PLATFORMS = ['instagram', 'tiktok', 'facebook', 'youtube', 'snapchat', 'other'];
export const CREATOR_TYPES = [
  'ugc', 'nano', 'micro', 'mid', 'macro', 'celebrity', 'blogger', 'publisher',
  'reviewer', 'beauty_creator', 'expert', 'local_page', 'other',
];
export const SOURCE_PROVIDERS = ['modash', 'hypeauditor', 'manual', 'web', 'youtube_api', 'tiktok', 'meta', 'other'];
export const CREATOR_STATUSES = ['discovered', 'qualified', 'do_not_contact', 'rejected'];
export const CAMPAIGN_STATUSES = [
  'selected', 'assigned', 'contact_pending', 'contacted', 'replied', 'interested', 'not_interested',
  'address_requested', 'product_sent', 'received', 'content_pending', 'content_received', 'posted',
  'no_response', 'rejected', 'do_not_contact',
];
export const SYRIA_CITIES = [
  'damascus', 'rif_dimashq', 'aleppo', 'homs', 'hama', 'latakia', 'tartus', 'daraa', 'sweida',
  'idlib', 'deir_ez_zor', 'raqqa', 'hasakah', 'quneitra', 'other', 'unknown',
];

// ---- Follower tiers (computed, never stored) ----
export const TIERS = [
  { key: 'under_1k', min: 0, max: 1000, label: 'أقل من 1K' },
  { key: '1k_5k', min: 1000, max: 5000, label: '1K–5K' },
  { key: '5k_10k', min: 5000, max: 10000, label: '5K–10K' },
  { key: '10k_25k', min: 10000, max: 25000, label: '10K–25K' },
  { key: '25k_50k', min: 25000, max: 50000, label: '25K–50K' },
  { key: '50k_100k', min: 50000, max: 100000, label: '50K–100K' },
  { key: '100k_250k', min: 100000, max: 250000, label: '100K–250K' },
  { key: '250k_500k', min: 250000, max: 500000, label: '250K–500K' },
  { key: '500k_1m', min: 500000, max: 1000000, label: '500K–1M' },
  { key: '1m_plus', min: 1000000, max: Infinity, label: '+1M' },
];

export function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function tierOf(followers) {
  const n = toNum(followers);
  if (n === null || n < 0) return null; // unknown, not "under 1K"
  return TIERS.find(t => n >= t.min && n < t.max) || null;
}
export const tierKey = f => tierOf(f)?.key ?? 'unknown';

// ---- Freshness (configurable thresholds, days) ----
export const FRESHNESS_DEFAULTS = { freshDays: 30, agedDays: 90 };
export function freshness(verifiedAt, now = new Date(), cfg = FRESHNESS_DEFAULTS) {
  if (!verifiedAt) return 'unknown';
  const t = new Date(verifiedAt).getTime();
  if (!Number.isFinite(t)) return 'unknown';
  const days = (new Date(now).getTime() - t) / 86400000;
  if (days < cfg.freshDays) return 'fresh';
  if (days <= cfg.agedDays) return 'aged';
  return 'stale';
}

// ---- Normalisation ----
export function normalizeHandle(h) {
  if (h === null || h === undefined) return null;
  const s = String(h).trim().replace(/^@+/, '').toLowerCase();
  return s || null;
}

const HOST_PLATFORM = [
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(facebook|fb)\.com$/, 'facebook'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)snapchat\.com$/, 'snapchat'],
];

// Returns {ok, url, platform, handle, error}
export function parseProfileUrl(raw) {
  if (!raw || typeof raw !== 'string') return { ok: false, error: 'empty_url' };
  let s = raw.trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch { return { ok: false, error: 'invalid_url' }; }
  const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  const hit = HOST_PLATFORM.find(([re]) => re.test(host));
  if (!hit) return { ok: false, error: 'unsupported_host' };
  const platform = hit[1];
  const parts = u.pathname.split('/').filter(Boolean);
  let handle = null;
  if (platform === 'youtube') {
    const first = parts[0] || '';
    handle = first.startsWith('@') ? first.slice(1) : (['channel', 'c', 'user'].includes(first) ? parts[1] : null);
  } else if (platform === 'facebook') {
    handle = parts[0] === 'profile.php' ? u.searchParams.get('id') : parts[0];
  } else {
    handle = parts[0] || null;
  }
  handle = normalizeHandle(handle);
  if (!handle) return { ok: false, error: 'no_handle', platform };
  if (['p', 'reel', 'reels', 'explore', 'video', 'watch', 'share', 'sharer.php'].includes(handle)) {
    return { ok: false, error: 'not_a_profile_url', platform };
  }
  const fbId = platform === 'facebook' && parts[0] === 'profile.php' ? u.search.match(/id=(\d+)/) : null;
  return { ok: true, platform, handle, url: fbId ? `https://${host}/profile.php?id=${fbId[1]}` : `https://${host}${u.pathname.replace(/\/+$/, '')}` };
}

export function normalizeName(n) {
  if (!n) return '';
  return String(n)
    .normalize('NFKD')
    .replace(/[ً-ٰٟـ]/g, '') // tashkeel + tatweel
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim().toLowerCase();
}

export function nameSimilarity(a, b) {
  const x = normalizeName(a), y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bi = s => { const set = new Set(); for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2)); return set; };
  const A = bi(x), B = bi(y);
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach(g => { if (B.has(g)) inter++; });
  return (2 * inter) / (A.size + B.size);
}

export function normalizePhone(p) {
  if (!p) return null;
  const d = String(p).replace(/[^\d+]/g, '').replace(/^00/, '+');
  return d.replace(/\D/g, '').length >= 7 ? d : null;
}
export function normalizeEmail(e) {
  if (!e) return null;
  const s = String(e).trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : null;
}
export function normalizeWebsite(w) {
  if (!w) return null;
  return String(w).trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '') || null;
}

// ---- Duplicate detection ----
// candidate/existing: { display_name, website, platforms:[{platform,handle,profile_url}], contacts:[{type,value}] }
// Strong signals => 'duplicate'. Name-only similarity => 'manual_review'. Never auto-merges on name alone.
export function duplicateCheck(candidate, existing) {
  const keys = c => {
    const set = new Set();
    (c.platforms || []).forEach(p => {
      const h = normalizeHandle(p.handle);
      if (p.platform && h) set.add(`h:${p.platform}:${h}`);
      const parsed = p.profile_url ? parseProfileUrl(p.profile_url) : null;
      if (parsed?.ok) set.add(`h:${parsed.platform}:${parsed.handle}`);
    });
    const w = normalizeWebsite(c.website); if (w) set.add(`w:${w}`);
    (c.contacts || []).forEach(ct => {
      if (ct.type === 'email') { const e = normalizeEmail(ct.value); if (e) set.add(`e:${e}`); }
      if (['phone', 'whatsapp'].includes(ct.type)) { const p = normalizePhone(ct.value); if (p) set.add(`p:${p}`); }
    });
    return set;
  };
  const a = keys(candidate), b = keys(existing);
  const shared = [...a].filter(k => b.has(k));
  if (shared.length) {
    const platformOnly = shared.every(k => k.startsWith('h:'));
    return { duplicate_confidence: platformOnly ? 0.95 : 0.99, decision: 'duplicate', matched_on: shared };
  }
  const sim = nameSimilarity(candidate.display_name, existing.display_name);
  if (sim >= 0.85) return { duplicate_confidence: Math.round(sim * 50) / 100, decision: 'manual_review', matched_on: ['name_similarity'] };
  return { duplicate_confidence: 0, decision: 'distinct', matched_on: [] };
}

export function findDuplicates(candidate, pool) {
  return pool
    .map(e => ({ existing: e, ...duplicateCheck(candidate, e) }))
    .filter(r => r.decision !== 'distinct')
    .sort((x, y) => y.duplicate_confidence - x.duplicate_confidence);
}

// ---- Verification level ----
// sources: [{ source_type, source_url, provider, ... }]; hasDirectProfile: a direct platform URL exists.
export function verificationLevel(sources = [], hasDirectProfile = false) {
  const withUrl = sources.filter(s => s && s.source_url);
  const independent = new Set(withUrl.map(s => `${s.provider || ''}|${hostOf(s.source_url)}`));
  if (independent.size >= 2 && hasDirectProfile) return 'A';
  if (independent.size >= 1 && hasDirectProfile) return 'B';
  if (withUrl.length >= 1 || hasDirectProfile) return 'C';
  return 'Unknown';
}
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return String(u); } }

// ---- Contactability (separate from influence) ----
// Hierarchy (1 = best). DM channels only mean "a profile exists"; whether DMs are open is NOT known.
export const CONTACT_RANK = {
  management: 1, agency: 1, management_email: 1,
  email: 2,
  whatsapp: 3,
  phone: 4, business_phone: 4,
  website: 5,
  instagram_dm: 6, tiktok_dm: 7, facebook_messenger: 8,
};
export const CONTACT_RANK_SCORE = { 1: 100, 2: 90, 3: 80, 4: 65, 5: 50, 6: 35, 7: 30, 8: 25 };
export function contactRank(c) { return c ? (CONTACT_RANK[c.type] ?? null) : null; }
export function bestContact(contacts = []) {
  const ok = contacts.filter(c => c && c.is_public !== false && c.source_url && contactRank(c) !== null);
  if (!ok.length) return { rank: 9, type: null, score: 0 };
  const best = ok.reduce((a, b) => (contactRank(b) < contactRank(a) ? b : a));
  return { rank: contactRank(best), type: best.type, score: CONTACT_RANK_SCORE[contactRank(best)] };
}
export function contactabilityScore(contacts = []) {
  const ok = contacts.filter(c => c && c.is_public !== false && c.source_url && contactRank(c) !== null);
  if (!ok.length) return 0;
  const best = bestContact(ok);
  const distinct = new Set(ok.map(c => contactRank(c))).size;
  return Math.min(100, best.score + (distinct - 1) * 5); // extra distinct channels add a little
}
// ---- Rate estimation (Estimated only; never a quote) ----
// benchmark: { rows: [{platform, content_format, tier_key, low, mid, high, currency}], source, date, scope }
// Returns null when there is no benchmark or no follower/view basis.
export function estimateRate(input, benchmark) {
  if (!benchmark || !Array.isArray(benchmark.rows) || !benchmark.source) return null;
  const followers = toNum(input.follower_count);
  const avgViews = toNum(input.average_views);
  if (followers === null && avgViews === null) return null;
  const tk = tierKey(followers);
  // exact platform+format first; then same-platform generic 'post'; then platform-agnostic 'any'+'post' (still labelled with its real scope)
  const rows = benchmark.rows.filter(r => r.tier_key === tk);
  const row = rows.find(r => r.platform === input.platform && r.content_format === input.content_format)
    || rows.find(r => r.platform === input.platform && r.content_format === 'post')
    || rows.find(r => r.platform === 'any' && r.content_format === 'post');
  if (!row) return null;
  let mult = 1;
  const er = toNum(input.engagement_rate);
  if (er !== null) mult *= er >= 6 ? 1.15 : er < 1.5 ? 0.85 : 1;
  const syr = toNum(input.audience_syria_pct);
  if (syr !== null && input.market === 'syria') mult *= syr >= 60 ? 1.1 : syr < 25 ? 0.8 : 1;
  if (input.usage_rights) mult *= 1.25;
  if (input.exclusivity) mult *= 1.3;
  if (input.production_complexity === 'high') mult *= 1.2;
  const r2 = v => Math.round(v * mult);
  // confidence from how many inputs we actually had
  const have = [followers, avgViews, er, syr].filter(v => v !== null).length;
  let confidence = have >= 4 ? 'medium' : 'low';
  const scope = String(benchmark.scope || 'global').toLowerCase();
  if (scope === 'syria' && have >= 4 && benchmark.confidence === 'high') confidence = 'high';
  if (scope === 'global') confidence = 'low'; // never present a global benchmark as a Syrian price
  if (scope === 'mena' && confidence === 'high') confidence = 'medium';
  return {
    label: 'Estimated', // UI must show "Estimated", never "Price"
    estimated_low: r2(row.low), estimated_mid: r2(row.mid), estimated_high: r2(row.high),
    currency: row.currency,
    confidence,
    basis: { benchmark_source: benchmark.source, benchmark_source_url: benchmark.source_url || null, benchmark_date: benchmark.date || null, benchmark_scope: benchmark.scope || null, benchmark_confidence: benchmark.confidence || null, matched_format: row.content_format, matched_platform: row.platform, tier: tk },
  };
}

// Display helper: quoted always wins and is shown separately; estimate never overwrites it.
export function rateDisplay(quoted, estimate) {
  return {
    quoted: quoted && toNum(quoted.amount) !== null ? { amount: toNum(quoted.amount), currency: quoted.currency || null, date: quoted.date || null, source: quoted.source || null } : null,
    estimated: estimate || null,
    unknown: !(quoted && toNum(quoted.amount) !== null) && !estimate,
  };
}

// ---- Scores (components always kept; final never hides raw) ----
const clamp = n => Math.max(0, Math.min(100, Math.round(n)));
const CONTENT_FIT = new Set(['beauty', 'skincare', 'makeup', 'hair', 'women', 'wellness', 'lifestyle', 'reviews', 'unboxing']);

export function computeScores(c) {
  const syr = toNum(c.audience_syria_pct);
  const audience_fit_score = syr === null ? null : clamp(syr);
  const cats = [c.main_category, ...(c.subcategories || [])].filter(Boolean);
  const content_fit_score = cats.length === 0 ? null : clamp((cats.filter(x => CONTENT_FIT.has(x)).length / cats.length) * 70 + (CONTENT_FIT.has(c.main_category) ? 30 : 0));
  const er = toNum(c.engagement_rate), av = toNum(c.average_views), fol = toNum(c.follower_count);
  let performance_score = null;
  if (er !== null || (av !== null && fol)) {
    const erPart = er === null ? null : Math.min(100, (er / 8) * 100);
    const viewPart = av !== null && fol ? Math.min(100, (av / fol) * 100) : null;
    const parts = [erPart, viewPart].filter(v => v !== null);
    performance_score = clamp(parts.reduce((a, b) => a + b, 0) / parts.length);
  }
  const authenticity_score = toNum(c.authenticity_external); // only from an external trusted indicator
  const ugcMap = { high: 90, medium: 60, low: 25 };
  const ugc_score = ugcMap[c.ugc_potential] ?? null;
  const pr_score = ({ high: 90, medium: 60, low: 25 })[c.pr_fit] ?? null;
  const paid_score = c.paid_collaboration === 'yes' && performance_score !== null ? clamp((performance_score + (audience_fit_score ?? 0)) / 2) : null;
  const contactability_score = toNum(c.contactability_score);
  const comps = { audience_fit_score, content_fit_score, performance_score, authenticity_score, ugc_score, pr_score, paid_score, contactability_score };
  const w = { audience_fit_score: 3, content_fit_score: 3, performance_score: 2, ugc_score: 1, pr_score: 1, contactability_score: 1 };
  let num = 0, den = 0;
  Object.entries(w).forEach(([k, wt]) => { if (comps[k] !== null && comps[k] !== undefined) { num += comps[k] * wt; den += wt; } });
  const creator_priority_score = den >= 4 ? clamp(num / den) : null; // needs enough real components
  return { ...comps, creator_priority_score };
}

// ---- Growth ----
export function growthStatus(snapshots = []) {
  const pts = snapshots.filter(s => toNum(s.followers) !== null && s.captured_at)
    .sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at));
  if (pts.length < 2) return { growth_status: 'unknown', growth_rate: null };
  const first = pts[0], last = pts[pts.length - 1];
  const days = (new Date(last.captured_at) - new Date(first.captured_at)) / 86400000;
  if (days < 14 || first.followers <= 0) return { growth_status: 'unknown', growth_rate: null };
  const rate = ((last.followers - first.followers) / first.followers) * 100;
  return { growth_rate: Math.round(rate * 10) / 10, growth_status: rate >= 10 ? 'rising' : rate <= -5 ? 'declining' : 'stable' };
}

// ---- Filtering (client side) ----
export function applyFilters(rows, f = {}, now = new Date()) {
  const inList = (v, list) => !list || list.length === 0 || list.includes(v);
  return rows.filter(r => {
    if (f.market && r.market !== f.market) return false;
    if (f.q) {
      const q = normalizeName(f.q);
      const hay = normalizeName([r.display_name, r.username, ...(r.platforms || []).map(p => p.handle)].join(' '));
      if (!hay.includes(q)) return false;
    }
    if (!inList(r.creator_type, f.creator_type)) return false;
    if (!inList(r.main_category, f.category)) return false;
    if (f.city && f.city.length && !f.city.includes(r.city || 'unknown')) return false;
    if (f.platform && f.platform.length && !(r.platforms || []).some(p => f.platform.includes(p.platform))) return false;
    if (f.tier && f.tier.length && !f.tier.includes(tierKey(r.follower_count))) return false;
    if (f.ugc_potential && f.ugc_potential.length && !f.ugc_potential.includes(r.ugc_potential || 'unknown')) return false;
    if (f.pr_fit && f.pr_fit.length && !f.pr_fit.includes(r.pr_fit || 'unknown')) return false;
    if (f.paid_collaboration && r.paid_collaboration !== f.paid_collaboration) return false;
    if (f.verification_level && f.verification_level.length && !f.verification_level.includes(r.verification_level || 'Unknown')) return false;
    if (f.minAudienceSyria !== undefined && f.minAudienceSyria !== null) {
      const v = toNum(r.audience_syria_pct); if (v === null || v < f.minAudienceSyria) return false;
    }
    if (f.minContactability !== undefined && f.minContactability !== null) {
      const v = toNum(r.contactability_score); if (v === null || v < f.minContactability) return false;
    }
    if (f.minEngagement !== undefined && f.minEngagement !== null) {
      const v = toNum(r.engagement_rate); if (v === null || v < f.minEngagement) return false;
    }
    if (f.minAvgViews !== undefined && f.minAvgViews !== null) {
      const v = toNum(r.average_views); if (v === null || v < f.minAvgViews) return false;
    }
    if (f.freshness && f.freshness.length && !f.freshness.includes(freshness(r.last_verified_at, now))) return false;
    if (f.assigned_to && r.assigned_to !== f.assigned_to) return false;
    if (f.outreach_status && f.outreach_status.length && !f.outreach_status.includes(r.outreach_status || 'none')) return false;
    if (f.campaign_id && !(r.campaign_ids || []).includes(f.campaign_id)) return false;
    if (f.recentlyActiveDays) {
      const t = r.last_post_at ? new Date(r.last_post_at).getTime() : NaN;
      if (!Number.isFinite(t) || (new Date(now).getTime() - t) / 86400000 > f.recentlyActiveDays) return false;
    }
    return true;
  });
}

// Saved filter presets required by the brief
export const SAVED_FILTER_PRESETS = [
  { id: 'sy_beauty_5k_25k_pr', label: 'سوريا — Beauty 5K-25K — PR', filter: { market: 'syria', category: ['beauty', 'skincare', 'makeup'], tier: ['5k_10k', '10k_25k'], pr_fit: ['high', 'medium'] } },
  { id: 'sy_ugc', label: 'سوريا — UGC', filter: { market: 'syria', ugc_potential: ['high', 'medium'] } },
  { id: 'sy_paid_50k', label: 'سوريا — Paid 50K+', filter: { market: 'syria', paid_collaboration: 'yes', tier: ['50k_100k', '100k_250k', '250k_500k', '500k_1m', '1m_plus'] } },
  { id: 'sy_damascus', label: 'سوريا — Damascus', filter: { market: 'syria', city: ['damascus'] } },
  { id: 'sy_high_fit', label: 'سوريا — High audience fit', filter: { market: 'syria', minAudienceSyria: 60 } },
];

// ---- Campaign selection (never pads to reach the target) ----
export function selectForCampaign(rows, target, opts = {}) {
  const eligible = rows.filter(r => r.creator_status !== 'do_not_contact' && r.creator_status !== 'rejected' && !(opts.excludeIds || []).includes(r.id));
  const sorted = [...eligible].sort((a, b) => (b.creator_priority_score ?? -1) - (a.creator_priority_score ?? -1));
  const selected = sorted.slice(0, target);
  return {
    selected,
    shortfall: Math.max(0, target - selected.length),
    message: selected.length < target ? `Only ${selected.length} qualified creators found (target ${target}).` : null,
  };
}

export function distributeAssignments(ids, assignees) {
  const out = {};
  if (!assignees.length) return out;
  assignees.forEach(a => { out[a] = []; });
  ids.forEach((id, i) => out[assignees[i % assignees.length]].push(id));
  return out;
}

// ---- CSV ----
export const CSV_COLUMNS = ['Name', 'Platform', 'Handle', 'URL', 'Followers', 'Tier', 'Category', 'City', 'Audience Syria %', 'Engagement', 'Avg Views', 'UGC', 'PR', 'Paid', 'Email', 'WhatsApp', 'DM', 'Estimated Rate', 'Quoted Rate', 'Verification', 'Status', 'Assigned To', 'Notes'];

export function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  const lines = [CSV_COLUMNS.join(',')];
  rows.forEach(r => {
    const p = (r.platforms || [])[0] || {};
    const contact = t => (r.contacts || []).find(c => c.type === t)?.value ?? '';
    const dm = (r.contacts || []).find(c => ['instagram_dm', 'tiktok_dm', 'facebook_messenger'].includes(c.type)) ? 'yes' : '';
    const est = r.estimate ? `${r.estimate.estimated_low}-${r.estimate.estimated_high} ${r.estimate.currency} (Estimated)` : '';
    const q = r.quoted_rate ? `${r.quoted_rate.amount} ${r.quoted_rate.currency || ''}` : '';
    lines.push([
      r.display_name, p.platform, p.handle, p.profile_url, r.follower_count, tierOf(r.follower_count)?.label ?? 'Unknown',
      r.main_category, r.city, r.audience_syria_pct, r.engagement_rate, r.average_views,
      r.ugc_potential, r.pr_fit, r.paid_collaboration, contact('email'), contact('whatsapp'), dm,
      est, q, r.verification_level, r.creator_status, r.assigned_to, r.notes,
    ].map(csvEscape).join(','));
  });
  return lines.join('\r\n');
}

export function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  let s = String(text || ''); if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cur); cur = ''; if (row.some(x => x !== '')) rows.push(row); row = [];
    } else cur += ch;
  }
  row.push(cur); if (row.some(x => x !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] === undefined ? '' : r[i]])));
}

// Import row validation. Requires a valid profile URL (platform+handle) and a source; rejects junk.
export function validateImportRow(row, ctx = {}) {
  const errors = [];
  const url = row.URL || row.url || row.profile_url;
  const parsed = url ? parseProfileUrl(url) : { ok: false, error: 'missing_url' };
  if (!parsed.ok) errors.push(`url:${parsed.error}`);
  const name = (row.Name || row.name || row.display_name || '').trim();
  if (!name) errors.push('missing_name');
  const provider = (row.source_provider || row.Provider || ctx.provider || '').toLowerCase();
  if (!SOURCE_PROVIDERS.includes(provider)) errors.push('invalid_or_missing_provider');
  const srcUrl = row.source_url || row['Source URL'] || ctx.source_url;
  if (!srcUrl) errors.push('missing_source_url');
  const followersRaw = row.Followers ?? row.followers;
  const followers = toNum(followersRaw);
  if (followersRaw !== undefined && followersRaw !== '' && (followers === null || followers < 0)) errors.push('invalid_followers');
  const market = (row.Market || row.market || ctx.market || 'syria').toLowerCase();
  if (!MARKETS.includes(market)) errors.push('invalid_market');
  return {
    ok: errors.length === 0, errors,
    value: errors.length ? null : {
      display_name: name, market, platform: parsed.platform, handle: parsed.handle, profile_url: parsed.url,
      followers, source_provider: provider, source_url: srcUrl,
      category: row.Category || null, city: row.City || null,
      audience_syria_pct: toNum(row['Audience Syria %']),
      engagement_rate: toNum(row.Engagement), average_views: toNum(row['Avg Views']),
      email: normalizeEmail(row.Email), whatsapp: normalizePhone(row.WhatsApp), notes: row.Notes || null,
    },
  };
}

// ---- Coverage gaps ----
export function coverageMatrix(rows, categories, tierKeys) {
  const m = {};
  categories.forEach(c => { m[c] = {}; tierKeys.forEach(t => { m[c][t] = 0; }); });
  rows.forEach(r => {
    const c = r.main_category, t = tierKey(r.follower_count);
    if (m[c] && t in m[c]) m[c][t]++;
  });
  return m;
}
