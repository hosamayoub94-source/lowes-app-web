// Creator Discovery — merge raw discovery batches into one de-duplicated pool. Local files only; nothing is written to any database.
// usage: node scripts/creators/discovery-merge.mjs   (reads data/creators/syria/discovery/batch_*.json)
// Row format: [platform, handle, name, followers|null, category|null, city|null, source_type, source_url, evidence, syria_signal]
//   syria_signal: strong | medium | weak | query_only   (query_only = matched the search terms only; NOT evidence of being Syrian)
// Dedup (mandatory, before anything is added): 1) profile URL, 2) platform + normalised username (case, @, trailing slash, www/m. hosts),
//   against: the research seed (255 known handles), the review queue (including removed), and earlier rows of this run. Names are never used.
//   Same handle on a different platform is NOT a duplicate creator by itself — it is reported as a possible cross-platform link for review.
// Discovery != qualification: unknown values stay null; nothing here is a contact, a rate, or a verdict.
import fs from 'node:fs';
import path from 'node:path';
import { parseProfileUrl, normalizeHandle, tierOf, SYRIA_CITIES } from '../../src/services/creatorLogic.js';

const DIR = path.resolve('data/creators/syria/discovery');
const PROFILE = { instagram: h => `https://www.instagram.com/${h}`, tiktok: h => `https://www.tiktok.com/@${h}`, youtube: h => `https://www.youtube.com/@${h}`, facebook: h => `https://www.facebook.com/${h}` };
const key = (p, h) => `${p}:${normalizeHandle(h)}`;
// provider topics = the directory's own classification (kept apart from our confirmed `category`)
const NOT_TOPICS = new Set(['Previous', 'Next', 'Relationship Management', 'Ambassador Marketing', 'Influencer Rates', 'Fake Follower Checker', 'Content Search', 'Hashtag Tracking', 'Tagged Tracking', 'Post Tracking']); // page navigation / sidebar, not topics
const topicsOf = ev => { const m = String(ev).match(/provider topics: ([^;]+)/); return m ? m[1].split(',').map(s => s.trim()).filter(t => t && !NOT_TOPICS.has(t)) : []; };
// city only when the creator's own bio names exactly one Syrian city (self-stated, not inferred)
const CITY_WORDS = [[/damascus|دمشق/i, 'damascus'], [/aleppo|حلب/i, 'aleppo'], [/\bhoms\b|حمص/i, 'homs'], [/latakia|lattakia|اللاذقية/i, 'latakia'], [/tartus|tartous|طرطوس/i, 'tartus'], [/\bhama\b|حماة|حماه/i, 'hama'], [/sweida|suwayda|السويداء/i, 'sweida'], [/daraa|درعا/i, 'daraa'], [/idlib|إدلب|ادلب/i, 'idlib'], [/qamishli|القامشلي|hasakah|الحسكة/i, 'hasakah'], [/deir ?ez|دير الزور/i, 'deir_ez_zor'], [/raqqa|الرقة/i, 'raqqa']];
const bioCity = ev => { const bio = (String(ev).split('bio:')[1] || ''); const hits = [...new Set(CITY_WORDS.filter(([re]) => re.test(bio)).map(x => x[1]))]; return hits.length === 1 ? hits[0] : null; };
const NON_CREATOR = /\bnews\b|akhbar|أخبار|اخبار|\bshop\b|store|متجر|محل |\bvideos?\b|quotes|اقتباسات|\btv\b|radio|إذاعة|قناة|\bchannel\b|official page|الصفحة الرسمية|memes?|ميمز|نكت|\bfan ?page\b|\bfc\b|club|نادي|شركة|company|agency|وكالة|restaurant|مطعم|salon|صالون|clinic|عيادة|pharmacy|صيدلية|hotel|فندق/i;

const known = new Set(JSON.parse(fs.readFileSync(path.join(DIR, 'known_handles.json'), 'utf8')));
const queueFile = path.resolve('data/creators/syria/seed/workbench_queue.json');
if (fs.existsSync(queueFile)) JSON.parse(fs.readFileSync(queueFile, 'utf8')).records.forEach(r => r.platforms.forEach(p => known.add(key(p.platform, p.handle))));

const SMALL = [[500, 1000, '500-1K'], [1000, 2500, '1K-2.5K'], [2500, 5000, '2.5K-5K'], [5000, 10000, '5K-10K'], [10000, 25000, '10K-25K'], [25000, 50000, '25K-50K'], [50000, Infinity, '50K+']];
const band = f => (f == null ? 'unknown' : f < 500 ? 'under-500' : SMALL.find(([lo, hi]) => f >= lo && f < hi)[2]);

