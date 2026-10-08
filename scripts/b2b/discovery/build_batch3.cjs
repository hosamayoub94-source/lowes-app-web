// Builds UAE stores Batch 3 (b2b-leads import format) from:
//   • talabat public "pharmacies in <area>" pages (talabat_pharmacies.json, 50 area pages, all 8 talabat cities)
//   • own-website checks of independent online beauty/pharmacy stores (raw/v3, curl, public pages)
// Nothing is invented: no website/phone unless seen on the entity's own page; Lowe's presence = unverified.
// usage: node build_batch3.cjs <out.json> <out_talabat_brands.csv>
const fs = require('fs');
const TODAY = '2026-10-08';
const SRC = 'research:2026-10-08:batch3';
const [out, outCsv] = process.argv.slice(2);

const PROVINCE = { 'Dubai': 'Dubai', 'Abu Dhabi': 'Abu Dhabi', 'Al Ain': 'Abu Dhabi', 'Sharjah': 'Sharjah', 'Ajman': 'Ajman', 'Ras Al Khaima': 'Ras Al Khaimah', 'Fujairah': 'Fujairah', 'Umm Al-Quwain': 'Umm Al Quwain' };
const CITY_AR = { 'Dubai': 'دبي', 'Abu Dhabi': 'أبوظبي', 'Al Ain': 'العين', 'Sharjah': 'الشارقة', 'Ajman': 'عجمان', 'Ras Al Khaima': 'رأس الخيمة', 'Fujairah': 'الفجيرة', 'Umm Al-Quwain': 'أم القيوين' };

// Already in batch1/batch2 (by name) -> not repeated here.
const ALREADY = /^(aster|express by aster|binsina|life pharmacy|supercare|al manara|800 pharmacy|thumbay|medicina|lamise|boots)/i;
// Not a multi-brand retailer that could stock LOWE'S (optics, perfume houses, mono-brand cosmetics, supplements-only, charities, talabat's own mart).
const NOT_RETAIL = /(optic|optical|vision|eyewear|eyewa|lenstore|optician|perfume|karji|junaid|ahmed al maghrebi|flormar|kiko|lush|the face shop|nutrition|supps|dr nutrition|fit & muscles|being builder|nutrili|dubai cares|unhcr|beit al khair|world food|edge of life|^wellness$|lifestyle|exquisite|^rite$|800 pharma)/i;

// Brand-family merges (same operator, sub-brands seen on talabat).
const FAMILY = [
  [/^(express by medon|medon first pharmacy|medon pharmacy)$/i, 'Medon Pharmacy'],
  [/^(med7|med7 pharmacy|med 7 pharmacy|med7 express)$/i, 'Med7 Pharmacy'],
  [/^(nahdi pharmacy|nahdi express)$/i, 'Nahdi Pharmacy'],
  [/^(lana pharmacy|lana express)$/i, 'Lana Pharmacy'],
  [/^(modern pharmacy|bioderma powered by modern pharmacy)$/i, 'Modern Pharmacy'],
  [/^(al fatah pharmacy|al fatah pharmacy-llc)$/i, 'Al Fatah Pharmacy'],
  [/^al ain pharmacy/i, 'Al Ain Pharmacy'],
  [/^(top ?care pharmacy|topcare pharmacy)$/i, 'Top Care Pharmacy'],
];
const titleCase = (s) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s).replace(/\s+/g, ' ').trim();
const family = (b) => { const n = b.replace(/\s+/g, ' ').trim(); for (const [re, name] of FAMILY) if (re.test(n)) return name; return titleCase(n); };

