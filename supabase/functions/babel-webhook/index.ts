// babel-webhook — Edge Function
// نقطة استقبال webhook بابل اكسبرس الرسمية (POST /registerWebhook بحسابهم).
// بابل ترسل POST فوري لهون بمجرد تغيّر حالة أي شحنة (بدل الـpolling القديم
// بـtrack-babel وبدل سكربت babel-autosync/sync.mjs اللي بيفتح متصفح ليسحب
// صفحة «شحناتي» — كلاهما يبقى شغّال كخط احتياطي، هاي الطريقة الأساسية الآن).
//
// التحقق: verify = sha256(`${awb}|${type}|${BABEL_WEBHOOK_KEY}`) — لازم يطابق
// تماماً وإلا 401 (رفض توقيع مزوَّر). المفتاح BABEL_WEBHOOK_KEY نفسه المُستخدم
// عند تسجيل الـwebhook بـ/registerWebhook (secret بمشروع Supabase، وليس بالكود).
//
// المطابقة: بالـawb (tracking_number) — نفس ما يفعله track-babel، لأن الشحنات
// حالياً تُنشأ يدوياً على موقع بابل (لا createShipment API بعد)، فحقل reference
// غير موثوق. لو صار إنشاء الشحنات عبر API لاحقاً بreference=order_id، يمكن
// إضافة مطابقة إضافية بالـreference كخط ثانٍ.
// ════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2';
import { notifyWhatsAppStatus } from '../_shared/notifyWhatsAppStatus.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
const WEBHOOK_KEY  = Deno.env.get('BABEL_WEBHOOK_KEY') ?? '';

// حالات يملكها الفريق: لا يدوسها التحديث التلقائي (يمنع ترفرف مُسلَّم ↔ راجع).
const RETURN_GUARD = ['returning', 'returned', 'not_received', 'cancelled', 'settled'];

const STATUS_AR: Record<string, string> = {
  preparing:'في التجهيز', at_center:'في المركز', shipped:'في النقل', on_way:'قيد التوصيل',
  delivered:'تم التسليم', not_received:'لم يتم الاستلام', returning:'راجع للمركز', returned:'راجع', cancelled:'ملغي',
};

// أحداث بابل → حالتنا. أحداث بلا مطابقة واضحة (DeliveryContact نتيجة محاولة
// اتصال فقط، CreatedFollowupShipment إشعار إنشاء شحنة تابعة، Disposed/ShipmentLost
// تحتاج قرار بشري) لا تُغيّر status تلقائياً، فقط تُسجَّل كإشعار للبائع.
const EVENT_STATUS: Record<string, string | null> = {
  ArrivedToHub: 'at_center',
  EnRoute: 'shipped',
  OutForDelivery: 'on_way',
  Delivered: 'delivered',
  DeliveryFailed: 'not_received',
  ReturnedToSender: 'returned',
  DeliveryContact: null,
  CreatedFollowupShipment: null,
  Disposed: null,
  ShipmentLost: null,
  ChangedReceiver: null,
};

const EVENT_AR: Record<string, string> = {
  ArrivedToHub: 'وصلت لمركز فرز', EnRoute: 'ضمن النقل', OutForDelivery: 'خرجت للتوصيل',
  Delivered: 'تم التسليم', DeliveryFailed: 'فشل التسليم', ReturnedToSender: 'رجعت للمرسل',
  DeliveryContact: 'محاولة اتصال بالمستلم', CreatedFollowupShipment: 'أُنشئت شحنة تابعة',
  Disposed: 'أُتلفت الشحنة', ShipmentLost: '⚠️ الشحنة مفقودة',
  ChangedReceiver: 'تغيّرت بيانات المستلم',
};

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function notifySeller(supabase: any, order: any, kind: string, isStatusChange: boolean) {
  try {
    if (!order?.handler_name) return;
    const { data: prof } = await supabase.from('profiles').select('id').eq('employee_name', order.handler_name).maybeSingle();
    if (!prof?.id) return;
    const label = isStatusChange ? (STATUS_AR[kind] || kind) : (EVENT_AR[kind] || kind);
    const title = `📦 تحديث شحنة ${order.customer_name || ''}`.trim();
    const message = `${label} (بابل اكسبرس — طلب ${order.order_id ?? order.id}).`;
    await supabase.from('notifications').insert({
      user_id: prof.id, type: 'system_alert', title, message,
      entity_type: 'order', entity_id: String(order.id), severity: kind === 'ShipmentLost' ? 'warning' : 'info',
      metadata: { source: 'babel_webhook', event: kind, status: isStatusChange ? kind : null },
      dedup_key: `${prof.id}|babel_webhook|${order.id}|${kind}`,
    }).then(() => {}, () => {});
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST', headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: prof.id, title, body: message, url: '/orders' }),
    }).then(() => {}, () => {});
  } catch { /* best-effort */ }
}

async function syncSheet(orderId: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/sync-order-to-sheet`, {
      method: 'POST', headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
  } catch { /* best-effort */ }
}

Deno.serve(async (req) => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return json({ status: 'error', error: 'method_not_allowed' }, 400);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ status: 'error', error: 'bad_json' }, 400); }

  // فحص أوّلي: طلب الاختبار الذي يرسله بابل عند تسجيل الـwebhook.
  if (body?.type === 'test') return json({ status: 'success' });

  const { type, awb, reference, verify } = body || {};
  if (!type || !awb || !verify) return json({ status: 'error', error: 'invalid_payload' }, 400);
  if (!WEBHOOK_KEY) return json({ status: 'error', error: 'server_not_configured' }, 400);

  const expected = await sha256Hex(`${awb}|${type}|${WEBHOOK_KEY}`);
  if (expected !== String(verify)) return json({ status: 'error', error: 'signature_mismatch' }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: order } = await supabase
    .from('orders')
    .select('id, order_id, customer_name, phone_1, status, handler_name, market, sheet_synced')
    .eq('market', 'syria')
    .eq('tracking_number', String(awb).trim())
    .is('deleted_at', null)
    .maybeSingle();

  if (!order) {
    // لا طلب مطابق (مثلاً شحنة تجريبية أو رقم غير مستورَد بعد) — نقبل الحدث
    // بصمت حتى لا تعيد بابل الإرسال باعتباره فشلاً.
    return json({ status: 'success', note: 'no_matching_order', awb, reference });
  }

  const newStatus = EVENT_STATUS[type] ?? null;
  const isStatusChange = !!newStatus && newStatus !== order.status && !RETURN_GUARD.includes(order.status);

  if (isStatusChange) {
    const { error: upErr } = await supabase.from('orders')
      .update({ status: newStatus, updated_by: 'بابل-webhook', updated_at: new Date().toISOString() })
      .eq('id', order.id).is('deleted_at', null);
    if (!upErr) {
      await supabase.from('order_status_history').insert({
        order_id: order.id, from_status: order.status, to_status: newStatus, changed_by: 'بابل اكسبرس', source: 'babel_webhook',
      }).then(() => {}, () => {});
      await notifySeller(supabase, order, newStatus, true);
      await notifyWhatsAppStatus(order, newStatus, 'syria');
      if (!(['delivered', 'returned', 'cancelled'].includes(newStatus) && !order.sheet_synced)) await syncSheet(order.id);
    }
  } else {
    // حدث بلا تغيير حالة تلقائي (أو حالة محمية) — نكتفي بإشعار البائع.
    await notifySeller(supabase, order, type, false);
  }

  return json({ status: 'success' });
});
