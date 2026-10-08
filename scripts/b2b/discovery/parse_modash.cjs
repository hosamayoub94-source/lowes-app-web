// Parses Modash "Top 20 ... in United Arab Emirates" public pages into structured creators.
// Keeps ONLY: display name, handles found in the public bio text, bio text (emails/phones removed), followers, fake%, ER, public ad-permit number, top audience cities.
// Personal emails shown on the page are dropped on purpose.
const fs = require('fs');
const path = require('path');
const files = process.argv.slice(2);
const toNum = (s) => { const m = String(s).trim().toLowerCase().match(/^([\d.,]+)\s*([km]?)$/); if (!m) return null; let n = parseFloat(m[1].replace(/,/g, '')); if (m[2] === 'k') n *= 1e3; if (m[2] === 'm') n *= 1e6; return Math.round(n); };
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/span)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
const out = [];
for (const f of files) {
  const lines = strip(fs.readFileSync(f, 'utf8'));
  const page = path.basename(f, '.html');
  const heading = lines.find((l) => /^Top \d+/.test(l)) || '';
  const upd = (lines.find((l, i) => lines[i - 1] === 'Last updated') || '');
  // entries start with "N. Name"
  const starts = [];
  lines.forEach((l, i) => { if (/^\d{1,2}\. .+/.test(l) && i > 8 && i < lines.length - 10) starts.push(i); });
  for (let k = 0; k < starts.length; k++) {
    const blk = lines.slice(starts[k], starts[k + 1] ?? starts[k] + 80);
    const name = blk[0].replace(/^\d{1,2}\.\s*/, '');
    const iCheck = blk.findIndex((l) => /^Check contact details/.test(l));
    const head = blk.slice(1, iCheck > 0 ? iCheck : 8);
    const val = (label) => { const i = blk.indexOf(label); return i >= 0 ? blk[i + 1] : null; };
    const followers = toNum(val('Followers'));
    if (followers == null) continue;
    const bioLines = head.filter((l) => !/^(United Arab Emirates|Dubai📍|Abu Dhabi📍|Sharjah📍|Permit: )/.test(l) && !/@[\w.-]+\.[a-z]{2,}/i.test(l) && !/^✉️/.test(l));
    const permit = (head.find((l) => /^Permit: /.test(l)) || '').replace('Permit: ', '') || null;
    const loc = head.find((l) => /📍$/.test(l)) || null;
    const bio = bioLines.join(' | ').replace(/\+?\d[\d\s-]{8,}\d/g, '[phone removed]');
    const handles = [...new Set((bio.match(/@[A-Za-z0-9_.]{3,30}/g) || []).map((h) => h.toLowerCase()))];
    const ci = blk.indexOf('Audience location by city');
    const cities = [];
    if (ci >= 0) for (let j = ci + 1; j + 1 < blk.length && cities.length < 3; j += 2) { if (/%$/.test(blk[j + 1])) cities.push(`${blk[j]} ${blk[j + 1]}`); else break; }
    out.push({
      source_page: page, source_heading: heading, source_updated: upd, rank: Number(blk[0].match(/^\d+/)[0]), display_name: name, handles_in_bio: handles, bio, loc_label: loc, ad_permit: permit,
      followers, fake_followers_pct: val('Fake followers'), engagement_rate: val('Engagement rate'), avg_reel_plays: val('Average Reel plays'), top_audience_cities: cities,
    });
  }
}
fs.writeFileSync(path.join(__dirname, 'modash_parsed.json'), JSON.stringify(out, null, 1));
const byPage = {}; out.forEach((o) => { byPage[o.source_page] = (byPage[o.source_page] || 0) + 1; });
console.log('entries', out.length, byPage);
