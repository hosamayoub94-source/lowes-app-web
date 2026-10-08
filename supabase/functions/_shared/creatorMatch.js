// _shared/creatorMatch.js — «صناع المحتوى» v2: بحث + مرادفات + Score + فلاتر.
// ESM نقي بلا أي dependency: تستورده الدالة creator-prospects (Deno) والواجهة (Vite) والاختبارات (node test-creator-match.mjs).
// قاعدة ذهبية: لا رقم مخترع — الحقل المجهول يعطي 0 نقاط ويظهر بقائمة «ناقص»، والأسباب تُبنى حرفياً من الحقول.

// ---------------- vocabularies ----------------
export const CONTENT_TYPES = ['ugc', 'unboxing', 'review', 'reels', 'stories', 'photography'];
export const SKINCARE_FOCUS = ['face_care', 'body_care', 'sunscreen', 'serums', 'creams', 'hair_care', 'beauty'];
export const CREATOR_TYPES = ['ugc', 'skincare', 'beauty', 'unboxing', 'reviewer', 'expert', 'general'];
export const STATUSES = ['discovered', 'needs_review', 'verified', 'rejected', 'contacted', 'interested', 'collaborating', 'not_interested', 'inactive'];
export const VERIFICATION = ['verified', 'partial', 'unverified'];
export const LOCATION_CONFIDENCE = ['high', 'medium', 'low'];
export const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'facebook', 'other'];

export const CONTENT_AR = { ugc: 'UGC', unboxing: 'Unboxing', review: 'مراجعة منتجات', reels: 'Reels', stories: 'Stories', photography: 'تصوير منتجات' };
export const FOCUS_AR = { face_care: 'عناية بالوجه', body_care: 'عناية بالجسم', sunscreen: 'واقي شمس', serums: 'سيروم', creams: 'كريمات', hair_care: 'عناية بالشعر', beauty: 'Beauty' };
export const TYPE_AR = { ugc: 'UGC Creator', skincare: 'Skincare Creator', beauty: 'Beauty Creator', unboxing: 'Unboxing Creator', reviewer: 'Product Reviewer', expert: 'خبير بشرة / صيدلاني', general: 'مؤثر عام' };
export const STATUS_AR = { discovered: 'مُكتشَف', needs_review: 'يحتاج مراجعة', verified: 'متحقَّق', rejected: 'مرفوض', contacted: 'تم التواصل', interested: 'مهتم', collaborating: 'متعاون', not_interested: 'غير مهتم', inactive: 'غير نشط' };
export const VERIFICATION_AR = { verified: 'متحقَّق', partial: 'متحقَّق جزئياً', unverified: 'غير متحقَّق' };
export const CONFIDENCE_AR = { high: 'ثقة عالية', medium: 'ثقة متوسطة', low: 'ثقة منخفضة' };
export const CATEGORY_AR = { skincare: 'عناية بالبشرة', beauty: 'جمال', makeup: 'مكياج', hair: 'شعر', fashion: 'أزياء', motherhood: 'أمومة', wellness: 'صحة', food: 'طعام', art: 'فن', fitness: 'لياقة', entertainment: 'ترفيه', music: 'موسيقى' };

// v1 statuses (still accepted by the DB during the transition) -> v2 meaning. The UI only writes v2.
export const LEGACY_STATUS = { new: 'needs_review', reviewing: 'needs_review', approved: 'verified', package_sent: 'collaborating', posted: 'collaborating', declined: 'not_interested' };
export const statusOf = (s) => LEGACY_STATUS[s] || s || 'needs_review';
// v2 -> closest v1 value, only used when the deployed function is still v1 (fallback mode).
export const V1_STATUS = { discovered: 'new', needs_review: 'reviewing', verified: 'approved', rejected: 'rejected', contacted: 'contacted', interested: 'contacted', collaborating: 'posted', not_interested: 'declined', inactive: 'rejected' };

