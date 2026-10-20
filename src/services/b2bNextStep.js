// «الخطوة التالية» لكل ليد B2B + رسالة تواصل جاهزة للنسخ (نسخ فقط — لا إرسال تلقائي أبداً).
// منطق نقي بلا اعتماد على React/Supabase (قابل للاختبار): نفس فكرة طابور صناع المحتوى.
import { hasAnyContact, hasDirectContact } from './syriaLeadsService';
import { needsFollowUp as modelNeedsFollowUp } from './b2bModel';

const DAY = 86400000;
export const FOLLOW_UP_DAYS = 3;

/** Whole days since the last status update (null when never touched). */
export function daysSinceUpdate(lead, now = Date.now()) {
  if (!lead?.status_updated_at) return null;
  return Math.max(0, Math.floor((now - new Date(lead.status_updated_at).getTime()) / DAY));
}

/** حالة «تم التواصل» بلا تحديث منذ FOLLOW_UP_DAYS يوم أو أكثر — المصدر الوحيد للقاعدة بـb2bModel. */
export const needsFollowUp = (lead, now = Date.now()) => modelNeedsFollowUp(lead, now, FOLLOW_UP_DAYS);

/**
 * The single next action for a lead.  tone: 'amber' (needs action) | 'blue' (waiting) | 'green' (good) | 'gray' (closed / low).
 * Online stores are tracked on `lowes_presence`; physical places on `status` — the contact status still drives the step for both.
 */
export function nextStep(lead, now = Date.now()) {
  const status = lead?.status || 'not_contacted';
  if (status === 'customer') return { key: 'customer', ar: 'عميل ✓', tone: 'green' };
  if (status === 'not_interested') return { key: 'closed', ar: 'مغلق — غير مهتم', tone: 'gray' };
  if (status === 'interested') return { key: 'convert', ar: 'مهتم — حدّد موعداً أو أرسل العرض', tone: 'green' };
  if (status === 'contacted') {
    const d = daysSinceUpdate(lead, now);
    if (needsFollowUp(lead, now)) return { key: 'follow_up', ar: `تابع الرد (مرّ ${d} أيام بلا تحديث)`, tone: 'amber' };
    return { key: 'wait_reply', ar: 'بانتظار الرد', tone: 'blue' };
  }
  // not_contacted
  if (!hasAnyContact(lead)) return { key: 'find_contact', ar: 'ينقصه وسيلة تواصل — ابحث عنها أولاً', tone: 'amber' };
  if (!hasDirectContact(lead) && !lead.email) return { key: 'contact_social', ar: 'تواصل عبر الحساب/الموقع (لا رقم مباشر)', tone: 'amber' };
  if (lead.priority === 'A' || lead.priority === 'A+' || lead.priority === 'B') return { key: 'contact_now', ar: 'تواصل الآن', tone: 'amber' };
  return { key: 'contact_later', ar: 'تواصل عندما تتسع الأولويات', tone: 'gray' };
}

/** Sort rank: things needing action first. Lower = earlier. */
export function stepRank(lead, now = Date.now()) {
  const k = nextStep(lead, now).key;
  return { follow_up: 0, convert: 1, contact_now: 2, contact_social: 3, find_contact: 4, contact_later: 5, wait_reply: 6, customer: 7, closed: 8 }[k] ?? 9;
}

/** Owner shown on the card: explicit assignee, else whoever last recorded a status. */
export const ownerOf = (lead) => lead?.assigned_to || lead?.status_updated_by || '';

/**
 * Owner to store when contact is recorded: contact never starts without an owner.
 * Keeps an existing assignee; otherwise the person saving.
 */
export function ownerForSave(lead, status, myName) {
  if (lead?.assigned_to) return lead.assigned_to;
  if (status && status !== 'not_contacted') return myName || null;
  return null;
}

const GREETING_AR = 'السلام عليكم، معكم فريق Lowe\'s Professional للعناية بالبشرة.';

/**
 * Copy-only outreach text. Deliberately makes no claims about prices, certifications or results.
 * country: 'SY' | 'AE'.  kind: derived from lead_type/category.
 */
export function outreachMessage(lead, country = 'SY') {
  const name = lead?.name ? String(lead.name).trim() : '';
  const online = lead?.lead_type === 'online';
  const cat = String(lead?.category || '');
  const isPharmacy = /صيدل/.test(cat);
  const isDistributor = /موزّع|مورد/.test(cat);
  if (country === 'AE') {
    const who = name ? `Hello ${name} team,` : 'Hello,';
    const ask = online
      ? 'We would like to know whether you work with brands/sellers and how to submit our products for review.'
      : isDistributor
        ? 'We would like to discuss distribution and share our catalogue with the right person.'
        : 'We would like to share our catalogue and discuss supplying your stores.';
    return `${who}\nWe are Lowe's Professional, a skincare brand. ${ask}\nCould you please point us to the right contact? Thank you.`;
  }
  const to = name ? `أهلاً فريق ${name}،` : 'أهلاً،';
  const ask = online
    ? 'حابين نعرف إذا بتتعاملوا مع بائعين/علامات، وكيف منقدّم منتجاتنا للمراجعة.'
    : isDistributor
      ? 'حابين نعرض عليكم الكتالوج ونحكي عن التوزيع مع الشخص المسؤول.'
      : isPharmacy
        ? 'حابين نعرض عليكم كتالوج منتجاتنا للعناية بالبشرة لتكون متوفرة عندكم.'
        : 'حابين نعرض عليكم كتالوج منتجاتنا للعناية بالبشرة.';
  return `${to}\n${GREETING_AR}\n${ask}\nبتقدروا تدلّونا على الشخص المناسب للتواصل؟ شكراً.`;
}
