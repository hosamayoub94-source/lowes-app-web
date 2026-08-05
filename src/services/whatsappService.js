// =============================================================
// whatsappService.js — يتواصل مع رقم واتساب لوويز الرسمي المشترك.
// ⚠️ هذا الرقم مستضاف بمشروع Supabase آخر (kesoqnwyydycuyifqfhl / lowes-production)
// وليس مشروع هذا التطبيق (fghdumrgimoeqsafdhhh) — نفس البنية المستخدمة بتطبيق
// lowes-classic. القيمتان تحت public anon key عام (غير سرّي)، لا Twilio secrets هون.
// أُنشئ 1 أغسطس 2026.
// =============================================================
import { supabase } from './supabase';
import { getCustomerOrders } from './customerService';
import { trackingLink } from '@utils/shippingTracking';
import { STATUSES } from '@data/orderStatus';
import { COMPANY } from '@data/brand';

export const WA_PROJECT_URL = 'https://kesoqnwyydycuyifqfhl.supabase.co';
const WA_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtlc29xbnd5eWR5Y3V5aWZxZmhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MjQzMDMsImV4cCI6MjA5NDUwMDMwM30.7muMlaq4MhWdJicSqzupLBZqTvaLbhWjieQuaQvCvBg';

export const WA_HEADERS = {
  apikey: WA_ANON_KEY,
  Authorization: `Bearer ${WA_ANON_KEY}`,
  'Content-Type': 'application/json',
};

export async function fetchWhatsAppMessages() {
  const res = await fetch(
    `${WA_PROJECT_URL}/rest/v1/whatsapp_messages?select=*&order=created_at.desc&limit=500`,
    { headers: WA_HEADERS },
  );
  if (!res.ok) throw new Error('تعذّر تحميل رسائل واتساب');
  return res.json();
}

// ملكية المحادثات (نسخة بسيطة) — كل صف: هالمحادثة (رقم+خط) مسؤول عنها موظف
// معيَّن. الأدمن/المدير يشوفوا الكل بغض النظر عن هالجدول (تُطبَّق بالواجهة).
export async function fetchWhatsAppOwners() {
  const res = await fetch(
    `${WA_PROJECT_URL}/rest/v1/whatsapp_conversation_owners?select=*`,
    { headers: WA_HEADERS },
  );
  if (!res.ok) throw new Error('تعذّر تحميل ملكية المحادثات');
  return res.json();
}

// يسجّل/يحدّث مين مسؤول عن هالمحادثة — upsert (idempotent، ما بيغيّر المالك
// الموجود لو نادى عليها موظف تاني بالغلط، بس منطق "أول ما يفتحها" بالواجهة).
export async function claimWhatsAppConversation(phone, toNumber, ownerId, ownerName) {
  const res = await fetch(
    `${WA_PROJECT_URL}/rest/v1/whatsapp_conversation_owners?on_conflict=phone,to_number`,
    {
      method: 'POST',
      headers: { ...WA_HEADERS, Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ phone, to_number: toNumber, owner_id: ownerId, owner_name: ownerName || null }),
    },
  );
  if (!res.ok) throw new Error('تعذّر تسجيل ملكية المحادثة');
  return res.json();
}

// إعادة تعيين مالك محادثة (أدمن/مدير فقط بالواجهة) — بعكس claimWhatsAppConversation
// (يتجاهل التكرار)، هاي تفرض المالك الجديد فعلياً حتى لو المحادثة مملوكة
// لحدا تاني. الحاجة الحقيقية: موظف عادي (مو أدمن) يفتح "+ محادثة جديدة"
// برقم عنده مالك أصلاً فتنقفل بوجهه بلا أي طريقة تحويلها إله — اكتُشف
// 5 أغسطس 2026 (ديانا حاولت تفتح محادثة hosam ayoub، انقفلت بوجهها).
export async function setWhatsAppConversationOwner(phone, toNumber, ownerId, ownerName) {
  const res = await fetch(
    `${WA_PROJECT_URL}/rest/v1/whatsapp_conversation_owners?on_conflict=phone,to_number`,
    {
      method: 'POST',
      headers: { ...WA_HEADERS, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ phone, to_number: toNumber, owner_id: ownerId, owner_name: ownerName || null }),
    },
  );
  if (!res.ok) throw new Error('تعذّر تحويل ملكية المحادثة');
  return res.json();
}

