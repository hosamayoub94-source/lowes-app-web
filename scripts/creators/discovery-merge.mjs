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

const known = new Set(JSON.parse(fs.readFileSync(path.join(DIR, 'known_handles.json'), 'utf8')));
const queueFile = path.resolve('data/creators/syria/seed/workbench_queue.json');
if (fs.existsSync(queueFile)) JSON.parse(fs.readFileSync(queueFile, 'utf8')).records.forEach(r => r.platforms.forEach(p => known.add(key(p.platform, p.handle))));

const SMALL = [[500, 1000, '500-1K'], [1000, 2500, '1K-2.5K'], [2500, 5000, '2.5K-5K'], [5000, 10000, '5K-10K'], [10000, 25000, '10K-25K'], [25000, 50000, '25K-50K'], [50000, Infinity, '50K+']];
const band = f => (f == null ? 'unknown' : f < 500 ? 'under-500' : SMALL.find(([lo, hi]) => f >= lo && f < hi)[2]);

const out = []; const seen = new Map(); const skipped = { already_known: [], duplicate_in_run: [], invalid: [] };
const files = fs.readdirSync(DIR).filter(f => /^batch_\d+\.json$/.test(f)).sort();
for (const f of files) {
  const b = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  for (const [platform, handleRaw, name, followers, category, city, sourceType, sourceUrl, evidence, signal] of b.rows) {
    const handle = normalizeHandle(handleRaw);
    const url = PROFILE[platform] ? PROFILE[platform](handle) : null;
    const parsed = url ? parseProfileUrl(url) : { ok: false };
    if (!handle || !parsed.ok || parsed.handle !== handle) { skipped.invalid.push({ file: f, platform, handle: handleRaw }); continue; }
    const k = key(platform, handle);
    if (known.has(k)) { skipped.already_known.push(k); continue; }
    if (seen.has(k)) { skipped.duplicate_in_run.push(k); continue; }
    if (city && !SYRIA_CITIES.includes(city)) { skipped.invalid.push({ file: f, platform, handle, why: 'city' }); continue; }
    const row = {
      platform, username: handle, display_name: name, profile_url: parsed.url, followers: followers ?? null, follower_band: band(followers ?? null), tier: tierOf(followers)?.key ?? 'unknown',
      category: category || null, city: city || null, syria_signal: signal, discovery: { type: sourceType, url: sourceUrl, evidence, source_batch: f, searched_at: b.searched_at, tool: b.tool },
      status: 'discovered', needs_verification: signal === 'weak' || signal === 'query_only' || followers == null,
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
  by_platform: count(out, r => r.platform), by_follower_band: count(out, r => r.follower_band), by_category: count(out, r => r.category), by_city: count(out, r => r.city),
  by_syria_signal: count(out, r => r.syria_signal), by_source_type: count(out, r => r.discovery.type), needs_verification: out.filter(r => r.needs_verification).length,
  micro_pool_under_10k: out.filter(r => r.followers != null && r.followers < 10000).length, cross_platform_possible_links: crossPlatform,
};
fs.writeFileSync(path.join(DIR, 'discovery_pool.json'), JSON.stringify({ version: 1, stats, rows: out }, null, 1));
const cols = ['platform', 'username', 'display_name', 'profile_url', 'followers', 'follower_band', 'category', 'city', 'syria_signal', 'needs_verification', 'discovery_type', 'discovery_url', 'evidence', 'searched_at'];
const esc = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
fs.writeFileSync(path.join(DIR, 'discovery_pool.csv'), '﻿' + [cols.join(',')].concat(out.map(r => [r.platform, r.username, r.display_name, r.profile_url, r.followers, r.follower_band, r.category, r.city, r.syria_signal, r.needs_verification, r.discovery.type, r.discovery.url, r.discovery.evidence, r.discovery.searched_at].map(esc).join(','))).join('\n'));
fs.writeFileSync(path.join(DIR, 'skipped.json'), JSON.stringify(skipped, null, 1));
console.log(JSON.stringify(stats, null, 1));
