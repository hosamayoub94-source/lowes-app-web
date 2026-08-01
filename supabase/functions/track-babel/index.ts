// track-babel — Edge Function
// يتتبّع شحنات بابل اكسبرس (سوريا) عبر صفحة التتبّع العامة (SSR، بلا مصادقة):
// https://www.babel-express.com/track?awb=<رقم الشحنة>
// نفس نمط track-yurtici: poll يدوي {manual:true} أو cron، يحدّث orders.status
// ويحترم حالات الفريق (RETURN_GUARD) ويسجّل order_status_history + إشعار للبائع.
// ════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2';
import { notifyWhatsAppStatus } from '../_shared/notifyWhatsAppStatus.ts';

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

// ترجمة حالة بابل (نص عربي من الصفحة) → حالتنا.
// الحالات المرصودة حيّاً 28 يوليو 2026: «تم تكوين الشحنة» «ضمن النقل»
// «موجودة في مركز التسليم - …» «خرجت للتسليم» «تم التسليم». نسجّل المجهول.
function mapBabel(raw: string): string | null {
  const t = (raw || '').trim();
  if (!t) return null;
  if (t.includes('تم التسليم') || t.includes('تم تسليم')) return 'delivered';
  if (t.includes('ملغ') || t.includes('ألغيت') || t.includes('الغاء') || t.includes('إلغاء')) return 'cancelled';
  if (t.includes('مرتجع') || t.includes('راجع') || t.includes('إعادة') || t.includes('اعادة') || t.includes('مردود')) return 'returning';
  if (t.includes('تعذر التسليم') || t.includes('لم يتم التسليم') || t.includes('رفض')) return 'not_received';
  if (t.includes('خرجت للتسليم') || t.includes('خرجت الشحنة للتسليم')) return 'on_way';
  if (t.includes('مركز التسليم')) return 'at_center';
  if (t.includes('ضمن النقل') || t.includes('تم استلام الشحنة')) return 'shipped';
  if (t.includes('تكوين')) return null; // بوليصة مُنشأة فقط — لم تتحرك بعد
  return null;
}

// يجلب صفحة التتبّع العامة ويستخرج «حالة الشحنة» + الخط الزمني من الـHTML (SSR).
async function fetchBabel(awb: string): Promise<{ raw: string; timeline: { date: string; time: string; text: string }[] } | null> {
  const res = await fetch(`https://www.babel-express.com/track?awb=${encodeURIComponent(awb)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LowesTracker/1.0)' },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ');
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  const i = lines.indexOf('حالة الشحنة');
  if (i === -1 || !lines[i + 1]) return null;
  const raw = lines[i + 1];
  // الخط الزمني: تسلسل «تاريخ dd/mm/yyyy ثم وقت ثم نص الحدث» بعد قسم المستلم.
  const timeline: { date: string; time: string; text: string }[] = [];
  for (let k = i; k < lines.length - 2; k++) {
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(lines[k]) && /^\d{2}:\d{2}\s*[صم]$/.test(lines[k + 1])) {
      timeline.push({ date: lines[k], time: lines[k + 1], text: lines[k + 2] || '' });
    }
  }
  return { raw, timeline };
}

async function notifySeller(supabase: any, order: any, newStatus: string) {
  try {
    if (!order?.handler_name) return;
    const { data: prof } = await supabase.from('profiles').select('id').eq('employee_name', order.handler_name).maybeSingle();
    if (!prof?.id) return;
    const label = STATUS_AR[newStatus] || newStatus;
    const title = `📦 تحديث حالة طلب ${order.customer_name || ''}`.trim();
    const message = `انتقل الطلب إلى «${label}» (من بابل اكسبرس).`;
    await supabase.from('notifications').insert({
      user_id: prof.id, type: 'system_alert', title, message,
      entity_type: 'order', entity_id: String(order.id), severity: 'info',
      metadata: { status: newStatus, source: 'babel', kind: 'order_status_remote' },
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

  // وضع الاستعلام المفرد (لعرض الخط الزمني بالتطبيق): {awb:'…'} → يرجّع الحالة
  // والخط الزمني دون لمس قاعدة البيانات.
  let body: any = {};
  try { body = await req.json(); } catch { /* بلا جسم = cron */ }
  if (body?.awb) {
    const info = await fetchBabel(String(body.awb));
    if (!info) return json({ ok: false, error: 'not_found' });
    return json({ ok: true, raw: info.raw, mapped: mapBabel(info.raw), timeline: info.timeline });
  }

  // المسار الجماعي: طلبات سوريا مع شركة بابل ورقم تتبّع وغير منتهية.
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_id, tracking_number, status, handler_name, customer_name, phone_1, shipping_company, sheet_synced')
    .eq('market', 'syria')
    .ilike('shipping_company', '%بابل%')
    .not('tracking_number', 'is', null)
    .neq('tracking_number', '')
    .not('status', 'in', `(${TERMINAL.map(s => `"${s}"`).join(',')})`)
    .or('archived.is.null,archived.eq.false')
    .is('deleted_at', null);

  let updated = 0;
  const results: any[] = [];
  for (const o of (orders ?? [])) {
    try {
      const info = await fetchBabel(String(o.tracking_number).trim());
      if (!info) { results.push({ order: o.order_id, note: 'no_response' }); continue; }
      const newStatus = mapBabel(info.raw);
      results.push({ order: o.order_id, babel: info.raw, mapped: newStatus, current: o.status });
      if (!newStatus || newStatus === o.status || RETURN_GUARD.includes(o.status)) continue;

      const { error: upErr } = await supabase.from('orders')
        .update({ status: newStatus, updated_by: 'بابل-تلقائي', updated_at: new Date().toISOString() })
        .eq('id', o.id).is('deleted_at', null);
      if (upErr) continue;
      updated++;
      await supabase.from('order_status_history').insert({
        order_id: o.id, from_status: o.status, to_status: newStatus, changed_by: 'بابل اكسبرس', source: 'babel',
      }).then(() => {}, () => {});
      await notifySeller(supabase, o, newStatus);
      await notifyWhatsAppStatus(o, newStatus, 'syria');
      // 🛡️ لا تدفع للجدول طلباً نهائياً لم يُزامَن معه أصلاً من قبل — بگ حقيقي
      // 29 يوليو 2026 (طلبات قديمة تُلحَق كصفوف «جديدة» وهمية). راجع track-ptt.
      if (!(TERMINAL.includes(newStatus) && !o.sheet_synced)) await syncSheet(o.id);
    } catch { /* skip this shipment */ }
  }

  return json({ ok: true, checked: orders?.length ?? 0, updated, results });
});
