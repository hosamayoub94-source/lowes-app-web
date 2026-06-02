// =============================================================
// Supabase Edge Function — generate-quiz
// يولّد أسئلة تدريب ذكية يومية لموظفي لويز عبر Claude + بحث ويب.
// المجالات: مكوّنات العناية بالبشرة · منتجات لويز · تقنيات المبيعات.
// يخزّن الأسئلة في quiz_questions بتاريخ اليوم (مرة/يوم — idempotent).
//
// Required Secret: ANTHROPIC_API_KEY
// Deploy: supabase functions deploy generate-quiz --no-verify-jwt
// =============================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// كتالوج منتجات لويز (مختصر — للأسئلة عن منتجاتنا تحديداً)
const PRODUCT_CATALOG = `منتجات لويز الرئيسية:
بشرة: غسول الوجه · مرطب Intense Repair · سيروم ريتينول 1% (مساءً، ممنوع للحوامل) · سيروم البقع (Alpha-Arbutin+Glutathione) · تونر مسامات (Glycolic+Salicylic) · جل مقشّر (فيتامين C) · واقي شمس زهري/برتقالي SPF50+ · سيروم ترطيب (هيالورونيك) · سيروم كولاجين · سيروم حبوب (Salicylic) · كريم ريتينال شوت · كريم ماء الأرز.
شعر: شامبو روزماري · زيت روزماري · ماء روزماري 100% · سيروم الدقن (رجال).
جسم: سكراب فراولة · زيت مساج · جل شد (كافيين) · كريم تبييض (Niacinamide+Kojic+Glutathione) · كريم إزالة شعر · سيروم/كريم الصدر (Kigelia) · كريم القدمين.`;

const CATEGORIES = {
  products:    { label: 'المنتجات',      focus: 'منتجات لويز تحديداً: مكوّناتها، طريقة استخدامها، تحذيراتها، ولمن تُنصح. استخدم الكتالوج.' },
  ingredients: { label: 'المكوّنات',     focus: 'علم مكوّنات العناية بالبشرة (ريتينول، نياسيناميد، هيالورونيك، AHA/BHA، فيتامين C، ببتيدات...): كيف تعمل، التوافق والتعارض، الأخطاء الشائعة. ابحث عن أحدث المعلومات العلمية إن لزم.' },
  sales:       { label: 'المبيعات',      focus: 'تقنيات بيع منتجات العناية بالبشرة: فهم احتياج العميل، الـ upsell الأخلاقي، التعامل مع الاعتراضات، بناء روتين للعميل، نصائح إغلاق البيع.' },
  customer:    { label: 'أسئلة العملاء', focus: 'أسئلة شائعة من العملاء عن العناية بالبشرة وكيف يجيب عليها الموظف باحتراف ودقة علمية.' },
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const onlyCategory: string | null = body.category ?? null;
    const useWebSearch: boolean = body.webSearch !== false; // default on
    const force: boolean = body.force === true;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const today = new Date().toISOString().slice(0, 10);

    // Idempotent: if today already has AI questions, skip (unless force)
    if (!force) {
      const { count } = await supabase
        .from('quiz_questions')
        .select('id', { count: 'exact', head: true })
        .eq('question_date', today)
        .eq('source', 'ai');
      if ((count ?? 0) > 0) {
        return json({ ok: true, skipped: true, reason: 'already_generated_today', count }, 200);
      }
    }

    const cats = onlyCategory ? [onlyCategory] : Object.keys(CATEGORIES);
    const created: any[] = [];

    for (const cat of cats) {
      const meta = (CATEGORIES as any)[cat];
      if (!meta) continue;

      const q = await generateOne(cat, meta, useWebSearch);
      if (!q) continue;

      const row = {
        question:        q.question,
        option_a:        q.option_a,
        option_b:        q.option_b,
        option_c:        q.option_c,
        option_d:        q.option_d,
        correct_answer:  q.correct_answer,
        explanation:     q.explanation,
        category:        cat,
        question_date:   today,
        is_active:       true,
        source:          'ai',
      };
      const { data, error } = await supabase.from('quiz_questions').insert(row).select('id').single();
      if (!error && data) created.push({ id: data.id, category: cat });
    }

    return json({ ok: true, created, count: created.length, date: today }, 200);

  } catch (err) {
    console.error('[generate-quiz]', err);
    return json({ ok: false, error: String(err) }, 500);
  }

  function json(b: unknown, status: number) {
    return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

// ── Generate a single smart question via Claude (+ optional web search) ──
async function generateOne(cat: string, meta: { label: string; focus: string }, useWebSearch: boolean) {
  const system = `أنتَ خبير تعليم العناية بالبشرة والمبيعات في شركة لويز للكوزمتك.
مهمتك: صياغة **سؤال تدريبي واحد ذكي ومفيد** يثقّف موظفي لويز في مجال: **${meta.label}**.
التركيز: ${meta.focus}

${PRODUCT_CATALOG}

قواعد:
- السؤال عملي ومفيد فعلاً (ليس تافهاً أو بديهياً) — يرفع كفاءة الموظف.
- 4 خيارات (أ/ب/ج/د)، واحد صحيح فقط، والخيارات الخاطئة معقولة (ليست سخيفة).
- معلومة دقيقة علمياً وحديثة. إن استخدمت بحث الويب، اعتمد أحدث المصادر الموثوقة.
- شرح مختصر يعلّم الموظف "لماذا" الإجابة صحيحة.
- بالعربية الفصيحة الواضحة.

أعِد **JSON فقط** بهذا الشكل بالضبط (بدون أي نص آخر):
{"question":"...","option_a":"...","option_b":"...","option_c":"...","option_d":"...","correct_answer":"a","explanation":"..."}`;

  const reqBody: any = {
    model:      'claude-sonnet-4-6',
    max_tokens: 1024,
    system,
    messages:   [{ role: 'user', content: `أنشئ سؤال تدريب ذكي جديد في مجال "${meta.label}". نوّع كل مرة. اليوم: ${new Date().toISOString().slice(0,10)}.` }],
  };
  if (useWebSearch && (cat === 'ingredients' || cat === 'customer')) {
    reqBody.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }];
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify(reqBody),
  });
  if (!res.ok) { console.error('claude err', await res.text()); return null; }

  const data = await res.json();
  // Collect all text blocks (web search interleaves tool blocks)
  const text = (data.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n');

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const q = JSON.parse(match[0]);
    if (!q.question || !q.correct_answer) return null;
    q.correct_answer = String(q.correct_answer).trim().toLowerCase().slice(0, 1);
    return q;
  } catch { return null; }
}
