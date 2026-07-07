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

// يفسّر ردّ Apps Script. عند رد غير JSON (صفحة خطأ HTML من جوجل) يستخرج
// نص الرسالة الحقيقية بدل «bad_response» الأعمى — درس تشخيص 10 يونيو:
// خطأ «التحقق من صحة البيانات بالخلية T17» كان مدفوناً بصفحة HTML مبتلعة.
async function parseSheetResponse(res: Response): Promise<any> {
  const raw = await res.text();
  try { return JSON.parse(raw); } catch { /* HTML/نص */ }
  const msg = raw
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;|&amp;quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return { ok: false, error: 'bad_response: ' + (msg ? msg.slice(0, 220) : `HTTP ${res.status}`) };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { orderId } = await req.json();
    if (!orderId) return json({ ok: false, error: 'orderId required' }, 400);

    const SHEET_URL   = Deno.env.get('SHEET_SYNC_URL');
    const SHEET_TOKEN = Deno.env.get('SHEET_SYNC_TOKEN') ?? 'LOWES-SYRIA-2026';
    if (!SHEET_URL) return json({ ok: false, error: 'sheet_not_configured', message: 'لم يُضبط رابط الجدول بعد' }, 200);

    const SB_URL = Deno.env.get('SUPABASE_URL')!;
    // مفتاح publishable العام (نفس المُضمَّن أصلاً بالمتصفح، آمن للنشر) — شبكة أمان
    // للقراءة/الكتابة إن انكسر المفتاح الخادمي بعد تدوير المفاتيح. RLS الحالية تسمح
    // بطلبات orders/products، والتطبيق نفسه يكتب sync_status بهذا المفتاح.
    const PUBLISHABLE_FALLBACK = 'sb_publishable_iYn5Rc00ZmdLPUBH5_09fg_eLiok3UO';
    const PRIV_KEY = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // اقرأ الطلب من قاعدة البيانات (مصدر الحقيقة) — لا نثق بجسم الطلب.
    // نُفضّل المفتاح الخادمي؛ وإن فشلت القراءة (مفتاح مكسور بعد التدوير — كان يرجّع
    // «order_not_found» زوراً رغم وجود الطلب) نُعيد بمفتاح publishable فتعمل المزامنة.
    let supabase = createClient(SB_URL, PRIV_KEY ?? PUBLISHABLE_FALLBACK);
    let { data: o, error } = await supabase
      .from('orders').select('*').eq('id', orderId).maybeSingle();
    if ((error || !o) && PRIV_KEY && PRIV_KEY !== PUBLISHABLE_FALLBACK) {
      console.warn('[sync-order-to-sheet] privileged read failed — fallback to publishable key. اضبط SB_SECRET_KEY لإزالة هذا التحذير.', error?.message || '');
      supabase = createClient(SB_URL, PUBLISHABLE_FALLBACK);
      ({ data: o, error } = await supabase
        .from('orders').select('*').eq('id', orderId).maybeSingle());
    }
    if (error || !o) return json({ ok: false, error: 'order_not_found' }, 200);

    // طلب محذوف (soft-delete): لا تُعِد دفع صفّه للجدول إطلاقاً. بدون هذا الحارس،
    // softDeleteOrder يدفع الطلب كـ«ملغي» فيُلحقه doPost من جديد بعد أن يحذف الفريق
    // الصفّ يدوياً من الجدول — وهذا جوهر باگ «الحذف يرجع» (البند ١).
    if (o.deleted_at) return json({ ok: true, skipped: 'deleted_no_readd' }, 200);

    // Only Syria + Turkey have sheets (team isolation)
    if (o.market !== 'syria' && o.market !== 'turkey') return json({ ok: true, skipped: 'no_sheet' }, 200);
    // Skip archived/imported rows (they never re-sync)
    if (o.archived === true) return json({ ok: true, skipped: 'archived' }, 200);
    // لا تُعِد إضافة الطلبات المُنتهية (تسليم/تسوية/راجع): الفريق ينقلها لتاب
    // التسليمات، والـdoPost يُلحقها ثانية لو لم يجدها بالتاب النشط → تكرار/عودة.
    // التسليم يُكتب بالمكان مباشرةً من مؤقّت التتبّع (إن كان الطلب ما زال بالتاب).
    if (['delivered', 'settled', 'returned'].includes(o.status)) return json({ ok: true, skipped: 'terminal_no_readd' }, 200);

    // ── Per-order rate limit (kill-switch) ────────────────────────────
    // Never call the Apps Script web app more than once per COOLDOWN per order.
    // A runaway client retry-loop (or a stale tab) could otherwise flood the
    // web app, exhaust its daily quota, and break sync for everyone. We stamp
    // the attempt time on `last_synced_at` BEFORE calling so concurrent/rapid
    // retries are throttled too. The first sync of any order always passes
    // (last_synced_at is null), so legitimate use is unaffected.
    const COOLDOWN_MS = 3_000;  // حارس ضد الحلقات فقط (لا يعرقل أي فعل يدوي بشري)
    if (o.last_synced_at) {
      const age = Date.now() - new Date(o.last_synced_at).getTime();
      if (age >= 0 && age < COOLDOWN_MS) {
        return json({ ok: false, error: 'throttled', retryAfterMs: COOLDOWN_MS - age }, 200);
      }
    }
    await supabase.from('orders')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', orderId).then(() => {}, () => {});

    // Translate product names → English. الجدول (الجرد + الأرشيف) يطابق أسماء
    // المنتجات الإنجليزية في أعمدة Item؛ فأي اسم عربي يكسر معادلات الجرد.
    // مُتين: نطبّع (trim + lowercase + توحيد المسافات) ونقبل أن الاسم قد يأتي
    // عربياً (name) أو إنجليزياً أصلاً (name_en) فنُرجّع دائماً name_en القياسي.
    const norm = (s: string) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    let toEn: Record<string,string> = {};
    try {
      const { data: prods } = await supabase.from('products').select('name,name_en');
      (prods ?? []).forEach((p: any) => {
        const en = String(p.name_en || p.name || '').trim();
        if (!en) return;
        if (p.name)    toEn[norm(p.name)]    = en;  // عربي → إنجليزي
        if (p.name_en) toEn[norm(p.name_en)] = en;  // إنجليزي (بأي حالة/مسافات) → إنجليزي قياسي
      });
    } catch { /* fall back to original name */ }
    const enName = (n: string) => toEn[norm(n)] || n;

    // ── Turkey: route to the Turkey spreadsheet (Strong / LOWE'S tab) ──
    if (o.market === 'turkey') {
      const TR_URL   = Deno.env.get('TURKEY_SHEET_SYNC_URL');
      const TR_TOKEN = Deno.env.get('TURKEY_SHEET_SYNC_TOKEN') ?? 'LOWES-TURKEY-2026';
      if (!TR_URL) return json({ ok: false, error: 'turkey_sheet_not_configured' }, 200);
      // عمود «مكان الاستلام» (T) بالجدول عليه قائمة منسدلة قيمها الحرفية
      // تتضمن إيموجي وعلامات اقتباس — نطبّع قيم التطبيق إليها حتى تبقى
      // الخلايا صالحة (ولو أعاد أحدهم وضع «الرفض» لا تنكسر المزامنة).
      const TR_PICKUP_MAP: Record<string, string> = {
        'عنوان المنزل':    '🏠 "عنوان منزل"',
        'عنوان منزل':      '🏠 "عنوان منزل"',
        'عنوان العمل':     '🏢 "عنوان عمل"',
        'عنوان عمل':       '🏢 "عنوان عمل"',
        'استلام من المركز': '📦 "استلام من المركز 🏢"',
      };
      const trPickup = (p: unknown) => TR_PICKUP_MAP[String(p ?? '').trim()] ?? p;
      const trPayload = {
        token: TR_TOKEN,
        brand: o.brand || 'lowes',
        order: {
          order_id:         o.order_id,
          // Column A = وقت آخر تغيير حالة (updated_at) أو وقت الإنشاء إن لم يتغيّر بعد.
          order_date:       o.updated_at || o.created_at || o.order_date,
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
          pickup_type:      trPickup(o.pickup_type),
          shipping_company: o.shipping_company,
          notes:            o.notes,
          items:            Array.isArray(o.items) ? o.items.map((it: any) => ({ name: enName(it.name), qty: it.qty })) : [],
        },
      };
      const trRes = await fetch(TR_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trPayload), redirect: 'follow',
      });
      const trOut = await parseSheetResponse(trRes);
      await supabase.from('orders')
        .update({
          sheet_synced:    !!trOut.ok,
          sheet_synced_at: trOut.ok ? new Date().toISOString() : null,
          sync_status:     trOut.ok ? 'synced' : 'failed',
          sync_error:      trOut.ok ? null : String(trOut.error || 'sheet error').slice(0, 300),
          last_synced_at:  trOut.ok ? new Date().toISOString() : undefined,
        })
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

    // الدفع الجزئي: المتبقّي للتحصيل + المدفوع الآن (للأعمدة K / O في الجدول)
    const _total = Number(o.amount || 0);
    const _paid  = Number(o.paid_amount || 0);
    const _remaining = Math.max(0, _total - _paid);

    // أكواد فريق سوريا الإنجليزية (الدروب-داون بالجدول) — نكتبها بدل المفتاح الخام
    // ليتوحّد العمود مع تعديلات الفريق (توحيد المسميات، قرار المالك 11 يونيو).
    const SYRIA_TEAM_CODE: Record<string, string> = {
      pending: 'NEW', preparing: 'PACK', shipped: 'SHIP', delivered: 'DONE',
      cancelled: 'CANC', waiting: 'Waiting', settled: 'Settled',
    };

    const payload = {
      token: SHEET_TOKEN,
      order: {
        orderId:        o.order_id,
        timestamp:      fmtTs(o.updated_at ?? o.order_date),
        customerName:   o.customer_name,
        phone:          o.phone_1,
        wa:             o.wa_number || o.phone_1,
        city:           o.city,
        address:        o.address,
        amount:         o.amount,
        currency:       o.currency,            // SYP / USD / TRY
        status:         SYRIA_TEAM_CODE[o.status] ?? o.status,
        salesperson:    o.handler_name,
        note:           o.notes,
        shippingMethod: o.shipping_company,
        payment:        o.payment_method,
        // الدفع الجزئي — يكتبهما السكربت في K (المتبقّي) و O (ملاحظة الدفع)
        paymentStatus:  o.payment_status,
        paidAmount:     _paid,
        remaining:      o.payment_status === 'paid' ? 0 : _remaining,
        // أسماء المنتجات بالإنجليزي القياسي — توافق معادلات الجرد والأرشيف بالجدول
        items:          Array.isArray(o.items) ? o.items.map((it: any) => ({ name: enName(it.name), qty: it.qty })) : [],
      },
    };

    const res = await fetch(SHEET_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      redirect: 'follow',
    });
    const out = await parseSheetResponse(res);

    // علّم الطلب كمتزامن (أو لا) للتتبّع وإعادة المحاولة + مؤشر المزامنة
    await supabase.from('orders')
      .update({
        sheet_synced:    !!out.ok,
        sheet_synced_at: out.ok ? new Date().toISOString() : null,
        sync_status:     out.ok ? 'synced' : 'failed',
        sync_error:      out.ok ? null : String(out.error || 'sheet error').slice(0, 300),
        last_synced_at:  out.ok ? new Date().toISOString() : undefined,
      })
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
