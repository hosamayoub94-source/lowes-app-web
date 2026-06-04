// =============================================================
// Supabase Edge Function — sync-order-to-sheet
// يمرّر طلب سوريا إلى Google Apps Script (ورقة LOWES Sales).
// يحفظ رابط السكربت السري بعيداً عن المتصفح.
//
// Secrets المطلوبة:
//   SHEET_SYNC_URL    = رابط الـ Web App من Apps Script
//   SHEET_SYNC_TOKEN  = نفس SECRET_TOKEN في السكربت (LOWES-SYRIA-2026)
//
// Deploy: supabase functions deploy sync-order-to-sheet --no-verify-jwt
// =============================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { orderId } = await req.json();
    if (!orderId) return json({ ok: false, error: 'orderId required' }, 400);

    const SHEET_URL   = Deno.env.get('SHEET_SYNC_URL');
    const SHEET_TOKEN = Deno.env.get('SHEET_SYNC_TOKEN') ?? 'LOWES-SYRIA-2026';
    if (!SHEET_URL) return json({ ok: false, error: 'sheet_not_configured', message: 'لم يُضبط رابط الجدول بعد' }, 200);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // اقرأ الطلب من قاعدة البيانات (مصدر الحقيقة) — لا نثق بجسم الطلب
    const { data: o, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();
    if (error || !o) return json({ ok: false, error: 'order_not_found' }, 200);

    // Only Syria + Turkey have sheets (team isolation)
    if (o.market !== 'syria' && o.market !== 'turkey') return json({ ok: true, skipped: 'no_sheet' }, 200);
    // Skip archived/imported rows (they never re-sync)
    if (o.archived === true) return json({ ok: true, skipped: 'archived' }, 200);

    // Translate Arabic product names → English (the sheet's Item columns use English)
    let toEn: Record<string,string> = {};
    try {
      const { data: prods } = await supabase.from('products').select('name,name_en');
      (prods ?? []).forEach((p: any) => { if (p.name && p.name_en) toEn[String(p.name).trim()] = String(p.name_en).trim(); });
    } catch { /* fall back to Arabic names */ }
    const enName = (n: string) => toEn[String(n || '').trim()] || n;

    // ── Turkey: route to the Turkey spreadsheet (Strong / LOWE'S tab) ──
    if (o.market === 'turkey') {
      const TR_URL   = Deno.env.get('TURKEY_SHEET_SYNC_URL');
      const TR_TOKEN = Deno.env.get('TURKEY_SHEET_SYNC_TOKEN') ?? 'LOWES-TURKEY-2026';
      if (!TR_URL) return json({ ok: false, error: 'turkey_sheet_not_configured' }, 200);
      const trPayload = {
        token: TR_TOKEN,
        brand: o.brand || 'lowes',
        order: {
          order_id:         o.order_id,
          // Column A = order creation timestamp (created_at) — the moment the
          // order was actually created, not the editable order_date field.
          order_date:       o.created_at || o.order_date,
          customer_name:    o.customer_name,
          phone_1:          o.phone_1,
          wa_number:        o.wa_number || o.phone_1,
          city:             o.city,
          district:         o.district,
          address:          o.address,
          amount:           o.amount,
          status:           o.status,
          handler_name:     o.handler_name,
          tracking_number:  o.tracking_number,
          payment_method:   o.payment_method,
          pickup_type:      o.pickup_type,
          shipping_company: o.shipping_company,
          notes:            o.notes,
          items:            Array.isArray(o.items) ? o.items.map((it: any) => ({ name: enName(it.name), qty: it.qty })) : [],
        },
      };
      const trRes = await fetch(TR_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trPayload), redirect: 'follow',
      });
      const trOut = await trRes.json().catch(() => ({ ok: false, error: 'bad_response' }));
      await supabase.from('orders')
        .update({ sheet_synced: !!trOut.ok, sheet_synced_at: trOut.ok ? new Date().toISOString() : null })
        .eq('id', orderId);
      return json(trOut, 200);
    }

    // Format timestamp as a Sheets-friendly string (ISO+microseconds won't display)
    const fmtTs = (iso: string) => {
      if (!iso) return '';
      const d = new Date(iso);
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    };

    const payload = {
      token: SHEET_TOKEN,
      order: {
        orderId:        o.order_id,
        timestamp:      fmtTs(o.order_date),
        customerName:   o.customer_name,
        phone:          o.phone_1,
        wa:             o.wa_number || o.phone_1,
        city:           o.city,
        address:        o.address,
        amount:         o.amount,
        currency:       o.currency,            // SYP / USD / TRY
        status:         o.status,
        salesperson:    o.handler_name,
        note:           o.notes,
        shippingMethod: o.shipping_company,
        payment:        o.payment_method,
        items:          Array.isArray(o.items) ? o.items.map((it: any) => ({ name: enName(it.name), qty: it.qty })) : [],
      },
    };

    const res = await fetch(SHEET_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      redirect: 'follow',
    });
    const out = await res.json().catch(() => ({ ok: false, error: 'bad_response' }));

    // علّم الطلب كمتزامن (أو لا) للتتبّع وإعادة المحاولة
    await supabase.from('orders')
      .update({ sheet_synced: !!out.ok, sheet_synced_at: out.ok ? new Date().toISOString() : null })
      .eq('id', orderId);

    return json(out, 200);

  } catch (err) {
    console.error('[sync-order-to-sheet]', err);
    return json({ ok: false, error: String(err) }, 500);
  }

  function json(b: unknown, status: number) {
    return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
