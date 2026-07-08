// ════════════════════════════════════════════════════════════════════
// import-yurtici-labels — Edge Function
// ────────────────────────────────────────────────────────────────────
// يستقبل أزواج (order_id ↔ GÖ) المُستخرجة من بوليصة يورتيتشي (PDF) في المتصفّح
// ويضبط orders.yurtici_cargo_key = GÖ لطلبات تركيا المطابِقة. بعدها يسحب
// track-yurtici (المُجدول/اليدوي) رقم التتبّع العام (1160…) والحالة تلقائياً —
// نفس المسار الموجود أصلاً للشحنات المُنشأة بالـAPI، لكن المفتاح هنا هو الـGÖ
// (مفتاح يورتيتشي للشحنات المرفوعة بـExcel).
//
// لا نزامن الجدول هنا: yurtici_cargo_key حقل داخلي لا يظهر بالجدول؛ ومزامنة
// الجدول الجماعية تستفزّ سباق Apps Script (درس عاصفة المزامنة). الحالة/التتبّع
// يتغيّران لاحقاً عبر track-yurtici الذي يزامن كل طلب يتغيّر.
//
// المُدخل:  { labels: [{ orderId: "TL-28596", go: "422444632" }, …] }
// المُخرَج: { ok, total, set, replaced, unchanged, unmatched: [...], results: [...] }
// ════════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_LABELS = 1000;
// حالات منتهية: يورتيتشي لا يتتبّعها، ولا نلمسها (سلوك صحيح + تقليل سطح الخطر).
const TERMINAL = ['delivered', 'returned', 'cancelled', 'settled'];
const cleanId = (s: unknown) => String(s ?? '').trim().replace(/-+$/, '').toUpperCase();
const cleanGo  = (s: unknown) => String(s ?? '').trim().replace(/\D/g, '');

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const body = await req.json().catch(() => ({}));
    const rawLabels = Array.isArray(body?.labels) ? body.labels : [];
    if (!rawLabels.length) return json({ ok: false, error: 'no_labels', message: 'لا توجد بوالص في الطلب' }, 200);
    if (rawLabels.length > MAX_LABELS) return json({ ok: false, error: 'too_many', message: `الحدّ الأقصى ${MAX_LABELS} بوليصة` }, 200);

    // طبّع + احذف ما لا معرّف/GÖ صالح له. آخر GÖ لنفس المعرّف يفوز (إعادة الطبع).
    const byId = new Map<string, string>();
    for (const l of rawLabels) {
      const orderId = cleanId(l?.orderId);
      const go = cleanGo(l?.go);
      if (orderId && go.length >= 6) byId.set(orderId, go);
    }
    const orderIds = [...byId.keys()];
    if (!orderIds.length) return json({ ok: false, error: 'no_valid_labels', message: 'لا توجد بوالص صالحة (معرّف + GÖ)' }, 200);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // طلبات تركيا غير المحذوفة المطابِقة للمعرّفات (استعلام واحد).
    const { data: rows, error: qErr } = await supabase
      .from('orders')
      .select('id, order_id, yurtici_cargo_key, shipping_company, status')
      .eq('market', 'turkey')
      .in('order_id', orderIds)
      .is('deleted_at', null);
    if (qErr) return json({ ok: false, error: 'query_failed', message: qErr.message }, 200);

    const found = new Map<string, any>();
    for (const r of rows ?? []) found.set(cleanId(r.order_id), r);

    const results: any[] = [];
    const unmatched: string[] = [];
    let set = 0, unchanged = 0, conflict = 0, terminal = 0;

    for (const orderId of orderIds) {
      const go = byId.get(orderId)!;
      const order = found.get(orderId);
      if (!order) { unmatched.push(orderId); results.push({ orderId, go, status: 'unmatched' }); continue; }

      // موجود مسبقاً بنفس المفتاح → لا شيء.
      if (String(order.yurtici_cargo_key || '') === go) {
        unchanged++; results.push({ orderId, go, status: 'unchanged' }); continue;
      }
      // أمان: لا نكتب فوق مفتاح موجود مختلف (نمنع الدهس/التخريب) — نُبلِّغ فقط.
      if (order.yurtici_cargo_key) {
        conflict++; results.push({ orderId, go, status: 'conflict', prev: order.yurtici_cargo_key }); continue;
      }
      // أمان + سلوك صحيح: لا نلمس الطلبات المنتهية (يورتيتشي لا يتتبّعها أصلاً).
      if (TERMINAL.includes(String(order.status || ''))) {
        terminal++; results.push({ orderId, go, status: 'skipped_terminal', orderStatus: order.status }); continue;
      }

      const patch: any = { yurtici_cargo_key: go, updated_at: new Date().toISOString() };
      if (!order.shipping_company) patch.shipping_company = 'Yurtiçi Kargo';

      // الحارس .is(null) ذرّي: يكتب فقط إن ظلّ المفتاح فارغاً (لا سباق/دهس).
      const { error: upErr } = await supabase
        .from('orders').update(patch).eq('id', order.id).is('yurtici_cargo_key', null);
      if (upErr) { results.push({ orderId, go, status: 'error', message: upErr.message }); continue; }
      set++; results.push({ orderId, go, status: 'set' });
    }

    return json({
      ok: true,
      total: orderIds.length,
      set, unchanged, conflict, terminal,
      matched: set + unchanged + conflict + terminal,
      unmatched,
      results,
    });
  } catch (err) {
    console.error('[import-yurtici-labels]', err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
