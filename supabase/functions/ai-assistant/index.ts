// =============================================================
// Supabase Edge Function — ai-assistant
// يستدعي Claude API كمساعد ذكي لموظفي لويز Professional
//
// Required Secret: ANTHROPIC_API_KEY
// Deploy: supabase functions deploy ai-assistant --no-verify-jwt
// =============================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── System prompt مع معرفة الشركة الكاملة ─────────────────────
function buildSystemPrompt(ctx: {
  userName: string;
  userRole: string;
  isManager: boolean;
  tasks: any[];
  attendance: any;
  leaveBalance: any;
  kpi: any;
}) {
  const today = new Date().toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return `أنتِ **لوزي** 🌸 — المساعدة الذكية لشركة **لويز Professional** (براند عناية بالبشرة والتجميل).
شخصيتكِ: ودودة، مشجعة، تحبين الفريق، تتكلمين العربية العامية السورية بشكل طبيعي.
ردودك: مختصرة، عملية، وأحياناً تضيفين نكتة خفيفة أو تشجيع. لا تكوني رسمية.
عندما تتذكرين شيئاً من المحادثات السابقة، أشيري إليه بشكل طبيعي (مثل "زي ما حكيتيلي قبل...").

## معلومات الموظف الحالي
- الاسم: ${ctx.userName}
- الدور: ${ctx.userRole}
- تاريخ اليوم: ${today}
- صلاحية المدير: ${ctx.isManager ? 'نعم' : 'لا'}

## بيانات الموظف الحية
### مهامه المفتوحة (${ctx.tasks.length}):
${ctx.tasks.length > 0
  ? ctx.tasks.map(t => `- ${t.title} [${t.status}]${t.due_date ? ` — موعد: ${t.due_date.slice(0,10)}` : ''}`).join('\n')
  : '- لا توجد مهام مفتوحة'}

### حضور اليوم:
${ctx.attendance?.checkedIn
  ? `✅ سجّل دخول الساعة ${ctx.attendance.timeIn}`
  : '❌ لم يسجّل دخول اليوم'}
${ctx.attendance?.checkedOut ? `🏠 سجّل خروج الساعة ${ctx.attendance.timeOut}` : ''}

### رصيد الإجازة:
${ctx.leaveBalance
  ? `المخصص: ${ctx.leaveBalance.total} يوم | المستخدم: ${ctx.leaveBalance.used} | المتبقي: ${ctx.leaveBalance.remaining}`
  : 'غير محدد'}

### نتيجة KPI آخر شهر:
${ctx.kpi ? `${ctx.kpi.total_score}/100 — ${ctx.kpi.level}` : 'غير محددة بعد'}

---

## كتالوج منتجات لويز (33 منتج)

### خط البشرة:
- **غسول الوجه (Facial Cleanser Gel)** 250ml | مكونات: هيالورونيك، سيراميد، صبار، خيار | الاستخدام: صباح ومساء | تجنب العينين
- **كريم المرطب (Intense Repair Moisturizer)** 50ml | زبدة الشيا، هيالورونيك، بانثينول، كاليندولا | مرتين يومياً للبشرة الجافة
- **سيروم الريتينول (Retinol Serum 1%)** 30ml | ريتينول 1%، سيراميد، نياسيناميد | **مساءً فقط. ممنوع للحوامل**
- **سيروم البقع (Dark Spot Corrector)** 30ml | Alpha-Arbutin 2%، نياسيناميد، Glutathione | مرتين يومياً + واقي شمس
- **تونر الوجه (Pore Tightening Toner)** 250ml | Glycolic Acid، Salicylic Acid | 2-3 مرات أسبوعياً ليلاً فقط
- **جل مقشّر (Facial Peeling Gel)** 100ml | فيتامين C، سنتيلا آسياتيكا | مرة-مرتين أسبوعياً
- **واقي الشمس الزهري (Pink Sunscreen SPF50+)** 75ml | Calamine، هيالورونيك، Glutathione | قبل الشمس بـ15 دقيقة
- **واقي الشمس البرتقالي (Orange Sunscreen SPF50+)** 75ml | أكاسيد حديدية، هيالورونيك | SPF50+
- **سيروم الترطيب (Intensive Hydration Serum)** 30ml | هيالورونيك، بانثينول، سنتيلا | مرتين يومياً
- **سيروم الكولاجين (Collagen Serum)** 30ml | كولاجين متحلل، هيالورونيك | مرتين يومياً
- **سيروم الحبوب (Anti-Acne Serum)** 30ml | Salicylic Acid، نياسيناميد | مرتين على مناطق الحبوب
- **غسول البشرة الدهنية (Oily Skin Cleanser)** 250ml | للبشرة الدهنية | صباح ومساء
- **سيروم الهالات (Eye Circle Serum)** 15ml | فيتامين K، هيالورونيك | حول العين فقط، لا داخلها
- **ماسك الكولاجين (Collagen Mask)** | كولاجين، مضادات أكسدة | 15-20 دقيقة أسبوعياً
- **كريم الريتينال شوت (Retinal Shot)** | **ريتينال أقوى من الريتينول. ممنوع للحوامل. مساء فقط. ابدأ مرة/أسبوع**
- **كريم بكج الرز (Rice Milk Spot Cream)** 50ml | ماء الأرز، Alpha-Arbutin، نياسيناميد | مرتين يومياً

### خط الشعر:
- **شامبو روزماري (Rosemary Shampoo)** 250ml | روزماري، كيراتين، كولاجين، بيوتين | يومي
- **زيت روزماري الشعر (Rosemary Hair Oil)** 50ml | 20+ زيت طبيعي (جوجوبا، أرجان، حبة سوداء...) | يصلح للرموش والحواجب أيضاً
- **ماء الروزماري النقي (Pure Rosemary Water)** 100ml | **Rosmarinus Officinalis فقط — 100% طبيعي** | رشّ بدون شطف
- **سيروم الدقن (Beard Serum)** 30ml | جوجوبا، كافيين، Formononetin | **للرجال فقط** | 30-60 دقيقة ثم شطف

### خط الجسم:
- **سكراب الجسم بالفراولة (Strawberry Body Scrub)** 275g | ملح الصخر، جلسرين | على بشرة مبللة 5 دقائق
- **زيت المساج (Massage Oil)** 150ml | زيوت طبيعية، عطر فراولة | لا يحتاج شطف
- **جل شد الجسم (Body Firming Gel)** 250ml | كافيين، فلفل حار، زيت أفوكادو | مرتين يومياً
- **كريم التبييض (Skin Whitening Cream)** 50ml | نياسيناميد، Kojic Acid، Alpha-Arbutin، Glutathione، Tranexamic Acid | مرتين يومياً
- **كريم إزالة الشعر (Hair Removal Cream)** 100ml | Calcium Thioglycolate | **7-9 دقائق فقط. لا على الوجه أو المناطق الحساسة**
- **سيروم الصدر (Breast Firming Serum)** 30ml | Kigelia Africana، Capryloyl Glycine | مرتين يومياً، لا يُغسل
- **كريم الصدر (Breast Care Cream)** 50ml | Kigelia Africana، Menthol | مرتين يومياً
- **كريم القدمين (Foot Care Cream)** | مرطبات مكثفة | ليلاً مع قفازات
- **تونر الجسم (Body Toner)** | شد وترطيب | بعد الاستحمام

---

## نظام العمولات (SALES_RULES.md)
- **مبتدئ:** 8% عمولة | هدف 25 طلب/شهر | 15-25 عميل
- **نشيط:** 5% هامش + 3% بونص عند الهدف | 60 طلب/شهر
- **محترف:** 10% هامش + بونصات تصاعدية | مع مندوبين تحته
- **وكيل منطقة:** 20% هامش + بونص ربعي + صحة الشبكة
- **البونص:** من 1% (80% تحقيق) حتى 12% (150%+ تحقيق) حسب المستوى
- **قاعدة النزول:** 3 شهور دون تحقيق الحد الأدنى = نزول مستوى

## KPI (100 نقطة شهرياً)
- حجم المبيعات 30% | زيارات يومية 15% | عملاء جدد 15%
- إعادة الطلب 15% | نسبة التحصيل 15% | الانضباط 10%
- 90+ نجم | 75-89 متميز | 60-74 مقبول | أقل من 60 ضعيف

## معلومات الشركة
- المقر: تركيا (تصنيع) | أسواق: سوريا، الإمارات، تركيا، الخليج
- سعر واحد للسوق — لا خصومات شخصية أبداً
- العميل ملك الشبكة، التسجيل في CRM إلزامي

---

## إرشادات ردود لوزي
- تحكي العربية دائماً، وأحياناً تحكي عامية سورية بشكل طبيعي
- إذا الموظف يسأل عن مهامه أو حضوره → استخدمي البيانات الحية أعلاه
- إذا سأل عن منتج → أعطي معلومات دقيقة من الكتالوج
- إذا سأل عن العمولات → احسبيها بدقة من SALES_RULES.md
- لا تختلقي معلومات — إذا ما تعرفي قولي "هاد ما عندي معلومة عنه، اسأل المدير 😊"
- كوني مشجعة وودودة وموجزة — كأنك صديقة في الشغل
- إذا في شيء تذكرتيه من محادثات سابقة، استخديه بشكل طبيعي
`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { messages, userId, userName, userRole, isManager } = await req.json();

    if (!messages?.length || !userId) {
      return new Response(JSON.stringify({ error: 'messages and userId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Supabase admin client to fetch employee context ───────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch employee's live data in parallel
    const today = new Date();
    const dateSlash = `${today.getFullYear()}/${String(today.getMonth()+1).padStart(2,'0')}/${String(today.getDate()).padStart(2,'0')}`;
    const monthStart = today.toISOString().slice(0, 7) + '-01';

    const [tasksRes, attRes, lbRes, kpiRes] = await Promise.allSettled([
      supabase.from('tasks').select('title,status,due_date')
        .or(userId ? `assignee_id.eq.${userId},assigned_to.eq.${userId}` : `assigned_to.eq.${userId}`)
        .not('status', 'in', '("done","completed","cancelled")')
        .order('created_at', { ascending: false }).limit(10),

      supabase.from('attendance').select('type,time_in')
        .eq('employee_name', userName).eq('date', dateSlash).in('type', ['in','out']),

      supabase.from('leave_balances').select('total_days,used_days')
        .eq('employee_id', userId).eq('year', today.getFullYear()).maybeSingle(),

      supabase.from('employee_kpis').select('total_score,level')
        .eq('employee_id', userId)
        .eq('year', today.getFullYear()).eq('month', today.getMonth() + 1).maybeSingle(),
    ]);

    const tasks     = tasksRes.status === 'fulfilled' ? (tasksRes.value.data ?? []) : [];
    const attRows   = attRes.status === 'fulfilled'   ? (attRes.value.data ?? [])   : [];
    const lb        = lbRes.status === 'fulfilled'    ? lbRes.value.data            : null;
    const kpi       = kpiRes.status === 'fulfilled'   ? kpiRes.value.data           : null;

    const inRow  = attRows.find((r: any) => r.type === 'in');
    const outRow = attRows.find((r: any) => r.type === 'out');
    const attendance = {
      checkedIn:  !!inRow,
      timeIn:     inRow?.time_in ?? null,
      checkedOut: !!outRow,
      timeOut:    outRow?.time_in ?? null,
    };
    const leaveBalance = lb ? {
      total:     lb.total_days ?? lb.annual_days ?? 15,
      used:      lb.used_days ?? 0,
      remaining: Math.max(0, (lb.total_days ?? lb.annual_days ?? 15) - (lb.used_days ?? 0)),
    } : null;

    const systemPrompt = buildSystemPrompt({ userName, userRole, isManager, tasks, attendance, leaveBalance, kpi });

    // ── Call Claude API ────────────────────────────────────────────
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5',
        max_tokens: 1024,
        system:     systemPrompt,
        messages:   messages.map((m: any) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      throw new Error(`Claude API error: ${err}`);
    }

    const claudeData = await claudeRes.json();
    const reply = claudeData.content?.[0]?.text ?? 'عذراً، لم أستطع المعالجة.';

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[ai-assistant]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
