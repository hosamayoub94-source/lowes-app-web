// Wave 2 — influencer.sy («مؤثّرو سوريا»): a public, opt-in Syrian creator link-in-bio directory.
// robots.txt: "User-agent: * Disallow:" (allow all) + public sitemap. Plain GET, honest UA, 1.2s spacing.
// Output: data/creators/syria/raw/influencer_sy.json. Facts are copied verbatim from each public page
// (schema.org JSON-LD + visible links). Nothing is inferred.
import fs from 'node:fs';
import path from 'node:path';

const UA = 'LowesCreatorResearch/1.0 (public directory; no login)';
const OUT = path.resolve('data/creators/syria/raw');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sm = await (await fetch('https://influencer.sy/sitemap.xml', { headers: { 'user-agent': UA } })).text();
const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]+)<\/lastmod>)?/g)].map(m => ({ url: m[1], lastmod: m[2] || null }))
  .filter(x => !/(top10|how-it-works|\/about|\/faq|\/contact|\/privacy)$/.test(x.url) && x.url !== 'https://influencer.sy');

const decode = s => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const out = []; const fails = [];
for (const u of urls) {
  try {
    const r = await fetch(u.url, { headers: { 'user-agent': UA } });
    if (r.status !== 200) { fails.push({ url: u.url, status: r.status }); await sleep(1200); continue; }
    const html = await r.text();
    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
    let person = null, modified = null;
    for (const b of ld) { try { const j = JSON.parse(b.replace(/<[^>]+>/g, '')); if (j['@type'] === 'ProfilePage') { person = j.mainEntity; modified = j.dateModified; } } catch { /* skip */ } }
    if (!person) { fails.push({ url: u.url, status: 'no_jsonld' }); await sleep(1200); continue; }
    const hrefs = [...new Set([...html.matchAll(/href="([^"]+)"/g)].map(m => decode(m[1])))];
    const ext = hrefs.filter(h => /^(https?:|mailto:|tel:)/.test(h) && !/influencer\.sy|fonts\.bunny|schema\.org|w3\.org/.test(h));
    // visible text (used only for city / contact keywords, never for invention)
    const text = decode(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
    const body = text.split('انتقل إلى المحتوى').pop() || text;
    out.push({
      page_url: u.url, slug: u.url.split('/').pop(), name: person.name || null, description: person.description || null,
      same_as: person.sameAs || [], external_links: ext, date_modified: modified || u.lastmod, sitemap_lastmod: u.lastmod,
      visible_text_excerpt: body.slice(0, 600),
    });
  } catch (e) { fails.push({ url: u.url, status: 'error', error: String(e.message || e) }); }
  await sleep(1200);
}
fs.writeFileSync(path.join(OUT, 'influencer_sy.json'), JSON.stringify({ provider: 'web', provider_name: 'influencer.sy', source_type: 'public_directory_page', collected_at: new Date().toISOString(), sitemap_urls: urls.length, profiles: out, failures: fails }, null, 1));
console.log('sitemap creators', urls.length, 'parsed', out.length, 'failed', fails.length);
