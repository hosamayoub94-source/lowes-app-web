// =============================================================
// Supabase Edge Function — lozy-kpi-coach
// كوتش أداء استباقي يومي: يقارن أداء كل مندوب مبيعات هالشهر (لحد اليوم)
// بنفس الفترة من الشهر الماضي (مقارنة ذاتية — ما في هدف رقمي ثابت مربوط
// بالموظف بقاعدة البيانات حالياً)، ويضيف رسالة تشجيعية من لوزي بمحادثته
// (lozy_chats) — تظهر كـ"غير مقروءة" بالويدجت لما يفتح التطبيق. بدون
// استدعاء Claude API (رسالة مبنية من قالب ثابت) — موثوقة وبلا كلفة.
//
// "مندوب مبيعات نشط" = عنده طلب واحد ع الأقل بآخر 60 يوم (handler_name)
// — لا يوجد حالياً حقل rep_level/target فعلي مربوط بالموظفين بقاعدة
// البيانات (موجود فقط كنص ثابت ببرومبت لوزي)، فتفادينا اختلاق هدف وهمي.
//
// Deploy: supabase functions deploy lozy-kpi-coach --no-verify-jwt
// Trigger: SQL cron job (راجع supabase/migration_v12_lozy_kpi_coach_cron.sql)
// =============================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function sumByCurrency(rows: { amount: number; currency: string }[]) {
  const sums: Record<string, number> = {};
  for (const o of rows) sums[o.currency] = (sums[o.currency] || 0) + Number(o.amount || 0);
  return Object.entries(sums)
    .filter(([, v]) => v > 0)
    .map(([cur, v]) => `${v.toLocaleString('en-US')} ${cur}`)
    .join(' · ') || '0';
}

function buildCoachMessage(name: string, thisCount: number, thisSalesTxt: string, lastCount: number, daysLeft: number, daysPassed: number) {
  const firstName = (name || '').split(' ')[0] || '';
  const greeting = `صباح الخير ${firstName}! 🌸`;

  if (lastCount === 0) {
    // ما في بيانات شهر ماضي كافية للمقارنة — ملخّص بسيط بدون حكم.
    return `${greeting}\n\nهلق عندك **${thisCount} طلب** هالشهر (${thisSalesTxt}) بأول ${daysPassed} يوم — استمري بنفس الوتيرة!\n\nباقي **${daysLeft} يوم** بالشهر 🌟`;
  }

  const diff = thisCount - lastCount;
  const pct = Math.round((diff / lastCount) * 100);
  let statusLine: string;
  if (pct >= 15) {
    statusLine = `أنتِ **أفضل من نفس الفترة الشهر الماضي بـ${pct}%** 🎉 (${lastCount} طلب حينها مقابل ${thisCount} هلق) — استمري!`;
  } else if (pct >= -15) {
    statusLine = `أداؤك قريب من نفس الفترة الشهر الماضي (${lastCount} طلب حينها، ${thisCount} هلق) — ثبات منيح، شدّي شوي وبتتفوقي 💪`;
  } else {
    statusLine = `أداؤك أبطأ من نفس الفترة الشهر الماضي (${lastCount} طلب حينها مقابل ${thisCount} هلق). ولا يهمك — ركّزي اليوم على المتابعة مع العملاء المعلّقين وزيارات جديدة.`;
  }

  return `${greeting}\n\n📊 **مقارنة أدائك بأول ${daysPassed} يوم من الشهر:**\nعندك **${thisCount} طلب** هالشهر (${thisSalesTxt}).\n\n${statusLine}\n\nباقي **${daysLeft} يوم** بالشهر. محتاجة مساعدة بخطة اليوم؟ اسأليني أي وقت 🌟`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    );

    const today = new Date();
    const todayISO = today.toISOString().slice(0, 10);
    const daysPassed = today.getDate(); // 1-indexed day of month
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const daysLeft = daysInMonth - daysPassed + 1;

    const thisMonthStart = todayISO.slice(0, 8) + '01';
    const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
    // نفس عدد الأيام من الشهر الماضي (مقارنة عادلة — مو الشهر الماضي كامل)
    const lastMonthCompEnd = new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), daysPassed + 1);
    const lastMonthCompEndISO = lastMonthCompEnd.toISOString().slice(0, 10);

    // "مندوب مبيعات نشط" = ≥5 طلبات بآخر 60 يوم (يستبعد إدخالات عرضية لموظفين
    // غير مبيعات — مثلاً أدمن/مسؤول تغليف ظهر اسمه بطلب واحد بالغلط) + استبعاد
    // أدوار إدارية/غير مبيعات صراحةً بغضّ النظر عن العدد.
    const NON_SALES_ROLES = ['admin', 'manager', 'sales_manager', 'social_manager', 'media_buyer'];
    const MIN_ORDERS_60D = 5;
    const sixtyDaysAgo = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: recentOrders, error: recentErr } = await supabase
      .from('orders').select('handler_name')
      .gte('order_date', sixtyDaysAgo + 'T00:00:00').not('handler_name', 'is', null);
    if (recentErr) throw recentErr;

    const countByName: Record<string, number> = {};
    for (const o of (recentOrders ?? [])) countByName[o.handler_name] = (countByName[o.handler_name] || 0) + 1;
    const activeNames = Object.keys(countByName).filter(n => countByName[n] >= MIN_ORDERS_60D);
    if (!activeNames.length) {
      return new Response(JSON.stringify({ ok: true, processed: 0, note: 'no rep met the minimum activity threshold' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: repsRaw, error: repsErr } = await supabase
      .from('profiles').select('id, employee_name, role_type')
      .eq('is_active', true).in('employee_name', activeNames);
    if (repsErr) throw repsErr;
    const reps = (repsRaw ?? []).filter(r => !NON_SALES_ROLES.includes(r.role_type));
    if (!reps?.length) {
      return new Response(JSON.stringify({ ok: true, processed: 0, note: 'no matching active sales profiles' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let sent = 0, skipped = 0;
    for (const rep of reps) {
      const { data: chatRow } = await supabase
        .from('lozy_chats').select('messages').eq('user_id', rep.id).maybeSingle();
      const existing = chatRow?.messages ?? [];
      const last = existing[existing.length - 1];
      if (last?.proactive && last?.coachDate === todayISO) { skipped++; continue; }

      const [{ data: thisOrders }, { data: lastOrders }] = await Promise.all([
        supabase.from('orders').select('amount, currency')
          .eq('handler_name', rep.employee_name)
          .gte('order_date', thisMonthStart + 'T00:00:00').neq('status', 'cancelled'),
        supabase.from('orders').select('amount, currency')
          .eq('handler_name', rep.employee_name)
          .gte('order_date', lastMonthStart + 'T00:00:00').lt('order_date', lastMonthCompEndISO + 'T00:00:00')
          .neq('status', 'cancelled'),
      ]);

      const thisRows = thisOrders ?? [];
      const lastRows = lastOrders ?? [];
      const content = buildCoachMessage(
        rep.employee_name, thisRows.length, sumByCurrency(thisRows), lastRows.length, daysLeft, daysPassed,
      );
      const newMsg = { role: 'assistant', content, proactive: true, coachDate: todayISO };
      const updated = [...existing, newMsg].slice(-40);

      const { error: upsertErr } = await supabase.from('lozy_chats').upsert(
        { user_id: rep.id, messages: updated, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
      if (upsertErr) { skipped++; continue; }
      sent++;
    }

    return new Response(JSON.stringify({ ok: true, processed: reps.length, sent, skipped }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[lozy-kpi-coach]', err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
