const d = require('./collabstr_parsed.json');
const sk = /skin|beauty|makeup|glow|derm|cosmet|ugc|بشرة|جمال|مكياج/i;
const u = new Map();
d.forEach((x) => {
  const t = `${x.headline} ${x.description}`;
  if (!sk.test(t)) return;
  if (x.max_followers_listed != null && x.max_followers_listed > 100000) return;
  if (!u.has(x.collabstr_handle.toLowerCase())) u.set(x.collabstr_handle.toLowerCase(), x);
});
require('fs').writeFileSync('cs_slugs.txt', [...u.keys()].join('\n') + '\n');
console.log('profiles to fetch:', u.size);
