// track-yurtici — Edge Function (SOAP)
// يستعلم Yurtiçi عن الطلبات المُنشأة عبر API (yurtici_cargo_key) ويحدّث الحالة.
// keyType=0 = cargoKey (= order_id). poll فقط (يورتيتشي بلا webhook).
// يُستدعى يدوياً {manual:true} أو من cron (بلا جسم) — كلاهما يعمل الآن.
// ════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;   // يُحقن تلقائياً — لا fallback مكشوف
const ENDPOINT = 'https://webservices.yurticikargo.com/KOPSWebServices/ShippingOrderDispatcherServices';
const NS = 'http://yurticikargo.com.tr/ShippingOrderDispatcherServices';

// نستعلم بحساب التحصيل (يرى كل شحنات الحساب 1200681314). NORMAL احتياطي.
const WS_USER = Deno.env.get('YURTICI_COD_USER') || Deno.env.get('YURTICI_NORMAL_USER');
const WS_PASS = Deno.env.get('YURTICI_COD_PASS') || Deno.env.get('YURTICI_NORMAL_PASS');

const TERMINAL = ['delivered', 'returned', 'cancelled', 'settled'];

// CORS — بدونها يفشل نداء التطبيق من المتصفح (preflight) صامتاً عبر .catch،
// فالتتبّع التلقائي من شاشة الطلبات لا يعمل إلا من cron. أضفناها 11 يونيو 2026.
const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STATUS_AR: Record<string, string> = {
  preparing:'في التجهيز', at_center:'في المركز', shipped:'في النقل', on_way:'قيد التوصيل',
  delivered:'تم التسليم', not_received:'لم يتم الاستلام', returning:'راجع للمركز', returned:'راجع', cancelled:'ملغي',
};

// ترجمة رد يورتيتشي → حالتنا. تعتمد operationStatus + النص التركي (مرن).
// ملاحظة: أكواد operationStatus الدقيقة للتسليم/النقل تُحسم من أول شحنات حقيقية —
// نعتمد مطابقة النص (مغطّاة جيداً) ونسجّل المجهول.
function mapStatus(opStatus: string, text: string): string | null {
  const s = (opStatus || '').toUpperCase();
  const t = (text || '').toLocaleLowerCase('tr');
  if (s === 'CNL' || t.includes('iptal')) return 'cancelled';
  if (s === 'NOP' || t.includes('işlem görmemiş')) return null;            // أُنشئت ولم تُشحن بعد
  if (t.includes('teslim edildi') || t.includes('teslim edilmiş')) return 'delivered';
  if (t.includes('teslim edilemedi') || t.includes('bulunamadı') || t.includes('adreste yok')) return 'not_received';
  if (t.includes('iade')) return 'returning';
  if (t.includes('dağıtım')) return 'on_way';
  if (t.includes('şube') || t.includes('aktarma') || t.includes('transfer') || t.includes('merkez')) return 'at_center';
  if (t.includes('çıkış') || t.includes('kabul') || t.includes('taşıma') || t.includes('yola çık')) return 'shipped';
  return null;
}

