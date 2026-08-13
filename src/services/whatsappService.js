// =============================================================
// whatsappService.js — يتواصل مع رقم واتساب لوويز الرسمي المشترك.
// ⚠️ هذا الرقم مستضاف بمشروع Supabase آخر (kesoqnwyydycuyifqfhl / lowes-production)
// وليس مشروع هذا التطبيق (fghdumrgimoeqsafdhhh) — نفس البنية المستخدمة بتطبيق
// lowes-classic. القيمتان تحت public anon key عام (غير سرّي)، لا Twilio secrets هون.
// أُنشئ 1 أغسطس 2026.
// =============================================================
import { supabase } from './supabase';
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

// ⚠️ 13 أغسطس 2026: تحقّق حي (Chrome فعلي، إنتاج) كشف إن كل نداء REST لهالمشروع
// (kesoqnwyydycuyifqfhl) بياخد ~900ms — أبطأ بكتير من المتوقَّع (مشروع Supabase
// تاني بمنطقة مختلفة عن باقي التطبيق). الصفحات كانت تُجلَب **متسلسلة**
// (سطر بسطر بحلقة for + await) فتحميل 7 صفحات = 7×900ms ≈ 6.3 ثانية انتظار
// شبكة صرف — هاد جزء كبير من الثقل المُبلَّغ عنه. fetchPagedWhatsApp تجيب
// أول صفحة (مع Prefer: count=exact لمعرفة العدد الكلي من Content-Range)، ثم
// تجيب **باقي الصفحات كلها بالتوازي** (Promise.all) بدل الانتظار صفحة صفحة —
// يهبط الزمن الكلي لصفحة ونص تقريباً (900ms + دفعة متوازية واحدة) بغض النظر
// عن عدد الصفحات.
async function fetchPagedWhatsApp(baseUrl, pageSize = 1000) {
  const firstRes = await fetch(`${baseUrl}&limit=${pageSize}&offset=0`, {
    headers: { ...WA_HEADERS, Prefer: 'count=exact' },
  });
  if (!firstRes.ok) throw new Error('تعذّر تحميل رسائل واتساب');
  const firstPage = await firstRes.json();
  const range = firstRes.headers.get('content-range'); // "0-999/6806"
  const total = range ? parseInt(range.split('/')[1], 10) : firstPage.length;
  const out = [...firstPage];
  if (firstPage.length === pageSize && Number.isFinite(total) && total > pageSize) {
    const offsets = [];
    for (let offset = pageSize; offset < total; offset += pageSize) offsets.push(offset);
    const restPages = await Promise.all(offsets.map((offset) =>
      fetch(`${baseUrl}&limit=${pageSize}&offset=${offset}`, { headers: WA_HEADERS })
        .then((res) => { if (!res.ok) throw new Error('تعذّر تحميل رسائل واتساب'); return res.json(); }),
    ));
    for (const page of restPages) out.push(...page);
  }
  return out;
}

// ⚠️ 6 أغسطس 2026: كان هون limit=500 ثابت — مع تدفّق حملات جماعية (880+
// رسالة برسالة واحدة) صارت الرسائل الأقدم (متل محادثات تتبّع هيا الموزَّعة
// إلها مسبقاً) تُدفَن تحت سقف الـ500 وتختفي كلياً من واجهتها رغم إنها
// مسجَّلة إلها فعلياً بجدول الملكية — بگت "بس محادثتين" رغم 47 محادثة
// فعلية. الحل: صفحات (نفس نمط fetchAllRows بباقي التطبيق) بدل سقف ثابت.
export async function fetchWhatsAppMessages() {
  return fetchPagedWhatsApp(`${WA_PROJECT_URL}/rest/v1/whatsapp_messages?select=*&order=created_at.desc`);
}

