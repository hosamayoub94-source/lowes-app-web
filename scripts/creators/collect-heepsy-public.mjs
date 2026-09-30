// Creator research — Heepsy PUBLIC country rankings (top 10 per platform; no login / no key).
// https://www.heepsy.com/en/find-influencers/<platform>/<country>
// Output: data/creators/<country>/raw/heepsy_public.json  (raw, not the database)
// Followers are rounded by the source (e.g. "13.6M") -> stored with followers_precision:'rounded'.
import fs from 'node:fs';
import path from 'node:path';

const country = process.argv[2] || 'syria';
const UA = 'LowesCreatorResearch/1.0';
const OUT = path.resolve('data/creators', country, 'raw');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const abbr = s => { const m = String(s).match(/^([\d.]+)\s*([KMB])?$/i); if (!m) return null; const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1; return Math.round(parseFloat(m[1]) * mult); };
const decode = s => s.replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');

const results = []; const pages = [];
for (const platform of ['instagram', 'tiktok', 'youtube']) {
  const url = `https://www.heepsy.com/en/ranking/top-${platform}-influencers-in-${country}`;
  const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': UA } });
  if (r.status !== 200) { pages.push({ url, status: r.status }); continue; }
  const html = await r.text();
  const hrefs = new Set([...html.matchAll(/href="(https:\/\/www\.(?:instagram|tiktok|youtube)\.com\/[^"]+)"/g)].map(m => m[1]));
  const upd = html.match(/Updated on ([A-Za-z]+ \d+, \d{4})/)?.[1] || null;
  const text = decode(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');
  const re = /(\d{1,2}) \. (.+?) @ (\S+) Check contact details Get audience breakdown\s+(.*?)\s*Get full report Followers ([\d.]+[KMB]?) Engagement rate ([\d.]+)% Average likes ([\d.]+[KMB]?)/g;
  let n = 0;
  for (const m of text.matchAll(re)) {
    const handle = m[3].replace(/^@/, '');
    const link = [...hrefs].find(h => h.toLowerCase().includes(`/${platform === 'tiktok' || platform === 'youtube' ? '@' : ''}${handle.toLowerCase()}`));
    results.push({
      rank: +m[1], full_name: m[2].trim(), platform, handle, profile_url: link || (platform === 'instagram' ? `https://www.instagram.com/${handle}` : null),
      location_label: m[4].trim() || null, followers: abbr(m[5]), followers_precision: 'rounded', engagement_rate_pct: parseFloat(m[6]), average_likes: abbr(m[7]),
      source_url: url, source_updated: upd,
    });
    n++;
  }
  pages.push({ url, status: 200, profiles: n, updated: upd });
  await sleep(1500);
}
fs.writeFileSync(path.join(OUT, 'heepsy_public.json'), JSON.stringify({ provider: 'other', provider_name: 'heepsy', source_type: 'public_ranking_page', collected_at: new Date().toISOString(), pages, profiles: results }, null, 1));
console.log(pages, results.length);
