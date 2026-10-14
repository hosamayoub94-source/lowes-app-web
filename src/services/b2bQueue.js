// طابور العمل لليدز B2B — منطق عرض نقي (بلا React/Supabase، بلا migration): ماذا أفعل الآن؟
//   • شريط «تحتاج إجراء اليوم» بأرقام قابلة للضغط بدل 12 فلتراً ظاهراً.
//   • حالة بطاقة مفهومة (قنوات: نشاط التسجيل · محلي: حالة التواصل) بلا مصطلحات «مشتقّة/غير متحقق».
//   • الخطوة التالية بصيغة عملية + زر رئيسي واحد لكل بطاقة.
// كل ما هنا مشتقّ من الأعمدة الموجودة؛ ما لا يُعرف يبقى «غير مسجّل» بالتفاصيل ولا يُفترض.
import { assess, hasAnyContactPath, isSellerGate, ownerOf, sourceQualityOf } from './b2bModel';
import { nextStep } from './b2bNextStep';

const GOING = ['today', 'follow_up'];

// ───────────────────────────── حالة البطاقة ─────────────────────────────
// قنوات (فتح حساب): نقرأ تواجد Lowe's؛ محلي: حالة التواصل. النص كما يفهمه الفريق، لا مفتاح قاعدة بيانات.
const CHANNEL_STATUS = {
  listed: { ar: 'نحن موجودون ✓', tone: 'green' },
  in_talks: { ar: 'قيد الاتفاق', tone: 'amber' },
  contacted: { ar: 'تم التواصل', tone: 'blue' },
  rejected: { ar: 'رفضوا', tone: 'red' },
  not_applicable: { ar: 'غير مناسب', tone: 'gray' },
};
const LOCAL_STATUS = {
  not_contacted: { ar: 'لم نتواصل', tone: 'gray' },
  contacted: { ar: 'تم التواصل', tone: 'blue' },
  interested: { ar: 'مهتم', tone: 'green' },
  not_interested: { ar: 'غير مهتم', tone: 'red' },
  customer: { ar: 'عميل ✓', tone: 'green' },
};

export function cardStatusOf(lead, a = assess(lead)) {
  if (a.track === 'channel') {
    const hit = CHANNEL_STATUS[lead?.lowes_presence];
    if (hit) return hit;
    if ((lead?.status || 'not_contacted') !== 'not_contacted') return LOCAL_STATUS[lead.status] || LOCAL_STATUS.contacted;
    return { ar: 'لم نبدأ التسجيل', tone: 'gray' };
  }
  return LOCAL_STATUS[lead?.status || 'not_contacted'] || LOCAL_STATUS.not_contacted;
}

// ───────────────────────────── الخطوة التالية ─────────────────────────────
const CONTACT_KEYS = ['contact_now', 'contact_social', 'contact_later', 'find_contact'];

/** الخطوة التالية بصيغة عمل. للمنصات (فتح حساب) تُترجَم لخطوة تسجيل بدل «تواصل الآن». */
export function stepOf(lead, a = assess(lead), now = Date.now()) {
  const s = nextStep(lead, now);
  if (a.exec.key === 'verify_first' && CONTACT_KEYS.includes(s.key) && s.key !== 'find_contact') {
    return { key: 'verify_first', ar: 'تحقق من البيانات ثم تواصل', tone: 'amber' };
  }
  if (a.approach === 'account_opening' && CONTACT_KEYS.includes(s.key) && s.key !== 'find_contact') {
    if (isSellerGate(lead) && lead?.accepts_sellers == null) return { key: 'verify_sellers', ar: 'تحقق من قبول البائعين وشروط التسجيل', tone: 'amber' };
    if (lead?.accepts_sellers === true) return { key: 'start_signup', ar: 'ابدأ طلب التسجيل كبائع', tone: 'amber' };
  }
  return s;
}

