// =============================================================
// Supabase Edge Function — retry-failed-syncs
// يعيد محاولة مزامنة الطلبات sync_status='failed' تلقائياً (بلا تدخل يدوي).
//
// السبب: ~7% من طلبات تركيا تفشل مرة واحدة بخطأ عابر من Google Apps Script
// (ضغط/تزامن مؤقت) ثم تنجح فوراً عند إعادة المحاولة يدوياً — 3 محاولات
// syncToSheet (بفارق ~3 ثوانٍ إجمالاً) أحياناً لا تكفي. بدل ما ينتظر المالك
// يشوف البانر ويضغط «أعد مزامنة الكل»، هالدالة تشتغل من cron كل 10 دقائق
// وتعيد محاولة أي طلب فاشل تلقائياً عبر استدعاء sync-order-to-sheet.
//
// ⚠️ درس 15 أغسطس 2026: أول نسخة كانت تعيد أي طلب sync_status='failed' —
// طلبات قديمة «delivered» كان الفريق نقلها يدوياً لجدول/شاشة «التسليمات»
// وشالها من الجدول الحيّ (عمرها sync_status بقي failed من عطل قديم). الدالة
// رجّعتها كصفوف جديدة (duplicate) بالجدول الحيّ. الآن: نستثني الحالات
// النهائية (delivered/settled/returned) — تلك من مسؤولية شاشة التسليمات لا
// هالدالة — ونحصر النطاق بآخر 72 ساعة (طلبات نشطة فقط، لا أرشيف قديم).
//
// يُستدعى من cron (بلا جسم) أو يدوياً.
// =============================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;

const TERMINAL_STATUSES = ['delivered', 'settled', 'returned'];

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const { data: failed, error } = await supabase
      .from('orders')
      .select('id, order_id, market, status')
      .eq('sync_status', 'failed')
      .in('market', ['syria', 'turkey'])
      .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`)
      .is('archived', false)
      .is('deleted_at', null)
      .gte('updated_at', since)
      .order('updated_at', { ascending: true })
      .limit(15);

    if (error) throw error;

    const results: any[] = [];
    for (const o of failed ?? []) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-order-to-sheet`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: o.id }),
        });
        const body = await res.json().catch(() => ({}));
        const ok = res.ok && body?.ok !== false && !body?.error;
        results.push({ order_id: o.order_id, ok, error: ok ? null : body?.error });
      } catch (e) {
        results.push({ order_id: o.order_id, ok: false, error: String((e as Error)?.message || e) });
      }
    }

    const fixed = results.filter((r) => r.ok).length;
    return new Response(JSON.stringify({ ok: true, checked: results.length, fixed, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
