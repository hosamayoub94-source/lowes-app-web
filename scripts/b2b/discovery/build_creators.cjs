// Builds the UAE creators discovery table from public directory pages (Modash top-20 pages + Elev8or public profiles).
// Rules: handle = the real profile link on the source page; numbers copied as shown; nothing inferred about gifting/barter/price.
const fs = require('fs');
const path = require('path');

const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
const toNum = (s) => { const m = String(s).trim().toLowerCase().match(/^([\d.,]+)\s*([km]?)$/); if (!m) return null; let n = parseFloat(m[1].replace(/,/g, '')); if (m[2] === 'k') n *= 1e3; if (m[2] === 'm') n *= 1e6; return Math.round(n); };

const SKIN_RE = /skin|beauty|makeup|make-up|glow|derm|cosmet|serum|spf|facial|hair|ugc|بشرة|عناية|جمال|مكياج|سكن|تجميل/i;
const SKIN_STRICT = /skin|derm|glow|serum|spf|facial|cosmetic|بشرة|عناية بالبشرة|سكن/i;
const COLLAB_RE = /collab|dm for|pr |gifted|barter|ambassador|ugc|brand promot|promotions?|مبادلة|تعاون|للتعاون/i;

const creators = new Map(); // key = ig handle
const add = (c) => {
  const k = c.ig_handle.toLowerCase();
  const prev = creators.get(k);
  if (!prev) { creators.set(k, { ...c, sources: [c.source] }); return; }
  prev.sources.push(c.source);
  for (const f of ['display_name', 'bio', 'ad_permit', 'engagement_rate', 'fake_followers_pct', 'tiktok_followers', 'niches', 'city']) if (!prev[f] && c[f]) prev[f] = c[f];
  if (c.followers && (!prev.followers || c.source.startsWith('modash'))) prev.followers = c.followers;
  prev.categories = [...new Set([...(prev.categories || []), ...(c.categories || [])])];
};

// ── Modash ──
const modash = require('./modash_aligned.json');
const modashLabel = {
  modash_ae_micro: 'UAE micro (<25k)', modash_dubai_micro: 'Dubai micro (<25k)', modash_ae_skincare_aff: 'UAE skincare affiliates', m_skin: 'UAE skincare', m_beauty: 'UAE beauty',
  m_dubai_beauty: 'Dubai beauty', m_ae_dubai: 'Dubai (general)', m_abudhabi: 'Abu Dhabi (general)', m_sharjah: 'Sharjah (general)', m_beauty_aff: 'UAE beauty affiliates', m_dubai_affil: 'Dubai affiliates',
};
const modashUrl = {
  modash_ae_micro: 'united-arab-emirates/micro', modash_dubai_micro: 'united-arab-emirates/dubai/micro', modash_ae_skincare_aff: 'united-arab-emirates/skincare/affiliates', m_skin: 'united-arab-emirates/skincare',
  m_beauty: 'united-arab-emirates/beauty', m_dubai_beauty: 'united-arab-emirates/dubai/beauty', m_ae_dubai: 'united-arab-emirates/dubai', m_abudhabi: 'united-arab-emirates/abu-dhabi', m_sharjah: 'united-arab-emirates/sharjah',
  m_beauty_aff: 'united-arab-emirates/beauty/affiliates', m_dubai_affil: 'united-arab-emirates/dubai/affiliates',
};
for (const m of modash) {
  add({
    ig_handle: m.ig_handle, display_name: m.display_name, followers: m.followers, bio: m.bio, ad_permit: m.ad_permit, engagement_rate: m.engagement_rate, fake_followers_pct: m.fake_followers_pct,
    top_audience_cities: m.top_audience_cities, categories: [modashLabel[m.source_page]],
    source: `modash:${modashLabel[m.source_page]}`, source_url: `https://www.modash.io/find-influencers/${modashUrl[m.source_page]}`, source_updated: m.source_updated,
  });
}