/** سبب التوقف (إن وُجد) — يظهر بالبطاقة فقط حين يعني شيئاً (متوقف/بلا وسيلة تواصل). */
export function blockerOf(lead, a = assess(lead)) {
  if (a.exec.key === 'blocked') return a.exec.why[0] || 'متوقف';
  if (!hasAnyContactPath(lead) && !['customer'].includes(lead?.status)) return 'لا وسيلة تواصل مسجّلة';
  return '';
}

// ───────────────────────────── الزر الرئيسي ─────────────────────────────
/**
 * زر واحد لكل بطاقة: رابط تواصل فعلي حين تكون الخطوة «تواصل»، وإلا «فتح التفاصيل».
 * wa = رابط واتساب جاهز (يحسبه المستدعي من الدولة). لا إرسال تلقائي أبداً — روابط فقط.
 */
export function primaryActionOf(lead, step, wa) {
  const details = { kind: 'details', label: 'فتح التفاصيل', href: null };
  if (!step || ['customer', 'closed', 'wait_reply', 'convert'].includes(step.key)) return details;
  if (step.key === 'find_contact') return { kind: 'details', label: 'ابحث عن جهة اتصال', href: null };
  if (step.key === 'verify_sellers' || step.key === 'verify_first') {
    return lead?.website ? { kind: 'link', label: '🌐 افتح الموقع', href: lead.website } : details;
  }
  if (wa) return { kind: 'link', label: '💬 تواصل واتساب', href: wa };
  if (lead?.phone_tel) return { kind: 'link', label: '📞 اتصل', href: lead.phone_tel };
  if (lead?.email) return { kind: 'link', label: '✉️ راسل', href: `mailto:${lead.email}` };
  if (lead?.website) return { kind: 'link', label: '🌐 افتح الموقع', href: lead.website };
  if (lead?.instagram_link) return { kind: 'link', label: '📷 إنستغرام', href: lead.instagram_link };
  return details;
}

// ───────────────────────────── شريط «ماذا أفعل الآن؟» ─────────────────────────────
/** أرقام قابلة للضغط. test(lead, a) على الليد وتقييمه (يُحسب مرة بالشاشة). */
export const QUEUE_FILTERS = [
  { key: 'today', ar: 'تحتاج إجراء اليوم', tone: 'amber', test: (l, a) => GOING.includes(a.exec.key) },
  { key: 'waiting', ar: 'بانتظار رد', tone: 'blue', test: (l, a) => a.exec.key === 'waiting' },
  { key: 'no_owner', ar: 'بلا مسؤول', tone: 'gray', test: (l, a) => [...GOING, 'waiting'].includes(a.exec.key) && !ownerOf(l) },
  { key: 'verify', ar: 'تحتاج تحقق', tone: 'gray', test: (l, a) => !['done', 'blocked'].includes(a.exec.key) && ['weak', 'unknown'].includes(sourceQualityOf(l).level) },
];
export const queueFilterByKey = (k) => QUEUE_FILTERS.find((f) => f.key === k) || null;

export function queueBar(leads, assessed) {
  return QUEUE_FILTERS.map((f) => ({ key: f.key, ar: f.ar, tone: f.tone, count: leads.filter((l) => f.test(l, assessed.get(l.id) || assess(l))).length }));
}

/** أول جهة تستحق العمل الآن (الليدز مرتّبة مسبقاً بالأولوية). null إن لم يوجد ما يستحق. */
export function topPick(sortedLeads, assessed) {
  return sortedLeads.find((l) => GOING.includes((assessed.get(l.id) || assess(l)).exec.key)) || null;
}

// ───────────────────────────── لون/تمييز نوع الجهة ─────────────────────────────
// منصة ≠ متجر ≠ سلسلة ≠ موزّع ≠ جهة محلية: شريط لون جانبي مختلف + أيقونة النوع.
export const ORG_ACCENT = {
  marketplace: 'border-r-purple-500', quick_commerce: 'border-r-orange-500', chain: 'border-r-indigo-500', online_store: 'border-r-sky-500',
  distributor: 'border-r-amber-500', pharmacy: 'border-r-emerald-500', beauty_center: 'border-r-rose-500', retail_store: 'border-r-slate-400', other: 'border-r-slate-300',
};