const out = []; const seen = new Map(); const skipped = { already_known: [], duplicate_in_run: [], invalid: [] };
const files = fs.readdirSync(DIR).filter(f => /^batch_[\w-]+\.json$/.test(f)).sort();
for (const f of files) {
  const b = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  for (const [platform, handleRaw, name, followers, category, city, sourceType, sourceUrl, evidence, signal] of b.rows) {
    const handle = normalizeHandle(handleRaw);
    const url = PROFILE[platform] ? PROFILE[platform](handle) : null;
    const parsed = url ? parseProfileUrl(url) : { ok: false };
    if (!handle || !parsed.ok || parsed.handle !== handle) { skipped.invalid.push({ file: f, platform, handle: handleRaw }); continue; }
    const k = key(platform, handle);
    if (known.has(k)) { skipped.already_known.push(k); continue; }
    if (seen.has(k)) { // keep the first row, but do not lose the extra provider topics / sources
      const cur = seen.get(k); topicsOf(evidence).forEach(t => { if (!cur.provider_topics.includes(t)) cur.provider_topics.push(t); });
      if (!cur.also_found_in.includes(sourceUrl) && cur.discovery.url !== sourceUrl) cur.also_found_in.push(sourceUrl);
      skipped.duplicate_in_run.push(k); continue;
    }
    if (city && !SYRIA_CITIES.includes(city)) { skipped.invalid.push({ file: f, platform, handle, why: 'city' }); continue; }
    const row = {
      platform, username: handle, display_name: name, profile_url: parsed.url, followers: followers ?? null, follower_band: band(followers ?? null), tier: tierOf(followers)?.key ?? 'unknown',
      category: category || null, provider_topics: topicsOf(evidence), also_found_in: [],
      ...(city ? { city, city_source: 'discovery_source' } : bioCity(evidence) ? { city: bioCity(evidence), city_source: 'creator_bio' } : { city: null }), syria_signal: signal, discovery: { type: sourceType, url: sourceUrl, evidence, source_batch: f, searched_at: b.searched_at, tool: b.tool },
      status: 'discovered', needs_verification: signal === 'weak' || signal === 'query_only' || followers == null,
      // evidence-based flag only (words in handle/name/bio) — the row is kept; a human decides
      possible_non_creator: NON_CREATOR.test(`${handle} ${name} ${evidence}`) || undefined,
    };
    seen.set(k, row); out.push(row);
  }
}
// same username on another platform -> possible link, never auto-merged
const byUser = {}; out.forEach(r => { (byUser[r.username] ||= []).push(r); });
const crossPlatform = Object.entries(byUser).filter(([, v]) => new Set(v.map(x => x.platform)).size > 1).map(([u, v]) => ({ username: u, platforms: v.map(x => x.platform) }));

const count = (arr, f) => arr.reduce((m, x) => { const k = f(x) ?? 'unknown'; m[k] = (m[k] || 0) + 1; return m; }, {});
const stats = {
  generated_at: new Date().toISOString(), batches: files, new_unique: out.length, skipped: { already_known: skipped.already_known.length, duplicate_in_run: skipped.duplicate_in_run.length, invalid: skipped.invalid.length },
  by_provider_topic: out.reduce((m, r) => { (r.provider_topics.length ? r.provider_topics : ['none']).forEach(t => { m[t] = (m[t] || 0) + 1; }); return m; }, {}),
  city_from_creator_bio: out.filter(r => r.city_source === 'creator_bio').length,
  by_platform: count(out, r => r.platform), by_follower_band: count(out, r => r.follower_band), by_category: count(out, r => r.category), by_city: count(out, r => r.city),
  by_syria_signal: count(out, r => r.syria_signal), by_source_type: count(out, r => r.discovery.type), needs_verification: out.filter(r => r.needs_verification).length,
  micro_pool_under_10k: out.filter(r => r.followers != null && r.followers < 10000).length,
  possible_non_creator: out.filter(r => r.possible_non_creator).length, cross_platform_possible_links: crossPlatform,
};
fs.writeFileSync(path.join(DIR, 'discovery_pool.json'), JSON.stringify({ version: 1, stats, rows: out }, null, 1));
const cols = ['platform', 'username', 'display_name', 'profile_url', 'followers', 'follower_band', 'category', 'city', 'syria_signal', 'needs_verification', 'possible_non_creator', 'discovery_type', 'discovery_url', 'evidence', 'searched_at'];
const esc = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
fs.writeFileSync(path.join(DIR, 'discovery_pool.csv'), '﻿' + [cols.join(',')].concat(out.map(r => [r.platform, r.username, r.display_name, r.profile_url, r.followers, r.follower_band, r.category, r.city, r.syria_signal, r.needs_verification, !!r.possible_non_creator, r.discovery.type, r.discovery.url, r.discovery.evidence, r.discovery.searched_at].map(esc).join(','))).join('\n'));
fs.writeFileSync(path.join(DIR, 'skipped.json'), JSON.stringify(skipped, null, 1));
console.log(JSON.stringify(stats, null, 1));