// نسخة خفيفة لتحديث الخلفية الدوري (كل 20 ثانية) — بلاغ مالك 13 آب 2026:
// "التطبيق تقيل، عم يعلّق" (حسام/ديانا/سالي). السبب: fetchWhatsAppMessages
// الكاملة كانت تُنادى كل 20 ثانية بلا استثناء — تجيب الجدول بأكمله (6800+
// صف اليوم، بيكبر ~600-900 صف/يوم من الحملات الجماعية) بصفحات متسلسلة، فكل
// نبضة تحديث هادئ صارت فعلياً عدة ثوانٍ من شبكة + JSON parsing + إعادة رسم
// القائمة كاملة — يتكرر كل 20 ثانية دائماً طالما الشاشة مفتوحة. صار التحديث
// الهادئ يجيب بس رسائل حديثة (`created_at=gte.<cutoff>`) — كافية فعلياً لأي
// تحديث حالة تسليم/قراءة حقيقي (بيصير خلال ساعات من الإرسال لا أيام)، ويُدمَج
// بمصفوفة الرسائل الموجودة بدل استبدالها كاملة (راجع mergeWhatsAppMessages
// بالشاشة). التحميل الأول (فتح الشاشة) ولا زر "تحديث ↻" اليدوي يضلّوا
// يستخدموا fetchWhatsAppMessages الكاملة — لازم السجل كامل لبناء قائمة
// المحادثات والبحث برقم هاتف قديم.
export async function fetchRecentWhatsAppMessages(days = 7) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return fetchPagedWhatsApp(
    `${WA_PROJECT_URL}/rest/v1/whatsapp_messages?select=*&created_at=gte.${encodeURIComponent(cutoff)}&order=created_at.desc`,
  );
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

// line: "main" (+13204416777 — عملاء/تتبّع) أو "campaign" (+12768772635 —
// حملات جماعية) — كلاهما مسجَّلان ONLINE فعلياً على Twilio منذ 5 أغسطس 2026.
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
    text: (name) => `مرحباً ${name || ''} 🌿\nمعك فريق Lowe's Profesyonel، تشرّفنا فيك وبطلبك — أي سؤال احنا هون بخدمتك 💚`,
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
//
// 🐛→✅ 8 أغسطس 2026: كان دايماً بيرجع null لعملاء عندهم طلب حقيقي فعلياً
// ("ما لقيت طلب مرتبط برقمك" لعميل مثبَت عنده TL-29121) — السبب: رقم
// واتساب دولي كامل بكود الدولة (905394693150) بينما orders.phone_1 مخزَّن
// محلياً بلا كود دولة (5394693150)، فالمطابقة الحرفية (RPC + fallback) ما
// كانت تلاقي شي أبداً. نجرّب المفتاح الكامل أولاً، وبعدها آخر 10 أرقام
// (نمط تركيا محلي) ثم آخر 9 (نمط سوريا محلي) كبدائل.
// ⚠️ 13 آب 2026: بلاغ مالك مباشر بعد تجربة حية — فتح شات تتبّع كان "بيطول"
// أحياناً كتير. أول محاولة إصلاح (تشغيل الثلاث مرشّحين بالتوازي عبر RPC
// `get_customer_orders_by_key`) قلّلت الزمن بس ما حلّت المشكلة فعلياً —
// تحقّق حي تاني (Chrome، PerformanceObserver على الشبكة الحقيقية) أظهر كل
// نداء RPC يواحد لحاله بياخد **~1.8-2.8 ثانية**، وحتى بالتوازي الزمن
// الكلي بيبقى بحدود أبطأ نداء. تحقّق مباشر إضافي (REST مباشر، بلا RPC):
// نداء وحيد بفلتر `.in('phone_1', [...])` على جدول orders نفسه (33,690
// صف) بيرجع نفس النتيجة الصحيحة بـ~350-600ms فقط بعد أول اتصال — RPC
// نفسه هو الأبطأ (تكلفة استدعاء الدالة + مسار مختلف)، مش المشكلة عدد
// النداءات. صار الاستعلام مباشرة عبر Supabase client (`.from('orders')`)
// بنداء **وحيد** بدل RPC بثلاث نسخ متوازية — يجيب كل الصفوف المطابقة لأي
// مرشّح دفعة وحدة، ونختار أفضل تطابق بالكود حسب نفس أولوية المطابقة
// القديمة (الرقم الكامل > آخر 10 > آخر 9).
export async function getLatestOrderForWaPhone(waPhone) {
  try {
    const digits = String(waPhone || '').replace(/\D/g, '');
    const candidates = [...new Set([digits, digits.slice(-10), digits.slice(-9)])].filter(k => k.length >= 6);
    if (!candidates.length) return null;
    const { data, error } = await supabase
      .from('orders')
      .select('order_date, items, amount, currency, status, city, address, wa_number, market, brand, customer_name, handler_name, order_id, phone_1, tracking_number')
      .in('phone_1', candidates)
      .order('order_date', { ascending: false })
      .limit(20);
    if (error || !data?.length) return null;
    for (const key of candidates) {
      const match = data.find((o) => o.phone_1 === key);
      if (match) return match;
    }
    return data[0];
  } catch { return null; }
}