// Countries: only SY is enabled now. Adding Turkey = set enabled:true + fill its governorates list. No schema change.
export const COUNTRIES = [
  { code: 'SY', ar: 'سوريا', en: 'Syria', enabled: true, aliases: ['سوريا', 'سوريه', 'syria', 'syrian', 'سوري', 'سوريين'] },
  { code: 'TR', ar: 'تركيا', en: 'Turkey', enabled: false, aliases: ['تركيا', 'turkey', 'turkiye', 'türkiye'] },
  { code: 'AE', ar: 'الإمارات', en: 'UAE', enabled: false, aliases: ['الامارات', 'امارات', 'uae', 'emirates'] },
  { code: 'LB', ar: 'لبنان', en: 'Lebanon', enabled: false, aliases: ['لبنان', 'lebanon'] },
  { code: 'SA', ar: 'السعودية', en: 'Saudi Arabia', enabled: false, aliases: ['السعوديه', 'سعوديه', 'saudi', 'ksa'] },
  { code: 'JO', ar: 'الأردن', en: 'Jordan', enabled: false, aliases: ['الاردن', 'اردن', 'jordan'] },
];
export const GOVERNORATES = {
  SY: [
    { slug: 'damascus', ar: 'دمشق', en: 'Damascus', aliases: ['دمشق', 'الشام', 'damascus', 'dimashq', 'sham'] },
    { slug: 'rif_dimashq', ar: 'ريف دمشق', en: 'Rif Dimashq', aliases: ['ريف دمشق', 'rif dimashq', 'rif damascus', 'damascus countryside', 'rural damascus'] },
    { slug: 'aleppo', ar: 'حلب', en: 'Aleppo', aliases: ['حلب', 'aleppo', 'halab'] },
    { slug: 'homs', ar: 'حمص', en: 'Homs', aliases: ['حمص', 'homs', 'hims'] },
    { slug: 'hama', ar: 'حماة', en: 'Hama', aliases: ['حماة', 'hama', 'hamah'] },
    { slug: 'latakia', ar: 'اللاذقية', en: 'Latakia', aliases: ['اللاذقية', 'لاذقية', 'latakia', 'lattakia', 'latakiya'] },
    { slug: 'tartus', ar: 'طرطوس', en: 'Tartus', aliases: ['طرطوس', 'tartus', 'tartous'] },
    { slug: 'idlib', ar: 'إدلب', en: 'Idlib', aliases: ['إدلب', 'idlib', 'idleb'] },
    { slug: 'daraa', ar: 'درعا', en: 'Daraa', aliases: ['درعا', 'daraa', 'deraa'] },
    { slug: 'as_suwayda', ar: 'السويداء', en: 'As-Suwayda', aliases: ['السويداء', 'سويداء', 'suwayda', 'sweida', 'swaida'] },
    { slug: 'quneitra', ar: 'القنيطرة', en: 'Quneitra', aliases: ['القنيطرة', 'قنيطرة', 'quneitra'] },
    { slug: 'al_hasakah', ar: 'الحسكة', en: 'Al-Hasakah', aliases: ['الحسكة', 'حسكة', 'hasakah', 'hasaka', 'al hasakah'] },
    { slug: 'raqqa', ar: 'الرقة', en: 'Raqqa', aliases: ['الرقة', 'رقة', 'raqqa', 'rakka'] },
    { slug: 'deir_ez_zor', ar: 'دير الزور', en: 'Deir ez-Zor', aliases: ['دير الزور', 'deir ez zor', 'deir ezzor', 'deir el zor', 'deir_ez_zor'] },
  ],
};
export const govOf = (country, slug) => (GOVERNORATES[country || 'SY'] || []).find((g) => g.slug === slug) || null;
export const countryOf = (code) => COUNTRIES.find((c) => c.code === code) || null;

