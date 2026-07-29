// track-karam — Edge Function
// يتتبّع شحنات شركة الكرم (سوريا) عبر صفحة التتبّع العامة (SSR، بلا مصادقة):
// https://newpost.mrkaram.com/track/<رقم التتبع>
// نفس نمط track-babel/track-ptt: poll يدوي {manual:true} أو cron، يحدّث orders.status
// ويحترم حالات الفريق (RETURN_GUARD) ويسجّل order_status_history + إشعار للبائع.
// اكتُشفت الصفحة العامة حيّاً 29 يوليو 2026 (لا تحتاج تسجيل دخول رغم أن /api/customer/*
// محمي بجلسة — /track/<id> منفصلة ومفتوحة، تعرض «مراحل الطرد» كخط زمني كامل).
// ════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;

const TERMINAL = ['delivered', 'returned', 'cancelled', 'settled'];
// حالات يملكها الفريق: لا يدوسها التتبّع التلقائي (يمنع ترفرف مُسلَّم ↔ راجع).
const RETURN_GUARD = ['returning', 'returned', 'not_received', 'cancelled', 'settled'];

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STATUS_AR: Record<string, string> = {
  preparing:'في التجهيز', at_center:'في المركز', shipped:'في النقل', on_way:'قيد التوصيل',
  delivered:'تم التسليم', not_received:'لم يتم الاستلام', returning:'راجع للمركز', returned:'راجع', cancelled:'ملغي',
};

// ترجمة حالة الكرم (نص عربي من شارة المرحلة) → حالتنا.
// الحالات المرصودة حيّاً 29 يوليو 2026: «تم الانشاء» «قيد النقل إلى مركز التجميع»
// «في مركز التجميع» «جاهزة للتسليم» «تم التسليم» «مرتجع». نسجّل المجهول (null).
function mapKaram(raw: string): string | null {
  const t = (raw || '').trim();
  if (!t) return null;
  if (t.includes('تم التسليم') || t.includes('تم تسليم')) return 'delivered';
  if (t.includes('ملغ') || t.includes('الغاء') || t.includes('إلغاء')) return 'cancelled';
  if (t.includes('مرتجع') || t.includes('راجع') || t.includes('إعادة') || t.includes('اعادة')) return 'returning';
  if (t.includes('تعذر') || t.includes('لم يتم التسليم') || t.includes('رفض')) return 'not_received';
  if (t.includes('جاهز') || t.includes('خرج')) return 'on_way';
  if (t.includes('مركز التجميع') && t.includes('قيد النقل')) return 'shipped';
  if (t.includes('مركز التجميع')) return 'at_center';
  if (t.includes('قيد النقل')) return 'shipped';
  if (t.includes('الانشاء') || t.includes('الإنشاء')) return null; // بوليصة أُنشئت فقط — لم تتحرك بعد
  return null;
}

// يجلب صفحة التتبّع العامة ويستخرج شارات «مراحل الطرد» (الأحدث أولاً) + تواريخها.
// badges[0] هو الحالة الحالية. يعمل على الـHTML الخام مباشرة (بلا تنظيف وسوم مسبق)
// لأن بعض الوسوم بمصدر الصفحة تمتد لعدة أسطر.
async function fetchKaram(trackingNumber: string): Promise<{ raw: string; timeline: { date: string; time: string; text: string }[] } | null> {
  const res = await fetch(`https://newpost.mrkaram.com/track/${encodeURIComponent(trackingNumber)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LowesTracker/1.0)' },
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const html = await res.text();

  const badgeRe = /uppercase tracking-wider">\s*([^<]+?)\s*<\/span>/g;
  const dateRe  = /📅\s*(\d{4}\/\d{2}\/\d{2})\s*-\s*(\d{2}:\d{2}\s*[AP]M)/g;
  const badges: string[] = [];
  const dates: { date: string; time: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = badgeRe.exec(html))) badges.push(m[1].trim());
  while ((m = dateRe.exec(html))) dates.push({ date: m[1], time: m[2] });
  if (badges.length === 0) return null;

  const timeline = badges.map((text, i) => ({ text, date: dates[i]?.date || '', time: dates[i]?.time || '' }));
  return { raw: badges[0], timeline };
}

async function notifySeller(supabase: any, order: any, newStatus: string) {
  try {
    if (!order?.handler_name) return;
    const { data: prof } = await supabase.from('profiles').select('id').eq('employee_name', order.handler_name).maybeSingle();
    if (!prof?.id) return;
    const label = STATUS_AR[newStatus] || newStatus;
    const title = `📦 تحديث حالة طلب ${order.customer_name || ''}`.trim();
    const message = `انتقل الطلب إلى «${label}» (من شركة الكرم).`;
    await supabase.from('notifications').insert({
      user_id: prof.id, type: 'system_alert', title, message,
      entity_type: 'order', entity_id: String(order.id), severity: 'info',
      metadata: { status: newStatus, source: 'karam', kind: 'order_status_remote' },
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

  // وضع الاستعلام المفرد (لعرض الخط الزمني بالتطبيق): {trackingNumber:'…'} → يرجّع
  // الحالة والخط الزمني دون لمس قاعدة البيانات.
  let body: any = {};
  try { body = await req.json(); } catch { /* بلا جسم = cron */ }
  if (body?.trackingNumber) {
    const info = await fetchKaram(String(body.trackingNumber));
    if (!info) return json({ ok: false, error: 'not_found' });
    return json({ ok: true, raw: info.raw, mapped: mapKaram(info.raw), timeline: info.timeline });
  }

  // المسار الجماعي: طلبات سوريا مع شركة الكرم ورقم تتبّع وغير منتهية.
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_id, tracking_number, status, handler_name, customer_name, shipping_company, sheet_synced')
    .eq('market', 'syria')
    .ilike('shipping_company', '%كرم%')
    .not('tracking_number', 'is', null)
    .neq('tracking_number', '')
    .not('status', 'in', `(${TERMINAL.map(s => `"${s}"`).join(',')})`)
    .or('archived.is.null,archived.eq.false')
    .is('deleted_at', null);

  let updated = 0;
  const results: any[] = [];
  for (const o of (orders ?? [])) {
    try {
      const info = await fetchKaram(String(o.tracking_number).trim());
      if (!info) { results.push({ order: o.order_id, note: 'not_found' }); continue; }
      const newStatus = mapKaram(info.raw);
      results.push({ order: o.order_id, karam: info.raw, mapped: newStatus, current: o.status });
      if (!newStatus || newStatus === o.status || RETURN_GUARD.includes(o.status)) continue;

      const { error: upErr } = await supabase.from('orders')
        .update({ status: newStatus, updated_by: 'الكرم-تلقائي', updated_at: new Date().toISOString() })
        .eq('id', o.id).is('deleted_at', null);
      if (upErr) continue;
      updated++;
      await supabase.from('order_status_history').insert({
        order_id: o.id, from_status: o.status, to_status: newStatus, changed_by: 'شركة الكرم', source: 'karam',
      }).then(() => {}, () => {});
      await notifySeller(supabase, o, newStatus);
      // 🛡️ لا تدفع للجدول طلباً نهائياً لم يُزامَن معه أصلاً من قبل — بگ حقيقي
      // 29 يوليو 2026 (طلبات قديمة تُلحَق كصفوف «جديدة» وهمية). راجع track-babel/track-ptt.
      if (!(TERMINAL.includes(newStatus) && !o.sheet_synced)) await syncSheet(o.id);
    } catch { /* skip this shipment */ }
  }

  return json({ ok: true, checked: orders?.length ?? 0, updated, results });
});