// رابط صفحة التتبّع العلنية بدومين لوويز نفسه (بديل احترافي عن رابط شركة
// الشحن الخام — طلب مالك 5 أغسطس 2026 "متل الشركات العالمية"). راجع
// src/screens/PublicTrackScreen.jsx.
const APP_BASE_URL = 'https://lowes-app-web.vercel.app';
export function brandedTrackingUrl(orderId) {
  return `${APP_BASE_URL}/track/${encodeURIComponent(orderId)}`;
}

// رسالة رابط تتبّع ديناميكية — رابط تتبّع بهويتنا (لا رابط شركة الشحن الخام)
// + حالة الطلب الحقيقية، بدل نص عام بلا معلومة. لو ما لقينا طلب مرتبط
// بالرقم، ترجع سؤال توضيحي بدل معلومة مختلَقة.
export function trackingLinkMessage(order, customerName) {
  const name = customerName || order?.customer_name || '';
  if (!order) return `مرحباً ${name} 🌿 ما لقيت طلب مرتبط برقمك حالياً — ممكن تأكدي لي رقم الطلب؟`;
  const statusLabel = STATUSES[order.status]?.label || order.status || '';
  if (!order.tracking_number) {
    return `مرحباً ${name} 🌿 طلبك رقم ${order.order_id || ''} حالته حالياً: ${statusLabel}. رقم تتبع الشحنة لسا ما انسجل، رح نبعتلك ياه أول ما يجهز.`;
  }
  return `مرحباً ${name} 🌿 طلبك رقم ${order.order_id || ''} حالته حالياً: ${statusLabel}.\nتابعي شحنتك أول بأول من هون:\n${brandedTrackingUrl(order.order_id)}`;
}

