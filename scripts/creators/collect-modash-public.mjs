// Creator research — collector for Modash's PUBLIC directory pages (no login, no API key, no bypass).
// Reads only pages served openly at https://www.modash.io/find-influencers/<country>/<slug>.
// Writes raw normalized records to data/creators/syria/raw/modash_public.json (NOT the database).
// Every record carries: source URL, observed date, provider, confidence. Unknown fields stay null.
//
// usage: node scripts/creators/collect-modash-public.mjs [country=syria]
import fs from 'node:fs';
import path from 'node:path';
import { parseProfiles } from './modash-parse.mjs';

const country = process.argv[2] || 'syria';
const UA = 'LowesCreatorResearch/1.0 (public directory pages; contact: owner)';
const OUT = path.resolve('data/creators', country, 'raw');
fs.mkdirSync(OUT, { recursive: true });

// Only paths that answered 200 with profiles on the last probe (others 301/404 — not retried, not bypassed).
const PATHS = ['', 'skincare', 'fashion', 'fashion/affiliates', 'fitness', 'food', 'food/affiliates', 'family', 'health', 'male', 'female', 'micro', 'damascus'].map(x => `${country}${x ? '/' + x : ''}`)
  .concat([`tiktok/${country}`]);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const found = {};
const pages = [];
for (const pth of PATHS) {
  const url = `https://www.modash.io/find-influencers/${pth}`;
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA } });
    if (r.status !== 200) { pages.push({ url, status: r.status, profiles: 0 }); await sleep(800); continue; }
    const html = await r.text();
    const list = parseProfiles(html);
    const upd = html.match(/Last updated[\s\S]{0,80}?(\d{2}\/\d{2}\/\d{4})/)?.[1] || null;
    pages.push({ url, status: 200, profiles: list.length, last_updated: upd });
    for (const p of list) {
      const k = (p.profile_url || p.username).toLowerCase();
      if (!found[k]) found[k] = { ...p, source_pages: [] };
      found[k].source_pages.push({ url, last_updated: upd });
    }
  } catch (e) { pages.push({ url, status: 'error', error: String(e.message || e) }); }
  await sleep(1200); // polite rate
}

const out = {
  provider: 'modash', source_type: 'public_directory_page', collected_at: new Date().toISOString(),
  note: 'Modash free public directory pages. Values are Modash-reported; audience is Modash-estimated.',
  pages, profiles: Object.values(found),
};
fs.writeFileSync(path.join(OUT, 'modash_public.json'), JSON.stringify(out, null, 1));
console.log(`pages: ${pages.length} (200: ${pages.filter(p => p.status === 200).length}) · unique profiles: ${out.profiles.length}`);
pages.filter(p => p.status === 200).forEach(p => console.log(p.profiles, p.url));
