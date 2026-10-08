// Parses fetched Collabstr public profile pages: Instagram handle (from <title>), location line, self-listed packages + prices.
// Ignores the "Analytics" block (masked/placeholder for logged-out viewers).
const fs = require('fs');
const path = require('path');
const dec = (s) => s.replace(/&amp;/g, '&').replace(/&nbsp;|&#160;/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/a)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ').split('\n').map((l) => dec(dec(l)).replace(/\s+/g, ' ').trim()).filter(Boolean);
const dir = path.join(__dirname, 'raw', 'cs');
const parsedList = require('./collabstr_parsed.json');
const listBySlug = new Map();
parsedList.forEach((x) => { if (!listBySlug.has(x.collabstr_handle.toLowerCase())) listBySlug.set(x.collabstr_handle.toLowerCase(), x); });
const out = [];
for (const f of fs.readdirSync(dir)) {
  const slug = f.replace(/\.html$/, '');
  const html = fs.readFileSync(path.join(dir, f), 'utf8');
  const title = dec((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '');
  const m = title.match(/^Promote with (.+?)(?: \(@([^)]+)\))? \|/);
  const lines = strip(html);
  const iPk = lines.indexOf('Packages');
  const iNeg = lines.findIndex((l, k) => k > iPk && /^(Negotiate a Package|Analytics)$/.test(l));
  const packs = [];
  if (iPk >= 0) {
    const seg = lines.slice(iPk + 1, iNeg > iPk ? iNeg : iPk + 30);
    for (let k = 0; k + 1 < seg.length; k++) if (/^\$[\d,]+(\.\d+)?$/.test(seg[k + 1]) && !/^\$/.test(seg[k])) { packs.push({ name: seg[k], usd: Number(seg[k + 1].replace(/[$,]/g, '')) }); k++; }
  }
  const locLine = lines.find((l) => /\| .*United Arab Emirates/.test(l)) || null;
  const list = listBySlug.get(slug.toLowerCase()) || {};
  out.push({
    collabstr_slug: slug, collabstr_url: `https://collabstr.com/${slug}`, name: m ? m[1] : list.name || slug, ig_handle: m && m[2] ? m[2] : null, location_line: locLine,
    headline: list.headline || null, followers_listed: list.followers_listed || [], min_followers_listed: list.min_followers_listed ?? null, max_followers_listed: list.max_followers_listed ?? null,
    description: (list.description || '').slice(0, 200), packages: packs, min_price_usd: packs.length ? Math.min(...packs.map((p) => p.usd)) : null, list_sources: parsedList.filter((x) => x.collabstr_handle.toLowerCase() === slug.toLowerCase()).map((x) => x.source_url).filter((v, i, a) => a.indexOf(v) === i),
  });
}
fs.writeFileSync(path.join(__dirname, 'collabstr_profiles.json'), JSON.stringify(out, null, 1));
console.log('profiles', out.length, '| with IG handle in title', out.filter((o) => o.ig_handle).length, '| with prices', out.filter((o) => o.min_price_usd != null).length, '| min price <= $100:', out.filter((o) => o.min_price_usd != null && o.min_price_usd <= 100).length);
