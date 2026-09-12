// =============================================================
// create-babel-shipment — Edge Function
// ينشئ شحنة بابل اكسبرس عبر API الرسمي (POST /createShipment)، reference=order_id
// (مطابقة دقيقة بالرقم — لا حاجة لمطابقة الاسم الهشة بعد اليوم لهذه الطلبات).
// AWB الراجع يُكتب مباشرة بـtracking_number، وwebhook babel-webhook (مفعّل
// أصلاً) يحدّث الحالة تلقائياً من هون حتى التسليم.
//
// Secrets المطلوبة (Supabase → Edge Functions → Secrets):
//   BABEL_API_USER / BABEL_API_PASS — نفس بيانات دخول لوحة تحكم بابل (Lowes Profesyonel)
// =============================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE = 'https://www.babel-express.com/api/v1/webservice.php';

function isPrepaid(o: any): boolean {
  const p = String(o.payment_method || '');
  return p.includes('مسبق') || p.includes('bank') || p.includes('بنك') || p.includes('حوالة') || /kredi|kart/i.test(p);
}

async function babel(path: string, body: unknown, auth: string): Promise<{ ok: boolean; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data?.status === 'success', data };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const { orderId, test, debug, cancelAwb, registerWebhook } = await req.json();

    if (debug) return json({ ok: true, debug: true, present: {
      BABEL_API_USER: !!Deno.env.get('BABEL_API_USER'),
      BABEL_API_PASS: !!Deno.env.get('BABEL_API_PASS'),
      BABEL_WEBHOOK_KEY: !!Deno.env.get('BABEL_WEBHOOK_KEY'),
    } });

    const user = Deno.env.get('BABEL_API_USER');
    const pass = Deno.env.get('BABEL_API_PASS');
    if (!user || !pass) return json({ ok: false, error: 'secrets_missing', message: 'أسرار بابل (BABEL_API_USER/BABEL_API_PASS) غير مضبوطة' }, 200);
    const auth = btoa(`${user}:${pass}`);

    // تسجيل/تحديث الـwebhook مرة واحدة (إدارية — لا تُستدعى من الواجهة). يقرأ
    // BABEL_WEBHOOK_KEY من الأسرار فلا يحتاج طرف الاستدعاء رؤية القيمة الفعلية.
    // مطابق تماماً لتوقيع babel-webhook/index.ts (sha256 awb|type|key) وقائمة
    // الأحداث الموثَّقة بـwebhooks.html (بينها ChangedReceiver غير المعالَجة
    // بمنطق الحالة عمداً — إشعار فقط).
    if (registerWebhook) {
      const key = Deno.env.get('BABEL_WEBHOOK_KEY');
      if (!key) return json({ ok: false, error: 'webhook_key_missing', message: 'BABEL_WEBHOOK_KEY غير مضبوط' }, 200);
      const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/babel-webhook`;
      const reg = await babel('/registerWebhook', {
        webhook: {
          enabled: true,
          url,
          key,
          subscribedEvents: [
            'ChangedReceiver', 'ArrivedToHub', 'EnRoute', 'DeliveryContact', 'DeliveryFailed',
            'CreatedFollowupShipment', 'OutForDelivery', 'Delivered', 'ReturnedToSender', 'Disposed', 'ShipmentLost',
          ],
        },
      }, auth);
      return json({ ok: reg.ok, url, babel: reg.data });
    }

    // إلغاء طارئ بالـawb مباشرة (تنظيف يدوي عند تعارض أو خطأ من طرف بابل).
    if (cancelAwb) {
      const del = await babel('/deleteShipment', { awb: cancelAwb }, auth);
      return json({ ok: del.ok, babel: del.data });
    }

    if (!orderId) return json({ ok: false, error: 'orderId required' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!);
    const { data: o, error } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (error || !o) return json({ ok: false, error: 'order_not_found' }, 200);
    if (o.market !== 'syria') return json({ ok: false, error: 'only_syria', message: 'الربط متاح لطلبات سوريا فقط' }, 200);
    if (!test && o.tracking_number) return json({ ok: false, error: 'already_created', message: 'الشحنة منشأة مسبقاً', awb: o.tracking_number }, 200);

    // حلّ العنوان الحر (مدينة+منطقة+عنوان) لحيّ بابل عبر findNeighbourhoodByAddress.
    const addrText = [o.city, o.district, o.address].filter(Boolean).join(' ').trim();
    if (!addrText) return json({ ok: false, error: 'no_address', message: 'الطلب بلا عنوان — أكمل المدينة/المنطقة/العنوان أولاً' }, 200);
    const found = await babel('/findNeighbourhoodByAddress', { address: addrText }, auth);
    if (!found.ok || !found.data?.neighbourhood?.id) {
      return json({ ok: false, error: 'address_not_matched', message: `لم يتعرّف بابل على العنوان: «${addrText}» — عدّل العنوان أو اختر الحي يدوياً`, babel: found.data }, 200);
    }
    const neighbourhoodId = found.data.neighbourhood.id;

    const phone = String(o.phone_1 || o.wa_number || '').replace(/\D/g, '').replace(/^0+/, '');
    const itemsDesc = Array.isArray(o.items) ? o.items.map((it: any) => `${it.qty || 1}x ${it.name}`).join(', ').slice(0, 200) : (o.items || 'بضاعة');

    const cod = !isPrepaid(o);
    const extraDelivery = o.shipping_payer === 'customer' ? Number(o.delivery_cost || 0) : 0;
    const codAmount = cod
      ? (o.payment_status === 'partial' && Number(o.paid_amount) > 0
          ? Math.max(0, Number(o.amount) - Number(o.paid_amount)) + extraDelivery
          : Number(o.amount || 0) + extraDelivery)
      : 0;

    // وضع الاختبار: مرجع مستقل مؤقت — أبداً نفس مرجع الطلب الحقيقي، لتفادي أي
    // تعارض/ربط عرضي بطلب فعلي (بابل قد تُنشئ الشحنة فعلياً رغم رجوع خطأ
    // تعارض المرجع — درس 2 سبتمبر 2026: اختبار كرّر مرجع طلب حقيقي وتسبّب
    // بشحنة حية غير مقصودة رُبطت بالطلب عبر import-babel-shipments بالاسم).
    const reference = test ? `TEST-${o.order_id || o.id}-${Date.now()}` : String(o.order_id ?? o.id);

    const shipmentBody = {
      shipment: {
        receiver: {
          // وضع الاختبار: اسم مصطنع لا يطابق أي عميل حقيقي — يمنع سكربت
          // الاستيراد بالاسم (babel-autosync/import-babel-shipments) من ربط
          // شحنة الاختبار خطأً بطلب حقيقي لو تأخّر الحذف عن ظهورها بالقائمة.
          name: test ? `TEST DO NOT SHIP ${Date.now()}` : (o.customer_name || '-'),
          phone: { country: '963', phone },
          address: addrText,
          neighbourhood: { id: neighbourhoodId },
        },
        type: 'box',
        parts: [{ weight: 1 }],
        contents: itemsDesc,
        reference,
        deliveryType: 'address',
        pickupType: 'address',
        cod: { amount: codAmount, currency: 'SYP' },
        payer: o.shipping_payer === 'customer' ? 'receiver' : 'reseller',
      },
    };

    let created = await babel('/createShipment', shipmentBody, auth);
    // بعض المناطق بلا توصيل للباب — بابل بترجع خطأ صريح يطلب hub، نعيد المحاولة فوراً.
    if (!created.ok && /no delivery service|try to change deliveryType/i.test(created.data?.errorMessage || '')) {
      shipmentBody.shipment.deliveryType = 'hub';
      created = await babel('/createShipment', shipmentBody, auth);
    }
    if (!created.ok) {
      return json({ ok: false, error: 'babel_error', message: created.data?.errorMessage || 'فشل إنشاء الشحنة', babel: created.data }, 200);
    }
    const awb = created.data.awb;

    if (test) {
      const del = await babel('/deleteShipment', { awb }, auth);
      return json({ ok: true, test: true, created: true, deleted: del.ok, awb, cod, codAmount });
    }

    await supabase.from('orders').update({
      tracking_number: awb,
      shipping_company: 'بابل اكسبرس',
      updated_by: 'بابل-API',
      updated_at: new Date().toISOString(),
    }).eq('id', orderId).is('deleted_at', null);

    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-order-to-sheet`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    }).catch(() => {});

    return json({ ok: true, awb, cod, codAmount });
  } catch (err) {
    console.error('[create-babel-shipment]', err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
