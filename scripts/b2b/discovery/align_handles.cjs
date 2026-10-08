const fs = require('fs');
const parsed = require('./modash_parsed.json');
const pages = [...new Set(parsed.map((p) => p.source_page))];
const skip = new Set(['p', 'reel', 'reels', 'explore', 'modash.io', 'modash', 'accounts', 'stories']);
let bad = 0;
for (const pg of pages) {
  const html = fs.readFileSync(`raw/${pg}.html`, 'utf8');
  // profile links only (not /p/ posts), document order, unique
  const hs = [];
  const re = /instagram\.com\/([A-Za-z0-9_.]{2,30})(?=["'/?\\])/g;
  for (const m of html.matchAll(re)) {
    const h = m[1].toLowerCase();
    if (skip.has(h)) continue;
    if (!hs.includes(h)) hs.push(h);
  }
  const entries = parsed.filter((p) => p.source_page === pg);
  console.log(pg, 'unique profile links:', hs.length, 'entries:', entries.length);
  if (hs.length === entries.length) entries.forEach((e, i) => { e.ig_handle = hs[i]; });
  else { bad++; console.log('  MISMATCH:', hs.join(',')); }
}
fs.writeFileSync('modash_aligned.json', JSON.stringify(parsed, null, 1));
console.log('pages needing manual check:', bad);