// خطّان منفصلان — قرار مالك 5 أغسطس 2026: الرئيسي يضل حصراً للعملاء/تتبّع
// الشحن (سمعة عالية HIGH مبنية من استخدام فعلي، ما نخاطر فيها بحملات
// جماعية)، والجديد (+12768772635، صار ONLINE بعد تحرير التسجيل العالق)
// مخصَّص للحملات التسويقية فقط. مرتبط بـSecret جديد TWILIO_WHATSAPP_FROM_2.
export const WA_LINES = {
  main:     { number: '+13204416777', label: 'الرئيسي — عملاء وتتبّع' },
  campaign: { number: '+12768772635', label: 'الحملات' },
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
// 6 أغسطس 2026: تحقّقت مباشرة من Twilio Console — كل السبعة قوالب v2 (بزر
// "تتبّع الشحنة" برابط ديناميكي) صارت Approved من Meta (shipped آخر وحدة،
// اعتُمدت 21:33). صار الإرسال الفعلي يستخدمها كلها بلا استثناء.
// {{1}}=اسم العميل, {{2}}=رقم الطلب, {{3}}=رقم الطلب مكرَّر (لزر الرابط).
const TEMPLATE_SID = {
  shipped: 'HXb7b169193122a9ef28b5d325e1c677b8',
  at_center: 'HXd67200bbcefe0ea6f5b2b1ee4783e5fb',
  on_way: 'HXb94f286c3d6a6ff18c026d9cd860c648',
  delivered: 'HX8488cebc405836a8754a4fdcd135bf30',
  cancelled: 'HX811b42acf8805422c828d34b94cb54f2',
  not_received: 'HXe342e4d0b35339c93c7dbb189270a8a5',
  returning: 'HX8ae3500cc67471cb7d809f8af6bb0353',
  // قالب تسويقي v2 (صورة مجموعة الروزماري + متغيّر {{1}} حقيقي + خصم 30%
  // لأسبوع + زر رابط للموقع) — قُدِّم لموافقة Meta (Marketing) 4 أغسطس 2026.
  // القالب القديم (اسم "سارة" ثابت بلا متغيّر) بقي معطَّلاً نهائياً — راجع
  // 09_Decision_Register.md § D-016. لا تُرسِل بهذا الـSID قبل تأكيد
  // "WhatsApp approval status: Approved" على Twilio Console.
  promo: 'HX4d52ece94bded9cd1a0bc58d12d7cd0e',
};

export { TEMPLATE_SID };

// ✅ قالب "تواصل ودّي" (Text، بلا زر/رابط — رسالة استرجاع علاقة بحتة:
// "اشتقنالك، كيف تجربتك، هاد رقمنا الرسمي") — قُدِّم لموافقة Meta (Marketing)
// 7 أغسطس 2026، **اعتُمد فعلياً 8 أغسطس 2026** (تحقّق مباشر عبر Twilio
// Console: WhatsApp approval status: Approved). طلب مالك صريح: هدفها فتح
// نافذة رد حر مع العميل، لا بيع مباشر — أي رابط (إنستا/قناة واتساب) يُرسَل
// يدوياً بعد رد العميل، مش بنفس الرسالة.
const CHECKIN_TEMPLATE_SID = 'HX2ca0719593a6f86f64b8a4f1e74c6288'; // lowes_customer_checkin_v1
export { CHECKIN_TEMPLATE_SID };

// قوالب v1 القديمة (بلا زر رابط) — لم تعد تُستخدَم بالإرسال الفعلي (استُبدلت
// أعلاه بـv2) لكن تبقى هون فقط عشان formatWaBody() يقدر يعيد بناء نص الرسائل
// التاريخية المُرسَلة قبل التبديل (6 أغسطس 2026).
const LEGACY_TEMPLATE_SID_V1 = {
  shipped: 'HXaf12020e320fbffba951eac64318d8ce',
  at_center: 'HX430237ba5998ec6d99a041715dac99bb',
  on_way: 'HX649f6747f5e4e59877cd734f9d258fff',
  delivered: 'HXdf345ed4562848274f06e3a5fa5a5b94',
  cancelled: 'HXfdc8e012f3c36d9110ffd5b0efd49d52',
  not_received: 'HXf58a03f83c7adceeac99f32a6a26c29f',
  returning: 'HX1b3f03e35175ea655ed9d50930b9b228',
};

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
  [CHECKIN_TEMPLATE_SID]:      'مرحباً {{1}} 👋 اشتقنالك عندنا بـLOWE\'S profesyonel! كيف كانت تجربتك معنا؟ حابين نسمع رأيك 🤝\nهاد رقمنا الرسمي – لأي سؤال أو طلب جديد.',
  // قالب "استلام الطلب" — {{1}}=اسم العميل, {{2}}=رقم الطلب, {{3}}=ملخّص
  // المنتجات, {{4}}=المجموع. كان مفقوداً من هالخريطة فظهر بواجهة الأدمن
  // كنص خام "قالب معتمَد (HXb29d16c9…) — العميل: X — رقم الطلب: Y" بدل
  // النص الفعلي (بلاغ مالك 8 أغسطس 2026). النص الحرفي هون منقول عن لقطة
  // شاشة فعلية لرسالة وصلت لعميلة حقيقية — راجع sendOrderReceivedMessage().
  'HXb29d16c967c8d7f651502eff3fa40f76':
    '👋 {{1}} مرحباً\nتم استلام طلبك رقم {{2}} وهو الآن قيد التجهيز 📦\nرح يتسلّم لشركة الشحن خلال 48 ساعة، ومدة التوصيل المتوقعة من 2 إلى 5 أيام عمل.\n\nطلبك: {{3}}\nالمجموع: {{4}}\n\nرح نبقى معك بكل خطوة لحالة طلبك خطوة بخطوة ✅\nوإذا حابة، بيسعدنا نتابعك وتشاركينا قصة صغيرة 🌱\n\nشكراً لثقتك فينا 💛\n— Lowe\'s Profesyonel',
  // نسخ v1 القديمة — نفس النص الحرفي (v2 غيّرت الزر فقط لا النص) — لعرض
  // الرسائل التاريخية المُرسَلة قبل التبديل لـv2 (6 أغسطس 2026) بشكل صحيح.
  [LEGACY_TEMPLATE_SID_V1.shipped]:      'مرحباً {{1}} 👋\nطلبك رقم {{2}} طلع بالطريق 📦 بيوصل خلال الأيام الجاية.\n— LOWE\'S Professional',
  [LEGACY_TEMPLATE_SID_V1.at_center]:    'مرحباً {{1}} 👋\nطلبك رقم {{2}} وصل لمركز التوزيع بمنطقتك 📍 قربنا نوصلّك.\n— LOWE\'S Professional',
  [LEGACY_TEMPLATE_SID_V1.on_way]:       'مرحباً {{1}} 👋\nالمندوب بالطريق إلك هلق بخصوص طلبك رقم {{2}} 🚚 خلّي هاتفك قريب منك.\n— LOWE\'S Professional',
  [LEGACY_TEMPLATE_SID_V1.delivered]:    'مرحباً {{1}} 👋\nتم تسليم طلبك رقم {{2}} بنجاح ✅ نتمنى تستمتعي فيه.\nلو عندك أي سؤال احنا هون دايماً، وبيسعدنا نسمع رأيك 💛\nتابعينا @lowes_profesyonel\n— LOWE\'S Professional',
  [LEGACY_TEMPLATE_SID_V1.cancelled]:    'مرحباً {{1}} 👋\nتم إلغاء طلبك رقم {{2}} 😔 إذا صار هيك بالغلط أو بدك تفاصيل، احنا هون جاهزين نساعدك.\n— LOWE\'S Professional',
  [LEGACY_TEMPLATE_SID_V1.not_received]: 'مرحباً {{1}} 👋\nحاولنا نوصلّك طلبك رقم {{2}} وما زبط ⚠️ رح نتواصل معك قريباً نرتب وقت أنسب.\n— LOWE\'S Professional',
  [LEGACY_TEMPLATE_SID_V1.returning]:    'مرحباً {{1}} 👋\nطلبك رقم {{2}} راجع لمركزنا ↩️ رح نتواصل معك نعرف السبب ونلاقي الحل الأنسب.\n— LOWE\'S Professional',
};