// Own-website evidence (only what the fetched page showed). Key = family name.
const SITES = {
  'Medon Pharmacy': { website: 'https://medon.ae', email: 'info@medon.ae', note: 'الموقع الرسمي يذكر «أكثر من 60 فرعاً بالإمارات منذ 2012» ويذكر دبي وأبوظبي والشارقة وعجمان والعين.' },
  'Nahdi Pharmacy': { website: 'https://www.nahdionline.com/en-ae', note: 'متجر Nahdi الأونلاين بنسخة الإمارات (en-ae) يعمل ويعرض عناية بالبشرة. Nahdi سلسلة سعودية كبيرة.' },
  'Zaitoon Pharmacy': { website: 'https://zaitoonpharmacy.com', note: 'موقعها كان بوضع صيانة عند الفحص، ووصفه يذكر التوصيل بعجمان والإمارات والعناية بالبشرة.' },
};
const SKIN_HINT = { 'Modern Pharmacy': 'تشغّل منفذ «Bioderma Powered By Modern Pharmacy» على talabat — مؤشر تركيز على الديرما/العناية بالبشرة.', 'Al Saha Al Jamal Pharmacy': 'اسمها «الصحة والجمال».' };

const tb = JSON.parse(fs.readFileSync('talabat_pharmacies.json', 'utf8')).vendors;
const groups = new Map();
for (const v of tb) {
  if (!v.brand || ALREADY.test(v.brand.trim()) || NOT_RETAIL.test(v.brand.trim())) continue;
  const name = family(v.brand);
  if (ALREADY.test(name)) continue;
  const g = groups.get(name) || { name, branches: new Set(), cities: new Set(), urls: new Set(), areaPages: new Set(), raw: new Set() };
  g.branches.add(v.branch); g.cities.add(v.city); if (v.branch_url) g.urls.add(v.branch_url); g.areaPages.add(v.sample_area_page); g.raw.add(v.brand.trim());
  groups.set(name, g);
}

const rows = [];
const csv = [['name', 'branches_seen', 'cities_seen', 'talabat_names', 'province', 'priority', 'score'].join(',')];
for (const g of [...groups.values()].sort((a, b) => b.branches.size - a.branches.size || a.name.localeCompare(b.name))) {
  const cities = [...g.cities];
  const emirates = [...new Set(cities.map((c) => PROVINCE[c]))];
  const province = emirates.length >= 3 ? 'Nationwide' : emirates.length === 1 ? emirates[0]
    : emirates.sort((a, b) => tb.filter((v) => PROVINCE[v.city] === b && family(v.brand) === g.name).length - tb.filter((v) => PROVINCE[v.city] === a && family(v.brand) === g.name).length)[0];
  const n = g.branches.size;
  const site = SITES[g.name];
  let score = n >= 8 ? 34 : n >= 3 ? 28 : n === 2 ? 24 : 18;
  if (site) score += 8;
  if (SKIN_HINT[g.name]) score += 4;
  const priority = score >= 30 ? 'C' : 'D';
  const sources = [...g.urls].slice(0, 1).concat([...g.areaPages].slice(0, 1));
  if (site) sources.unshift(site.website);
  const scope = `ظهرت على talabat (صيدليات) بـ${n} فرع${n > 1 ? 'اً' : ''} ضمن العينة، في: ${cities.map((c) => CITY_AR[c]).join('، ')}.`;
  const reason = [
    `صيدلية — ${n >= 8 ? 'سلسلة واسعة' : n >= 3 ? 'سلسلة متوسطة' : n === 2 ? 'سلسلة صغيرة' : 'صيدلية مستقلة/فرع واحد بالعينة'}. ${scope}`,
    g.raw.size > 1 ? `أسماء talabat المدموجة: ${[...g.raw].join(' / ')}.` : '',
    site ? site.note : 'لا موقع رسمي متحقَّق — المصدر الوحيد صفحة talabat العامة.',
    SKIN_HINT[g.name] || '',
    'العينة 50 صفحة منطقة من أصل ~660، فالعدد الفعلي للفروع غير معروف. قناة الموردين: غير معروفة. تواجد Lowe\'s: غير متحقق.',
  ].filter(Boolean).join(' ');
  const row = {
    name: g.name, province, lead_type: 'physical', channel: site ? 'website' : 'app', category: 'صيدلية',
    ...(site ? { website: site.website } : {}), ...(site?.email ? { email: site.email } : {}),
    ...(province !== 'Nationwide' && cities.length === 1 && cities[0] === 'Al Ain' ? { city: 'Al Ain' } : {}),
    sells_beauty: true, source_urls: sources.join(' | '), priority, score,
    verified: site ? 'verified_multi_source' : 'verified_single_source', last_verified_at: TODAY, lowes_presence: 'unverified',
    reason, discovery_source: SRC,
  };
  rows.push(row);
  csv.push([g.name, n, cities.join(' / '), [...g.raw].join(' / '), province, priority, score].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(','));
}

