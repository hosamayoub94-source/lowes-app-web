// =============================================================
// create-yurtici-shipment — Edge Function
// ينشئ شحنة Yurtiçi عبر SOAP createShipment، cargoKey = order_id.
// طلبات COD (دفع عند الباب) → حساب التحصيل + مبلغ التحصيل.
// طلبات مدفوعة مسبقاً → الحساب العادي.
// يحفظ yurtici_cargo_key + shipping_company بالطلب ثم يزامن الجدول.
//
// Secrets المطلوبة (Supabase → Edge Functions → Secrets):
//   YURTICI_COD_USER / YURTICI_COD_PASS / YURTICI_COD_DOCID      (GÖ TAHSİLATLI)
//   YURTICI_NORMAL_USER / YURTICI_NORMAL_PASS / YURTICI_NORMAL_DOCID (GÖ NORMAL)
// =============================================================
// redeploy: التقاط أسرار يورتيتشي (10 يونيو 2026)
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const ENDPOINT = 'https://webservices.yurticikargo.com/KOPSWebServices/ShippingOrderDispatcherServices';
const NS = 'http://yurticikargo.com.tr/ShippingOrderDispatcherServices';

const xmlEsc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const tag = (r: string, name: string) => (r.match(new RegExp(`<${name}>(.*?)</${name}>`, 's'))?.[1] ?? '').trim();

// COD حين لا يكون الدفع مسبقاً/بنكياً.
const isPrepaid = (o: any) => {
  const p = String(o.payment_method || '');
  return p.includes('مسبق') || p.includes('bank') || p.includes('بنك') || p.includes('حوالة') || /kredi|kart/i.test(p);
};

