// =============================================================
// send-whatsapp — إرسال رسائل واتساب عبر WhatsApp Cloud API (Meta)
// يُستخدم لإشعارات حالة الطلب (قوالب Utility) — بديل رسمي لا يُحظر.
//
// Secrets المطلوبة (Supabase → Edge Functions → Secrets):
//   WHATSAPP_TOKEN            ← التوكن من Meta (System User دائم، أو المؤقّت للتجربة)
//   WHATSAPP_PHONE_NUMBER_ID  ← «معرّف رقم الهاتف» من شاشة API Setup
//
// الاستدعاء (POST):
//   { "to": "9055xxxxxxx" }                              → يرسل قالب hello_world (تجربة)
//   { "to": "...", "template": "order_shipped",
//     "lang": "ar", "params": ["123","يورتيتشي"] }       → قالب مخصّص ببارامترات
//
// Deploy: supabase functions deploy send-whatsapp --no-verify-jwt
// =============================================================

const GRAPH_VERSION = 'v21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const TOKEN   = Deno.env.get('WHATSAPP_TOKEN');
  const PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  if (!TOKEN || !PHONE_ID) {
    return json({ ok: false, error: 'secrets_missing', need: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] }, 200);
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body allowed for default test */ }

  const to = String(body.to || '').replace(/[^\d]/g, ''); // أرقام فقط، صيغة دولية بلا +
  if (!to) return json({ ok: false, error: 'missing_to', hint: 'أرسل {"to":"9055xxxxxxx"}' }, 400);

  const templateName = body.template || 'hello_world';
  const lang         = body.lang || (templateName === 'hello_world' ? 'en_US' : 'ar');

  // بارامترات القالب (body variables) — تتحوّل لـ components عند الحاجة
  const params: string[] = Array.isArray(body.params) ? body.params.map((p: any) => String(p)) : [];
  const components = params.length
    ? [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }]
    : undefined;

  const payload: any = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name: templateName, language: { code: lang }, ...(components ? { components } : {}) },
  };

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      // رسالة Meta الحقيقية (مثلاً: الرقم غير مسجّل كمستقبِل اختبار، أو القالب غير معتمد)
      return json({ ok: false, status: res.status, error: data?.error ?? data }, 200);
    }
    return json({ ok: true, to, template: templateName, messageId: data?.messages?.[0]?.id ?? null });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 200);
  }
});
