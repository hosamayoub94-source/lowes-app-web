// =============================================================
// whatsappService.js — يتواصل مع رقم واتساب لوويز الرسمي المشترك.
// ⚠️ هذا الرقم مستضاف بمشروع Supabase آخر (kesoqnwyydycuyifqfhl / lowes-production)
// وليس مشروع هذا التطبيق (fghdumrgimoeqsafdhhh) — نفس البنية المستخدمة بتطبيق
// lowes-classic. القيمتان تحت public anon key عام (غير سرّي)، لا Twilio secrets هون.
// أُنشئ 1 أغسطس 2026.
// =============================================================
const WA_PROJECT_URL = 'https://kesoqnwyydycuyifqfhl.supabase.co';
const WA_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtlc29xbnd5eWR5Y3V5aWZxZmhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MjQzMDMsImV4cCI6MjA5NDUwMDMwM30.7muMlaq4MhWdJicSqzupLBZqTvaLbhWjieQuaQvCvBg';

const WA_HEADERS = {
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

// line: "main" (+13204416777، افتراضي) أو "campaign" (+16195144716، سارة/رودي) — راجع 09_Decision_Register.md § D-016
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

export const WA_LINES = {
  main: { number: '+13204416777', label: 'الرقم الرئيسي' },
  campaign: { number: '+16195144716', label: 'خط الحملة (سارة/رودي)' },
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

// عرض ودّي لجسم رسالة قالب — الرسائل المُرسَلة بقالب فقط (contentSid بلا body،
// أغلبها إشعارات حالة الطلب) تُخزَّن كـ"[template:HXxxx] {json}" خام غير
// مقروء. هاي بترجم SID المعروف لاسم القالب + تعرض قيم {{1}}/{{2}} بشكل نظيف.
const TEMPLATE_LABELS = {
  [TEMPLATE_SID.shipped]: '📦 تم شحن الطلب',
  [TEMPLATE_SID.at_center]: '🏢 الطلب وصل لمركز التوزيع',
  [TEMPLATE_SID.on_way]: '🚚 الطلب بالطريق',
  [TEMPLATE_SID.delivered]: '✅ تم تسليم الطلب',
  [TEMPLATE_SID.cancelled]: '❌ تم إلغاء الطلب',
  [TEMPLATE_SID.not_received]: '⚠️ العميل أفاد بعدم استلام الطلب',
  [TEMPLATE_SID.returning]: '↩️ الطلب قيد الإرجاع',
  [TEMPLATE_SID.promo]: '🌿 رسالة حملة كثافة الشعر (الروزماري)',
};

export function formatWaBody(body) {
  if (!body) return '';
  const m = body.match(/^\[template:([^\]]+)\]\s*(\{.*\})?$/);
  if (!m) return body;
  const [, sid, varsJson] = m;
  const label = TEMPLATE_LABELS[sid] || `قالب معتمَد (${sid.slice(0, 10)}…)`;
  let vars = {};
  try { vars = varsJson ? JSON.parse(varsJson) : {}; } catch { /* ignore */ }
  const parts = [label];
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
export async function sendBulkCampaign(customers, contentSid, { delayMs = 2500, onProgress } = {}) {
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
    onProgress?.(i + 1, customers.length, result);
    if (i < customers.length - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  return { sent, failed, results };
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
