// Creator Intelligence — Wave 2 research logic (pure, node-testable).
// Everything here is evidence-driven: each classifier returns the evidence it used, and returns
// null / 'unknown' when evidence is insufficient. Nothing is inferred from follower count or from gender/name.
import { toNum, tierKey, tierOf, bestContact, freshness, normalizePhone, normalizeEmail } from './creatorLogic.js';

const DAY = 86400000;
const daysBetween = (a, b) => (new Date(a).getTime() - new Date(b).getTime()) / DAY;

// ───────────────────────── public contact extraction ─────────────────────────
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Syrian mobile: prefix + 9 + 8 digits; Syrian landline: prefix + area(1-8,d) + 6-7 digits; international: +CC then 8-12 digits. Digits may be grouped by one space/dot/dash. Bounded so adjacent digits (dates, counters) are never absorbed.
const PHONE_RE = /(?<![\d+])(?:(?:\+|00)?963[\s.-]?9\d(?:[\s.-]?\d){7}|0[\s.-]?9\d(?:[\s.-]?\d){7}|(?:(?:\+|00)?963[\s.-]?|0)[1-8]\d(?:[\s.-]?\d){6,7}|\+[1-9]\d{0,2}[\s.-]?\d(?:[\s.-]?\d){7,11})(?!\d)/g;
const LINKPAGE_RE = /(?:https?:\/\/)?(?:www\.)?(linktr\.ee|beacons\.ai|bio\.link|lnk\.bio|taplink\.cc|campsite\.bio|linkin\.bio|solo\.to|carrd\.co)\/[A-Za-z0-9._-]+/gi;
const URL_RE = /(?:https?:\/\/)[^\s"'<>]+/gi;
const WA_CTX = /\bwa\b|whats\s?app|واتس|وتساب|واتساب|wa\.me/i;
const BIZ_CTX = /للحجز|للاستفسار|للطلب|للطلبات|للتواصل|للاعلان|للإعلان|للاعلانات|للإعلانات|تواصل|حجز|booking|\bbook\b|inquir|business|collab|contact|\borders?\b|📞|☎|📩|📧|✉|للتعاون|\bcall\b|\bphone\b|\bwork\b|\bnumber\b|رقم العمل|\binfo(?:rmation)?\b|معلومات|استفسار|\btel\b|\bmob(?:ile)?\b|هاتف|موبايل|جوال|تلفون|الاتصال|اتصال|رقم/i;
const MGMT_CTX = /management|mgmt|manager|agency|agent|talent|إدارة أعمال|ادارة اعمال|مدير أعمال|مدير اعمال|وكالة|وكيل/i;

// ArDigits -> latin
const arDigits = s => String(s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

/** Returns { contacts, skipped } from a public bio/description. Contacts carry the context used to classify them. */
export function extractPublicContacts(rawText, opts = {}) {
  const text = arDigits(rawText || '');
  const contacts = [], skipped = [];
  if (!text.trim()) return { contacts, skipped };
  const win = (i, len, n = 45) => text.slice(Math.max(0, i - n), Math.min(text.length, i + len + n));
  for (const m of text.matchAll(EMAIL_RE)) {
    const email = normalizeEmail(m[0]);
    if (!email) continue;
    const ctx = win(m.index, m[0].length, 22);
    const before = text.slice(Math.max(0, m.index - 22), m.index);
    const mgmt = MGMT_CTX.test(before.replace(EMAIL_RE, ' ')) || /(^|[._-])(management|mgmt|talent|agency|pr|booking)@/i.test(email);
    contacts.push({ type: mgmt ? 'management' : 'email', value: email, context: ctx.trim().slice(0, 120), classification_basis: mgmt ? 'management keyword/local-part' : 'email in public bio' });
  }
  const emailSpans = [...text.matchAll(EMAIL_RE)].map(m => [m.index, m.index + m[0].length]);
  for (const m of text.matchAll(PHONE_RE)) {
    if (emailSpans.some(([a, b]) => m.index >= a && m.index < b)) continue;
    const digits = m[0].replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) continue;
    if (/^(19|20)\d{6,}/.test(digits) && digits.length <= 8) continue; // date-like
    const norm = normalizeSyrianOrIntl(m[0]);
    if (!norm) continue;
    const ctx = win(m.index, m[0].length, 40);
    const wa = WA_CTX.test(ctx);
    const biz = wa || BIZ_CTX.test(ctx) || opts.businessAccount === true;
    if (!biz) { skipped.push({ value: norm, reason: 'phone_without_business_context' }); continue; }
    contacts.push({ type: wa ? 'whatsapp' : 'phone', value: norm, context: ctx.trim().slice(0, 120), classification_basis: wa ? 'whatsapp keyword near number' : 'business/booking keyword near number' });
  }
  for (const m of text.matchAll(LINKPAGE_RE)) contacts.push({ type: 'website', value: m[0].replace(/^https?:\/\//, ''), context: 'link-in-bio page', classification_basis: 'linkpage host' });
  for (const m of text.matchAll(URL_RE)) {
    if (/instagram\.com|tiktok\.com|youtube\.com|youtu\.be|facebook\.com|fb\.com|wa\.me|t\.me|twitter\.com|x\.com/i.test(m[0])) {
      if (/wa\.me\/(\d+)/i.test(m[0])) contacts.push({ type: 'whatsapp', value: '+' + m[0].match(/wa\.me\/(\d+)/i)[1], context: 'wa.me link', classification_basis: 'wa.me link' });
      continue;
    }
    if (!LINKPAGE_RE.test(m[0])) contacts.push({ type: 'website', value: m[0], context: 'website in public bio', classification_basis: 'url in bio' });
    LINKPAGE_RE.lastIndex = 0;
  }
  // de-dupe
  const seen = new Set();
  return { contacts: contacts.filter(c => { const k = c.type + ':' + c.value; if (seen.has(k)) return false; seen.add(k); return true; }), skipped };
}

export function normalizeSyrianOrIntl(raw) {
  const d0 = String(raw).replace(/[^\d+]/g, '');
  let d = d0.replace(/^00/, '+');
  if (/^\+963\d{8,9}$/.test(d)) return d;
  if (/^963\d{8,9}$/.test(d)) return '+' + d;
  if (/^0[1-9]\d{7,9}$/.test(d)) return '+963' + d.slice(1); // local Syrian format (09xxxxxxxx / 011xxxxxxx)
  if (/^\+\d{9,15}$/.test(d)) return d;
  return normalizePhone(raw) && /^\+/.test(normalizePhone(raw)) ? normalizePhone(raw) : null;
}

// ───────────────────────── activity ─────────────────────────
/** active_30d | active_90d | inactive_90d | unknown. Never inferred from follower count.
 *  A stale provider crawl (dataAsOf old) cannot prove present-day activity or inactivity. */
export function activityStatus({ lastPostAt, dataAsOf, now = new Date() }) {
  if (!lastPostAt) return { status: 'unknown', active_recently: null, days_since_last_post: null, basis: 'no post date observed' };
  const days = Math.floor(daysBetween(now, lastPostAt));
  if (days < 0) return { status: 'unknown', active_recently: null, days_since_last_post: null, basis: 'post date in the future' };
  if (days <= 30) return { status: 'active_30d', active_recently: true, days_since_last_post: days, basis: 'last post ≤30d before today' };
  if (days <= 90) return { status: 'active_90d', active_recently: true, days_since_last_post: days, basis: 'last post 31–90d before today' };
  // last post older than 90d: only call it inactive if the observation itself is fresh, or the account was already dormant at crawl time
  const asOf = dataAsOf ? new Date(/^\d{4}-\d{2}$/.test(dataAsOf) ? dataAsOf + '-28' : dataAsOf) : null;
  if (asOf) {
    const dormantAtCrawl = daysBetween(asOf, lastPostAt) > 90;
    const crawlAge = daysBetween(now, asOf);
    if (crawlAge <= 60) return { status: 'inactive_90d', active_recently: false, days_since_last_post: days, basis: 'fresh crawl (≤60d) shows no post in 90d' };
    if (dormantAtCrawl) return { status: 'inactive_90d', active_recently: false, days_since_last_post: days, basis: 'already dormant >90d at crawl time; crawl is stale so present state not re-verified' };
  }
  return { status: 'unknown', active_recently: null, days_since_last_post: days, basis: 'stale crawl: last observed post is old but the crawl predates today, activity since then is unobservable' };
}

// ───────────────────────── category / type classification ─────────────────────────
export const CATEGORY_RULES = [
  ['skincare', /skin ?care|skincare|سكن ?كير|سكين ?كير|بشرة|البشره|dermat|جلدي|serum|سيروم|retinol|ريتينول/i],
  ['makeup', /make ?up|\bmua\b|مكياج|ميك ?اب|ميكاب|ميكب|cosmetic artist/i],
  ['hair', /\bhair\b|شعر|صالون|hair ?styl|مصفف|باربر|barber|coiffeur/i],
  ['beauty', /beauty|بيوتي|جمال|تجميل|cosmet|nails|أظافر|اظافر|نيلز|lashes|رموش/i],
  ['fashion', /fashion|موضة|موضه|أزياء|ازياء|ستايل|\bmodel\b|مودل|outfit|ootd/i],
  ['fitness', /fitness|gym|workout|رياضة|رياضه|جيم|لياقة|كوتش|coach|bodybuild|كمال أجسام/i],
  ['motherhood', /\bmom\b|mother|mama|mommy|أم |ام |ماما|امومة|أمومة|اطفال|أطفال|baby/i],
  ['food', /food|chef|cook|recipe|طبخ|مطعم|شيف|أكل|اكل|وصفات|حلويات|kitchen/i],
  ['comedy', /comed|funny|كوميد|ضحك|مضحك|sketch|ستاند ?اب/i],
  ['wellness', /health|wellness|nutrition|صحة|صحه|تغذية|دكتور|طبيب|صيدل|pharmac|clinic|عيادة/i],
  ['travel', /travel|سفر|سياحة|رحلات|traveler/i],
  ['gaming', /gaming|gamer|ببجي|pubg|ألعاب|العاب|fortnite|streamer/i],
  ['tech', /\btech\b|technology|تقنية|برمجة|software|developer|ai\b|ذكاء/i],
  ['music', /singer|music|مغني|مطرب|موسيقى|\bdj\b|rapper/i],
  ['entertainment', /actor|actress|artist|ممثل|فنان|فنانة|تمثيل|entertain|tv host|مقدم برامج/i],
  ['art', /\bart\b|photograph|تصوير|فن تشكيلي|رسم|design|تصميم|illustrat/i],
  ['business', /business|entrepreneur|marketing|تسويق|ريادة|أعمال|اعمال|founder|ceo/i],
  ['education', /teacher|education|معلم|تعليم|أكاديمي|academy|course|دورة|مدرس/i],
  ['lifestyle', /lifestyle|vlog|content creator|لايف|بلوجر|blogger|مدونة|صانع محتوى|صانعة محتوى|يوميات|daily/i],
];
const DIRECTORY_CATEGORY_MAP = { beauty: 'beauty', fitness: 'fitness', fashion: 'fashion', music: 'music', entertainment: 'entertainment', business: 'business', travel: 'travel', tech: 'tech', food: 'food', art: 'art', gaming: 'gaming', family: 'lifestyle', education: 'education', skincare: 'skincare', health: 'wellness' };
export const directoryCategory = slugSuffix => DIRECTORY_CATEGORY_MAP[slugSuffix] || null;

/** Evidence-scored category. sources: bio, name, directory (self-declared or provider list), hashtags[], captions[]. */
export function classifyCategory({ bio = '', name = '', directory = null, hashtags = [], captions = [], pageCats = [] }) {
  const score = {}; const ev = {};
  const add = (cat, pts, field, term) => { score[cat] = (score[cat] || 0) + pts; (ev[cat] ||= []).push({ field, term }); };
  if (directory) add(directory, 4, 'directory_self_declared', directory);
  pageCats.forEach(c => add(c, 3, 'provider_category_list', c));
  for (const [cat, re] of CATEGORY_RULES) {
    if (re.test(bio)) add(cat, 3, 'bio', (bio.match(re) || [])[0]);
    if (re.test(name)) add(cat, 1, 'display_name', (name.match(re) || [])[0]);
    const hh = hashtags.filter(h => re.test(h)); if (hh.length) add(cat, Math.min(2, hh.length), 'hashtags', hh.slice(0, 3).join(','));
    const cc = captions.filter(c => re.test(c)); if (cc.length) add(cat, Math.min(3, cc.length), 'captions', `${cc.length} caption(s)`);
  }
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  // "lifestyle" is a weak catch-all: it wins only if nothing else has evidence
  const strong = ranked.filter(([c, s]) => c !== 'lifestyle' && s >= 3);
  const pick = strong[0] || ranked.find(([, s]) => s >= 3) || null;
  if (!pick) return { main: null, secondary: [], evidence: [], confidence: null, reason: 'insufficient evidence' };
  const main = pick[0];
  const secondary = ranked.filter(([c, s]) => c !== main && s >= 3).slice(0, 3).map(([c]) => c);
  const conf = pick[1] >= 6 ? 'high' : pick[1] >= 4 ? 'medium' : 'low';
  return { main, secondary, evidence: ev[main] || [], confidence: conf, reason: null };
}

const EXPERT_RE = /pharmac|صيدل|dermat|طبيب|دكتور|دكتورة|\bdr\.?\b|doctor|cosmetic scientist|formulator|اخصائي|أخصائي|اختصاصي|specialist|consultant|استشاري/i;
const SALON_RE = /salon|صالون|beauty center|مركز تجميل|مركز|\bspa\b|clinic|عيادة|barber|باربر/i;
const MEDIA_RE = /media|إعلام|اعلام|news|أخبار|اخبار|magazine|مجلة|page\b|صفحة|شوبينغ|shopping|عروض|deals/i;
export function classifyCreatorType({ bio = '', name = '', followers = null, category = null, isPage = false }) {
  const t = `${name} ${bio}`;
  const f = toNum(followers);
  if (/\bugc\b/i.test(t)) return { type: 'ugc', evidence: 'bio mentions UGC' };
  if (EXPERT_RE.test(t) && ['skincare', 'wellness', 'beauty', 'hair', 'makeup'].includes(category)) return { type: 'expert', evidence: 'professional title in bio' };
  if (SALON_RE.test(t) && ['beauty', 'hair', 'makeup', 'skincare'].includes(category)) return { type: 'expert', evidence: 'salon/beauty professional in bio', subtype: 'salon_professional' };
  if (/review|ريفيو|مراجعات|reviewer/i.test(t)) return { type: 'reviewer', evidence: 'bio mentions reviews' };
  if (/blogger|بلوجر|مدون/i.test(t)) return { type: 'blogger', evidence: 'bio mentions blogger' };
  if (isPage || MEDIA_RE.test(t) && !/creator|صانع|صانعة/i.test(t)) return { type: MEDIA_RE.test(t) ? 'publisher' : 'local_page', evidence: 'page/media wording in bio' };
  if (['beauty', 'makeup', 'skincare', 'hair'].includes(category) && /creator|صانع|صانعة|content/i.test(t)) return { type: 'beauty_creator', evidence: 'beauty niche + creator wording' };
  if (f !== null && f >= 1_000_000) return { type: 'celebrity', evidence: 'followers ≥ 1M (definition)' };
  return { type: null, evidence: null };
}

// ───────────────────────── UGC / PR / paid evidence ─────────────────────────
const UGC_SIGNALS = {
  review: /ريفيو|مراجعة|مراجعات|رأيي|رايي|تجربتي|تجربة|review|honest|صراحة/i,
  unboxing: /unbox|أنبوكسينغ|انبوكسنج|فتح صندوق|فتح بوكس|ما وصلني|وصلني بوكس|haul/i,
  tutorial: /tutorial|تتوريال|تعليم|خطوات|how to|طريقة|شرح|تعلمي|تعلم|tips|نصائح/i,
  routine: /روتين|routine|grwm|get ready|يومي|daily/i,
  before_after: /قبل وبعد|before|after|نتيجة|نتائج|result/i,
  product_demo: /منتج|product|استخدام|جربت|demo|swatch|تجربة منتج/i,
  storytelling: /قصة|قصتي|story|ذكريات|storytime/i,
  trend_content: /trend|ترند|challenge|تحدي|viral|رايج/i,
  voiceover: /voice ?over|تعليق صوتي/i,
  talking_head: /talking|talk to|احكي|حكي|بحكي|قولوا|بدي احكي/i,
};
const CORE_UGC = ['review', 'unboxing', 'tutorial', 'routine', 'before_after', 'product_demo'];
/** Text-evidence UGC assessment. Cap = 'medium': *visual* evidence (face on camera, video quality) requires a human/visual review
 *  and is recorded only via `visual_review` (then 'high' becomes possible). */
export function ugcAssess({ captions = [], hashtags = [], bio = '', category = null, visualReview = null }) {
  const items = [...captions.map(c => ({ kind: 'caption', text: c.caption ?? c, url: c.url ?? null })), ...hashtags.map(h => ({ kind: 'hashtag', text: h, url: null })), { kind: 'bio', text: bio, url: null }];
  const tags = new Set(); const evid = {};
  for (const it of items) for (const [tag, re] of Object.entries(UGC_SIGNALS)) if (it.text && re.test(it.text)) { tags.add(tag); (evid[tag] ||= []).push(it); }
  const core = CORE_UGC.filter(t => tags.has(t));
  const niche = ['skincare', 'makeup', 'beauty', 'hair', 'lifestyle', 'fashion', 'wellness', 'motherhood'].includes(category);
  const nCaptions = captions.length;
  let potential = 'unknown', reason = null, evidenceUrl = null, evidenceType = null;
  const firstUrl = tag => (evid[tag] || []).find(x => x.url)?.url || null;
  if (visualReview && visualReview.face_on_camera) { tags.add('face_on_camera'); }
  if (visualReview && visualReview.potential) { potential = visualReview.potential; reason = visualReview.reason; evidenceUrl = visualReview.url; evidenceType = 'visual_review'; }
  else if (core.length >= 2 && niche) { potential = 'medium'; evidenceType = 'caption_text'; evidenceUrl = firstUrl(core[0]) || firstUrl(core[1]); reason = `caption/hashtag text shows ${core.join(' + ')} content in a ${category} niche (text evidence only; on-camera quality not visually verified)`; }
  else if (core.length === 1 && niche && nCaptions >= 1) { potential = 'low'; evidenceType = 'caption_text'; evidenceUrl = firstUrl(core[0]); reason = `only one content-format signal (${core[0]}) in available captions; not enough to call it UGC-capable`; }
  else if (nCaptions >= 3 && core.length === 0) { potential = 'low'; evidenceType = 'caption_text'; reason = `${nCaptions} public captions inspected, none show review/tutorial/routine/unboxing content`; }
  if (!evidenceUrl && potential !== 'unknown') evidenceUrl = captions.find(c => c.url)?.url || null;
  return { ugc_potential: potential, ugc_reason: reason, ugc_evidence_url: evidenceUrl, ugc_evidence_type: evidenceType, ugc_tags: [...tags], captions_inspected: nCaptions, signals: core };
}

const GIFT_RE = /#?gifted|pr ?package|#?pr_?box|#?prgift|#?prpackage|مقدم(?:ة)? من|هدية من|اهداء من|إهداء من|thank(?:s| you) .{0,25}for (?:sending|gifting)|sent me|وصلني من|ارسلولي|أرسلولي|شكرا .{0,20}على الهدية/i;
const COLLAB_OPEN_RE = /for collab|collab(?:s|oration)?|للتعاون|تعاونات|للتعاونات|للإعلانات|للاعلانات|للإعلان|للاعلان|business inquir|dm for|pr ?[:@]|open for|إعلانات|اعلانات/i;
const SPONSORED_RE = /#ad\b|#sponsored|#اعلان|#إعلان|paid partnership|بالتعاون مع|sponsored|برعاية|#collab\b/i;
const RATECARD_RE = /rate ?card|price ?list|media ?kit|أسعار الإعلانات|اسعار الاعلانات|قائمة الأسعار|booking|للحجز والإعلانات/i;
/** Evidence for PR/gifting and paid status. accepts_gifting = 'yes' ONLY with a gifting-specific signal (never from generic collab words). */
export function prPaidEvidence({ bio = '', captions = [], hashtags = [], contacts = [], hasSponsoredMgmt = false }) {
  const texts = [{ where: 'bio', text: bio, url: null }, ...captions.map(c => ({ where: 'caption', text: c.caption ?? c, url: c.url ?? null })), ...hashtags.map(h => ({ where: 'hashtag', text: h, url: null }))];
  const hit = re => texts.filter(t => t.text && re.test(t.text));
  const gifted = hit(GIFT_RE), open = hit(COLLAB_OPEN_RE), spons = hit(SPONSORED_RE), rate = hit(RATECARD_RE);
  const mgmt = contacts.some(c => ['management', 'agency'].includes(c.type));
  let paid_status = 'unknown';
  if (rate.length || mgmt || hasSponsoredMgmt) paid_status = 'known_paid';
  else if (open.length || spons.length || contacts.some(c => ['email', 'whatsapp', 'phone'].includes(c.type))) paid_status = 'likely_commercial';
  const shape = arr => arr.slice(0, 3).map(x => ({ where: x.where, excerpt: String(x.text).slice(0, 140), url: x.url }));
  return {
    accepts_gifting: gifted.length ? 'yes' : 'unknown', accepts_product_exchange: 'unknown',
    gifting_evidence: shape(gifted), open_for_collab_evidence: shape(open), sponsored_evidence: shape(spons), rate_card_evidence: shape(rate),
    paid_status,
    paid_basis: paid_status === 'known_paid' ? (rate.length ? 'rate-card/booking wording' : 'management/agency contact') : paid_status === 'likely_commercial' ? (spons.length ? 'sponsored-post markers' : open.length ? 'open-for-collab wording' : 'business contact published') : 'no evidence',
  };
}

// ───────────────────────── source freshness + conflict handling ─────────────────────────
export function sourceFreshness(observedAt, now = new Date()) { return freshness(observedAt, now); }

const PROVIDER_TRUST = { official_api: 5, licensed_provider: 4, modash: 3, other: 2, web: 1, manual: 3 };
/** candidates: [{value, provider, observed_at, source_url}] -> chosen (freshest, ties by trust) + conflict flag + kept history. */
export function resolveConflict(candidates, { tolerancePct = 15 } = {}) {
  const c = candidates.filter(x => x && x.value !== null && x.value !== undefined);
  if (!c.length) return { chosen: null, conflict: false, history: [] };
  const sorted = [...c].sort((a, b) => (new Date(b.observed_at) - new Date(a.observed_at)) || ((PROVIDER_TRUST[b.provider] ?? 0) - (PROVIDER_TRUST[a.provider] ?? 0)));
  const chosen = sorted[0];
  let conflict = false;
  if (c.length > 1) {
    const nums = c.map(x => toNum(x.value));
    if (nums.every(n => n !== null)) { const mx = Math.max(...nums), mn = Math.min(...nums); conflict = mx > 0 && ((mx - mn) / mx) * 100 > tolerancePct; }
    else conflict = new Set(c.map(x => String(x.value).toLowerCase())).size > 1;
  }
  return { chosen, conflict, history: sorted.map((x, i) => ({ ...x, superseded: i > 0 })) };
}

// ───────────────────────── data quality (NOT creator quality) ─────────────────────────
export function dataQualityScore(r, now = new Date()) {
  const p = r.platforms?.[0] || {};
  const parts = {};
  parts.identity = ((r.display_name ? 5 : 0) + (p.handle ? 5 : 0) + (p.profile_url ? 5 : 0)); // 15
  parts.platform_metrics = ((toNum(p.followers) !== null ? 6 : 0) + ((toNum(p.engagement_rate) !== null || toNum(p.avg_views) !== null || toNum(p.reels_avg_views) !== null) ? 5 : 0) + (p.last_post_at ? 4 : 0)); // 15
  const aud = r.audience || [];
  parts.audience_evidence = aud.length ? (aud.some(a => a.dimension === 'country') ? 9 : 0) + (aud.some(a => a.dimension === 'gender') ? 3 : 0) + (aud.some(a => a.dimension === 'city') ? 3 : 0) : 0; // 15
  const cs = r.contacts || [];
  const best = bestContact(cs.filter(c => !/_dm$|messenger/.test(c.type)));
  parts.contact_evidence = cs.length === 0 ? 0 : best.type ? Math.round(best.score / 100 * 15) : 4; // 15 (DM-only = 4)
  parts.category_evidence = r.main_category ? ({ high: 10, medium: 8, low: 5 }[r.category_confidence] ?? 5) : 0; // 10
  parts.city_evidence = r.creator_city ? 5 : 0; // 5
  const obs = r.last_verified_at || p.metrics_observed_at;
  const asOf = r.data_as_of;
  const fr = obs ? freshness(obs, now) : 'unknown';
  const dataAge = asOf ? daysBetween(now, new Date(asOf + '-28')) : null;
  parts.freshness = (fr === 'fresh' ? 8 : fr === 'aged' ? 4 : 0) + (dataAge === null ? 0 : dataAge <= 60 ? 7 : dataAge <= 180 ? 4 : dataAge <= 365 ? 2 : 0); // 15
  const provs = new Set((r.sources || []).map(s => s.provider + '|' + (s.source_type || '')));
  parts.source_diversity = provs.size >= 3 ? 10 : provs.size === 2 ? 8 : provs.size === 1 ? 4 : 0; // 10
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { data_quality_score: Math.min(100, total), parts };
}

// ───────────────────────── "Why this creator" ─────────────────────────
/** Machine-readable + human-readable explanation, built only from populated fields. */
export function whyCreator(r, scores = {}) {
  const reasons = [], warnings = [];
  const f = toNum(r.follower_count);
  if (f !== null) reasons.push({ code: 'followers', text_en: `${f.toLocaleString('en')} followers (${tierOf(f)?.label})`, text_ar: `${f.toLocaleString('en')} متابع` });
  const syr = toNum(r.audience_syria_pct);
  if (syr !== null) reasons.push({ code: 'audience_syria', text_en: `${syr}% Syria audience (provider estimate)`, text_ar: `${syr}% جمهور من سوريا (تقدير المزوّد)` });
  else warnings.push({ code: 'audience_unknown', text_en: 'Syria audience share unknown', text_ar: 'نسبة الجمهور السوري غير معروفة' });
  const er = toNum(r.engagement_rate);
  if (er !== null) reasons.push({ code: 'engagement', text_en: `${er}% engagement`, text_ar: `${er}% تفاعل` });
  const act = r.activity_status;
  if (act === 'active_30d' || act === 'active_90d') reasons.push({ code: 'active', text_en: `posted ${r.days_since_last_post} days ago`, text_ar: `آخر نشر قبل ${r.days_since_last_post} يوماً` });
  else if (act === 'inactive_90d') warnings.push({ code: 'inactive', text_en: 'no post in the last 90 days', text_ar: 'لا نشر خلال 90 يوماً' });
  else warnings.push({ code: 'activity_unknown', text_en: 'recent activity not verifiable (stale source data)', text_ar: 'النشاط الحديث غير مؤكد (بيانات قديمة)' });
  if (r.main_category) reasons.push({ code: 'category', text_en: `${r.main_category} content`, text_ar: `محتوى ${r.main_category}` });
  else warnings.push({ code: 'category_unknown', text_en: 'category unknown', text_ar: 'الفئة غير معروفة' });
  const best = bestContact(r.contacts || []);
  const bl = { 1: 'management/agency contact', 2: 'public business email', 3: 'public WhatsApp', 4: 'public business phone', 5: 'website/contact page', 6: 'Instagram DM only', 7: 'TikTok DM only', 8: 'Facebook Messenger only' };
  if (best.rank <= 5) reasons.push({ code: 'contact', text_en: bl[best.rank], text_ar: bl[best.rank] });
  else if (best.rank <= 8) warnings.push({ code: 'contact_dm_only', text_en: bl[best.rank] + ' (no public business contact)', text_ar: 'تواصل عبر الرسائل فقط' });
  else warnings.push({ code: 'contact_none', text_en: 'no public contact', text_ar: 'لا وسيلة تواصل عامة' });
  if (r.ugc_potential === 'medium' || r.ugc_potential === 'high') reasons.push({ code: 'ugc', text_en: `UGC potential ${r.ugc_potential}: ${(r.ugc_tags || []).slice(0, 3).join(', ')}`, text_ar: `قدرة UGC ${r.ugc_potential}` });
  if (r.pr_fit === 'high' || r.pr_fit === 'medium') reasons.push({ code: 'pr', text_en: `PR fit ${r.pr_fit}${r.accepts_gifting === 'yes' ? ' (past gifted content observed)' : ' (rule-derived; acceptance unconfirmed)'}`, text_ar: `ملاءمة PR ${r.pr_fit}` });
  if (r.paid_status === 'known_paid') reasons.push({ code: 'paid', text_en: 'known paid collaborator (rate card/management)', text_ar: 'يتعاون بمقابل (مثبت)' });
  else if (r.paid_status === 'likely_commercial') reasons.push({ code: 'commercial', text_en: 'commercial signals present', text_ar: 'مؤشرات تجارية' });
  const priority = scores.creator_priority_score ?? null;
  return { priority, reasons, warnings, text_en: (priority !== null ? `Priority ${priority}. ` : 'Priority not computed (insufficient inputs). ') + reasons.map(x => x.text_en).join('; ') + (warnings.length ? ' | Gaps: ' + warnings.map(x => x.text_en).join('; ') : '') };
}

// ───────────────────────── commercial pools ─────────────────────────
const NOT_ELIGIBLE = new Set(['rejected', 'do_not_contact']);
export const POOL_RULES_DOC = {
  pr_pool: 'pr_fit high|medium AND followers < 100K AND not celebrity AND activity_status <> inactive_90d AND status not rejected/do_not_contact',
  ugc_pool: 'ugc_potential high|medium AND ugc_evidence_url present (evidence required)',
  paid_pool: '(followers >= 50K OR paid_status = known_paid) AND not celebrity-only-unknown AND status not rejected/do_not_contact',
  expert_pool: "creator_type = 'expert'",
  media_pool: "creator_type in ('publisher','local_page') OR main_category in ('local','shopping')",
};
export function poolsOf(r) {
  const f = toNum(r.follower_count);
  const okStatus = !NOT_ELIGIBLE.has(r.creator_status || 'discovered');
  const pools = [];
  if (okStatus && ['high', 'medium'].includes(r.pr_fit) && f !== null && f < 100000 && !r.is_celebrity && r.activity_status !== 'inactive_90d') pools.push('pr_pool');
  if (okStatus && ['high', 'medium'].includes(r.ugc_potential) && r.ugc_evidence_url) pools.push('ugc_pool');
  if (okStatus && ((f !== null && f >= 50000) || r.paid_status === 'known_paid')) pools.push('paid_pool');
  if (okStatus && r.creator_type === 'expert') pools.push('expert_pool');
  if (okStatus && (['publisher', 'local_page'].includes(r.creator_type) || ['local', 'shopping'].includes(r.main_category))) pools.push('media_pool');
  return pools;
}

// ───────────────────────── benchmark record validation ─────────────────────────
export const BENCHMARK_REQUIRED = ['source', 'source_url', 'country', 'market_scope', 'platform', 'creator_tier', 'format', 'low', 'mid', 'high', 'currency', 'date', 'confidence'];
export function validateBenchmark(b) {
  const errors = BENCHMARK_REQUIRED.filter(k => b[k] === undefined || b[k] === null || b[k] === '').map(k => `missing:${k}`);
  if (toNum(b.low) !== null && toNum(b.mid) !== null && toNum(b.high) !== null && !(b.low <= b.mid && b.mid <= b.high)) errors.push('low<=mid<=high violated');
  if (!['syria', 'mena', 'global'].includes(b.market_scope)) errors.push('invalid market_scope');
  return { ok: errors.length === 0, errors };
}

// Priority "why" needs follower_count etc. flattened; helper used by builder + service.
export function flattenForScoring(r) {
  const pl = r.platforms || [];
  const fol = pl.map(x => toNum(x.followers)).filter(v => v !== null);
  return {
    ...r,
    follower_count: fol.length ? Math.max(...fol) : null,
    average_views: toNum(pl[0]?.avg_views) ?? toNum(pl[0]?.reels_avg_views),
    engagement_rate: toNum(pl[0]?.engagement_rate),
    audience_syria_pct: r.audience_syria_pct ?? null,
  };
}
export { tierKey };
