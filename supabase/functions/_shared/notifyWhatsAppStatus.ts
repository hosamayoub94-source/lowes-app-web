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
// {{1}} = اسم العميل، {{2}} = رقم الطلب.
const TEMPLATE_SID: Record<string, string> = {
  shipped: "HXaf12020e320fbffba951eac64318d8ce",
  at_center: "HX430237ba5998ec6d99a041715dac99bb",
  on_way: "HX649f6747f5e4e59877cd734f9d258fff",
  delivered: "HXdf345ed4562848274f06e3a5fa5a5b94",
  cancelled: "HXfdc8e012f3c36d9110ffd5b0efd49d52",
  not_received: "HXf58a03f83c7adceeac99f32a6a26c29f",
  returning: "HX1b3f03e35175ea655ed9d50930b9b228",
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
    await fetch(WA_PROJECT_URL, {
      method: "POST",
      headers: { apikey: WA_ANON_KEY, Authorization: `Bearer ${WA_ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ phone, contentSid, contentVariables: { "1": name, "2": orderNo } }),
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
