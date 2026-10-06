// creatorDiscovery — مولّد Queries ذكية لاكتشاف Creators (عربي/إنجليزي × محافظة × نوع) + قراءة قائمة روابط ملصوقة.
// لا scraping من التطبيق: كل Query تُفتح ببحث عام بتبويب جديد، والفريق يضيف المرشّح مع مصدره.
import { GOVERNORATES, COUNTRIES, normalizeHandle, parseHandle } from '../../supabase/functions/_shared/creatorMatch.js';

const AR_TOPICS = ['عناية بالبشرة', 'سكين كير', 'UGC', 'مراجعة منتجات البشرة', 'فتح بوكس منتجات', 'سيروم تجربتي', 'روتين بشرتي'];
const EN_TOPICS = ['skincare', 'UGC creator', 'skincare review', 'unboxing beauty', 'skin care routine'];
const COUNTRY_AR = ['عناية بالبشرة انستغرام', 'مراجعة منتجات البشرة', 'فتح بوكس منتجات', 'محتوى UGC', 'صيدلانية عناية بالبشرة', 'طبيبة جلدية', 'بلوغر سكين كير'];
const COUNTRY_EN = ['skincare creator', 'UGC creator', 'beauty creator', 'unboxing beauty', 'skincare review', 'skincare influencer', 'dermatologist instagram'];
const HASHTAGS = { SY: ['سكين_كير_سوريا', 'عناية_بالبشرة_سوريا', 'skincaresyria', 'syriaskincare', 'ugcsyria', 'بيوتي_سوريا', 'دمشق_بيوتي', 'حلب_بيوتي'] };

const google = (q) => `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com ${q}`)}`;

// -> [{ group, label, q, url }]
export function buildDiscoveryQueries({ country = 'SY', governorate = '' } = {}) {
  const cn = COUNTRIES.find((c) => c.code === country) || COUNTRIES[0];
  const govs = (GOVERNORATES[cn.code] || []).filter((g) => !governorate || g.slug === governorate);
  const out = [];
  if (!governorate) {
    for (const t of COUNTRY_AR) out.push({ group: cn.ar, label: `${cn.ar} ${t}`, q: `${cn.ar} ${t}` });
    for (const t of COUNTRY_EN) out.push({ group: cn.ar, label: `${cn.en} ${t}`, q: `${cn.en} ${t}` });
  }
  for (const g of govs) {
    for (const t of AR_TOPICS) out.push({ group: g.ar, label: `${g.ar} ${t}`, q: `${g.ar} ${t}` });
    for (const t of EN_TOPICS) out.push({ group: g.ar, label: `${g.en} ${t}`, q: `${g.en} ${t}` });
  }
  return out.map((x) => ({ ...x, url: google(x.q) }));
}

export function discoveryHashtags(country = 'SY') {
  return (HASHTAGS[country] || []).map((t) => ({ tag: t, url: `https://www.instagram.com/explore/tags/${encodeURIComponent(t)}/` }));
}

// Pasted text (one link/@handle per line, or separated by spaces/commas) -> unique candidates.
export function parsePastedCandidates(text) {
  const seen = new Set();
  const out = [];
  const invalid = [];
  for (const tok of String(text || '').split(/[\s,،;]+/).filter(Boolean)) {
    const p = parseHandle(tok);
    const key = normalizeHandle(tok);
    if (!p || !key || (/^https?:/i.test(tok) && !p.platform)) { invalid.push(tok); continue; }
    if (['p', 'reel', 'reels', 'explore', 'stories', 'tv'].includes(key)) { invalid.push(tok); continue; } // post/reel links are not profiles
    const k = `${p.platform || 'instagram'}|${key}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ handle: p.handle, platform: p.platform || 'instagram' });
  }
  return { candidates: out, invalid };
}
