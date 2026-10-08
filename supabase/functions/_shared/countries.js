// Central country config for the B2B leads tool (D-119). One source for the screen (src/) and the
// b2b-leads edge function (Deno) — plain JS, no imports, same pattern as ./creatorMatch.js.
//   code      ISO-3166 alpha-2, stored in syria_b2b_leads.country
//   market    the orders.market key for the same country (orders keep their own lists in src/data/cities.js)
//   regions   values stored in syria_b2b_leads.province (English keys, Arabic labels below)
//   cities    optional named cities per region (stored in .city)
//   leadsPermission  the app permission that opens this country's leads (checked again on the server)
//   legacyDirect     true = this country's rows are read/written by the old direct path (Syria only, unchanged)
// Adding a country later = one entry here + its permission in src/data/permissions.js. Nothing else.

export const NATIONWIDE = 'Nationwide';

export const COUNTRIES = {
  SY: {
    code: 'SY', market: 'syria', ar: 'سوريا', en: 'Syria', flag: '🇸🇾', currency: 'SYP', phoneCc: '963',
    enabled: true, legacyDirect: true, idPrefix: 'SYR', regionLabel: 'المحافظة', nationwideLabel: 'كل سوريا',
    regionPlural: 'محافظات', allRegionsLabel: 'كل المحافظات', phoneHint: '09xxxxxxxx',
    leadsPermission: 'view_syria_leads',
    regions: ['Damascus', 'Rif Damascus', 'Aleppo', 'Homs', 'Hama', 'Latakia', 'Tartous',
      'Idlib', 'Daraa', 'Sweida', 'Quneitra', 'Deir Ezzor', 'Raqqa', 'Hasakah'],
    regionAr: {
      Damascus: 'دمشق', 'Rif Damascus': 'ريف دمشق', Aleppo: 'حلب', Homs: 'حمص', Hama: 'حماة',
      Latakia: 'اللاذقية', Tartous: 'طرطوس', Idlib: 'إدلب', Daraa: 'درعا', Sweida: 'السويداء',
      Quneitra: 'القنيطرة', 'Deir Ezzor': 'دير الزور', Raqqa: 'الرقة', Hasakah: 'الحسكة',
    },
    cities: {},
    cityAr: {},
    extraCategories: [],
  },
  AE: {
    code: 'AE', market: 'uae', ar: 'الإمارات', en: 'UAE', flag: '🇦🇪', currency: 'AED', phoneCc: '971',
    enabled: true, legacyDirect: false, idPrefix: 'UAE', regionLabel: 'الإمارة', nationwideLabel: 'على مستوى الإمارات',
    regionPlural: 'إمارات', allRegionsLabel: 'كل الإمارات', phoneHint: '05xxxxxxxx',
    leadsPermission: 'view_uae_leads',
    regions: ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'],
    regionAr: {
      'Abu Dhabi': 'أبوظبي', Dubai: 'دبي', Sharjah: 'الشارقة', Ajman: 'عجمان',
      'Umm Al Quwain': 'أم القيوين', 'Ras Al Khaimah': 'رأس الخيمة', Fujairah: 'الفجيرة',
    },
    cities: { 'Abu Dhabi': ['Al Ain'] },
    cityAr: { 'Al Ain': 'العين' },
    extraCategories: ['سلسلة تجميل/صيدليات', 'منصة توصيل سريع'],
  },
  TR: {
    code: 'TR', market: 'turkey', ar: 'تركيا', en: 'Türkiye', flag: '🇹🇷', currency: 'TRY', phoneCc: '90',
    enabled: false, legacyDirect: false, idPrefix: 'TUR', regionLabel: 'الولاية', nationwideLabel: 'كل تركيا',
    regionPlural: 'ولايات', allRegionsLabel: 'كل الولايات', phoneHint: '05xxxxxxxxx',
    leadsPermission: null, regions: [], regionAr: {}, cities: {}, cityAr: {}, extraCategories: [],
  },
};

export const countryOf = (code) => COUNTRIES[code] || null;
export const enabledCountries = () => Object.values(COUNTRIES).filter((c) => c.enabled);
export const countryOfMarket = (market) => Object.values(COUNTRIES).find((c) => c.market === market) || null;

export function regionLabelAr(code, region) {
  const c = COUNTRIES[code];
  if (!region) return '';
  if (region === NATIONWIDE) return c?.nationwideLabel || 'كل البلد';
  return c?.regionAr?.[region] || region;
}
export const cityLabelAr = (code, city) => (city && COUNTRIES[code]?.cityAr?.[city]) || city || '';

/** Accepts the English key or the Arabic label; returns the stored key or null. */
export function normalizeRegion(code, value) {
  const c = COUNTRIES[code];
  const v = String(value ?? '').trim();
  if (!c || !v) return null;
  if (v === NATIONWIDE || v === c.nationwideLabel) return NATIONWIDE;
  const low = v.toLowerCase();
  for (const r of c.regions) if (r.toLowerCase() === low || c.regionAr[r] === v) return r;
  return null;
}
/** A city is either a known city of that region (Al Ain) or free text. Known Arabic labels map back to the key. */
export function normalizeCity(code, value) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  const c = COUNTRIES[code];
  for (const [k, ar] of Object.entries(c?.cityAr || {})) if (ar === v || k.toLowerCase() === v.toLowerCase()) return k;
  return v;
}

/** Same normalisation as the unique index uq_syria_leads_website (scheme, www, trailing slashes; lower-case). */
export function websiteKey(url) {
  const s = String(url ?? '').trim();
  if (!s) return null;
  return s.replace(/^https?:\/\/(www\.)?|\/+$/g, '').toLowerCase();
}
/** Duplicate key inside one country: same name in the same region. */
export function nameKey(code, region, name) {
  const n = String(name ?? '').toLowerCase().replace(/[\s\u200f\u200e'’`".,()-]+/g, '');
  return n ? `${code}|${region || ''}|${n}` : null;
}

/** wa.me link with the country's calling code for local numbers (0xxxx). */
export function waLinkFor(whatsapp, cc) {
  if (!whatsapp) return '';
  const digits = String(whatsapp).replace(/[^0-9]/g, '');
  if (!digits) return '';
  return 'https://wa.me/' + (digits.startsWith(cc) ? digits : digits.startsWith('0') ? cc + digits.slice(1) : digits);
}
export function telLinkOf(phone) {
  const digits = String(phone ?? '').replace(/[^0-9+]/g, '');
  return digits ? 'tel:' + digits : '';
}
