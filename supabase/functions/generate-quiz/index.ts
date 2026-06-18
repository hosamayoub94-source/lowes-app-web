// =============================================================
// Supabase Edge Function — generate-quiz
// يولّد أسئلة تدريب ذكية يومية لموظفي لويز عبر Claude + بحث ويب.
// المجالات: مكوّنات العناية بالبشرة · منتجات لويز · تقنيات المبيعات.
// يخزّن الأسئلة في quiz_questions بتاريخ اليوم (مرة/يوم — idempotent).
// سؤالان لكل تصنيف (أساسي + متقدّم) = 8 أسئلة/يوم.
// الكتالوج يُجلب حيّاً من جدول products (fallback: قائمة ثابتة).
//
// Required Secret: ANTHROPIC_API_KEY
// Cron: مجدولة يومياً 05:00 UTC (راجع migrations/20260610_generate_quiz_cron.sql)
// =============================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// معلومات حرجة لا توجد بجدول المنتجات (تحذيرات/استخدام) — تُلحق بالكتالوج الحيّ.
const KNOWLEDGE_NOTES = `ملاحظات حرجة عن منتجات لويز:
- سيروم الريتينول 1%: يُستخدم مساءً فقط، ممنوع للحوامل والمرضعات، إلزامي واقي شمس صباحاً.
- ريتينال شوت: أقوى من الريتينول وأسرع نتيجة — نفس تحذيرات الريتينول.
- سيروم مصحح البقع: Alpha-Arbutin + Glutathione — آمن نهاراً مع واقي شمس.
- تونر المسامات: Glycolic + Salicylic — لا يُدمج مع الريتينول بنفس الليلة.
- سيروم حب الشباب: Salicylic Acid (BHA) — يخترق المسام الدهنية.
- جل الشد: كافيين — للسيليوليت وترهّل الجسم.
- كريم التفتيح: Niacinamide + Kojic + Glutathione.
- سيروم/كريم الثدي: خلاصة Kigelia Africana.
- ماء الروزماري 100%: نتائج مثبتة +15.53% كثافة شعر.
- واقيات الشمس SPF50+: الوردي بالكالامين للتفتيح والتوحيد، المضاد للبقع للبشرة المعرّضة للتصبغات.`;

// كتالوج ثابت احتياطي — يُستخدم فقط إذا فشل جلب جدول products.
const FALLBACK_CATALOG = `منتجات لويز الرئيسية:
بشرة: غسول الوجه · مرطب Intense Repair · سيروم ريتينول 1% · سيروم البقع · تونر مسامات · جل مقشّر · واقي شمس زهري/برتقالي SPF50+ · سيروم ترطيب (هيالورونيك) · سيروم كولاجين · سيروم حبوب · كريم ريتينال شوت · كريم ماء الأرز.
شعر: شامبو روزماري · زيت روزماري · ماء روزماري 100% · سيروم الدقن (رجال).
جسم: سكراب فراولة · زيت مساج · جل شد (كافيين) · كريم تبييض · كريم إزالة شعر · سيروم/كريم الصدر · كريم القدمين.`;

const CATEGORIES = {
  products:    { label: 'المنتجات',      focus: 'منتجات لويز تحديداً: مكوّناتها، طريقة استخدامها، تحذيراتها، ولمن تُنصح. استخدم الكتالوج.' },
  ingredients: { label: 'المكوّنات',     focus: 'علم مكوّنات العناية بالبشرة (ريتينول، نياسيناميد، هيالورونيك، AHA/BHA، فيتامين C، ببتيدات...): كيف تعمل، التوافق والتعارض، الأخطاء الشائعة. ابحث عن أحدث المعلومات العلمية إن لزم.' },
  sales:       { label: 'المبيعات',      focus: 'تقنيات بيع منتجات العناية بالبشرة: فهم احتياج العميل، الـ upsell الأخلاقي، التعامل مع الاعتراضات، بناء روتين للعميل، نصائح إغلاق البيع.' },
  customer:    { label: 'أسئلة العملاء', focus: 'أسئلة شائعة من العملاء عن العناية بالبشرة وكيف يجيب عليها الموظف باحتراف ودقة علمية.' },
};

