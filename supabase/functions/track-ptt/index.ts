// track-ptt — Edge Function
// يتتبّع شحنات PTT Kargo (تركيا) عبر API عام غير موثَّق لكن يعمل بلا مصادقة:
// POST https://api.ptt.gov.tr/api/ShipmentTracking  body: JSON.stringify(barkod)
// اكتُشف حيّاً 29 يوليو 2026 من صفحة gonderitakip.ptt.gov.tr (تبويب «Gönderi Takip»).
// نفس نمط track-babel/track-yurtici: poll يدوي {manual:true} أو تلقائي كل 3 دقائق من
// الشاشة، يحدّث orders.status ويحترم RETURN_GUARD، ويزامن الجدول عبر sync-order-to-sheet.
// ════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;

const TERMINAL = ['delivered', 'returned', 'cancelled', 'settled'];
const RETURN_GUARD = ['returning', 'returned', 'not_received', 'cancelled', 'settled'];

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STATUS_AR: Record<string, string> = {
  preparing:'في التجهيز', at_center:'في المركز', shipped:'في النقل', on_way:'قيد التوصيل',
  delivered:'تم التسليم', not_received:'لم يتم الاستلام', returning:'راجع للمركز', returned:'راجع', cancelled:'ملغي',
};

// ترجمة نص PTT التركي → حالتنا. الحالات المرصودة حيّاً 29 يوليو 2026: «KABUL EDİLDİ»
// (استُلمت) «TRANSFER SÜRECİNDE»/«…AKTARMADA» (بالنقل) «DAĞITIMDA» (خرجت للتوصيل)
// «TESLİM EDİLDİ» (تم التسليم). نغطّي أشكالاً محتملة أخرى (إرجاع/تعذّر/إلغاء) بمرونة.
function mapPTT(raw: string): string | null {
  const t = (raw || '').toLocaleUpperCase('tr');
  if (!t) return null;
  if (t.includes('TESLİM EDİLDİ') || t.includes('TESLIM EDILDI')) return 'delivered';
  if (t.includes('İPTAL') || t.includes('IPTAL')) return 'cancelled';
  if (t.includes('İADE') || t.includes('IADE')) return 'returning';
  if (t.includes('TESLİM EDİLEMEDİ') || t.includes('TESLIM EDILEMEDI') || t.includes('BULUNAMADI') || t.includes('ADRESTE YOK')) return 'not_received';
  if (t.includes('DAĞITIMDA') || t.includes('DAGITIMDA')) return 'on_way';
  if (t.includes('AKTARMA') || t.includes('TRANSFER') || t.includes('MERKEZ')) return 'at_center';
  if (t.includes('KABUL EDİLDİ') || t.includes('KABUL EDILDI')) return 'shipped';
  return null;
}

// يستعلم PTT عن رقم تتبّع واحد. الـbody هو نص JSON خام (barkod مقتبَس)، لا كائن —
// أي شكل آخر يرجّع 400 «barkod field is required» (مُختبَر حيّاً).
async function fetchPTT(barkod: string): Promise<{ raw: string; found: boolean; timeline: { date: string; time: string; text: string; city: string }[] } | null> {
  try {
    const res = await fetch('https://api.ptt.gov.tr/api/ShipmentTracking', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(barkod),
    });
    if (!res.ok) return null;
    const arr = await res.json();
    const o = Array.isArray(arr) ? arr[0] : null;
    if (!o) return null;
    if (!o.errorState) return { raw: o.errorMessage || '', found: false, timeline: [] };
    const moves = Array.isArray(o.hareketDongu) ? o.hareketDongu : [];
    const last = moves[moves.length - 1];
    const raw = o?.sondurum?.son_durum_aciklama || last?.aciklama || '';
    const timeline = moves.map((m: any) => ({ date: m.tarih || '', time: m.saat || '', text: m.aciklama || '', city: m.il || '' }));
    return { raw, found: true, timeline };
  } catch { return null; }
}

async function notifySeller(supabase: any, order: any, newStatus: string) {
  try {
    if (!order?.handler_name) return;
    const { data: prof } = await supabase.from('profiles').select('id').eq('employee_name', order.handler_name).maybeSingle();
    if (!prof?.id) return;
    const label = STATUS_AR[newStatus] || newStatus;
    const title = `📦 تحديث حالة طلب ${order.customer_name || ''}`.trim();
    const message = `انتقل الطلب إلى «${label}» (من PTT Kargo).`;
    await supabase.from('notifications').insert({
      user_id: prof.id, type: 'system_alert', title, message,
      entity_type: 'order', entity_id: String(order.id), severity: 'info',
      metadata: { status: newStatus, source: 'ptt', kind: 'order_status_remote' },
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // وضع الاستعلام المفرد (لعرض المسار بالتطبيق لاحقاً): {trackingNumber:'…'}.
  let body: any = {};
  try { body = await req.json(); } catch { /* بلا جسم = cron */ }
  if (body?.trackingNumber) {
    const info = await fetchPTT(String(body.trackingNumber));
    if (!info) return json({ ok: false, error: 'lookup_failed' });
    if (!info.found) return json({ ok: true, found: false, raw: info.raw });
    return json({ ok: true, found: true, raw: info.raw, mapped: mapPTT(info.raw), timeline: info.timeline });
  }

  // المسار الجماعي: طلبات تركيا مع شركة PTT ورقم تتبّع وغير منتهية.
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_id, tracking_number, status, handler_name, customer_name, shipping_company')
    .eq('market', 'turkey')
    .ilike('shipping_company', '%PTT%')
    .not('tracking_number', 'is', null)
    .neq('tracking_number', '')
    .not('status', 'in', `(${TERMINAL.map(s => `"${s}"`).join(',')})`)
    .or('archived.is.null,archived.eq.false')
    .is('deleted_at', null);

  let updated = 0;
  const results: any[] = [];
  for (const o of (orders ?? [])) {
    try {
      const info = await fetchPTT(String(o.tracking_number).trim());
      if (!info || !info.found) { results.push({ order: o.order_id, note: info ? 'no_record' : 'lookup_failed' }); continue; }
      const newStatus = mapPTT(info.raw);
      results.push({ order: o.order_id, ptt: info.raw, mapped: newStatus, current: o.status });
      if (!newStatus || newStatus === o.status || RETURN_GUARD.includes(o.status)) continue;

      const { error: upErr } = await supabase.from('orders')
        .update({ status: newStatus, updated_by: 'PTT-تلقائي', updated_at: new Date().toISOString() })
        .eq('id', o.id).is('deleted_at', null);
      if (upErr) continue;
      updated++;
      await supabase.from('order_status_history').insert({
        order_id: o.id, from_status: o.status, to_status: newStatus, changed_by: 'PTT Kargo', source: 'ptt',
      }).then(() => {}, () => {});
      await notifySeller(supabase, o, newStatus);
      await syncSheet(o.id);
    } catch { /* skip this shipment */ }
  }

  return json({ ok: true, checked: orders?.length ?? 0, updated, results });
});
