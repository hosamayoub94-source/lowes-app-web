// Ranks the 71 on-target UAE creators for LOWE'S (skincare serums/SPF/brightening/acne + rosemary hair + beard serum)
// and writes a Top 30 + 20 reserve shortlist. Uses ONLY fields already collected from public pages.
// Rules: price = «غير معروف» unless self-listed with a source; nobody is called free/gifted/barter (no public evidence exists).
// usage: node shortlist_creators.cjs <targets.csv> <out.csv> <out.json>
const fs = require('fs');
const [inCsv, outCsv, outJson] = process.argv.slice(2);

function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [h, ...rest] = rows.filter((r) => r.length > 1);
  return rest.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}
const all = parseCsv(fs.readFileSync(inCsv, 'utf8'));

const RE = {
  skin: /(skin ?care|skincare|serum|spf|sunscreen|acne|glow|derma|routine|glass skin|k-?beauty|بشرة|عناية)/i,
  hair: /(hair|curl|scalp|rosemary|شعر)/i,
  men: /(beard|grooming|men'?s|لحية)/i,
  ugc: /(ugc|user.generated|product (video|content)|review)/i,
  arabic: /[؀-ۿ]/,
  arab: /(arab|emirati|khaleeji|syrian|lebanese|jordanian|egyptian|palestinian|saudi|عربي|إماراتي|سوري)/i,
};
const priceOf = (s) => { const m = String(s || '').match(/\$\s?(\d+)/g); return m ? Math.min(...m.map((x) => +x.replace(/\D/g, ''))) : null; };
const emirate = (loc) => (String(loc).match(/(Dubai|Abu Dhabi|Sharjah|Ajman|Al Ain|Ras Al Khaimah|Fujairah|Umm Al Quwain)/i) || [])[1] || (String(loc).match(/United Arab Emirates|UAE/i) ? 'الإمارات (بلا إمارة)' : (loc ? 'غير معروف' : 'الإمارات (من قائمة إماراتية — الإمارة غير معروفة)'));

const scored = all.map((r) => {
  const text = `${r.niche_text} ${r.bio_excerpt}`;
  const f = { skin: r.skincare_signal === 'true' || RE.skin.test(text), hair: RE.hair.test(text), men: RE.men.test(text), ugc: r.ugc_signal === 'true' || RE.ugc.test(text), arabic: RE.arabic.test(text) || RE.arab.test(text), permit: !!r.uae_ad_permit_in_bio, handle: !!r.ig_handle };
  const price = priceOf(r.low_cost_evidence);
  let s = +r.fit_score || 0;
  if (f.skin) s += 12; if (f.hair) s += 6; if (f.men) s += 2; if (f.ugc) s += 6; if (f.arabic) s += 6; if (f.permit) s += 8; if (!f.handle) s -= 15;
  if (price != null) s += price <= 100 ? 6 : price <= 250 ? 2 : -4;
  if (r.tier === 'nano') s += 2;
  const why = [];
  if (f.skin) why.push('محتوى عناية بالبشرة (سيروم/SPF/روتين)'); if (f.hair) why.push('يغطي العناية بالشعر (مناسب لزيت الروزماري)');
  if (f.men) why.push('محتوى رجالي (سيروم اللحية)'); if (f.ugc) why.push('يقدّم UGC/مراجعات منتجات'); if (f.arabic) why.push('جمهور/محتوى عربي محتمل');
  if (f.permit) why.push('رخصة معلِن إماراتية مذكورة بالبايو'); if (price != null && price <= 100) why.push(`سعر مُعلَن ذاتياً يبدأ من $${price}`);
  why.push(`${r.tier === 'nano' ? 'Nano' : 'Micro'} — ${emirate(r.location)}`);
  if (!f.handle) why.push('⚠️ handle إنستغرام غير مؤكد');
  return {
    rank: 0, id: r.id, lowes_fit_score: s, ig_handle: r.ig_handle || '', ig_url: r.ig_url || '', display_name: r.display_name, tier: r.tier, followers_shown: r.followers_shown,
    emirate: emirate(r.location), engagement_rate: r.engagement_rate || 'غير معروف',
    price: price != null ? `من $${price} (مُعلَن ذاتياً — ${r.marketplace_listed || 'منصة'})` : 'غير معروف',
    collab_model: 'غير معروف — لا دليل منشور على مجاني/هدية/Barter',
    fit_reason: why.join(' · '), source_urls: r.source_urls, verified_at: r.verified_at,
  };
}).sort((a, b) => b.lowes_fit_score - a.lowes_fit_score || a.id.localeCompare(b.id));
scored.forEach((r, i) => { r.rank = i + 1; r.list = i < 30 ? 'top30' : i < 50 ? 'reserve20' : 'not_shortlisted'; });

const short = scored.filter((r) => r.list !== 'not_shortlisted');
const cols = ['rank', 'list', 'id', 'lowes_fit_score', 'ig_handle', 'ig_url', 'display_name', 'tier', 'followers_shown', 'emirate', 'engagement_rate', 'price', 'collab_model', 'fit_reason', 'source_urls', 'verified_at'];
fs.writeFileSync(outCsv, '﻿' + [cols.join(','), ...short.map((r) => cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n'));
fs.writeFileSync(outJson, JSON.stringify({
  _about: 'UAE creators shortlist for LOWE\'S (D-119): Top 30 + 20 reserve out of 71 on-target Nano/Micro. Public data only. Price = self-listed or «غير معروف». Nobody is labelled free/gifted/barter (no public evidence). Not contacted, not imported.',
  generated_at: '2026-10-08', scoring: 'base fit_score + skincare 12 + hair 6 + men 2 + UGC 6 + Arabic 6 + UAE ad permit 8 + price≤$100 6 (≤$250 2, >$250 −4) + nano 2 − no IG handle 15',
  top30: short.filter((r) => r.list === 'top30'), reserve20: short.filter((r) => r.list === 'reserve20'),
}, null, 1));
const t = short.filter((r) => r.list === 'top30');
console.log('input', all.length, '| top30', t.length, '| reserve', short.length - t.length);
console.log('top30: skincare', t.filter((r) => /بشرة/.test(r.fit_reason)).length, '| hair', t.filter((r) => /الشعر/.test(r.fit_reason)).length, '| UGC', t.filter((r) => /UGC/.test(r.fit_reason)).length, '| permit', t.filter((r) => /رخصة/.test(r.fit_reason)).length, '| price known', t.filter((r) => r.price !== 'غير معروف').length, '| no handle', t.filter((r) => !r.ig_handle).length);
console.log('emirates', Object.entries(t.reduce((m, r) => (m[r.emirate] = (m[r.emirate] || 0) + 1, m), {})).map(([a, b]) => `${a}:${b}`).join(' '));
t.slice(0, 10).forEach((r) => console.log(r.rank, r.lowes_fit_score, r.ig_handle || '—', r.tier, r.emirate, r.price));
