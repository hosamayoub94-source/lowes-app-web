// =============================================================
// syriaLeadsService — Syria B2B Leads (صيدليات/عيادات/مراكز تجميل/موزعين)
// Table: syria_b2b_leads (migration 20260912_syria_b2b_leads.sql)
//
// البيانات البحثية (name/category/phone/score/verified/reason...) تُملأ من
// خارج التطبيق (بحث + تحقق يدوي، منهجية SYRIA_B2B_LEADS بمركز القيادة) —
// هذه الخدمة تقرأها وتكتب فقط حقول التواصل الفعلي (status/notes/assigned_to).
// =============================================================
import { supabase } from './supabase';

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

export const PROVINCES = [
  'Damascus', 'Rif Damascus', 'Aleppo', 'Homs', 'Hama', 'Latakia', 'Tartous',
  'Idlib', 'Daraa', 'Sweida', 'Quneitra', 'Deir Ezzor', 'Raqqa', 'Hasakah',
];
export const PROVINCE_LABELS_AR = {
  Damascus: 'دمشق', 'Rif Damascus': 'ريف دمشق', Aleppo: 'حلب', Homs: 'حمص', Hama: 'حماة',
  Latakia: 'اللاذقية', Tartous: 'طرطوس', Idlib: 'إدلب', Daraa: 'درعا', Sweida: 'السويداء',
  Quneitra: 'القنيطرة', 'Deir Ezzor': 'دير الزور', Raqqa: 'الرقة', Hasakah: 'الحسكة',
};

export const CATEGORIES = ['صيدلية', 'عيادة جلدية', 'مركز تجميل', 'متجر/مورد مستحضرات', 'موزّع'];

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
  contact_person, phone, whatsapp, instagram, facebook, reason, initialStatus }, addedByName) {
  if (!name?.trim()) throw new Error('اسم المحل مطلوب');
  if (!province) throw new Error('المحافظة مطلوبة');

  const ig = normalizeInstagram(instagram);
  const fb = normalizeFacebook(facebook);
  const contactMethods = [phone, whatsapp, ig, fb].filter(Boolean).length;
  const priority = contactMethods >= 1 ? 'B' : 'C';
  const score = Math.min(65, 40 + contactMethods * 8 + (contact_person ? 5 : 0));

  const id = `SYR-ADD-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
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
