// Discovery source: StarNgage Pro public ranking pages ("Top 1,000 influencers in Syria"), Instagram / TikTok / YouTube.
// robots.txt (checked 2026-10-01): no Disallow and no content-signal set. Plain GET, honest UA, one request every 3 s,
// stop on the first non-200 (no retries, no bypass). Raw HTML kept in data/creators/syria/raw/starngage/ for audit.
// Output: discovery batches (row format of discovery-merge.mjs). Only rows with the SY badge are kept.
// Provider topics are the provider's own classification -> kept in the evidence text, NOT used as our category.
// usage: node scripts/creators/collect-starngage-public.mjs [instagram|tiktok|youtube ...] [--pages N]
import fs from 'node:fs';
import path from 'node:path';

const UA = 'LowesCreatorResearch/1.0 (public ranking pages; no login)';
const RAW = path.resolve('data/creators/syria/raw/starngage');
const OUT = path.resolve('data/creators/syria/discovery');
const args = process.argv.slice(2);
const pi = args.indexOf('--pages'); const maxPages = pi >= 0 ? Number(args.splice(pi, 2)[1]) : 40;
const ti = args.indexOf('--topic'); const topic = ti >= 0 ? args.splice(ti, 2)[1] : 'All';
const platforms = args.length ? args : ['instagram', 'tiktok', 'youtube'];
const BATCH = { instagram: 'batch_04.json', tiktok: 'batch_05.json', youtube: 'batch_06.json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const text = s => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const SY_WORDS = /syria|سوري|damascus|دمشق|aleppo|حلب|homs|حمص|latakia|lattakia|اللاذقية|tartus|tartous|طرطوس|hama|حماة|حماه|sweida|السويداء|idlib|ادلب|إدلب|daraa|درعا|🇸🇾/i;

export function parsePage(html, platform) {
  const rows = [];
  for (const tr of html.split('<tr class="border py-2 my-2">').slice(1)) {
    const href = tr.match(new RegExp(`/profiles/public/${platform}/([^"/?]+)`));
    if (!href) continue;
    const handle = decodeURIComponent(href[1]);
    const name = (tr.match(/class="product-name">([\s\S]*?)<\/a>/) || [])[1];
    const serials = [...tr.matchAll(/<div class="serial">([\s\S]*?)<\/div>/g)].map(m => text(m[1]));
    const country = text((tr.match(/rounded-pill">([\s\S]*?)<\/span>/) || [])[1] || '');
    const followers = Number(((tr.match(/Followers<\/h5>\s*<p class="card-text">([\d,]+)/) || [])[1] || '').replace(/,/g, '')) || null;
    const topicsCell = tr.split('Topics')[1] || '';
    const topics = [...topicsCell.matchAll(/>([^<>]{3,40})</g)].map(m => decode(m[1])).filter(t => /^[A-Za-z][A-Za-z &]+$/.test(t)).slice(0, 4);
    const bio = serials[1] || '';
    rows.push({ handle, name: name ? text(name) : serials[0] || handle, country, followers, bio, topics });
  }
  return rows;
}

if ((process.argv[1] || '').endsWith('collect-starngage-public.mjs')) {
  fs.mkdirSync(RAW, { recursive: true });
  for (const platform of platforms) {
    const rows = []; const log = [];
    for (let page = 1; page <= maxPages; page++) {
      const url = `https://starngage.pro/ranking/${platform}/Syria/${encodeURIComponent(topic)}?page=${page}`;
      const res = await fetch(url, { headers: { 'user-agent': UA } });
      log.push({ page, status: res.status });
      if (res.status !== 200) { console.log(platform, 'stop at page', page, 'status', res.status); break; }
      const html = await res.text();
      fs.writeFileSync(path.join(RAW, `${platform}_${topic.replace(/\W+/g, '_')}_p${page}.html`), html);
      const got = parsePage(html, platform);
      if (!got.length) { console.log(platform, 'no rows at page', page); break; }
      for (const r of got) {
        if (r.country !== 'SY') continue;
        rows.push([platform, r.handle, r.name, r.followers, null, null, 'directory_page', url,
          `StarNgage Pro ranking (location SY by provider)${r.topics.length ? '; provider topics: ' + r.topics.join(', ') : ''}; bio: ${r.bio}`.slice(0, 300),
          SY_WORDS.test(r.bio) ? 'strong' : 'medium']);
      }
      process.stdout.write(`${platform} p${page}: ${got.length} rows (min followers ${Math.min(...got.map(x => x.followers || Infinity))})\n`);
      await sleep(3000);
    }
    const batchName = topic === 'All' ? BATCH[platform] : `batch_sng_${topic.replace(/\W+/g, '_').toLowerCase()}_${platform}.json`;
    fs.writeFileSync(path.join(OUT, batchName), JSON.stringify({ searched_at: new Date().toISOString().slice(0, 10), tool: `StarNgage Pro public ranking (${platform}, Syria, topic: ${topic}) — plain GET`, pages: log, rows }, null, 0));
    console.log(platform, 'kept', rows.length);
  }
}
