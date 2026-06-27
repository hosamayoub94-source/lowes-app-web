// ════════════════════════════════════════════════════════════════════
// import-yurtici-report — Edge Function
// ────────────────────────────────────────────────────────────────────
// يستقبل (order_id ↔ رقم تتبّع 1160) المُستخرجة من تقرير يورتيتشي (results.xlsx)
// في المتصفّح، ويضبط orders.tracking_number لطلبات تركيا المطابِقة. هذا التقرير
// هو المصدر المضمون لرقم التتبّع (SOAP لا يرجّعه — مُختبَر حيّاً).
//
// «بلا مشاكل»: يفعل شيئاً واحداً = تعبئة رقم التتبّع (يظهر بشاشة الطلبات بالتطبيق).
// لا يلمس الحالة (الجدول/الفريق/track-yurtici يملكونها — تجنّب صراع/ترفرف). لا
// يدوس رقماً موجوداً على طلب منتهٍ (تقرير قديم لا يُرجِع رقماً مصحَّحاً).
// ملاحظة: عمود P بالجدول مملوك للجدول (Apps Script لا يكتب tracking_number من
// التطبيق) — تعبئته بالجدول تتطلّب إجراء Apps Script منفصلاً (fillTracking).
//
// المُدخل:  { updates: [{ orderId, tracking, status? }, …] }  (status يُتجاهَل)
// المُخرَج: { ok, total, tracked, unchanged, matched, unmatched: [...], results }
// ════════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const MAX_ROWS = 5000;
const TERMINAL = ['delivered', 'returned', 'cancelled', 'settled'];
const cleanId  = (s: unknown) => String(s ?? '').trim().replace(/-+$/, '').toUpperCase();
const cleanTrk = (s: unknown) => String(s ?? '').replace(/\D/g, '');

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const body = await req.json().catch(() => ({}));
    const raw = Array.isArray(body?.updates) ? body.updates : [];
    if (!raw.length) return json({ ok: false, error: 'no_updates', message: 'لا توجد بيانات في التقرير' }, 200);
    if (raw.length > MAX_ROWS) return json({ ok: false, error: 'too_many', message: `الحدّ الأقصى ${MAX_ROWS} صفّ` }, 200);

    const byId = new Map<string, string>();
    for (const u of raw) {
      const orderId = cleanId(u?.orderId);
      const tracking = cleanTrk(u?.tracking);
      if (orderId && tracking.length >= 6) byId.set(orderId, tracking);
    }
    const orderIds = [...byId.keys()];
    if (!orderIds.length) return json({ ok: false, error: 'no_valid', message: 'لا توجد صفوف صالحة (طلب + رقم تتبّع)' }, 200);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: rows, error: qErr } = await supabase
      .from('orders')
      .select('id, order_id, tracking_number, status')
      .eq('market', 'turkey')
      .in('order_id', orderIds)
      .is('deleted_at', null);
    if (qErr) return json({ ok: false, error: 'query_failed', message: qErr.message }, 200);

    const found = new Map<string, any>();
    for (const r of rows ?? []) found.set(cleanId(r.order_id), r);

    const results: any[] = [];
    const unmatched: string[] = [];
    const sheetItems: { order_id: string; tracking: string }[] = [];
    let tracked = 0, unchanged = 0;

    for (const orderId of orderIds) {
      const tracking = byId.get(orderId)!;
      const order = found.get(orderId);
      if (!order) { unmatched.push(orderId); results.push({ orderId, status: 'unmatched' }); continue; }
      sheetItems.push({ order_id: orderId, tracking });   // كل مطابَق → يُملأ بعمود P

      if (String(order.tracking_number || '') === tracking) { unchanged++; results.push({ orderId, status: 'unchanged' }); continue; }
      // لا ندوس رقماً موجوداً على طلب منتهٍ (تقرير قديم قد يُرجِع رقماً مصحَّحاً).
      if (order.tracking_number && TERMINAL.includes(String(order.status || ''))) {
        unchanged++; results.push({ orderId, status: 'kept_terminal' }); continue;
      }

      const { error: upErr } = await supabase.from('orders')
        .update({ tracking_number: tracking, updated_by: 'تقرير-يورتيتشي', updated_at: new Date().toISOString() })
        .eq('id', order.id);
      if (upErr) { results.push({ orderId, status: 'error', message: upErr.message }); continue; }
      tracked++; results.push({ orderId, tracking, status: 'tracked' });
    }

    // ── عمود P بالجدول: نداء fillTracking مُجمَّع واحد على نشر Apps Script المُثبَّت ──
    // نُثبّت رابط النشر الذي يحوي دالة fillTracking (V45 «AqhBo» — مُختبَر حيّاً: filled>0)
    // بدل الاعتماد على TURKEY_SHEET_SYNC_URL الذي قد يشير لنشر قديم بلا الدالة فيتجاهل
    // الأمر بصمت (هذا بالضبط سبب «الأرقام ما نزلت بالجدول»). قابل للتجاوز ببيئة
    // YURTICI_SHEET_FILL_URL لو تغيّر النشر مستقبلاً. بلا علَم تعطيل: الدالة منشورة
    // فالنداء آمن دائماً (يكتب عمود «رقم التتبع» فقط، idempotent، بلا صفّ تالف).
    let sheetFilled: number | null = null;
    const FILL_URL = Deno.env.get('YURTICI_SHEET_FILL_URL')
      ?? 'https://script.google.com/macros/s/AKfycbxslmupsmlPawlEIuCalEb_mD9puyk13aoWB0yPqjBi5V6DEstL41L_OO2mNGnAqhBo/exec';
    const FILL_TOKEN = Deno.env.get('TURKEY_SHEET_SYNC_TOKEN') ?? 'LOWES-TURKEY-2026';
    if (FILL_URL && sheetItems.length) {
      const fillBody = JSON.stringify({ token: FILL_TOKEN, action: 'fillTracking', items: sheetItems });
      // محاولتان: /exec يُعيد توجيهاً لـ googleusercontent؛ نقرأ النصّ ونحلّله يدوياً
      // (r.json() قد يفشل على إعادة التوجيه فيُرجِع null رغم نجاح الكتابة).
      for (let attempt = 0; attempt < 2 && sheetFilled === null; attempt++) {
        try {
          const r = await fetch(FILL_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: fillBody, redirect: 'follow',
          });
          const txt = await r.text();
          const j = JSON.parse(txt);
          if (typeof j?.filled === 'number') sheetFilled = j.filled;
        } catch { /* best-effort: نعيد المحاولة مرّة */ }
      }
    }

    return json({
      ok: true,
      total: orderIds.length,
      tracked, unchanged,
      matched: orderIds.length - unmatched.length,
      unmatched,
      sheetFilled,
      results,
    });
  } catch (err) {
    console.error('[import-yurtici-report]', err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
