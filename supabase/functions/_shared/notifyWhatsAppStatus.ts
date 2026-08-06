// _shared/notifyWhatsAppStatus.ts
// يرسل رسالة واتساب للعميل عند تغيّر حالة شحنته تلقائياً (من أي من دوال التتبّع:
// track-babel/track-karam/track-ptt/track-yurtici). يستخدم رقم لوويز الرسمي
// (+13204416777) المستضاف بمشروع Supabase آخر (kesoqnwyydycuyifqfhl / lowes-production)
// عبر edge function whatsapp-send الموجودة هناك فعلياً — لا Twilio secrets هون إطلاقاً،
// فقط استدعاء HTTP بمفتاح anon العام (غير سرّي) لذاك المشروع.
//
// 1 أغسطس 2026 — أُنشئ أول مرة لربط تتبّع الشحن بإشعارات واتساب تلقائية.
// 1 أغسطس 2026 (تحديث): واتساب بزنس يرفض أي نص حرّ لعميل لم يراسلنا خلال آخر 24
// ساعة (خطأ Twilio 63016 "Outside messaging window") — لازم Message Template معتمد
// من Meta. حوّلنا الإرسال لاستخدام Content Templates (Twilio Content API، ContentSid +
// ContentVariables) بدل النص الحر. القوالب مُقدَّمة لمراجعة Meta (٤٨ ساعة عادة) — بعد
// الموافقة تشتغل تلقائياً بدون أي تغيير إضافي بالكود.

const WA_PROJECT_URL = "https://kesoqnwyydycuyifqfhl.supabase.co/functions/v1/whatsapp-send";
// مفتاح anon عام لمشروع lowes-production — مصمَّم ليكون عاماً (نفس القيمة الموجودة
// أصلاً بكود app.js لتطبيق lowes-classic، SB_ANON)، وليس سراً.
const WA_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtlc29xbnd5eWR5Y3V5aWZxZmhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MjQzMDMsImV4cCI6MjA5NDUwMDMwM30.7muMlaq4MhWdJicSqzupLBZqTvaLbhWjieQuaQvCvBg";

// Content SID لكل قالب معتمَد (Twilio Content Template Builder، لغة عربية، فئة Utility).
// {{1}} = اسم العميل، {{2}} = رقم الطلب، {{3}} = رقم الطلب مكرَّر (زر رابط
// التتبّع الديناميكي). 6 أغسطس 2026: تحقّقت مباشرة من Twilio Console — كل
// السبعة قوالب v2 صارت Approved من Meta (shipped آخر وحدة، 21:33)، استُبدلت
// هون كلها. نفس التبديل بـsrc/services/whatsappService.js، إن عدّلت وحدة
// عدّل التانية. ⚠️ هالملف edge function منشور على مشروع Supabase منفصل
// (fghdumrgimoeqsafdhhh، دوال track-babel/karam/ptt/yurtici) — لازم
// `supabase functions deploy` بعد أي تعديل هون، التعديل بالمصدر لا يكفي وحده.
const TEMPLATE_SID: Record<string, string> = {
  shipped: "HXb7b169193122a9ef28b5d325e1c677b8",
  at_center: "HXd67200bbcefe0ea6f5b2b1ee4783e5fb",
  on_way: "HXb94f286c3d6a6ff18c026d9cd860c648",
  delivered: "HX8488cebc405836a8754a4fdcd135bf30",
  cancelled: "HX811b42acf8805422c828d34b94cb54f2",
  not_received: "HXe342e4d0b35339c93c7dbb189270a8a5",
  returning: "HX8ae3500cc67471cb7d809f8af6bb0353",
};

// ⏳ قالب "طلب فيديو فتح الطرد" — يُرسَل بعد رسالة التسليم مباشرة، نفس منطق
// whatsappService.js (lowes-app-web) — راجعها لو عدّلت هون، النسختان لازم
// تتزامنا. بلا أي ذكر لسياسة استرجاع (لا يوجد سياسة رسمية موثَّقة بعد —
// طلب مالك 6 أغسطس 2026). SID قُدِّم لموافقة Meta 6 أغسطس 2026 (status:
// received). **لا تُفعَّل قبل تأكيد الموافقة.**
const UNBOXING_VIDEO_SID = "HX7a1399acb1734201f34faec6a8152559";
const UNBOXING_VIDEO_READY = true; // ✅ موافقة Meta مؤكَّدة 6 أغسطس 2026 (أعادت Meta تصنيفها MARKETING)

// يطبّع رقم الهاتف المحلي (سوري/تركي، غالباً يبدأ بصفر) لصيغة دولية +E.164.
function normalizePhone(raw: string | null | undefined, market: string | null | undefined): string | null {
  if (!raw) return null;
  let p = String(raw).replace(/[^\d+]/g, "");
  if (!p) return null;
  if (p.startsWith("+")) return p;
  if (p.startsWith("00")) return "+" + p.slice(2);
  p = p.replace(/^0+/, "");
  return (market === "turkey" ? "+90" : "+963") + p;
}

export interface OrderForWhatsApp {
  id?: string | number;
  order_id?: string | number;
  phone_1?: string | null;
  customer_name?: string | null;
}

// best-effort دائماً — لا ترمي استثناءً أبداً كي لا توقف دالة التتبّع الأصلية.
export async function notifyWhatsAppStatus(order: OrderForWhatsApp, newStatus: string, market: "syria" | "turkey") {
  try {
    const contentSid = TEMPLATE_SID[newStatus];
    if (!contentSid) return;
    const phone = normalizePhone(order.phone_1, market);
    if (!phone) return;
    const name = order.customer_name || "عميلنا العزيز";
    const orderNo = String(order.order_id ?? order.id ?? "");
    // {{3}} = رقم الطلب مكرَّر لزر "تتبّع الشحنة" (كل القوالب v2 الآن).
    const contentVariables: Record<string, string> = { "1": name, "2": orderNo, "3": orderNo };
    await fetch(WA_PROJECT_URL, {
      method: "POST",
      headers: { apikey: WA_ANON_KEY, Authorization: `Bearer ${WA_ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ phone, contentSid, contentVariables }),
    });
    if (newStatus === "delivered" && UNBOXING_VIDEO_READY) {
      await fetch(WA_PROJECT_URL, {
        method: "POST",
        headers: { apikey: WA_ANON_KEY, Authorization: `Bearer ${WA_ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ phone, contentSid: UNBOXING_VIDEO_SID, contentVariables: { "1": name, "2": orderNo } }),
      });
    }
  } catch {
    /* best-effort — لا نوقف تحديث الحالة الأصلي مهما حصل */
  }
}