// Online beauty / pharmacy stores verified on their own sites (curl, public pages).
const ONLINE = [
  { name: 'LOOKFANTASTIC UAE', province: 'Nationwide', lead_type: 'online', channel: 'website', category: 'متجر أونلاين — تجميل', website: 'https://www.lookfantastic.ae', email: 'partnerships@thehutgroup.com', sells_beauty: true,
    source_urls: 'https://www.lookfantastic.ae | https://www.lookfantastic.ae/c/info/partnerships-suppliers/', priority: 'B', score: 52, verified: 'verified_single_source',
    reason: 'متجر جمال أونلاين بنسخة إمارات (الأسعار بالدرهم). **صفحة «Partnerships/Suppliers» رسمية** تدعو الموردين للتواصل عبر partnerships@thehutgroup.com (بريد الشركة الأم THG، منشور بالموقع). يبيع براندات بريميوم — قبول براند جديد غير معروف. تواجد Lowe\'s: غير متحقق.' },
  { name: 'Chemist Warehouse UAE', province: 'Nationwide', lead_type: 'online', channel: 'website', category: 'صيدلية أونلاين', website: 'https://www.chemistwarehouse.ae', sells_beauty: true,
    source_urls: 'https://www.chemistwarehouse.ae', priority: 'C', score: 36, verified: 'verified_single_source',
    reason: 'صيدلية أونلاين بالإمارات (عنوان الموقع: «Online Pharmacy | Health, Beauty & Wellness»، ووصفه يذكر عناية بالبشرة وتوصيلاً بكل الإمارات). صفحة موردين: لم تظهر. تواجد Lowe\'s: غير متحقق.' },
  { name: 'Glam Beaute', province: 'Dubai', lead_type: 'online', channel: 'website', category: 'متجر أونلاين — تجميل', website: 'https://glambeaute.com', sells_beauty: true,
    source_urls: 'https://glambeaute.com | https://www.talabat.com/uae/pharmacies', priority: 'C', score: 34, verified: 'verified_multi_source',
    reason: 'متجر تجميل وعناية بالبشرة أونلاين بالإمارات (الموقع: «Buy Beauty, Skincare, Makeup & Fragrances Online in UAE»، ويذكر دبي)، وظهر أيضاً كبائع جمال على talabat. متجر مستقل متوسط — أقرب لقبول براند جديد من السلاسل. صفحة موردين: لم تظهر. تواجد Lowe\'s: غير متحقق.' },
].map((r) => ({ ...r, last_verified_at: TODAY, lowes_presence: 'unverified', discovery_source: SRC }));
// the talabat source for Glam Beaute = the actual branch url
const gb = tb.find((v) => /glam beaute/i.test(v.brand)); if (gb) ONLINE[2].source_urls = `https://glambeaute.com | ${gb.branch_url}`;
// Glam Beaute also appears in the talabat group list? it was filtered as non-pharmacy? keep one row only
const finalRows = [...ONLINE, ...rows.filter((r) => !/glam beaute/i.test(r.name))];

fs.writeFileSync(out, JSON.stringify({
  _about: 'UAE stores Batch 3 (D-119) — talabat pharmacies across all emirates + independent online beauty stores. Public pages only. NOT imported. Import only via the admin import button (preview → select → acknowledge → save).',
  country: 'AE', generated_at: TODAY, rows: finalRows,
}, null, 1));
fs.writeFileSync(outCsv, '﻿' + csv.join('\n'));
const by = (k) => Object.entries(finalRows.reduce((m, r) => (m[r[k]] = (m[r[k]] || 0) + 1, m), {})).map(([a, b]) => `${a}:${b}`).join(' ');
console.log('rows', finalRows.length, '| online', ONLINE.length, '| pharmacies', finalRows.length - ONLINE.length);
console.log('province', by('province')); console.log('priority', by('priority')); console.log('verified', by('verified'));