// وسوم يدوية للمحادثة (تصنيف حرّ — "عميل جديد"، اسم البائع، إلخ) لفلترة
// قائمة المحادثات. طلب مالك 5 أغسطس 2026. UPDATE لا upsert — عمود owner_id
// بالجدول NOT NULL بلا default، فمحادثة بلا مالك أصلاً (ما انفتحت/اتملكت
// بعد) ما فيها صف لتوسمه؛ افتحها/املكها أول (claim) ثم وسمها.
export async function setConversationTags(phone, toNumber, tags) {
  const res = await fetch(
    `${WA_PROJECT_URL}/rest/v1/whatsapp_conversation_owners?phone=eq.${encodeURIComponent(phone)}&to_number=eq.${encodeURIComponent(toNumber)}`,
    {
      method: 'PATCH',
      headers: { ...WA_HEADERS, Prefer: 'return=representation' },
      body: JSON.stringify({ tags }),
    },
  );
  if (!res.ok) throw new Error('تعذّر تحديث وسوم المحادثة');
  return res.json();
}

export const SUGGESTED_TAGS = ['عميل جديد', 'متابعة', 'VIP', 'شكوى', 'استفسار سعر', 'جاهز للطلب'];

// line: "main" (+13204416777، الرقم الوحيد الشغّال فعلياً حالياً) — الرقم
// التاني ("campaign") لسا معطَّل عند Twilio (خطأ 63110)، راجع HANDOFF.
// media: { mediaUrl, mediaContentType } اختياري — رد صوتي/صورة (يحتاج uploadWhatsAppMedia أولاً)
export async function sendWhatsAppReply(phone, body, byUser, line = 'main', media = null) {
  const res = await fetch(`${WA_PROJECT_URL}/functions/v1/whatsapp-send`, {
    method: 'POST',
    headers: WA_HEADERS,
    body: JSON.stringify({ phone, body: body || undefined, byUser, line, ...(media || {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'تعذّر إرسال الرسالة');
  return data;
}

// يرفع ملف صوت/صورة (Blob) لـbucket عام ويرجع رابطه — تمهيداً لإرساله عبر sendWhatsAppReply.
// الحد الأقصى العملي حسب واتساب: صوت ~16MB، صورة ~5MB.
export async function uploadWhatsAppMedia(blob, ext) {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const res = await fetch(`${WA_PROJECT_URL}/functions/v1/whatsapp-upload-media`, {
    method: 'POST',
    headers: WA_HEADERS,
    body: JSON.stringify({ base64, contentType: blob.type, ext }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'تعذّر رفع الملف');
  return { mediaUrl: data.url, mediaContentType: data.contentType };
}

// خط "campaign" (+16195144716) مُزال مؤقتاً من الواجهة — الرقم لم يكتمل
// تسجيله كـWhatsApp Sender فعلياً على Twilio (راجع 09_Decision_Register.md
// § D-016، تصحيح 4-5 آب 2026)، فأي محاولة إرسال عليه تفشل بخطأ Twilio
// "could not find a Channel". يُعاد لما يُسجَّل رقم فعلي.
// يحذف كل تاريخ محادثة رقم مُعيَّن من عرضنا المحلي فقط (سجلات Twilio نفسها
// تبقى، هذا فقط "حذف محادثة" متل أي تطبيق شات عادي).
export async function deleteWhatsAppConversation(phone, toNumber) {
  const res = await fetch(`${WA_PROJECT_URL}/functions/v1/whatsapp-delete-conversation`, {
    method: 'POST',
    headers: WA_HEADERS,
    body: JSON.stringify({ action: 'deleteConversation', phone, toNumber }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'تعذّر حذف المحادثة');
  return data;
}

// يحذف رسالة صادرة واحدة (رسالتنا نحن — لا يُحذَف رد العميل، هو ملكه).
export async function deleteWhatsAppMessage(id) {
  const res = await fetch(`${WA_PROJECT_URL}/functions/v1/whatsapp-delete-conversation`, {
    method: 'POST',
    headers: WA_HEADERS,
    body: JSON.stringify({ action: 'deleteMessage', id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'تعذّر حذف الرسالة');
  return data;
}

// ينقل تاريخ محادثة كامل لرقم جديد (العميل غيّر رقمه واستمر عليه) — يبقى
// بنفس الشاشة، بس تحت رقم مختلف من الآن فصاعداً.
export async function transferWhatsAppConversation(fromPhone, toPhone, toNumber) {
  const res = await fetch(`${WA_PROJECT_URL}/functions/v1/whatsapp-delete-conversation`, {
    method: 'POST',
    headers: WA_HEADERS,
    body: JSON.stringify({ action: 'transferConversation', fromPhone, toPhone, toNumber }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'تعذّر نقل المحادثة');
  return data;
}

// ردود جاهزة (مؤتمتة يدوياً — سارة/رودي يضغطوا بدل ما يكتبوا من الصفر) —
// مبنية على سكريبت البيع المتفَق عليه لحملة كثافة الشعر (خط الروزماري).
export const QUICK_REPLIES = [
  {
    label: 'السعر',
    text: 'أهلاً 🌿 خصم 30% لهالأسبوع بس على مجموعة الروزماري — حابة أبعتلك رابط الطلب المباشر؟',
  },
  {
    label: 'الدليل العلمي',
    text: 'دراسة علمية مستقلة (SKINLAB، بولندا) أثبتت إن ماء الروزماري النقي بيزيد كثافة الشعر بنسبة +15.53% خلال 8 أسابيع.',
  },
  {
    label: 'الثقة/الأصالة',
    text: 'المنتج صناعة تركيا 🇹🇷، أكتر من 230,000 عميلة جربوه، تقييم 4.7/5، ومسجَّل رسمياً (ÜTS) ومطابق للمعايير الأوروبية.',
  },
  {
    label: 'التوصيل',
    text: 'بيوصلك الطلب خلال 3-5 أيام عمل، والدفع عند الاستلام.',
  },
  {
    label: 'متابعة',
    text: 'العرض بينتهي قريباً — حابة أثبتلك الطلب الآن قبل ما ينتهي الخصم؟',
  },
];

// ── رسائل تتبّع ذكية ────────────────────────────────────────────
// طلب مالك 5 أغسطس 2026: رسائل التتبّع لازم تفيد أكتر من مجرد حالة شحن آلية —
// ترحيب/شكر بأسلوب بسيط (مش رسمي/متكبّر)، حماية حق العميل عند الاستلام،
// وتحفيز تفاعل حقيقي (قناة واتساب/متابعة/تقييم). كل نص text(name) دالة
// عشان الاسم ينحقن ديناميكياً — الموظف يقدر يعدّل قبل الإرسال زي أي رسالة.
export const TRACKING_QUICK_REPLIES = [
  {
    key: 'welcome', label: '👋 ترحيب',
    text: (name) => `مرحباً ${name || ''} 🌿\nمعك فريق LOWE'S Professional، تشرّفنا فيك وبطلبك — أي سؤال احنا هون بخدمتك 💚`,
  },
  {
    key: 'thanks', label: '🙏 شكر',
    text: (name) => `يسلموا ${name || ''} 🌿 شكراً إلك عن قلب على ثقتك فينا — وجودك معنا بيسعدنا كتير، وإذا في أي شي تاني احتجتيه بس اكتبيلنا.`,
  },
  {
    key: 'unboxing', label: '📦 توثيق فتح الطرد',
    text: () => `قبل ما تفتحي الطرد 🙏 صوّري فيديو قصير من لحظة استلامك للطرد المغلق لحد ما تفتحيه — هيك بنضمن حقك 100% لو صار أي نقص أو خطأ بالمحتوى.`,
  },
  {
    key: 'channel', label: '📢 دعوة لقناة واتساب',
    text: () => `تحبي تكوني أول وحدة تعرف عن عروضنا وجديدنا؟ 🌿 انضمي لقناتنا على واتساب:\n${COMPANY.whatsappChannelUrl}`,
  },
  {
    key: 'social', label: '📱 متابعة صفحاتنا',
    text: () => `تابعينا على إنستغرام ${COMPANY.instagramSkincare} 📸 لأحدث النصائح والعروض الحصرية — وموقعنا ${COMPANY.website} فيه كل تشكيلتنا.`,
  },
  {
    key: 'review', label: '⭐ طلب تقييم/رأي',
    text: (name) => `${name ? name + ' 💛' : '💛'} شو رأيك بمنتجاتنا لحد هلق؟ رأيك بيهمنا كتير وبيساعدنا نتحسّن — احكيلنا انطباعك وتقييمك من 5 ⭐.`,
  },
  {
    key: 'followup_result', label: '🔁 متابعة النتيجة',
    text: (name) => `${name || ''} 🌿 صار كم يوم على استخدامك للمنتج — شو حاسة؟ لاحظتي فرق؟ حابين نطمن عليكِ ونعرف كيف رافقك معنا.`,
  },
];

// آخر طلب حقيقي لهالرقم (لأي سوق) — يُستخدَم لبناء رسالة رابط التتبع
// الديناميكية بدل نص عام. يعيد استخدام نفس مطابقة الهاتف الموثوقة
// (RPC get_customer_orders_by_key) المستخدمة بشاشة العملاء.
export async function getLatestOrderForWaPhone(waPhone) {
  try {
    const orders = await getCustomerOrders(waPhone);
    return orders?.[0] || null;
  } catch { return null; }
}

// رسالة رابط تتبّع ديناميكية — رابط تتبّع فعلي عند شركة الشحن + حالة الطلب
// الحقيقية، بدل نص عام بلا معلومة. لو ما لقينا طلب مرتبط بالرقم، ترجع سؤال
// توضيحي بدل معلومة مختلَقة.
export function trackingLinkMessage(order, customerName) {
  const name = customerName || order?.customer_name || '';
  if (!order) return `مرحباً ${name} 🌿 ما لقيت طلب مرتبط برقمك حالياً — ممكن تأكدي لي رقم الطلب؟`;
  const link = trackingLink(order.shipping_company, order.tracking_number);
  const statusLabel = STATUSES[order.status]?.label || order.status || '';
  if (!link) {
    return `مرحباً ${name} 🌿 طلبك رقم ${order.order_id || ''} حالته حالياً: ${statusLabel}. رقم تتبع الشحنة لسا ما انسجل، رح نبعتلك ياه أول ما يجهز.`;
  }
  return `مرحباً ${name} 🌿 طلبك رقم ${order.order_id || ''} حالته حالياً: ${statusLabel}.\nرابط تتبّع الشحنة مباشرة:\n${link}`;
}

export const WA_LINES = {
  main: { number: '+13204416777', label: 'الرقم الرئيسي' },
};

export function normalizeWaPhone(raw) {
  if (!raw) return '';
  const p = String(raw).replace(/^whatsapp:/, '');
  return p.startsWith('+') ? p : `+${p}`;
}

// يطبّع رقم محلي (سوري/تركي، غالباً يبدأ بصفر) لصيغة دولية حسب السوق.
function normalizeLocalPhone(raw, market) {
  if (!raw) return null;
  let p = String(raw).replace(/[^\d+]/g, '');
  if (!p) return null;
  if (p.startsWith('+')) return p;
  if (p.startsWith('00')) return `+${p.slice(2)}`;
  p = p.replace(/^0+/, '');
  return (market === 'turkey' ? '+90' : '+963') + p;
}

// نفس قوالب supabase/functions/_shared/notifyWhatsAppStatus.ts — إن عدّلت وحدة عدّل التانية.
// 1 أغسطس 2026 (تحديث): واتساب بزنس يرفض نص حرّ خارج نافذة الـ24 ساعة (خطأ Twilio
// 63016) — التحديث اليدوي هلق يرسل عبر Message Template معتمَد من Meta (Content SID)
// بدل نص حر، بنفس القوالب المستخدمة بالتحديث التلقائي. {{1}}=اسم العميل, {{2}}=رقم الطلب.
const TEMPLATE_SID = {
  shipped: 'HXaf12020e320fbffba951eac64318d8ce',
  at_center: 'HX430237ba5998ec6d99a041715dac99bb',
  on_way: 'HX649f6747f5e4e59877cd734f9d258fff',
  delivered: 'HXdf345ed4562848274f06e3a5fa5a5b94',
  cancelled: 'HXfdc8e012f3c36d9110ffd5b0efd49d52',
  not_received: 'HXf58a03f83c7adceeac99f32a6a26c29f',
  returning: 'HX1b3f03e35175ea655ed9d50930b9b228',
  // قالب تسويقي v2 (صورة مجموعة الروزماري + متغيّر {{1}} حقيقي + خصم 30%
  // لأسبوع + زر رابط للموقع) — قُدِّم لموافقة Meta (Marketing) 4 أغسطس 2026.
  // القالب القديم (اسم "سارة" ثابت بلا متغيّر) بقي معطَّلاً نهائياً — راجع
  // 09_Decision_Register.md § D-016. لا تُرسِل بهذا الـSID قبل تأكيد
  // "WhatsApp approval status: Approved" على Twilio Console.
  promo: 'HX4d52ece94bded9cd1a0bc58d12d7cd0e',
};

export { TEMPLATE_SID };

// عرض حقيقي لجسم رسالة قالب — الرسائل المُرسَلة بقالب فقط (contentSid بلا
// body، أغلبها إشعارات حالة الطلب أو الحملة) تُخزَّن كـ"[template:HXxxx]
// {json}" خام غير مقروء. هاي تعيد بناء **نفس النص الحرفي يلي وصل للعميل**
// (مو مجرد تسمية داخلية) — جُلبت من Twilio Content API حرفياً 5 أغسطس 2026
// (نفس النص المعتمَد من Meta). لو تغيّر أي قالب مستقبلاً، لازم تحديث هون يدوياً.
const TEMPLATE_BODIES = {
  [TEMPLATE_SID.shipped]:      'مرحباً {{1}} 👋\nطلبك رقم {{2}} طلع بالطريق 📦 بيوصل خلال الأيام الجاية.\n— LOWE\'S Professional',
  [TEMPLATE_SID.at_center]:    'مرحباً {{1}} 👋\nطلبك رقم {{2}} وصل لمركز التوزيع بمنطقتك 📍 قربنا نوصلّك.\n— LOWE\'S Professional',
  [TEMPLATE_SID.on_way]:       'مرحباً {{1}} 👋\nالمندوب بالطريق إلك هلق بخصوص طلبك رقم {{2}} 🚚 خلّي هاتفك قريب منك.\n— LOWE\'S Professional',
  [TEMPLATE_SID.delivered]:    'مرحباً {{1}} 👋\nتم تسليم طلبك رقم {{2}} بنجاح ✅ نتمنى تستمتعي فيه.\nلو عندك أي سؤال احنا هون دايماً، وبيسعدنا نسمع رأيك 💛\nتابعينا @lowes_profesyonel\n— LOWE\'S Professional',
  [TEMPLATE_SID.cancelled]:    'مرحباً {{1}} 👋\nتم إلغاء طلبك رقم {{2}} 😔 إذا صار هيك بالغلط أو بدك تفاصيل، احنا هون جاهزين نساعدك.\n— LOWE\'S Professional',
  [TEMPLATE_SID.not_received]: 'مرحباً {{1}} 👋\nحاولنا نوصلّك طلبك رقم {{2}} وما زبط ⚠️ رح نتواصل معك قريباً نرتب وقت أنسب.\n— LOWE\'S Professional',
  [TEMPLATE_SID.returning]:    'مرحباً {{1}} 👋\nطلبك رقم {{2}} راجع لمركزنا ↩️ رح نتواصل معك نعرف السبب ونلاقي الحل الأنسب.\n— LOWE\'S Professional',
  [TEMPLATE_SID.promo]:        '🖼️ [صورة: مجموعة الروزماري]\nمرحباً {{1}}، كثافة شعرك تستاهل عناية حقيقية 🌿\nخط الروزماري من LOWE\'S profesyonel — نتيجة مثبتة علمياً من مختبرات SKINLAB.\nخصم 30% لمدة أسبوع فقط — العرض ينتهي قريباً!\nاكتشفي الفرق الآن 👇\n[زر: تسوّقي الآن → lowesprofesyonel.com]',
};

// تصنيف محادثة: إشعار طلب آلي (شحن/تسليم/إلغاء...) مقابل محادثة عميل حقيقية —
// يُستخدَم لفصل شات "تتبّع الطلبات" عن "المحادثات" بقائمة المحادثات.
const ORDER_TRACKING_SIDS = new Set([
  TEMPLATE_SID.shipped, TEMPLATE_SID.at_center, TEMPLATE_SID.on_way,
  TEMPLATE_SID.delivered, TEMPLATE_SID.cancelled, TEMPLATE_SID.not_received,
  TEMPLATE_SID.returning,
]);
export function isOrderTrackingBody(body) {
  if (!body) return false;
  const m = body.match(/^\[template:([^\]]+)\]/);
  return !!m && ORDER_TRACKING_SIDS.has(m[1]);
}

export function formatWaBody(body) {
  if (!body) return '';
  const m = body.match(/^\[template:([^\]]+)\]\s*(\{.*\})?$/);
  if (!m) return body;
  const [, sid, varsJson] = m;
  let vars = {};
  try { vars = varsJson ? JSON.parse(varsJson) : {}; } catch { /* ignore */ }
  const template = TEMPLATE_BODIES[sid];
  if (template) {
    return template.replace(/\{\{(\d)\}\}/g, (_, n) => vars[n] ?? `{{${n}}}`);
  }
  // قالب غير معروف (جديد لسا ما انضاف هون) — رجوع لملخّص أساسي بدل نص فاضي.
  const parts = [`قالب معتمَد (${sid.slice(0, 10)}…)`];
  if (vars['1']) parts.push(`العميل: ${vars['1']}`);
  if (vars['2']) parts.push(`رقم الطلب: ${vars['2']}`);
  return parts.join(' — ');
}

// إرسال حملة جماعية بقالب معتمَد (contentSid) لعدة أرقام — بمعدل محكوم (delayMs
// بين كل رسالة) لحماية Quality Rating عند Meta. onProgress(i, total, result)
// يُستدعى بعد كل محاولة. يرجع { sent, failed, results }.
// ⚠️ استدعِ هاي الدالة فقط لأسواق غير سوريا — واتساب الرسمي محظور كلياً على
// +963 (خطأ Twilio 21408، قيد منصّة على مستوى الحساب — راجع D-022). الفلترة
// مسؤولية الطرف المستدعي (CustomersScreen يستبعد section === 'syria').
//
// campaignKey/campaignLabel: تُسجَّل كل محاولة (نجحت أو فشلت) بجدول
// campaign_sends (مشروعنا الرئيسي، لا مشروع واتساب) — بدونه ما في طريقة
// نعرف "مين استلم حملة كذا" لاحقاً ولا نستبعد المُرسَل لهم من حملة جاية
// (اكتُشفت الفجوة 5 أغسطس 2026 لما المالك سأل "مين ارسلتلهم ومين لأ").
export async function sendBulkCampaign(customers, contentSid, {
  delayMs = 2500, onProgress, campaignKey = null, campaignLabel = null, sentBy = null,
} = {}) {
  const results = [];
  let sent = 0, failed = 0;
  for (let i = 0; i < customers.length; i++) {
    const c = customers[i];
    // ⚠️ الرقم مخزَّن محلياً (تركي بلا كود دولة، مثال: 5551108464) — لازم
    // normalizeLocalPhone('turkey') مش normalizeWaPhone (يضيف + بس بلا 90).
    const phone = normalizeLocalPhone(c.phone, 'turkey');
    if (!phone) {
      const result = { phone: c.phone, ok: false, error: 'رقم غير صالح' };
      results.push(result); failed++;
      onProgress?.(i + 1, customers.length, result);
      continue;
    }
    let result;
    try {
      const res = await fetch(`${WA_PROJECT_URL}/functions/v1/whatsapp-send`, {
        method: 'POST',
        headers: WA_HEADERS,
        body: JSON.stringify({
          phone, contentSid, byUser: 'bulk-campaign',
          contentVariables: { '1': c.name || 'عميلتنا العزيزة' },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'فشل الإرسال');
      result = { phone, ok: true, sid: data.sid };
      sent++;
    } catch (e) {
      result = { phone, ok: false, error: e.message };
      failed++;
    }
    results.push(result);
    if (campaignKey) {
      supabase.from('campaign_sends').insert({
        campaign_key: campaignKey, campaign_label: campaignLabel, template_sid: contentSid,
        phone_key: c.phone_key || null, customer_name: c.name || null, market: 'turkey',
        sent_by: sentBy || null, status: result.ok ? 'sent' : 'failed',
      }).then(() => {}, () => {}); // best-effort — لا يوقف الحملة لو فشل التسجيل
    }
    onProgress?.(i + 1, customers.length, result);
    if (i < customers.length - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  return { sent, failed, results };
}

// أرقام (phone_key) استلمت حملة معيّنة سابقاً — لفلترة "استبعد المُرسَل لهم"
// ولوسم بطاقة العميل بشارة. status='sent' فقط (محاولة فاشلة لا تُعدّ استلاماً).
export async function getCampaignSentPhones(campaignKey) {
  if (!campaignKey) return new Set();
  const { data } = await supabase
    .from('campaign_sends')
    .select('phone_key')
    .eq('campaign_key', campaignKey)
    .eq('status', 'sent');
  return new Set((data ?? []).map(r => r.phone_key).filter(Boolean));
}

// سجل حملات مختصر (للوحة صغيرة) — عدد المُرسَل/الفاشل وآخر إرسال، حسب campaign_key.
export async function getCampaignStats(campaignKey) {
  if (!campaignKey) return { sent: 0, failed: 0, lastSentAt: null };
  const { data } = await supabase
    .from('campaign_sends')
    .select('status, sent_at')
    .eq('campaign_key', campaignKey);
  const rows = data ?? [];
  const sent = rows.filter(r => r.status === 'sent').length;
  const failed = rows.filter(r => r.status === 'failed').length;
  const lastSentAt = rows.reduce((max, r) => (!max || r.sent_at > max) ? r.sent_at : max, null);
  return { sent, failed, lastSentAt };
}

// يرسل إشعار واتساب على تغيّر حالة طلب — يُستدعى من شاشة الطلبات عند تحديث يدوي.
// best-effort دائماً: ما بيرمي استثناء أبداً كي ما يوقف تحديث الحالة نفسه.
export async function notifyOrderStatusWhatsApp(order, newStatus) {
  try {
    const contentSid = TEMPLATE_SID[newStatus];
    if (!contentSid) return;
    const phone = normalizeLocalPhone(order?.phone_1, order?.market);
    if (!phone) return;
    const name = order?.customer_name || 'عميلنا العزيز';
    const orderNo = String(order?.order_id ?? order?.id ?? '');
    await fetch(`${WA_PROJECT_URL}/functions/v1/whatsapp-send`, {
      method: 'POST',
      headers: WA_HEADERS,
      body: JSON.stringify({ phone, contentSid, contentVariables: { '1': name, '2': orderNo } }),
    });
  } catch {
    /* best-effort — لا نوقف تحديث الحالة الأصلي مهما حصل */
  }
}
