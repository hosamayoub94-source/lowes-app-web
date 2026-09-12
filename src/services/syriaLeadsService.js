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
