// =============================================================
// create-yurtici-shipment — Edge Function
// ينشئ شحنة Yurtiçi عبر SOAP createShipment، cargoKey = order_id.
// اختيار الحساب (_shared/yurticiAccounts.ts):
//   العقد 2 (1279282180) لكل شحنة جديدة متى ضُبطت أسرار YK2_* —
//   أجور الشحن على العميل ← AÖ، على الشركة ← GÖ؛ تحصيل عند الباب ← TAHSİLATLI.
//   بلا أسرار YK2_* ← العقد 1 (YURTICI_COD_* / YURTICI_NORMAL_* + DOCID) كما كان.
// يحفظ yurtici_cargo_key + yurtici_account + shipping_company ثم يزامن الجدول.
// test:true ← إنشاء ثم إلغاء فوري بلا لمس الطلب (+ forceAccount لتجربة حساب بعينه).
// debug:true ← وجود الأسرار (بلا قيم).
// =============================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getAccount, pickAccountId, contract2Ready, presence, ACCOUNT_IDS } from '../_shared/yurticiAccounts.ts';

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

// خادم يورتيتشي (IP واحد) يُسقط اتصالات بعض خوادم Supabase أحياناً — يعلق ~130ث
// ثم «tcp connect error» (سجلات 6–7 تشرين الأول 2026، كل المناطق). مهلة 15ث لكل
// محاولة (الطبيعي ~2ث) + 3 محاولات. إعادة المحاولة لا تُنشئ شحنة مكرّرة: cargoKey فريد عند يورتيتشي.
async function soap(inner: string): Promise<string> {
  const body = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ship="${NS}"><soapenv:Body>${inner}</soapenv:Body></soapenv:Envelope>`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '""' },
        body,
        signal: AbortSignal.timeout(15000),
      });
      return await res.text();
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const reqBody = await req.json();
    const { orderId, test, debug, forceAccount } = reqBody;

    // تشخيص: أي أسرار موجودة (بلا قيم) + هل العقد 2 جاهز.
    if (debug) return json({ ok: true, debug: true, contract2Ready: contract2Ready(), present: presence(),
      _env_ok_SUPABASE_URL: !!Deno.env.get('SUPABASE_URL') });

    if (!orderId) return json({ ok: false, error: 'orderId required' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!);
    const { data: o, error } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (error || !o) return json({ ok: false, error: 'order_not_found' }, 200);
    if (o.market !== 'turkey') return json({ ok: false, error: 'only_turkey', message: 'الربط متاح لطلبات تركيا فقط' }, 200);
    if (!test && o.yurtici_cargo_key) return json({ ok: false, error: 'already_created', message: 'الشحنة منشأة مسبقاً', cargoKey: o.yurtici_cargo_key }, 200);

    // تحصيل: نفس قاعدة yurticiRow (ملف Excel بـOrdersScreen) — طلب مدفوع فعلاً
    // (payment_status=paid) لا يُطلب تحصيله حتى لو طريقة الدفع «عند الباب». جزئي ← المتبقّي.
    const remaining = o.payment_status === 'partial' && Number(o.paid_amount) > 0
      ? Math.max(0, Number(o.amount) - Number(o.paid_amount)) : Number(o.amount || 0);
    const wantsCod = !isPrepaid(o) && o.payment_status !== 'paid' && remaining > 0;

    const accountId = test && forceAccount ? String(forceAccount) : pickAccountId(o.shipping_payer === 'customer', wantsCod);
    if (!ACCOUNT_IDS.includes(accountId)) return json({ ok: false, error: 'bad_account', account: accountId }, 200);
    const acc = getAccount(accountId);
    if (!acc) return json({ ok: false, error: 'secrets_missing', message: `أسرار يورتيتشي غير مضبوطة (${accountId})` }, 200);
    const cod = acc.cod;
    const codAmount = cod ? remaining : 0;

    // ttDocumentId = «Tahsilâtlı Teslimat Fatura No» (Long 12، رقم فاتورتنا — الدليل التقني).
    // العقد 1: الرقم الثابت المضبوط سابقاً بالأسرار. العقد 2: رقم فريد لكل شحنة.
    let docId = '';
    if (acc.contract === 1) {
      docId = Deno.env.get(cod ? 'YURTICI_COD_DOCID' : 'YURTICI_NORMAL_DOCID') || '';
      if (!docId) return json({ ok: false, error: 'secrets_missing', message: `أسرار يورتيتشي غير مضبوطة (${accountId} DOCID)` }, 200);
    } else if (cod) {
      docId = String(Date.now()).slice(-12);
    }

    // وضع الاختبار: مفتاح اختبار + إنشاء ثم إلغاء فوري بلا أي تعديل على الطلب.
    const cargoKey = test ? `TEST-${o.order_id || o.id}-${Date.now()}` : String(o.order_id || o.id);
    const phone = String(o.phone_1 || o.wa_number || '').replace(/\D/g, '');
    const itemsDesc = Array.isArray(o.items) ? o.items.map((it: any) => `${it.qty || 1}x ${it.name}`).join(', ').slice(0, 200) : '';

    // حقول التحصيل: العقد 1 يرسلها دائماً (كما كان مُختبَراً)؛ العقد 2 لحسابات TAHSİLATLI فقط.
    const ttFields = (acc.contract === 1 || cod)
      ? `<ttInvoiceAmount>${codAmount}</ttInvoiceAmount>` +
        `<ttDocumentId>${xmlEsc(docId)}</ttDocumentId>` +
        `<ttCollectionType>0</ttCollectionType><ttDocumentSaveType>1</ttDocumentSaveType>` +
        `<dcSelectedCredit>0</dcSelectedCredit><dcCreditRule>0</dcCreditRule>`
      : '';

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
      ttFields +
      `<description>${xmlEsc(itemsDesc)}</description>` +
      `</ShippingOrderVO>`;

    const r = await soap(
      `<ship:createShipment><wsUserName>${xmlEsc(acc.user)}</wsUserName><wsPassword>${xmlEsc(acc.pass)}</wsPassword><userLanguage>TR</userLanguage>${vo}</ship:createShipment>`
    );
    const outFlag = tag(r, 'outFlag');
    if (outFlag !== '0') {
      const err = tag(r, 'errMessage') || tag(r, 'outResult') || 'unknown';
      return json({ ok: false, error: 'yurtici_error', message: err, cod, account: accountId, test: !!test }, 200);
    }

    // وضع الاختبار: ألغِ فوراً (بلا طرد فعلي) ولا تمسّ الطلب.
    if (test) {
      const rc = await soap(
        `<ship:cancelShipment><wsUserName>${xmlEsc(acc.user)}</wsUserName><wsPassword>${xmlEsc(acc.pass)}</wsPassword><userLanguage>TR</userLanguage><cargoKeys>${xmlEsc(cargoKey)}</cargoKeys></ship:cancelShipment>`
      );
      const cancelled = tag(rc, 'operationStatus') === 'CNL' || tag(rc, 'outFlag') === '0';
      return json({ ok: true, test: true, created: true, cancelled, cargoKey, cod, codAmount, account: accountId });
    }

    // نجح — احفظ مفتاح الشحنة + الحساب + الشركة. (رقم التتبّع العام يأتي لاحقاً من track-yurtici.)
    await supabase.from('orders').update({
      yurtici_cargo_key: cargoKey,
      yurtici_account: accountId,
      shipping_company: 'Yurtiçi Kargo',
      updated_at: new Date().toISOString(),
    }).eq('id', orderId);

    // زامن الجدول (best-effort)
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-order-to-sheet`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    }).catch(() => {});

    return json({ ok: true, cargoKey, cod, codAmount, account: accountId });
  } catch (err) {
    console.error('[create-yurtici-shipment]', err);
    // انقطاع الشبكة مع يورتيتشي ← رسالة واضحة للموظف (200 كي تظهر بالـtoast كما هي).
    if (/timeout|timed out|connect/i.test(String(err))) return json({ ok: false, error: 'yurtici_unreachable',
      message: 'خادم يورتيتشي لم يستجب — أعد المحاولة بعد دقيقة' }, 200);
    return json({ ok: false, error: String(err) }, 500);
  }
});