// تصنيف محادثة: إشعار طلب آلي (شحن/تسليم/إلغاء...) مقابل محادثة عميل حقيقية —
// يُستخدَم لفصل شات "تتبّع الطلبات" عن "المحادثات" بقائمة المحادثات. يشمل
// v1 القديمة كمان (رسائل تاريخية قبل التبديل لـv2) عشان ما تنكسر تصنيفها.
const ORDER_TRACKING_SIDS = new Set([
  TEMPLATE_SID.shipped, TEMPLATE_SID.at_center, TEMPLATE_SID.on_way,
  TEMPLATE_SID.delivered, TEMPLATE_SID.cancelled, TEMPLATE_SID.not_received,
  TEMPLATE_SID.returning,
  ...Object.values(LEGACY_TEMPLATE_SID_V1),
  // "استلام الطلب" (ORDER_RECEIVED_SID) و"فيديو فتح الطرد" (UNBOXING_VIDEO_SID)
  // — إشعارات آلية بحياة الطلب متل باقي القائمة فوق، كانت ناقصة هون فانتهى
  // بها المطاف بقسم "المحادثات" العضوي بدل "تتبّع الطلبات" (بلاغ مالك 8
  // أغسطس 2026). القيم مكتوبة حرفياً (لا استيراد الثابت) لأن الثابتين
  // معرَّفين لاحقاً بأسفل الملف — TDZ لو استُخدما هون بالاسم.
  'HXb29d16c967c8d7f651502eff3fa40f76', // ORDER_RECEIVED_SID
  'HX7a1399acb1734201f34faec6a8152559', // UNBOXING_VIDEO_SID
]);
export function isOrderTrackingBody(body) {
  if (!body) return false;
  const m = body.match(/^\[template:([^\]]+)\]/);
  return !!m && ORDER_TRACKING_SIDS.has(m[1]);
}

