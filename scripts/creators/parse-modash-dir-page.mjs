// Parses a Modash public "find-influencers" page saved as a firecrawl scrape result (JSON with .markdown)
// into a discovery batch (row format of discovery-merge.mjs). City only when the creator's own bio names exactly one city.
// usage: node scripts/creators/parse-modash-dir-page.mjs <scrape.json> <source-url> <out-batch.json> [label]
import fs from 'node:fs';

const [file, sourceUrl, outFile, label = 'modash public directory page'] = process.argv.slice(2);
if (!file || !sourceUrl || !outFile) { console.error('usage: parse-modash-dir-page.mjs <scrape.json> <source-url> <out.json>'); process.exit(1); }
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const md = String(raw.markdown || raw.data?.markdown || '');
const BS = String.fromCharCode(92);
const clean = s => s.split(BS).join('');
const num = s => { const m = String(s).match(/([\d.]+)\s*([km])?/i); if (!m) return null; return Math.round(parseFloat(m[1]) * ({ k: 1e3, m: 1e6 }[(m[2] || '').toLowerCase()] || 1)); };
const CITY = [[/damascus|دمشق/i, 'damascus'], [/aleppo|حلب/i, 'aleppo'], [/homs|حمص/i, 'homs'], [/latakia|lattakia|اللاذقية/i, 'latakia'], [/tartus|tartous|طرطوس/i, 'tartus'], [/hama\b|حماة|حماه/i, 'hama'], [/sweida|suwayda|السويداء/i, 'sweida'], [/daraa|درعا/i, 'daraa'], [/idlib|إدلب|ادلب/i, 'idlib']];
const updated = (md.match(/Last updated\s+([\d/]+)/) || [])[1] || null;
const parts = clean(md).split(/\n## \d+\. /).slice(1);
const rows = [];
for (const p of parts) {
  const name = p.split('\n')[0].trim();
  const h = p.match(/\]\(https:\/\/www\.instagram\.com\/([^)/?]+)\)/);
  if (!h) continue;
  const f = p.match(/Followers\s*\n\s*\n\s*([\d.]+\s*[km]?)/i);
  const at = p.indexOf('[@');
  const bio = p.slice(name.length, at > 0 ? at : undefined).trim().replace(/\s+/g, ' ').slice(0, 200);
  const cities = [...new Set(CITY.filter(([re]) => re.test(bio)).map(x => x[1]))];
  rows.push(['instagram', h[1], name, f ? num(f[1]) : null, null, cities.length === 1 ? cities[0] : null, 'directory_page', sourceUrl,
    `${label}${updated ? ' (updated ' + updated + ')' : ''}; bio: ${bio}`, 'strong']);
}
fs.writeFileSync(outFile, JSON.stringify({ searched_at: new Date().toISOString().slice(0, 10), tool: `firecrawl_scrape ${sourceUrl}`, rows }, null, 0));
console.log(`parsed ${rows.length} profiles -> ${outFile}`);
rows.forEach(r => console.log(r[1], r[3], r[5] || ''));