async function soap(inner: string): Promise<string> {
  const body = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ship="${NS}"><soapenv:Body>${inner}</soapenv:Body></soapenv:Envelope>`;
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '""' }, body });
  return await res.text();
}

// يستعلم عن دفعة مفاتيح من نوع keyType (0=cargoKey للشحنات المُنشأة بالـAPI ·
// 1=invoiceKey = «İrsaliye Numarası» الذي يضعه ملف Excel = order_id لشحنات الرفع).
// يرجّع map: <المفتاح المُستعلَم به> → {opStatus, text, trackingNo}.
async function queryBatch(keys: string[], keyType = 0): Promise<Record<string, { opStatus: string; text: string; trackingNo: string }>> {
  const keysXml = keys.map(k => `<keys>${String(k).replace(/[<>&]/g, '')}</keys>`).join('');
  const r = await soap(
    `<ship:queryShipment><wsUserName>${WS_USER}</wsUserName><wsPassword>${WS_PASS}</wsPassword><wsLanguage>TR</wsLanguage>${keysXml}<keyType>${keyType}</keyType><addHistoricalData>true</addHistoricalData><onlyTracking>false</onlyTracking></ship:queryShipment>`
  );
  const out: Record<string, any> = {};
  // كل شحنة داخل <shippingDeliveryDetailVO>...
  const blocks = r.match(/<shippingDeliveryDetailVO>[\s\S]*?<\/shippingDeliveryDetailVO>/g) || [];
  for (const b of blocks) {
    // فهرس الخرج بنفس نوع المفتاح المُستعلَم به (cargoKey لـ0، invoiceKey لـ1)
    const cargoKey   = (b.match(/<cargoKey>(.*?)<\/cargoKey>/)?.[1] || '').trim();
    const invoiceKey = (b.match(/<invoiceKey>(.*?)<\/invoiceKey>/)?.[1] || '').trim();
    const k = keyType === 1 ? invoiceKey : cargoKey;
    if (!k) continue;
    const opStatus = (b.match(/<operationStatus>(.*?)<\/operationStatus>/)?.[1] || '').trim();
    // آخر حركة (إن وُجدت) أدقّ من operationMessage العام
    const moves = b.match(/<operationMessage>(.*?)<\/operationMessage>/g) || [];
    const text = moves.map(m => m.replace(/<\/?operationMessage>/g, '')).join(' ');
    const trackingNo = (b.match(/<cargoTrackingNumber>(.*?)<\/cargoTrackingNumber>/)?.[1]
      || b.match(/<documentNo>(.*?)<\/documentNo>/)?.[1] || '').trim();
    if (!out[k] || (!out[k].opStatus && opStatus)) out[k] = { opStatus, text, trackingNo };
  }
  return out;
}

async function notifySeller(supabase: any, order: any, newStatus: string) {
  try {
    if (!order?.handler_name) return;
    const { data: prof } = await supabase.from('profiles').select('id').eq('employee_name', order.handler_name).maybeSingle();
    if (!prof?.id) return;
    const label = STATUS_AR[newStatus] || newStatus;
    const title = `📦 تحديث حالة طلب ${order.customer_name || ''}`.trim();
    const message = `انتقل الطلب إلى «${label}» (من يورتيتشي).`;
    await supabase.from('notifications').insert({
      user_id: prof.id, type: 'system_alert', title, message,
      entity_type: 'order', entity_id: String(order.id), severity: 'info',
      metadata: { status: newStatus, source: 'yurtici', kind: 'order_status_remote' },
      dedup_key: `${prof.id}|order_status|${order.id}|${newStatus}`,
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

// يحوّل ShipmentStatus (نص API يورتيتشي العام) → مفتاح حالة التطبيق.
function mapPublic(shipmentStatus: string, isDelivered: unknown): string | null {
  const t = (shipmentStatus || '').toLocaleLowerCase('tr');
  if (isDelivered === true || isDelivered === 'true' || t.includes('teslim edildi')) return 'delivered';
  if (t.includes('teslim edilemedi') || t.includes('bulunamad') || t.includes('adreste yok')) return 'not_received';
  if (t.includes('iade')) return 'returning';
  if (t.includes('iptal')) return 'cancelled';
  if (t.includes('dağıt') || t.includes('dagit')) return 'on_way';
  if (t.includes('şube') || t.includes('sube') || t.includes('aktarma') || t.includes('transfer') || t.includes('merkez')) return 'at_center';
  if (t.includes('taşı') || t.includes('tasi') || t.includes('yola') || t.includes('çık') || t.includes('cik') || t.includes('kabul')) return 'shipped';
  return null; // NOP / işlem görmemiş / غير معروف
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (!WS_USER || !WS_PASS) return json({ ok: false, error: 'secrets_missing' }, 200);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // طلبات تركيا المُنشأة عبر API (yurtici_cargo_key) وغير منتهية → تتبّع SOAP.
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_id, yurtici_cargo_key, tracking_number, status, handler_name, customer_name')
    .eq('market', 'turkey')
    .not('yurtici_cargo_key', 'is', null)
    .not('status', 'in', `(${TERMINAL.map(s => `"${s}"`).join(',')})`)
    .or('archived.is.null,archived.eq.false')
    .is('deleted_at', null);

  const BATCH = 50;
  let updated = 0;
  const results: any[] = [];
  const soapOrders = orders ?? [];

  for (let i = 0; i < soapOrders.length; i += BATCH) {
    const batch = soapOrders.slice(i, i + BATCH);
    // keyType=0 (cargoKey = order_id لشحنات API). ملاحظة: شحنات الرفع بـExcel
    // لا يتعرّف عليها يورتيتشي بـorder_id (لا cargoKey ولا invoiceKey — مُختبَر
    // حيّاً 11 يونيو)، فمفتاحها الحقيقي يجب جلبه من Teslim Listesi.
    const map = await queryBatch(batch.map(o => o.yurtici_cargo_key), 0);
    for (const o of batch) {
      const hit = map[o.yurtici_cargo_key];
      if (!hit) { results.push({ order: o.order_id, note: 'no_response' }); continue; }
      const newStatus = mapStatus(hit.opStatus, hit.text);
      results.push({ order: o.order_id, opStatus: hit.opStatus, mapped: newStatus, current: o.status });

      const patch: any = {};
      if (hit.trackingNo && hit.trackingNo !== o.tracking_number) patch.tracking_number = hit.trackingNo;
      if (newStatus && newStatus !== o.status) { patch.status = newStatus; patch.updated_by = 'يورتيتشي-تلقائي'; }
      if (Object.keys(patch).length === 0) continue;

      patch.updated_at = new Date().toISOString();
      const { error: upErr } = await supabase.from('orders').update(patch).eq('id', o.id);
      if (upErr) continue;

      if (patch.status) {
        updated++;
        await supabase.from('order_status_history').insert({
          order_id: o.id, from_status: o.status, to_status: newStatus, changed_by: 'يورتيتشي', source: 'yurtici',
        }).then(() => {}, () => {});
        await notifySeller(supabase, o, newStatus);
      }
      await syncSheet(o.id);
    }
  }

  // ── المسار العام: شحنات الرفع بـExcel (رقم تتبّع عام، بلا cargoKey) ──
  // API يورتيتشي العام بلا مصادقة: /service/shipmentstracking?id=<tracking>&language=tr.
  // يحلّ ما يعجز عنه SOAP (order_id لا يطابق مفتاح شحنات الرفع). متوازٍ مع مؤقّت
  // Apps Script (كلاهما idempotent) — هذا المسار يخدم «التحديث الفوري عند فتح الشاشة».
  const { data: pub } = await supabase
    .from('orders')
    .select('id, order_id, tracking_number, status, handler_name, customer_name')
    .eq('market', 'turkey')
    .is('yurtici_cargo_key', null)
    .not('tracking_number', 'is', null)
    .neq('tracking_number', '')
    .not('status', 'in', `(${TERMINAL.map(s => `"${s}"`).join(',')})`)
    .or('archived.is.null,archived.eq.false')
    .is('deleted_at', null);
  for (const o of (pub ?? [])) {
    try {
      const r = await fetch(`https://www.yurticikargo.com/service/shipmentstracking?id=${encodeURIComponent(o.tracking_number)}&language=tr`);
      if (!r.ok) continue;
      const j = await r.json();
      const newStatus = mapPublic(j.ShipmentStatus, j.IsDelivered);
      if (!newStatus || newStatus === o.status) continue;
      const { error: e2 } = await supabase.from('orders')
        .update({ status: newStatus, updated_by: 'يورتيتشي-تلقائي', updated_at: new Date().toISOString() })
        .eq('id', o.id).is('deleted_at', null);
      if (e2) continue;
      updated++;
      results.push({ order: o.order_id, public: j.ShipmentStatus, mapped: newStatus });
      await supabase.from('order_status_history').insert({
        order_id: o.id, from_status: o.status, to_status: newStatus, changed_by: 'يورتيتشي', source: 'yurtici',
      }).then(() => {}, () => {});
      await notifySeller(supabase, o, newStatus);
      await syncSheet(o.id);
    } catch { /* skip this shipment */ }
  }

  return json({ ok: true, checked: soapOrders.length + (pub?.length ?? 0), updated, results });
});