// محادثة أصلها حملة جماعية (قالب promo أو checkin) — تُفصَل عن كل من
// "المحادثات" العضوية و"تتبّع الطلبات" الآلي. طلب مالك 5 أغسطس 2026: تتبّع
// الطلبات مسؤولية Haya حصراً، ومحادثات الحملة لازم تنفصل عن هالقسمين.
const CAMPAIGN_SIDS = new Set([TEMPLATE_SID.promo, CHECKIN_TEMPLATE_SID]);
export function isCampaignBody(body) {
  if (!body) return false;
  const m = body.match(/^\[template:([^\]]+)\]/);
  return !!m && CAMPAIGN_SIDS.has(m[1]);
}

// اسم العميل المحقون بأي رسالة قالب (متغيّر {{1}} — دايماً الاسم بكل
// قوالبنا التسويقية/التتبّع). بلا استعلام DB إضافي — نفس اسم انبعت للعميل
// فعلياً مخزون أصلاً بجسم الرسالة. طلب مالك 5 أغسطس 2026: عرض اسم العميل
// مو رقمه بس، "متل الواتساب الحقيقي".
export function extractTemplateName(body) {
  if (!body) return null;
  const m = body.match(/^\[template:([^\]]+)\]\s*(\{.*\})?$/);
  if (!m || !m[2]) return null;
  try {
    const vars = JSON.parse(m[2]);
    return vars['1'] || null;
  } catch { return null; }
}

// السبعة قوالب v2 هدول تحديداً (بس هدول) مبنيّة عند Twilio بزر "تتبّع الشحنة"
// (Call-to-Action URL، {{3}}=رقم الطلب يغذّي الرابط الديناميكي) — الزر نفسه
// عنصر منفصل عن نص الرسالة (body)، فمهما أعدنا بناء النص من TEMPLATE_BODIES
// ما رح يظهر تلقائياً بمعاينة الأدمن. نضيفه هون يدوياً بس لهالسبعة تحديداً
// (v1 القديمة والقوالب التانية كلها بلا زر فعلياً — ما نضيف رابط وهمي إلها)
// عشان الموظف/ة يشوف نفس اللي وصل للعميل فعلياً، بلا لبس. طلب مالك 9 أغسطس
// 2026 بعد ما شاف رسالة "طلع بالطريق" بمعاينة الأدمن بلا أي رابط ظاهر.
const STATUS_BUTTON_SIDS = new Set(Object.values(TEMPLATE_SID).filter(sid => sid !== TEMPLATE_SID.promo));

