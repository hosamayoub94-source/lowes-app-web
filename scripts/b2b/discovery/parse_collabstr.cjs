// Parses Collabstr public "Top ... in <city>, UAE" list pages. Keeps handle, name, location, headline, follower buckets/counts exactly as listed, and a short description.
const fs = require('fs');
const path = require('path');
const dec = (s) => s.replace(/&amp;/g, '&').replace(/&nbsp;|&#160;/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/a)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ').split('\n').map((l) => dec(dec(l)).replace(/\s+/g, ' ').trim()).filter(Boolean);
const pages = {
  cs_ugc_ajman: 'user-generated-content/in/united-arab-emirates/ajman', cs_ugc_sharjah: 'user-generated-content/in/united-arab-emirates/sharjah', cs_ugc_deira: 'user-generated-content/in/united-arab-emirates/deira',
  cs_ugc_dubai2: 'user-generated-content/in/united-arab-emirates/dubai', cs_ugc_abudhabi: 'user-generated-content/in/united-arab-emirates/abu-dhabi', cs_ugc_ae: 'user-generated-content/in/united-arab-emirates',
  cs_ig_abudhabi: 'instagram/in/united-arab-emirates/abu-dhabi', cs_all_sharjah: 'in/united-arab-emirates/sharjah', cs_all_ae: 'in/united-arab-emirates',
};
const toNum = (s) => { const m = String(s).trim().toLowerCase().match(/^([\d.,]+)\s*([km]?)$/); if (!m) return null; let n = parseFloat(m[1].replace(/,/g, '')); if (m[2] === 'k') n *= 1e3; if (m[2] === 'm') n *= 1e6; return Math.round(n); };
const out = [];
for (const [pg, rel] of Object.entries(pages)) {
  const f = path.join(__dirname, 'raw', `${pg}.html`);
  if (!fs.existsSync(f)) continue;
  const lines = strip(fs.readFileSync(f, 'utf8'));
  for (let i = 0; i < lines.length; i++) {
    if (!/^\d{1,3}\.$/.test(lines[i]) || !/^@[A-Za-z0-9_.]{2,40}$/.test(lines[i + 1] || '')) continue;
    const end = lines.findIndex((l, k) => k > i && l === 'View Full Profile');
    if (end < 0) continue;
    const blk = lines.slice(i + 2, end);
    const iLoc = blk.findIndex((l) => /, (UAE|United Arab Emirates)$/.test(l));
    const nameLine = iLoc > 0 ? blk[iLoc - 1] : blk[0];
    const name = nameLine.replace(/\s+\d(\.\d)?$/, '');
    const rating = (nameLine.match(/\s(\d(?:\.\d)?)$/) || [])[1] || null;
    const location = iLoc >= 0 ? blk[iLoc] : null;
    const after = iLoc >= 0 ? blk.slice(iLoc + 1) : blk;
    const headline = after.find((l) => l && !/Followers$/.test(l)) || '';
    const followersListed = after.filter((l) => /Followers$/.test(l)).map((l) => l.replace(/ Followers$/i, ''));
    const desc = after.filter((l) => l !== headline && !/Followers$/.test(l)).join(' ').slice(0, 260);
    const nums = followersListed.map((s) => (/^[\d.,]+[km]?$/i.test(s) ? toNum(s) : (s.match(/-([\d.,]+[km]?)$/i) ? toNum(s.match(/-([\d.,]+[km]?)$/i)[1]) : null))).filter((n) => n != null);
    out.push({ source_page: pg, source_url: `https://collabstr.com/top-influencers/${rel}`, rank: Number(lines[i].replace('.', '')), collabstr_handle: lines[i + 1].slice(1), name, rating, location, headline, followers_listed: followersListed, max_followers_listed: nums.length ? Math.max(...nums) : null, min_followers_listed: nums.length ? Math.min(...nums) : null, top_creator: blk.includes('Top Creator'), description: desc });
  }
}
fs.writeFileSync(path.join(__dirname, 'collabstr_parsed.json'), JSON.stringify(out, null, 1));
const by = {}; out.forEach((o) => { by[o.source_page] = (by[o.source_page] || 0) + 1; });
console.log('entries', out.length, 'unique handles', new Set(out.map((o) => o.collabstr_handle.toLowerCase())).size, by);