// ── Elev8or ──
const e8dir = path.join(__dirname, 'raw', 'e8');
for (const f of fs.readdirSync(e8dir)) {
  const html = fs.readFileSync(path.join(e8dir, f), 'utf8');
  const lines = strip(html);
  const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1] || '';
  const handleFromTitle = (title.match(/\(@([^)]+)\)/) || [])[1];
  const igs = [...html.matchAll(/instagram\.com\/([A-Za-z0-9_.]{2,30})/g)].map((m) => m[1]).filter((h) => !/^(elev8or_io|p|reel|explore)$/i.test(h));
  const ig = igs[0];
  if (!ig) continue;
  const pub = (lines.find((l) => /publishes on/.test(l)) || '');
  const igF = (pub.match(/instagram \(([\d.,]+k?m?) followers\)/i) || [])[1];
  const ttF = (pub.match(/tiktok \(([\d.,]+k?m?) followers\)/i) || [])[1];
  const iName = lines.findIndex((l) => l === (handleFromTitle || '') || l.toLowerCase() === (handleFromTitle || '').toLowerCase());
  const tag = iName >= 0 ? lines[iName + 1] : '';
  const place = iName >= 0 ? lines[iName + 2] : '';
  const nich = iName >= 0 ? lines[iName + 3] : '';
  const about = (lines.findIndex((l) => l === 'About') >= 0) ? lines.slice(lines.findIndex((l) => l === 'About') + 1, lines.findIndex((l) => l === 'About') + 4).join(' ') : '';
  const desc = (lines.find((l) => /creator based in/.test(l)) || '');
  const kind = /ugc/i.test(desc) ? 'UGC creator' : 'creator';
  add({
    ig_handle: ig, display_name: handleFromTitle || f.replace(/\.html$/, ''), followers: igF ? toNum(igF) : null, tiktok_followers: ttF ? toNum(ttF) : null, bio: [tag, about].filter(Boolean).join(' | ').slice(0, 300),
    niches: nich, city: place, categories: ['Elev8or marketplace (self-listed creator)'], source: 'elev8or', source_url: `https://www.elev8or.io/c/${f.replace(/\.html$/, '')}`, source_updated: '2026-10', kind,
  });
}

// ── classify ──
const out = [];
for (const c of creators.values()) {
  const text = `${c.bio || ''} ${c.niches || ''} ${(c.categories || []).join(' ')}`;
  const f = c.followers;
  const tier = f == null ? 'unknown' : f < 1000 ? 'sub-nano' : f <= 10000 ? 'nano' : f <= 100000 ? 'micro' : f <= 500000 ? 'mid' : 'macro';
  const skinSignal = SKIN_STRICT.test(text) || /skincare/i.test((c.categories || []).join(' '));
  const beautySignal = SKIN_RE.test(text) || /beauty/i.test((c.categories || []).join(' '));
  const permit = c.ad_permit || null;
  const collabText = (text.match(COLLAB_RE) || [null])[0];
  const marketplace = c.sources.some((s) => s === 'elev8or');
  const fake = c.fake_followers_pct ? c.fake_followers_pct : null;
  out.push({
    ig_handle: c.ig_handle, ig_url: `https://www.instagram.com/${c.ig_handle}`, display_name: c.display_name, followers_ig: f, tier, tiktok_followers: c.tiktok_followers || null,
    engagement_rate: c.engagement_rate || null, fake_followers_pct: fake, location: c.city || null, niche_text: (c.niches || '').slice(0, 120) || null, bio: (c.bio || '').slice(0, 220),
    skincare_signal: skinSignal, beauty_signal: beautySignal, uae_ad_permit_in_bio: permit,
    collab_signal: marketplace ? 'self-listed on Elev8or creator marketplace (brand collabs); barter/gifting acceptance NOT stated' : collabText ? `bio mentions: ${collabText}` : null,
    gifted_barter_evidence: null, low_cost_evidence: null,
    sources: [...new Set(c.sources)], source_urls: [...new Set([c.source_url])], extra_source_urls: [], verified_at: '2026-10-08', source_data_updated: c.source_updated || null, categories: c.categories,
  });
}
fs.writeFileSync(path.join(__dirname, 'creators_all.json'), JSON.stringify(out, null, 1));
const cnt = (fn) => out.filter(fn).length;
console.log('unique creators:', out.length, '| nano', cnt((o) => o.tier === 'nano'), '| micro', cnt((o) => o.tier === 'micro'), '| mid+macro', cnt((o) => ['mid', 'macro'].includes(o.tier)), '| unknown', cnt((o) => o.tier === 'unknown'), '| skincare signal', cnt((o) => o.skincare_signal), '| beauty signal', cnt((o) => o.beauty_signal));
const target = out.filter((o) => ['nano', 'micro'].includes(o.tier) && (o.skincare_signal || o.beauty_signal));
console.log('nano/micro with skincare|beauty signal:', target.length, '(nano', target.filter((o) => o.tier === 'nano').length, ', micro', target.filter((o) => o.tier === 'micro').length, ')');