// جلب الكتالوج الحيّ من جدول products (مجموعاً حسب التصنيف).
async function buildCatalog(supabase: any): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('name, name_en, category')
      .eq('is_active', true)
      .order('category');
    if (error || !data?.length) return FALLBACK_CATALOG;
    const byCat: Record<string, string[]> = {};
    for (const p of data) {
      const cat = p.category || 'أخرى';
      const en  = p.name_en ? ` (${p.name_en})` : '';
      (byCat[cat] ??= []).push(`${p.name}${en}`);
    }
    const lines = Object.entries(byCat).map(([cat, names]) => `${cat}: ${names.join(' · ')}`);
    return `منتجات لويز الحالية (${data.length} منتجاً، من قاعدة البيانات):\n${lines.join('\n')}`;
  } catch {
    return FALLBACK_CATALOG;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const onlyCategory: string | null = body.category ?? null;
    const useWebSearch: boolean = body.webSearch !== false; // default on
    const force: boolean = body.force === true;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
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

    const catalog = await buildCatalog(supabase);
    const cats = onlyCategory ? [onlyCategory] : Object.keys(CATEGORIES);

    // كل تصنيف بنداء واحد يولّد سؤالين (أساسي + متقدّم) — وكل التصنيفات بالتوازي.
    const results = await Promise.all(cats.map(async (cat) => {
      const meta = (CATEGORIES as any)[cat];
      if (!meta) return [];
      const qs = await generatePair(cat, meta, catalog, useWebSearch);
      const created: any[] = [];
      for (const q of qs) {
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
      return created;
    }));

    const created = results.flat();
    return json({ ok: true, created, count: created.length, date: today }, 200);

  } catch (err) {
    console.error('[generate-quiz]', err);
    return json({ ok: false, error: String(err) }, 500);
  }

  function json(b: unknown, status: number) {
    return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

// ── Generate a pair of smart questions (basic + advanced) via Claude ──
async function generatePair(cat: string, meta: { label: string; focus: string }, catalog: string, useWebSearch: boolean) {
  const system = `أنتَ خبير تعليم العناية بالبشرة والمبيعات في شركة لويز للكوزمتك.
مهمتك: صياغة **سؤالين تدريبيين ذكيين ومفيدين** يثقّفان موظفي لويز في مجال: **${meta.label}**.
التركيز: ${meta.focus}

${catalog}

${KNOWLEDGE_NOTES}

قواعد:
- السؤال الأول **أساسي**: معلومة جوهرية كل موظف لازم يعرفها.
- السؤال الثاني **متقدّم**: سيناريو واقعي (عميل يسأل/حالة بيع) يتطلّب تفكيراً وربطاً بين المعلومات.
- السؤالان مختلفان تماماً (لا يكرّر أحدهما فكرة الآخر).
- كل سؤال عملي ومفيد فعلاً (ليس تافهاً أو بديهياً) — يرفع كفاءة الموظف.
- 4 خيارات (أ/ب/ج/د)، واحد صحيح فقط، والخيارات الخاطئة معقولة (ليست سخيفة).
- وزّع موقع الإجابة الصحيحة عشوائياً بين a/b/c/d (لا تجعلها دائماً a).
- معلومة دقيقة علمياً وحديثة. إن استخدمت بحث الويب، اعتمد أحدث المصادر الموثوقة.
- شرح مختصر يعلّم الموظف "لماذا" الإجابة صحيحة.
- بالعربية الفصيحة الواضحة.

أعِد **JSON فقط**: مصفوفة من سؤالين بهذا الشكل بالضبط (بدون أي نص آخر):
[{"question":"...","option_a":"...","option_b":"...","option_c":"...","option_d":"...","correct_answer":"a","explanation":"..."},{...}]`;

  const reqBody: any = {
    model:      'claude-sonnet-4-6',
    max_tokens: 2048,
    system,
    messages:   [{ role: 'user', content: `أنشئ سؤالين تدريبيين جديدين (أساسي + متقدّم) في مجال "${meta.label}". نوّع المواضيع كل مرة. اليوم: ${new Date().toISOString().slice(0,10)}.` }],
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
  if (!res.ok) { console.error('claude err', await res.text()); return []; }

  const data = await res.json();
  // Collect all text blocks (web search interleaves tool blocks)
  const text = (data.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n');

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((q: any) => q?.question && q?.correct_answer)
      .slice(0, 2)
      .map((q: any) => ({ ...q, correct_answer: String(q.correct_answer).trim().toLowerCase().slice(0, 1) }));
  } catch { return []; }
}
