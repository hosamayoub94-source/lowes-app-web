// Parses a Heepsy public ranking page that was saved locally (e.g. via `curl -A LowesCreatorResearch/1.0 <url> -o file.html`)
// and merges its top-10 profiles into data/creators/syria/raw/heepsy_public.json (idempotent by platform+handle).
// Why local: Heepsy intermittently answers 403 to automated fetches; we never retry in a loop or spoof a browser —
// a single plain request that succeeded is parsed offline.
// usage: node scripts/creators/parse-heepsy-html.mjs <platform> <html-file> <source-url> [updated-on]
import fs from 'node:fs';
import path from 'node:path';

const [platform, file, sourceUrl, updated] = process.argv.slice(2);
if (!platform || !file || !sourceUrl) { console.error('usage: parse-heepsy-html.mjs <platform> <html-file> <source-url>'); process.exit(1); }
const abbr = s => { const m = String(s).match(/^([\d.]+)\s*([KMB])?$/i); if (!m) return null; const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1; return Math.round(parseFloat(m[1]) * mult); };
const decode = s => s.replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const html = fs.readFileSync(file, 'utf8');
const hrefs = new Set([...html.matchAll(/href="(https:\/\/www\.(?:instagram|tiktok|youtube)\.com\/[^"]+)"/g)].map(m => m[1]));
const upd = updated || html.match(/Updated on ([A-Za-z]+ \d+, \d{4})/)?.[1] || null;
const text = decode(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');
const re = /(\d{1,2}) \. (.+?) @ (\S+) Check contact details Get audience breakdown\s+(.*?)\s*Get full report Followers ([\d.]+[KMB]?) Engagement rate ([\d.]+)% Average likes ([\d.]+[KMB]?)/g;
const out = [];
for (const m of text.matchAll(re)) {
  const handle = m[3].replace(/^@/, '');
  const link = [...hrefs].find(h => h.toLowerCase().includes(`/${platform === 'instagram' ? '' : '@'}${handle.toLowerCase()}`)) || (platform === 'instagram' ? `https://www.instagram.com/${handle}` : null);
  out.push({ rank: +m[1], full_name: m[2].trim(), platform, handle, profile_url: link, location_label: m[4].trim() || null, followers: abbr(m[5]), followers_precision: 'rounded', engagement_rate_pct: parseFloat(m[6]), average_likes: abbr(m[7]), source_url: sourceUrl, source_updated: upd });
}
const target = path.resolve('data/creators/syria/raw/heepsy_public.json');
const j = JSON.parse(fs.readFileSync(target, 'utf8'));
const have = new Set(j.profiles.map(p => `${p.platform}:${p.handle.toLowerCase()}`));
let added = 0;
for (const p of out) if (!have.has(`${p.platform}:${p.handle.toLowerCase()}`)) { j.profiles.push(p); added++; }
j.pages = j.pages.filter(p => !p.url.includes(`-${platform}-`) && !p.url.includes(`/${platform}/`));
j.pages.push({ url: sourceUrl, status: 200, profiles: out.length, updated: upd, note: 'parsed from a locally saved single plain request' });
fs.writeFileSync(target, JSON.stringify(j, null, 1));
console.log(`parsed ${out.length}, added ${added}`);
