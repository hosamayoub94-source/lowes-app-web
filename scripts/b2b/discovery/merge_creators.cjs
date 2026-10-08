// Final merge of UAE creator discovery: Modash + Elev8or (creators_all.json) + Collabstr (collabstr_profiles.json).
// Nothing is invented: every number/label is copied from a public page; absent = null. No personal emails/phones are stored.
const fs = require('fs');
const path = require('path');
const all = require('./creators_all.json');
const cs = require('./collabstr_profiles.json');

const SKIN = /skin|derm|glow|serum|spf|facial|cosmetic|بشرة|عناية بالبشرة|سكن/i;
const BEAUTY = /beauty|makeup|make-up|cosmet|skin|derm|glow|مكياج|جمال|تجميل|بشرة/i;
const UGC = /\bugc\b|user[- ]generated/i;
const GIFT = /gifted|barter|free products?|pr (package|friendly)|مبادلة|هدايا|منتجات مجانية/i;


const permitFromText = (t) => { const m = String(t).match(/(?:permit|AP No.?|APN|Adv(?:ertiser)? ?(?:No|Permit)|تصريح معلن|تصريح)[^0-9]{0,25}(d{5,8})/i); if (m) return m[1]; return /licensed (uae )?(influencer|content creator)/i.test(t) ? 'licensed (no number shown)' : null; };
const byIg = new Map();
const rows = [];
for (const c of all) {
  const r = {
    ig_handle: c.ig_handle, display_name: c.display_name, followers_ig: c.followers_ig, followers_basis: c.sources.includes('elev8or') && !c.sources.some((s) => s.startsWith('modash')) ? 'elev8or self-listed' : 'modash (Instagram)',
    tiktok_followers: c.tiktok_followers, engagement_rate: c.engagement_rate, fake_followers_pct: c.fake_followers_pct, location: c.location, niche_text: c.niche_text, bio: c.bio,
    uae_ad_permit_in_bio: c.uae_ad_permit_in_bio, categories: c.categories, sources: [...c.sources], source_urls: [...c.source_urls], collabstr_url: null, min_price_usd: null, packages: [], followers_listed_collabstr: [],
  };
  rows.push(r); byIg.set(c.ig_handle.toLowerCase(), r);
}
for (const p of cs) {
  const ig = p.ig_handle ? p.ig_handle.toLowerCase() : null;
  let r = ig ? byIg.get(ig) : null;
  if (!r) {
    r = {
      ig_handle: p.ig_handle || null, display_name: p.name, followers_ig: null, followers_basis: 'collabstr list (platform not specified)', tiktok_followers: null, engagement_rate: null, fake_followers_pct: null,
      location: (p.location_line || '').split('|').pop().trim() || null, niche_text: p.headline, bio: p.description, uae_ad_permit_in_bio: null, categories: [], sources: [], source_urls: [], collabstr_url: null, min_price_usd: null, packages: [], followers_listed_collabstr: [],
    };
    rows.push(r); if (ig) byIg.set(ig, r);
  }
  r.sources.push('collabstr'); r.collabstr_url = p.collabstr_url; r.source_urls.push(p.collabstr_url, ...p.list_sources);
  r.min_price_usd = p.min_price_usd; r.packages = p.packages; r.followers_listed_collabstr = p.followers_listed; r.max_listed = p.max_followers_listed; r.min_listed = p.min_followers_listed;
  if (!r.location) r.location = (p.location_line || '').split('|').pop().trim() || null;
}