export function formatWaBody(body) {
  if (!body) return '';
  const m = body.match(/^\[template:([^\]]+)\]\s*(\{.*\})?$/);
  if (!m) return body;
  const [, sid, varsJson] = m;
  let vars = {};
  try { vars = varsJson ? JSON.parse(varsJson) : {}; } catch { /* ignore */ }
  const template = TEMPLATE_BODIES[sid];
  if (template) {
    let text = template.replace(/\{\{(\d)\}\}/g, (_, n) => vars[n] ?? `{{${n}}}`);
    if (STATUS_BUTTON_SIDS.has(sid) && vars['2']) {
      text += `\n🔗 تتبّع الشحنة: ${brandedTrackingUrl(vars['2'])}`;
    }
    return text;
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
          phone, contentSid, byUser: 'bulk-campaign', line: 'campaign',
          contentVariables: { '1': c.name || 'عميلنا العزيز' },
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

// PostgREST بيقص أي نتيجة عند 1000 صف افتراضياً بصمت (بلا خطأ) — حملة
// "تواصل ودّي" عبرت الـ1000 إرسال ناجح فوقع عميل حقيقي (استلم الحملة
// مرتين فعلياً بـ8 و10 أغسطس) خارج الصفحة الأولى، فبان "لسا ما استلم"
// رغم وجوده بالجدول (اكتُشف 13 أغسطس 2026 لما عملية الاستبعاد فشلت حياً).
// كل قراءة من campaign_sends لازم تصفّح بدفعات 1000 لحد ما تخلص.
async function fetchAllCampaignSends(campaignKey, columns) {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('campaign_sends')
      .select(columns)
      .eq('campaign_key', campaignKey)
      .range(from, from + PAGE - 1);
    if (error || !data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

// أرقام (phone_key) استلمت حملة معيّنة سابقاً — لفلترة "استبعد المُرسَل لهم"
// ولوسم بطاقة العميل بشارة. status='sent' فقط (محاولة فاشلة لا تُعدّ استلاماً).
export async function getCampaignSentPhones(campaignKey) {
  if (!campaignKey) return new Set();
  const rows = await fetchAllCampaignSends(campaignKey, 'phone_key, status');
  return new Set(rows.filter(r => r.status === 'sent').map(r => r.phone_key).filter(Boolean));
}

// سجل حملات مختصر (للوحة صغيرة) — عدد المُرسَل/الفاشل وآخر إرسال، حسب campaign_key.
export async function getCampaignStats(campaignKey) {
  if (!campaignKey) return { sent: 0, failed: 0, lastSentAt: null };
  const rows = await fetchAllCampaignSends(campaignKey, 'status, sent_at');
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
    // {{3}} = رقم الطلب مكرَّر — يغذّي زر "تتبّع الشحنة" الديناميكي (كل القوالب v2 الآن).
    const contentVariables = { '1': name, '2': orderNo, '3': orderNo };
    await fetch(`${WA_PROJECT_URL}/functions/v1/whatsapp-send`, {
      method: 'POST',
      headers: WA_HEADERS,
      body: JSON.stringify({ phone, contentSid, contentVariables }),
    });
  } catch {
    /* best-effort — لا نوقف تحديث الحالة الأصلي مهما حصل */
  }
  if (newStatus === 'delivered') sendUnboxingVideoRequest(order);
}

// ⏳ قالب "طلب فيديو فتح الطرد" — يُرسَل بعد رسالة التسليم مباشرة. **بلا أي**
// **ذكر لسياسة استرجاع محدَّدة** (لا يوجد سياسة رسمية موثَّقة وقت الكتابة —
// طلب مالك صريح 6 أغسطس 2026: لا تُضَف معلومة غير موجودة) — فقط طلب توثيق
// فتح الطرد بفيديو لحفظ حق العميل. قُدِّم لموافقة Meta 6 أغسطس 2026 (status:
// received، SID: HX7a1399acb1734201f34faec6a8152559). **لا تُفعَّل قبل تأكيد**
// **الموافقة** — بدّل UNBOXING_VIDEO_READY لـtrue فقط بعدها.
const UNBOXING_VIDEO_SID = 'HX7a1399acb1734201f34faec6a8152559';
const UNBOXING_VIDEO_READY = true; // ✅ موافقة Meta مؤكَّدة 6 أغسطس 2026 (أعادت Meta تصنيفها MARKETING)

async function sendUnboxingVideoRequest(order) {
  if (!UNBOXING_VIDEO_READY) return;
  try {
    const phone = normalizeLocalPhone(order?.phone_1, order?.market);
    if (!phone) return;
    const name = order?.customer_name || 'عميلنا العزيز';
    const orderNo = String(order?.order_id ?? order?.id ?? '');
    await fetch(`${WA_PROJECT_URL}/functions/v1/whatsapp-send`, {
      method: 'POST',
      headers: WA_HEADERS,
      body: JSON.stringify({
        phone, contentSid: UNBOXING_VIDEO_SID,
        contentVariables: { '1': name, '2': orderNo },
      }),
    });
  } catch {
    /* best-effort */
  }
}

// ⏳ قالب "استلام الطلب" — تأكيد فوري عند إنشاء الطلب (مختلف عن إشعارات
// تغيّر الحالة اللاحقة أعلاه). قُدِّم لموافقة Meta 6 أغسطس 2026 (status:
// received وقت التقديم، SID: HXb29d16c967c8d7f651502eff3fa40f76). **لا
// تُفعَّل قبل تأكيد الموافقة** (GET /v1/Content/{sid}/ApprovalRequests
// → status: approved) — بدّل ORDER_RECEIVED_READY لـtrue فقط بعدها، وإلا
// كل إرسال يفشل بخطأ Twilio 63016 (نفس درس promo/v2 tracking templates).
const ORDER_RECEIVED_SID = 'HXb29d16c967c8d7f651502eff3fa40f76';
const ORDER_RECEIVED_READY = true; // ✅ موافقة Meta مؤكَّدة 6 أغسطس 2026

// يرسل تأكيد استلام الطلب فور إنشائه — قيد التجهيز، تسليم لشركة الشحن خلال
// 48 ساعة، مدة توصيل متوقعة 2-5 أيام عمل (نفس أسلوب شركات الشحن — تقدير لا
// وعد)، ملخّص المنتجات والمجموع، ودعوة لطيفة للمتابعة. طلب مالك 6 أغسطس
// 2026. best-effort دائماً — ما يوقف حفظ الطلب مهما صار.
export async function sendOrderReceivedMessage(order) {
  if (!ORDER_RECEIVED_READY) return;
  try {
    const phone = normalizeLocalPhone(order?.phone_1, order?.market);
    if (!phone) return;
    const name = order?.customer_name || 'عميلنا العزيز';
    const orderNo = String(order?.order_id ?? order?.id ?? '');
    const itemsSummary = (order?.items || []).map(it => `${it.name} ×${it.qty}`).join('، ') || '—';
    const total = order?.amount ? `${Number(order.amount).toLocaleString()} ${order.currency || ''}`.trim() : '—';
    await fetch(`${WA_PROJECT_URL}/functions/v1/whatsapp-send`, {
      method: 'POST',
      headers: WA_HEADERS,
      body: JSON.stringify({
        phone, contentSid: ORDER_RECEIVED_SID,
        contentVariables: { '1': name, '2': orderNo, '3': itemsSummary, '4': total },
      }),
    });
  } catch {
    /* best-effort — ما يوقف حفظ الطلب مهما صار */
  }
}
