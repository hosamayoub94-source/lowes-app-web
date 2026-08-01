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
export async function sendWhatsAppReply(phone, body, byUser, line = 'main') {
  const res = await fetch(`${WA_PROJECT_URL}/functions/v1/whatsapp-send`, {
    method: 'POST',
    headers: WA_HEADERS,
    body: JSON.stringify({ phone, body, byUser, line }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'تعذّر إرسال الرسالة');
  return data;
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
};

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