async function soap(inner: string): Promise<string> {
  const body = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ship="${NS}"><soapenv:Body>${inner}</soapenv:Body></soapenv:Envelope>`;
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '""' },
    body,
  });
  return await res.text();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const reqBody = await req.json();
    const { orderId, test, debug } = reqBody;

    // تشخيص: يكشف أي أسماء أسرار موجودة (بلا قيم) + يؤكّد أن البيئة تعمل.
    if (debug) return json({ ok: true, debug: true, present: {
      YURTICI_COD_USER:    !!Deno.env.get('YURTICI_COD_USER'),
      YURTICI_COD_PASS:    !!Deno.env.get('YURTICI_COD_PASS'),
      YURTICI_COD_DOCID:   !!Deno.env.get('YURTICI_COD_DOCID'),
      YURTICI_NORMAL_USER: !!Deno.env.get('YURTICI_NORMAL_USER'),
      YURTICI_NORMAL_PASS: !!Deno.env.get('YURTICI_NORMAL_PASS'),
      YURTICI_NORMAL_DOCID:!!Deno.env.get('YURTICI_NORMAL_DOCID'),
      _env_ok_SUPABASE_URL: !!Deno.env.get('SUPABASE_URL'),
    } });

    if (!orderId) return json({ ok: false, error: 'orderId required' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: o, error } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (error || !o) return json({ ok: false, error: 'order_not_found' }, 200);
    if (o.market !== 'turkey') return json({ ok: false, error: 'only_turkey', message: 'الربط متاح لطلبات تركيا فقط' }, 200);
    if (!test && o.yurtici_cargo_key) return json({ ok: false, error: 'already_created', message: 'الشحنة منشأة مسبقاً', cargoKey: o.yurtici_cargo_key }, 200);

    // اختيار الحساب حسب نوع الدفع
    const cod = !isPrepaid(o);
    const user   = cod ? Deno.env.get('YURTICI_COD_USER')   : Deno.env.get('YURTICI_NORMAL_USER');
    const pass   = cod ? Deno.env.get('YURTICI_COD_PASS')   : Deno.env.get('YURTICI_NORMAL_PASS');
    const docId  = cod ? Deno.env.get('YURTICI_COD_DOCID')  : Deno.env.get('YURTICI_NORMAL_DOCID');
    if (!user || !pass || !docId) return json({ ok: false, error: 'secrets_missing', message: `أسرار يورتيتشي غير مضبوطة (${cod ? 'COD' : 'NORMAL'})` }, 200);

    // وضع الاختبار: مفتاح اختبار + إنشاء ثم إلغاء فوري بلا أي تعديل على الطلب.
    const cargoKey = test ? `TEST-${o.order_id || o.id}-${Date.now()}` : String(o.order_id || o.id);
    const phone = String(o.phone_1 || o.wa_number || '').replace(/\D/g, '');
    const itemsDesc = Array.isArray(o.items) ? o.items.map((it: any) => `${it.qty || 1}x ${it.name}`).join(', ').slice(0, 200) : '';
    // COD: مبلغ التحصيل = المتبقّي للجزئي وإلا الإجمالي. غير COD: 0.
    const codAmount = cod
      ? (o.payment_status === 'partial' && Number(o.paid_amount) > 0 ? Math.max(0, Number(o.amount) - Number(o.paid_amount)) : Number(o.amount || 0))
      : 0;

    const vo =
      `<ShippingOrderVO>` +
      `<cargoKey>${xmlEsc(cargoKey)}</cargoKey>` +
      `<invoiceKey>${xmlEsc(cargoKey)}</invoiceKey>` +
      `<receiverCustName>${xmlEsc(o.customer_name || '-')}</receiverCustName>` +
      `<receiverAddress>${xmlEsc(o.address || o.district || o.city || '-')}</receiverAddress>` +
      `<cityName>${xmlEsc(o.city || '')}</cityName>` +
      `<townName>${xmlEsc(o.district || '')}</townName>` +
      `<receiverPhone1>${xmlEsc(phone)}</receiverPhone1>` +
      `<taxOfficeId>0</taxOfficeId>` +
      `<cargoCount>1</cargoCount><desi>1</desi><kg>1</kg>` +
      `<ttInvoiceAmount>${codAmount}</ttInvoiceAmount>` +
      `<ttDocumentId>${xmlEsc(docId)}</ttDocumentId>` +
      `<ttCollectionType>0</ttCollectionType><ttDocumentSaveType>1</ttDocumentSaveType>` +
      `<dcSelectedCredit>0</dcSelectedCredit><dcCreditRule>0</dcCreditRule>` +
      `<description>${xmlEsc(itemsDesc)}</description>` +
      `</ShippingOrderVO>`;

    const r = await soap(
      `<ship:createShipment><wsUserName>${xmlEsc(user)}</wsUserName><wsPassword>${xmlEsc(pass)}</wsPassword><userLanguage>TR</userLanguage>${vo}</ship:createShipment>`
    );
    const outFlag = tag(r, 'outFlag');
    if (outFlag !== '0') {
      const err = tag(r, 'errMessage') || tag(r, 'outResult') || 'unknown';
      return json({ ok: false, error: 'yurtici_error', message: err, cod, test: !!test }, 200);
    }

    // وضع الاختبار: ألغِ فوراً (بلا طرد فعلي) ولا تمسّ الطلب.
    if (test) {
      const rc = await soap(
        `<ship:cancelShipment><wsUserName>${xmlEsc(user)}</wsUserName><wsPassword>${xmlEsc(pass)}</wsPassword><userLanguage>TR</userLanguage><cargoKeys>${xmlEsc(cargoKey)}</cargoKeys></ship:cancelShipment>`
      );
      const cancelled = tag(rc, 'operationStatus') === 'CNL' || tag(rc, 'outFlag') === '0';
      return json({ ok: true, test: true, created: true, cancelled, cargoKey, cod, codAmount, account: cod ? 'COD' : 'NORMAL' });
    }

    // نجح — احفظ مفتاح الشحنة + الشركة. (رقم التتبّع العام يأتي لاحقاً من track-yurtici.)
    await supabase.from('orders').update({
      yurtici_cargo_key: cargoKey,
      shipping_company: 'Yurtiçi Kargo',
      updated_at: new Date().toISOString(),
    }).eq('id', orderId);

    // زامن الجدول (best-effort)
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-order-to-sheet`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    }).catch(() => {});

    return json({ ok: true, cargoKey, cod, codAmount });
  } catch (err) {
    console.error('[create-yurtici-shipment]', err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
