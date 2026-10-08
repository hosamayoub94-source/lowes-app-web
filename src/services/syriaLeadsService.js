// =============================================================
// syriaLeadsService — Syria B2B Leads (صيدليات/عيادات/مراكز تجميل/موزعين)
// Table: syria_b2b_leads (migration 20260912_syria_b2b_leads.sql)
//
// البيانات البحثية (name/category/phone/score/verified/reason...) تُملأ من
// خارج التطبيق (بحث + تحقق يدوي، منهجية SYRIA_B2B_LEADS بمركز القيادة) —
// هذه الخدمة تقرأها وتكتب فقط حقول التواصل الفعلي (status/notes/assigned_to).
// =============================================================
import { supabase } from './supabase';
import { COUNTRIES } from '../../supabase/functions/_shared/countries.js';

export async function listLeads() {
  const { data, error } = await supabase
    .from('syria_b2b_leads')
    .select('*')
    .order('score', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Update only the contact-status fields — never touches research fields. */
export async function updateLeadStatus(id, { status, notes, assigned_to }, updatedByName) {
  const { error } = await supabase
    .from('syria_b2b_leads')
    .update({
      status,
      notes: notes ?? null,
      assigned_to: assigned_to ?? null,
      status_updated_at: new Date().toISOString(),
      status_updated_by: updatedByName || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

// المحافظات من الإعداد المركزي للدول (D-119) — نفس القيم والتسميات حرفياً.
export const PROVINCES = COUNTRIES.SY.regions;
export const PROVINCE_LABELS_AR = COUNTRIES.SY.regionAr;

export const CATEGORIES = ['صيدلية', 'عيادة جلدية', 'مركز تجميل', 'متجر/مورد مستحضرات', 'موزّع'];

// ── المتاجر الأونلاين (lead_type = 'online') ─────────────────
export const ONLINE_CATEGORIES = ['منصة متعددة البائعين', 'متجر أونلاين — تجميل', 'متجر أونلاين — عام', 'صيدلية أونلاين'];
export const CHANNEL_LABELS = {
  website: '🌐 موقع', marketplace: '🏬 منصة', app: '📱 تطبيق', instagram: '📷 إنستغرام', facebook: '👍 فيسبوك',
};

// تواجد Lowe's على المتجر/المنصة — الهدف: "نكون بكل المتاجر".
export const PRESENCE_LABELS = {
  not_listed:     'غير موجودين',
  contacted:      'تواصلنا',
  in_talks:       'قيد الاتفاق',
  listed:         'موجودين ✅',
  rejected:       'رفض',
  not_applicable: 'غير مناسب',
};
// دول غير سوريا (D-119): «غير متحقق» = لم نجد دليلاً عاماً بعد — ليس «غير موجودين».
export const PRESENCE_LABELS_WITH_UNVERIFIED = { unverified: 'غير متحقق', ...PRESENCE_LABELS };

/** تحديث تواجد Lowe's على متجر أونلاين — حقول الفريق فقط، لا يلمس البحث. */
export async function updateLeadPresence(id, { lowes_presence, lowes_listing_url }, updatedByName) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('syria_b2b_leads')
    .update({
      lowes_presence,
      lowes_listing_url: lowes_listing_url?.trim() || null,
      presence_updated_at: now,
      presence_updated_by: updatedByName || null,
      updated_at: now,
    })
    .eq('id', id);
  if (error) throw error;
}

const DAY = 24 * 60 * 60 * 1000;
/** جديد = اكتُشف خلال آخر 7 أيام. */
export function isNewLead(lead, now = Date.now()) {
  return !!lead.discovered_at && now - new Date(lead.discovered_at).getTime() < 7 * DAY;
}
/** قديم التحقق = لم يُتحقق منه منذ 90 يوماً (أو أبداً). */
export function isStale(lead, now = Date.now()) {
  const t = lead.last_verified_at || lead.created_at;
  return !t || now - new Date(t).getTime() > 90 * DAY;
}
export function hasDirectContact(l) {
  return !!(l.phone || l.whatsapp);
}
export function hasAnyContact(l) {
  return !!(l.phone || l.whatsapp || l.instagram || l.facebook || l.email || l.telegram || l.website);
}

/**
 * مؤشرات مفيدة للإدارة من نفس البيانات (بلا مصدر خارجي):
 * تغطية المحافظات، قابلية التواصل، مسار التحويل، التواجد بالمتاجر الأونلاين،
 * وأولويات "ابدأ بهدول".
 */
export function computeInsights(leads, regions = PROVINCES) {
  const now = Date.now();
  const byProvince = {};
  const funnel = { not_contacted: 0, contacted: 0, interested: 0, not_interested: 0, customer: 0 };
  const byCategory = {};
  let direct = 0, anyContact = 0, stale = 0, fresh7 = 0;
  const online = leads.filter(l => l.lead_type === 'online');
  const presence = Object.fromEntries(Object.keys(PRESENCE_LABELS).map(k => [k, 0]));
  for (const l of leads) {
    const p = l.province || '—';
    const row = (byProvince[p] ??= { total: 0, direct: 0, contacted: 0, customers: 0, online: 0 });
    row.total++;
    if (hasDirectContact(l)) { row.direct++; direct++; }
    if (hasAnyContact(l)) anyContact++;
    if ((l.status || 'not_contacted') !== 'not_contacted') row.contacted++;
    if (l.status === 'customer') row.customers++;
    if (l.lead_type === 'online') row.online++;
    funnel[l.status || 'not_contacted'] = (funnel[l.status || 'not_contacted'] || 0) + 1;
    byCategory[l.category || '—'] = (byCategory[l.category || '—'] || 0) + 1;
    if (isStale(l, now)) stale++;
    if (isNewLead(l, now)) fresh7++;
  }
  for (const l of online) { const k = l.lowes_presence || 'not_listed'; presence[k] = (presence[k] || 0) + 1; }
  const missingProvinces = regions.filter(p => p !== 'Nationwide' && !byProvince[p]);
  // "ابدأ بهدول": أعلى Score لم يُتواصل معهم ولديهم تواصل مباشر
  const startWith = leads
    .filter(l => (l.status || 'not_contacted') === 'not_contacted' && hasDirectContact(l))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 8);
  // منصات تقبل بائعين ولسنا عليها بعد = أسرع طريق للتواجد
  const sellerPlatformsGap = online
    .filter(l => l.accepts_sellers && !['listed', 'not_applicable', 'rejected'].includes(l.lowes_presence || 'not_listed'))
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  return {
    total: leads.length, direct, anyContact, stale, fresh7,
    byProvince, funnel, byCategory, missingProvinces, startWith,
    online: { total: online.length, presence, listed: presence.listed, sellerPlatformsGap },
  };
}

function normalizeInstagram(v) {
  const s = (v || '').trim();
  if (!s) return '';
  return s.startsWith('@') ? s : '@' + s.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/+$/,'');
}
function instagramLink(handle) {
  return handle ? 'https://instagram.com/' + handle.slice(1) : '';
}
function normalizeFacebook(v) {
  const s = (v || '').trim();
  if (!s) return '';
  if (s.startsWith('http')) return s;
  return 'https://facebook.com/' + s.replace(/^facebook\.com\//i, '');
}
function telLink(phone) {
  const digits = (phone || '').replace(/[^0-9+]/g, '');
  return digits ? 'tel:' + digits : '';
}

/**
 * إضافة Lead يدوياً من الفريق (معرفة شخصية — مصدر واحد بالتعريف). تُحسب
 * priority/score تلقائياً وتُقفَل عند B كحد أقصى — نفس قاعدة "لا A بلا
 * مصدرين" المطبَّقة بمحرك البحث، حتى لو الفريق واثق 100% من الشخص.
 */
export async function createLead({ name, category, province, city, district, address,
  contact_person, phone, whatsapp, instagram, facebook, reason, initialStatus,
  lead_type, website, email, telegram, channel, sells_beauty, accepts_sellers }, addedByName) {
  if (!name?.trim()) throw new Error('اسم المحل مطلوب');
  if (!province) throw new Error('المحافظة مطلوبة');

  const ig = normalizeInstagram(instagram);
  const fb = normalizeFacebook(facebook);
  const contactMethods = [phone, whatsapp, ig, fb, email, telegram].filter(Boolean).length;
  const priority = contactMethods >= 1 ? 'B' : 'C';
  const score = Math.min(65, 40 + contactMethods * 8 + (contact_person ? 5 : 0));

  const id = `SYR-${lead_type === 'online' ? 'ONA' : 'ADD'}-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
  const now = new Date().toISOString();
  const status = initialStatus || 'not_contacted';

  const row = {
    id, province, city: city || null, district: district || null,
    name: name.trim(), category: category || null, address: address || null,
    contact_person: contact_person || null,
    phone: phone || null, phone_tel: telLink(phone) || null,
    whatsapp: whatsapp || null, whatsapp_link: waLink(whatsapp) || null,
    instagram: ig || null, instagram_link: ig ? instagramLink(ig) : null,
    facebook: fb || null,
    priority, score,
    verified: 'manual_team_entry',
    reason: reason?.trim() ? `إضافة يدوية من الفريق: ${reason.trim()}` : 'إضافة يدوية من الفريق.',
    source_urls: null,
    status,
    status_updated_at: status !== 'not_contacted' ? now : null,
    status_updated_by: status !== 'not_contacted' ? addedByName : null,
    added_by: addedByName || null,
    added_manually: true,
    lead_type: lead_type === 'online' ? 'online' : 'physical',
    website: website?.trim() || null,
    email: email?.trim() || null,
    telegram: telegram?.trim() || null,
    channel: channel || null,
    sells_beauty: typeof sells_beauty === 'boolean' ? sells_beauty : null,
    accepts_sellers: typeof accepts_sellers === 'boolean' ? accepts_sellers : null,
    discovery_source: 'manual_team_entry',
    discovered_at: now, last_verified_at: now,
    created_at: now, updated_at: now,
  };

  const { error } = await supabase.from('syria_b2b_leads').insert(row);
  if (error) throw error;
  return row;
}

export const STATUS_LABELS = {
  not_contacted:  'لم يُتَّصل',
  contacted:      'تم التواصل',
  interested:     'مهتم',
  not_interested: 'غير مهتم',
  customer:       'عميل',
};

export const CATEGORY_LABELS_BY_TIER = {
  'A+': 'جاهز الآن', A: 'جاهز الآن', B: 'يحتاج تأكيد', C: 'اكتشاف فقط', D: 'اكتشاف فقط',
};

export function tierGroup(priority) {
  if (priority === 'A' || priority === 'A+') return 'ready';
  if (priority === 'B') return 'check';
  return 'raw';
}

export function waLink(whatsapp) {
  if (!whatsapp) return '';
  const digits = String(whatsapp).replace(/[^0-9]/g, '');
  if (!digits) return '';
  return 'https://wa.me/' + (digits.startsWith('963') ? digits : digits.startsWith('0') ? '963' + digits.slice(1) : digits);
}