const out = rows.map((r, i) => {
  const text = `${r.bio || ''} ${r.niche_text || ''} ${(r.categories || []).join(' ')}`;
  const skin = SKIN.test(text) || (r.categories || []).some((c) => /skincare/i.test(c));
  const beauty = BEAUTY.test(text) || (r.categories || []).some((c) => /beauty/i.test(c));
  const ugc = UGC.test(text) || r.sources.includes('collabstr') && /ugc/i.test(`${r.niche_text} ${r.bio}`);
  // tier: exact IG followers when known; else Collabstr listed max (conservative, platform unspecified)
  let basisNum = r.followers_ig, tierBasis = r.followers_ig != null ? r.followers_basis : null;
  if (basisNum == null && r.max_listed != null) { basisNum = r.max_listed; tierBasis = 'collabstr listed (max across unlabeled platforms)'; }
  const fromBucket = tierBasis && tierBasis.startsWith('collabstr');
  const tier = basisNum == null ? 'unknown' : fromBucket && basisNum <= 1000 ? 'sub-nano(<1k)' : basisNum < 1000 ? 'sub-nano(<1k)' : basisNum <= 10000 ? 'nano' : basisNum <= 100000 ? 'micro' : 'above-micro';
  const fake = r.fake_followers_pct ? parseFloat(r.fake_followers_pct) : null;
  const er = r.engagement_rate ? parseFloat(r.engagement_rate) : null;
  const gift = (text.match(GIFT) || [null])[0];
  const marketplace = r.sources.includes('elev8or') || r.sources.includes('collabstr');
  const comp = {
    tier: tier === 'nano' ? 25 : tier === 'micro' ? 20 : tier === 'sub-nano(<1k)' ? 8 : 0,
    skincare: skin ? 25 : beauty ? 10 : 0,
    low_cost_price: r.min_price_usd == null ? 0 : r.min_price_usd <= 100 ? 15 : r.min_price_usd <= 200 ? 8 : 0,
    uae_ad_permit: (r.uae_ad_permit_in_bio || permitFromText(text)) ? 10 : 0,
    engagement_quality: er != null && er >= 1 && er <= 10 && (fake == null || fake < 25) ? 10 : 0,
    collab_ready: ugc || marketplace ? 10 : 0,
    multi_source: new Set(r.sources.map((s) => s.split(':')[0])).size >= 2 ? 5 : 0,
  };
  const score = Object.values(comp).reduce((a, b) => a + b, 0);
  const eligible = ['nano', 'micro'].includes(tier) && (skin || beauty);
  return {
    id: `AE-CR-${String(i + 1).padStart(3, '0')}`, ig_handle: r.ig_handle, ig_url: r.ig_handle ? `https://www.instagram.com/${r.ig_handle}` : null, display_name: r.display_name, location: r.location,
    tier, tier_basis: tierBasis, followers_ig: r.followers_ig, followers_listed_collabstr: r.followers_listed_collabstr, tiktok_followers: r.tiktok_followers, engagement_rate: r.engagement_rate, fake_followers_pct: r.fake_followers_pct,
    niche_text: r.niche_text, bio_excerpt: (r.bio || '').slice(0, 200), skincare_signal: skin, beauty_signal: beauty, ugc_signal: !!ugc, uae_ad_permit_in_bio: r.uae_ad_permit_in_bio || permitFromText(text),
    collab_model_evidence: {
      gifted_barter: gift ? `public text mentions "${gift}"` : null,
      low_cost: r.min_price_usd != null ? `self-listed on Collabstr: packages from $${r.min_price_usd} (${r.packages.slice(0, 3).map((p) => `${p.name} $${p.usd}`).join('; ')})` : null,
      marketplace_listed: marketplace ? r.sources.filter((s) => s === 'elev8or' || s === 'collabstr').join('+') : null,
      note: gift ? null : 'gifted/barter acceptance NOT stated in any public source — must be asked directly',
    },
    fit_score: score, fit_components: comp, target_nano_micro_beauty: eligible,
    sources: [...new Set(r.sources)], source_urls: [...new Set(r.source_urls)], marketplace_profile_urls: [r.collabstr_url].filter(Boolean), verified_at: '2026-10-08',
    contact_note: 'No contact data stored. Reach via the public Instagram DM / marketplace profile only.',
  };
});
out.sort((a, b) => b.fit_score - a.fit_score);
fs.writeFileSync(path.join(__dirname, 'creators_final.json'), JSON.stringify(out, null, 1));
const t = out.filter((o) => o.target_nano_micro_beauty);
const cnt = (arr, f) => arr.filter(f).length;
console.log('creators total:', out.length, '| target (nano/micro + skincare|beauty):', t.length);
console.log('  by tier:', ['sub-nano(<1k)', 'nano', 'micro'].map((k) => `${k} ${cnt(t, (o) => o.tier === k)}`).join(' | '));
console.log('  skincare-explicit:', cnt(t, (o) => o.skincare_signal), '| with self-listed price<=$100:', cnt(t, (o) => o.collab_model_evidence.low_cost && /\$\d+/.test(o.collab_model_evidence.low_cost) && o.fit_components.low_cost_price === 15), '| with IG handle:', cnt(t, (o) => o.ig_handle), '| UAE ad permit in bio:', cnt(t, (o) => o.uae_ad_permit_in_bio), '| gifted/barter text:', cnt(t, (o) => o.collab_model_evidence.gifted_barter));
console.log('  top 12:'); t.slice(0, 12).forEach((o) => console.log('   ', String(o.fit_score).padStart(3), (o.ig_handle ? '@' + o.ig_handle : '(' + o.display_name + ')').padEnd(26), o.tier.padEnd(10), String(o.followers_ig ?? o.followers_listed_collabstr.join('/')).padEnd(14), o.skincare_signal ? 'skin' : 'beauty'));