// ---------------- text normalisation ----------------
export function normalizeText(v) {
  return String(v ?? '')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '') // tashkeel + tatweel
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[،؛؟@#_\-./\\|,;:!?()[\]{}"'«»+*%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "@handle", "handle", or a profile URL -> { platform?, handle } (handle keeps its case; key = lower-case).
export function parseHandle(raw) {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  let platform;
  if (/^https?:\/\//i.test(s) || /^(www\.|m\.)?(instagram|tiktok|youtube|facebook)\.com/i.test(s)) {
    try {
      const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
      const host = u.hostname.replace(/^(www\.|m\.)/, '');
      if (host.includes('instagram.com')) platform = 'instagram';
      else if (host.includes('tiktok.com')) platform = 'tiktok';
      else if (host.includes('youtube.com')) platform = 'youtube';
      else if (host.includes('facebook.com')) platform = 'facebook';
      s = decodeURIComponent(u.pathname.split('/').filter(Boolean)[0] || '');
    } catch { return null; }
  }
  s = s.replace(/^@+/, '').replace(/\/+$/, '').trim();
  if (!s || s.length > 100 || /\s/.test(s)) return null;
  return { platform, handle: s };
}
export const normalizeHandle = (raw) => { const p = parseHandle(raw); return p ? p.handle.toLowerCase() : null; };

// Arabic <-> Latin name tolerance: a consonant skeleton ("ريم" ~ "Reem" -> "rm", "حنين" ~ "Hanin" -> "hnn").
const AR_LAT = { 'ب': 'b', 'ت': 't', 'ث': 't', 'ج': 'j', 'ح': 'h', 'خ': 'k', 'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 's', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'غ': 'g', 'ف': 'f', 'ق': 'k', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h' };
export function skeleton(word) {
  let w = normalizeText(word);
  if (/[؀-ۿ]/.test(w)) w = [...w].map((c) => AR_LAT[c] ?? '').join('');
  else w = w.replace(/th/g, 't').replace(/sh/g, 's').replace(/kh/g, 'k').replace(/gh/g, 'g').replace(/dh/g, 'd').replace(/ch/g, 's').replace(/q/g, 'k').replace(/c/g, 'k').replace(/g/g, 'j').replace(/[^a-z]/g, '').replace(/[aeiouyw]/g, '');
  w = w.replace(/g/g, 'j').replace(/(.)\1+/g, '$1').replace(/h$/, '');
  return w;
}

// ---------------- concepts (synonyms) ----------------
// kind: content | focus | type | product | geo | country | platform | size
const CONCEPTS = [
  { key: 'ugc', kind: 'content', terms: ['ugc', 'يو جي سي', 'محتوى مستخدم', 'user generated', 'user generated content'] },
  { key: 'unboxing', kind: 'content', terms: ['unboxing', 'unbox', 'انبوكسنج', 'انبوكسينغ', 'انبوكسينج', 'فتح بوكس', 'فتح البوكس', 'فتح علبه', 'فتح صندوق'] },
  { key: 'review', kind: 'content', terms: ['review', 'reviews', 'reviewer', 'مراجعه', 'مراجعات', 'ريفيو', 'تجربه', 'تجربتي', 'رأيي', 'product review'] },
  { key: 'reels', kind: 'content', terms: ['reels', 'reel', 'ريلز', 'ريل'] },
  { key: 'stories', kind: 'content', terms: ['stories', 'story', 'ستوري', 'ستوريز'] },
  { key: 'photography', kind: 'content', terms: ['photography', 'photographer', 'product photography', 'تصوير', 'تصوير منتجات', 'مصوره', 'مصور'] },
  { key: 'skincare', kind: 'focus', terms: ['skincare', 'skin care', 'skin', 'سكين كير', 'سكينكير', 'عنايه بالبشره', 'العنايه بالبشره', 'عنايه', 'بشره', 'face care', 'facecare', 'عنايه بالوجه'] },
  { key: 'serums', kind: 'product', parent: 'skincare', terms: ['serum', 'serums', 'سيروم', 'سيرم'] },
  { key: 'sunscreen', kind: 'product', parent: 'skincare', terms: ['sunscreen', 'sun screen', 'sunblock', 'spf', 'واقي شمس', 'واقي الشمس', 'صن سكرين', 'صن بلوك'] },
  { key: 'creams', kind: 'product', parent: 'skincare', terms: ['cream', 'creams', 'كريم', 'كريمات', 'moisturizer', 'moisturiser', 'مرطب', 'مرطبات'] },
  { key: 'retinol', kind: 'product', parent: 'skincare', terms: ['retinol', 'ريتينول', 'ريتنول'] },
  { key: 'vitamin_c', kind: 'product', parent: 'skincare', terms: ['vitamin c', 'vit c', 'فيتامين سي', 'فيتامين c'] },
  { key: 'scrub', kind: 'product', parent: 'skincare', terms: ['scrub', 'scrubs', 'مقشر', 'مقشرات', 'تقشير'] },
  { key: 'body_care', kind: 'focus', terms: ['body care', 'bodycare', 'عنايه بالجسم', 'لوشن', 'lotion'] },
  { key: 'hair_care', kind: 'focus', terms: ['hair', 'hair care', 'haircare', 'شعر', 'عنايه بالشعر'] },
  { key: 'beauty', kind: 'focus', terms: ['beauty', 'بيوتي', 'جمال', 'makeup', 'make up', 'مكياج', 'ميك اب', 'ميكاب'] },
  { key: 'expert', kind: 'type', terms: ['dermatologist', 'derma', 'derm', 'pharmacist', 'pharmacy', 'cosmetic scientist', 'skin specialist', 'طبيب جلديه', 'طبيبه جلديه', 'جلديه', 'صيدلاني', 'صيدلانيه', 'صيدليه', 'دكتور', 'دكتوره', 'dr'] },
  { key: 'instagram', kind: 'platform', terms: ['instagram', 'insta', 'ig', 'انستغرام', 'انستقرام', 'انستا', 'انستجرام'] },
  { key: 'tiktok', kind: 'platform', terms: ['tiktok', 'tik tok', 'تيك توك', 'تيكتوك'] },
  { key: 'youtube', kind: 'platform', terms: ['youtube', 'يوتيوب'] },
  { key: 'facebook', kind: 'platform', terms: ['facebook', 'fb', 'فيسبوك', 'فيس بوك'] },
  { key: 'nano', kind: 'size', min: 0, max: 10000, terms: ['nano', 'نانو', 'صغير', 'صغيره', 'small'] },
  { key: 'micro', kind: 'size', min: 10000, max: 100000, terms: ['micro', 'مايكرو', 'ميكرو'] },
  { key: 'macro', kind: 'size', min: 100000, max: 1000000, terms: ['macro', 'ماكرو'] },
  { key: 'mega', kind: 'size', min: 1000000, max: Infinity, terms: ['mega', 'ميجا', 'celebrity', 'مشهور', 'مشهوره'] },
  ...COUNTRIES.map((c) => ({ key: 'country:' + c.code, kind: 'country', code: c.code, terms: c.aliases })),
  ...Object.entries(GOVERNORATES).flatMap(([cc, list]) => list.map((g) => ({ key: 'geo:' + g.slug, kind: 'geo', country: cc, slug: g.slug, terms: g.aliases }))),
].map((c) => ({ ...c, terms: [...new Set(c.terms.map(normalizeText))] }));
export const CONCEPT_KEYS = CONCEPTS.map((c) => c.key);

const TERM_TO_CONCEPT = new Map();
const PHRASES = [];
for (const c of CONCEPTS) for (const t of c.terms) {
  if (!TERM_TO_CONCEPT.has(t)) TERM_TO_CONCEPT.set(t, c);
  if (t.includes(' ')) PHRASES.push(t);
}
PHRASES.sort((a, b) => b.length - a.length);

const STOP = new Set(['بدي', 'بدنا', 'بدك', 'اريد', 'نريد', 'ابغى', 'ابي', 'عايز', 'بنت', 'بنات', 'شب', 'شاب', 'شباب', 'تصور', 'يصور', 'بتصور', 'بيصور', 'عنده', 'عندها', 'عندو', 'لديه', 'لديها', 'عندهم', 'في', 'من', 'على', 'عن', 'مع', 'او', 'و', 'ل', 'الى', 'اللي', 'يلي', 'هو', 'هي', 'منتجات', 'منتج', 'لمنتجات', 'محتوى', 'حساب', 'حسابات', 'مبدع', 'مبدعه', 'مبدعين', 'صانع', 'صانعه', 'صناع', 'creator', 'creators', 'content', 'account', 'accounts', 'in', 'with', 'the', 'and', 'for', 'who', 'a', 'an', 'of', 'from', 'to', 'i', 'want', 'need', 'products', 'product', 'video', 'videos', 'فيديو', 'فيديوهات', 'influencer', 'مؤثر', 'مؤثره', 'بلوجر', 'blogger'].map(normalizeText));
const AR_PREFIXES = ['وبال', 'وال', 'بال', 'لل', 'ال', 'وب', 'ب', 'ل', 'و', 'ف'];

function lookupToken(tok) {
  if (STOP.has(tok)) return { stop: true };
  if (TERM_TO_CONCEPT.has(tok)) return { concept: TERM_TO_CONCEPT.get(tok) };
  if (/[؀-ۿ]/.test(tok)) {
    for (const p of AR_PREFIXES) {
      if (tok.startsWith(p) && tok.length - p.length >= 2) {
        const rest = tok.slice(p.length);
        if (STOP.has(rest)) return { stop: true };
        if (TERM_TO_CONCEPT.has(rest)) return { concept: TERM_TO_CONCEPT.get(rest) };
      }
    }
  }
  return null;
}

// "بدي UGC Skincare بدمشق" -> { concepts:[ugc, skincare, geo:damascus], words:[], handles:[] }
export function parseQuery(q) {
  const raw = String(q ?? '').trim();
  const handles = [];
  const rest = raw.split(/\s+/).filter((t) => {
    if (/^@/.test(t) || /instagram\.com|tiktok\.com|youtube\.com|facebook\.com/i.test(t)) { const h = normalizeHandle(t); if (h) handles.push(h); return false; }
    return true;
  }).join(' ');
  let s = ` ${normalizeText(rest)} `;
  const concepts = [];
  const add = (c) => { if (!concepts.some((x) => x.key === c.key)) concepts.push(c); };
  for (const ph of PHRASES) {
    const variants = [ph, ...AR_PREFIXES.map((p) => p + ph)];
    for (const v of variants) {
      if (s.includes(` ${v} `)) { add(TERM_TO_CONCEPT.get(ph)); s = s.split(` ${v} `).join(' '); }
    }
  }
  const words = [];
  for (const tok of s.split(' ').filter(Boolean)) {
    const hit = lookupToken(tok);
    if (hit?.stop) continue;
    if (hit?.concept) add(hit.concept);
    else words.push(tok);
  }
  return { concepts, words, handles, empty: concepts.length + words.length + handles.length === 0 };
}

// ---------------- row helpers ----------------
const arr = (v) => (Array.isArray(v) ? v : []);
const hasOtherPlatform = (r, p) => !!(r.other_platforms && typeof r.other_platforms === 'object' && r.other_platforms[p]);
const SKIN_ITEMS = ['face_care', 'body_care', 'sunscreen', 'serums', 'creams'];

export function isUgc(r) {
  const ct = arr(r.content_types);
  return ct.includes('ugc') || ct.includes('unboxing') || ct.includes('review') || ['ugc', 'unboxing', 'reviewer'].includes(r.creator_type);
}
export function isSkincare(r) {
  return ['skincare', 'expert'].includes(r.creator_type) || arr(r.skincare_focus).some((f) => SKIN_ITEMS.includes(f)) || (r.category || '').toLowerCase() === 'skincare';
}

function haystack(r) {
  const gov = govOf(r.country, r.governorate);
  const cn = countryOf(r.country);
  const parts = [
    r.name, r.handle, String(r.handle || '').replace(/[._]/g, ''), r.profile_url, r.city, r.location, gov?.ar, gov?.en, cn?.ar, cn?.en,
    r.creator_type, TYPE_AR[r.creator_type], r.category, CATEGORY_AR[(r.category || '').toLowerCase()],
    ...arr(r.content_types), ...arr(r.content_types).map((c) => CONTENT_AR[c]),
    ...arr(r.skincare_focus), ...arr(r.skincare_focus).map((f) => FOCUS_AR[f]),
    ...arr(r.tags), r.bio, r.notes, r.fit,
  ];
  return ` ${normalizeText(parts.filter(Boolean).join(' '))} `;
}
const textHasTerm = (hay, term) => hay.includes(` ${term} `) || (term.length >= 4 && hay.includes(term));

// strength: 3 = structured field proves it · 1 = only text mentions it (or the parent concept) · 0 = no
function conceptStrength(r, c, hay) {
  const ct = arr(r.content_types), sf = arr(r.skincare_focus), cat = (r.category || '').toLowerCase();
  switch (c.kind) {
    case 'content':
      if (ct.includes(c.key)) return 3;
      if (c.key === 'ugc' && r.creator_type === 'ugc') return 3;
      if (c.key === 'unboxing' && r.creator_type === 'unboxing') return 3;
      if (c.key === 'review' && r.creator_type === 'reviewer') return 3;
      return c.terms.some((t) => textHasTerm(hay, t)) ? 1 : 0;
    case 'focus':
      if (c.key === 'skincare') { if (isSkincare(r)) return 3; }
      else if (c.key === 'beauty') { if (r.creator_type === 'beauty' || sf.includes('beauty') || ['beauty', 'makeup'].includes(cat)) return 3; }
      else if (c.key === 'hair_care') { if (sf.includes('hair_care') || cat === 'hair') return 3; }
      else if (sf.includes(c.key)) return 3;
      return c.terms.some((t) => textHasTerm(hay, t)) ? 1 : 0;
    case 'product':
      if (sf.includes(c.key)) return 3;
      if (c.terms.some((t) => textHasTerm(hay, t))) return 2;
      return isSkincare(r) ? 1 : 0; // «سيروم» also surfaces clear Skincare creators, ranked below exact matches
    case 'type':
      if (r.creator_type === c.key) return 3;
      return c.terms.some((t) => textHasTerm(hay, t)) ? 1 : 0;
    case 'platform':
      return r.platform === c.key ? 3 : hasOtherPlatform(r, c.key) ? 2 : 0;
    case 'size':
      return r.followers != null && r.followers >= c.min && r.followers < c.max ? 2 : 0;
    case 'country':
      return r.country === c.code ? 2 : 0;
    case 'geo': {
      if (r.governorate === c.slug) return 3;
      const loc = ` ${normalizeText([r.city, r.location].filter(Boolean).join(' '))} `;
      return c.terms.some((t) => loc.includes(` ${t} `)) ? 2 : 0;
    }
    default: return 0;
  }
}

// Every query part must match (AND). Returns 0 when the row is out, else a relevance number.
export function matchRow(r, parsed) {
  if (!parsed || parsed.empty) return 1;
  const hay = haystack(r);
  let rel = 0;
  const key = String(r.handle_key || r.handle || '').toLowerCase().replace(/^@+/, '');
  for (const h of parsed.handles) {
    if (key === h) rel += 10; else if (key.includes(h)) rel += 5; else return 0;
  }
  for (const c of parsed.concepts) { const s = conceptStrength(r, c, hay); if (!s) return 0; rel += s; }
  const nameWords = normalizeText(`${r.name || ''} ${r.handle || ''}`).split(' ').filter(Boolean);
  for (const w of parsed.words) {
    if (nameWords.some((nw) => nw.startsWith(w))) { rel += 3; continue; }
    if (hay.includes(w)) { rel += 1; continue; }
    const sk = skeleton(w);
    if (sk.length >= 2 && nameWords.some((nw) => skeleton(nw) === sk)) { rel += 1; continue; }
    return 0;
  }
  return rel;
}

// ---------------- score (0–100) ----------------
export const WEIGHTS = { skincare: 30, ugc: 25, product: 15, unboxing: 10, activity: 10, location: 5, engagement: 5 };
export const BADGES = {
  excellent: { icon: '⭐', label: 'مناسب جداً', cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  good: { icon: '🟢', label: 'مناسب', cls: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  review: { icon: '🟡', label: 'يحتاج مراجعة', cls: 'bg-yellow-50 text-yellow-800 border-yellow-300' },
  // gray, not red: a low score usually means "little evidence recorded yet", not "bad". Red is reserved for rejected accounts.
  low: { icon: '⚪', label: 'تقييم أولي منخفض', cls: 'bg-gray-50 text-gray-600 border-gray-300' },
  unfit: { icon: '🔴', label: 'غير مناسب', cls: 'bg-red-50 text-red-700 border-red-300' },
};
const daysSince = (d, now) => { const t = Date.parse(d); return Number.isFinite(t) ? Math.floor((now - t) / 864e5) : null; };
export function fmtNum(n) {
  if (n == null || n === '') return '—';
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  if (x >= 1e6) return (x / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (x >= 1e3) return (x / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(x);
}

export function scoreCreator(r, now = Date.now()) {
  const ct = arr(r.content_types), sf = arr(r.skincare_focus), cat = (r.category || '').toLowerCase();
  const reasons = [], missing = [], parts = {};
  const focusAr = sf.filter((f) => f !== 'beauty').map((f) => FOCUS_AR[f]);

  // 1) Skincare relevance — 30
  const skinItems = sf.filter((f) => SKIN_ITEMS.includes(f));
  let sk = 0;
  if (r.creator_type === 'expert') { sk = 30; reasons.push('خبير بشرة / صيدلاني (نوع مسجّل)'); }
  else if (r.creator_type === 'skincare') { sk = 30; reasons.push(`Skincare Creator${focusAr.length ? ` — ${focusAr.join('، ')}` : ''}`); }
  else if (skinItems.length >= 2) { sk = 30; reasons.push(`محتوى عناية بالبشرة: ${focusAr.join('، ')}`); }
  else if (skinItems.length === 1) { sk = 20; reasons.push(`محتوى عناية بالبشرة: ${focusAr.join('، ')}`); }
  else if (cat === 'skincare') { sk = 20; reasons.push('تصنيف المصدر: عناية بالبشرة (غير مؤكَّد بالمحتوى)'); }
  else if (r.creator_type === 'beauty' || sf.includes('beauty') || sf.includes('hair_care') || ['beauty', 'makeup', 'hair'].includes(cat)) { sk = 10; reasons.push('Beauty بدون دليل Skincare واضح'); missing.push('لا يوجد دليل محتوى عناية بالبشرة'); }
  else missing.push('لا يوجد ارتباط مسجّل بالعناية بالبشرة');
  parts.skincare = sk;

  // 2) UGC capability — 25
  let ugc = 0;
  if (ct.includes('ugc') || r.creator_type === 'ugc') { ugc = 25; reasons.push('يصوّر UGC (مسجّل بأنواع المحتوى)'); }
  else if (ct.includes('review') || ct.includes('unboxing') || ['reviewer', 'unboxing'].includes(r.creator_type)) { ugc = 12; reasons.push('يصوّر منتجات — قدرة UGC جزئية'); }
  else missing.push('لا يوجد دليل UGC مسجّل');
  parts.ugc = ugc;

  // 3) Product content — 15
  let prod = 0;
  if (ct.includes('review') || r.creator_type === 'reviewer') { prod = 15; reasons.push('لديه مراجعات منتجات'); }
  else if (ct.includes('reels') || ct.includes('photography')) { prod = 5; reasons.push(ct.includes('reels') ? 'يصوّر Reels' : 'يصوّر منتجات (صور)'); }
  parts.product = prod;

  // 4) Unboxing — 10
  const unb = ct.includes('unboxing') || r.creator_type === 'unboxing' ? 10 : 0;
  if (unb) reasons.push('لديه محتوى Unboxing');
  parts.unboxing = unb;

  // 5) Instagram activity — 10 (unknown = 0, never assumed)
  let act = 0;
  const onIg = r.platform === 'instagram' || hasOtherPlatform(r, 'instagram');
  if (!onIg) missing.push('ليس على Instagram');
  else {
    const d = r.last_active_at ? daysSince(r.last_active_at, now) : null;
    if (d == null) missing.push('آخر نشاط على Instagram غير متوفر');
    else if (d <= 30) { act = 10; reasons.push(`نشط على Instagram (آخر نشر قبل ${d} يوم)`); }
    else if (d <= 90) { act = 6; reasons.push(`نشاط متوسط (آخر نشر قبل ${d} يوم)`); }
    else { act = 2; missing.push(`آخر نشر قبل ${d} يوم — قد يكون غير نشط`); }
  }
  parts.activity = act;

  // 6) Location confidence — 5
  let loc = 0;
  const gov = govOf(r.country, r.governorate);
  const cn = countryOf(r.country);
  if (r.country) {
    loc = r.location_confidence === 'high' ? 5 : r.location_confidence === 'medium' ? 3 : 1;
    const place = [...new Set([r.city, gov?.ar, cn?.ar || r.country].filter(Boolean))].join('، ');
    reasons.push(`${place} — ${CONFIDENCE_AR[r.location_confidence] || 'ثقة منخفضة'}`);
  } else missing.push('الدولة غير متحقَّقة');
  parts.location = loc;

  // 7) Engagement quality — 5
  let eng = 0;
  const er = r.engagement_pct == null || r.engagement_pct === '' ? null : Number(r.engagement_pct);
  if (er == null || !Number.isFinite(er)) missing.push('التفاعل غير متوفر');
  else if (er > 20) { eng = 1; missing.push(`تفاعل ${er}% مرتفع بشكل غير اعتيادي — يحتاج تحقق`); }
  else if (er >= 3) { eng = 5; reasons.push(`تفاعل جيد ${er}%`); }
  else if (er >= 1.5) { eng = 3; reasons.push(`تفاعل ${er}%`); }
  else if (er > 0) { eng = 1; reasons.push(`تفاعل منخفض ${er}%`); }
  parts.engagement = eng;

  if (r.followers == null) missing.push('عدد المتابعين غير متوفر');
  if (!r.source) missing.push('مصدر الاكتشاف غير مسجّل');
  if (!r.last_verified_at && r.verification_status !== 'verified') missing.push('لم يُتحقَّق من الحساب يدوياً بعد');

  const score = sk + ugc + prod + unb + act + loc + eng;
  const st = statusOf(r.status);
  const badge = ['rejected', 'not_interested'].includes(st) ? 'unfit' : score >= 75 ? 'excellent' : score >= 60 ? 'good' : score >= 45 ? 'review' : 'low';
  return { score, badge, parts, reasons, missing };
}

// ---------------- search (server + client fallback share this) ----------------
export const SORTS = {
  best: 'Best Match', followers: 'الأكثر متابعين', engagement: 'الأعلى تفاعلاً', small: 'Creators صغار أولاً', verified: 'آخر تحقق', active: 'آخر نشاط',
};
// x = value of the first row, y = second row; unknown (null) always sorts last.
const desc = (x, y) => (x == null && y == null ? 0 : x == null ? 1 : y == null ? -1 : y - x);
const asc = (x, y) => (x == null && y == null ? 0 : x == null ? 1 : y == null ? -1 : x - y);
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const ts = (d) => { const t = Date.parse(d); return Number.isFinite(t) ? t : null; };

function passFilters(r, f) {
  if (f.country && r.country !== f.country) return false;
  if (f.governorate && r.governorate !== f.governorate) return false;
  if (f.city && normalizeText(r.city) !== normalizeText(f.city)) return false;
  if (f.creator_type && r.creator_type !== f.creator_type) return false;
  if (f.platform && r.platform !== f.platform && !hasOtherPlatform(r, f.platform)) return false;
  if (f.status && statusOf(r.status) !== f.status) return false;
  if (f.verification_status && (r.verification_status || 'unverified') !== f.verification_status) return false;
  if (arr(f.content_types).length && !arr(f.content_types).every((c) => arr(r.content_types).includes(c))) return false;
  if (arr(f.skincare_focus).length && !arr(f.skincare_focus).some((c) => arr(r.skincare_focus).includes(c))) return false;
  if (f.badge && scoreCreator(r).badge !== f.badge) return false;
  return true;
}

export function searchCreators(rows, { q = '', filters = {}, sort = 'best', page = 1, pageSize = 30, now = Date.now() } = {}) {
  const parsed = parseQuery(q);
  const base = [];
  for (const r of rows || []) {
    if (!passFilters(r, filters)) continue;
    const rel = matchRow(r, parsed);
    if (!rel) continue;
    base.push({ ...r, relevance: parsed.empty ? 0 : rel, ...scoreCreator(r, now) });
  }
  const counts = { all: base.length, ugc: 0, skincare: 0, saved: 0, status: {}, governorate: {} };
  for (const r of base) {
    if (isUgc(r)) counts.ugc++;
    if (isSkincare(r)) counts.skincare++;
    if (r.saved) counts.saved++;
    const st = statusOf(r.status); counts.status[st] = (counts.status[st] || 0) + 1;
    if (r.governorate) counts.governorate[r.governorate] = (counts.governorate[r.governorate] || 0) + 1;
  }
  const out = base.filter((r) => (!filters.ugcOnly || isUgc(r)) && (!filters.skincareOnly || isSkincare(r)) && (!filters.saved || r.saved));
  const cmp = {
    best: (a, b) => b.relevance - a.relevance || b.score - a.score || desc(num(a.followers), num(b.followers)),
    followers: (a, b) => desc(num(a.followers), num(b.followers)),
    engagement: (a, b) => desc(num(a.engagement_pct), num(b.engagement_pct)),
    small: (a, b) => asc(num(a.followers), num(b.followers)) || b.score - a.score,
    verified: (a, b) => desc(ts(a.last_verified_at), ts(b.last_verified_at)),
    active: (a, b) => desc(ts(a.last_active_at), ts(b.last_active_at)),
  }[sort] || ((a, b) => b.score - a.score);
  out.sort((a, b) => cmp(a, b) || String(a.handle).localeCompare(String(b.handle)));
  const size = Math.max(1, Math.min(60, Number(pageSize) || 30));
  const p = Math.max(1, Number(page) || 1);
  return { rows: out.slice((p - 1) * size, p * size), total: out.length, page: p, pageSize: size, counts, parsed: { concepts: parsed.concepts.map((c) => c.key), words: parsed.words, handles: parsed.handles } };
}
