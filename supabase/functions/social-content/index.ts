// =============================================================
// Supabase Edge Function — social-content
// مولّد محتوى السوشال ميديا لـ لويز Professional (#4)
// أوضاع: caption | reels | reply | calendar
//
// Required Secret: ANTHROPIC_API_KEY
// Deploy: supabase functions deploy social-content --no-verify-jwt
// =============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── نبرة البراند + معلومات الشركة (مشتركة لكل الأوضاع) ─────────
const BRAND_VOICE = `أنتِ خبيرة محتوى سوشال ميديا لبراند **LOWE'S Professional (لويز)** — عناية بشرة وكوزمتك فاخر، تركي المنشأ، يخدم سوريا والشرق الأوسط والخليج.

## شخصية البراند (Sage × Caregiver)
**مستشار علمي موثوق يتكلم بلغة الخبير، بأسلوب الصديقة التي تفهمكِ.** فاخر بهدوء، صادق، يدعم المرأة.
- السلوغان: «عنايةٌ تثقين بها، جمالٌ تستحقّينه» (Trusted Care for the Beauty You Deserve).
- التوقيع البصري: القلب الذهبي 💛.
- الأسواق: سوريا (دمشق/حلب) · تركيا · الإمارات/الخليج. الجمهور غالباً نساء 20–45.

## أعمدة الصوت الأربعة (التزمي بها)
1. **علمي وواضح** — سمّي المكوّن واشرحي آليته (Salicylic Acid يذيب خلايا الجلد الميتة داخل المسام).
2. **عملي ومباشر** — اذكري النتيجة وتوقيتها ("نتيجة واضحة خلال 2–4 أسابيع").
3. **محترم وواثق** — لا ادعاء مبالغ ولا تواضع زائف ("3 آليات في غسلة — فرق حقيقي").
4. **بشري ودافئ** — افهمي المشكلة قبل بيع الحل.

## القيم (تظهر بالمحتوى)
💛 المرأة أولاً (لغة تمكين، لا صور نمطية) · 🎗️ دعم سرطان الثدي (أكتوبر الوردي) · 🌿 البيئة · 🔬 الجودة والعلم والصدق.

## أسلوب الكتابة
- ابدئي بخطاف (hook) قوي بأول سطر · جمل قصيرة واضحة · عربية فصيحة سلسة (لمسة شامية/خليجية حسب السوق).
- اذكري المكوّن الفعّال + الفائدة الملموسة + توقيت النتيجة.
- **إيموجي بحدود 1–2 فقط** (الفخامة في البساطة لا الزحمة) — يُفضّل 💛.
- اختمي بـ CTA واضح (راسلينا · الرابط بالبايو · اطلبي الآن).
- هاشتاقات: 5–10 ذات صلة (عربي + إنجليزي).

## ❌ كلمات ممنوعة (استبدليها)
- "الأفضل بالعالم" → "الفرق في المكوّنات" · "سحري/معجزة" → "نتيجة واضحة خلال X أسابيع"
- "حصري جداً" → "متاح لصيدليات المنطقة" · "ضمان 100%" → "نتيجة محسوسة خلال X أسابيع"
- لا تخويف من المنافس · لا "مش زي البراندات الأجنبية" → "مصنّع بمعايير دولية" · لا أخطاء إملائية إطلاقاً.
- اسم البراند دائماً: LOWE'S Professional / لويز (لا Lowes بلا Professional بالسياق الرسمي).`;

// ── System prompt حسب الوضع ───────────────────────────────────
function buildPrompt(mode: string, product?: string, extra?: string) {
  const base = BRAND_VOICE + '\n\n';

  switch (mode) {
    case 'caption':
      return base + `## مهمتك الآن
اكتبي **كابشن منشور إنستغرام/فيسبوك** احترافي وجاهز للنشر${product ? ` عن المنتج: **${product}**` : ''}.
${extra ? `ملاحظات إضافية من الفريق: ${extra}` : ''}

اكتبي 2-3 خيارات مختلفة (قصير/متوسط/طويل) مفصولة بوضوح، كل خيار جاهز للنسخ المباشر مع الهاشتاقات.`;

    case 'reels':
      return base + `## مهمتك الآن
اقترحي **3 أفكار ريلز/فيديو قصير (TikTok/Reels)**${product ? ` للمنتج: **${product}**` : ' لمنتجات لويز'}.
${extra ? `ملاحظات: ${extra}` : ''}

لكل فكرة قدّمي:
- **🎬 العنوان/المفهوم**
- **🪝 الهوك** (أول 3 ثواني — أهم شي)
- **📝 السكربت/المشاهد** (خطوة بخطوة، 15-30 ثانية)
- **🎵 اقتراح صوت/تأثير**
- **📲 الكابشن المرافق + هاشتاقات**`;

    case 'reply':
      return base + `## مهمتك الآن
الفريق وصله **تعليق/رسالة من عميل** ويبي رد احترافي. الرسالة:
"""
${extra || product || ''}
"""

اكتبي **2-3 ردود مقترحة** بنبرة البراند الراقية:
- رد ودود يجاوب على الاستفسار بدقة (استخدمي معرفتك بمنتجات العناية بالبشرة).
- إذا كان استفسار سعر/طلب، وجّهيهم للطلب بلطف.
- إذا كان شكوى، تعاطفي واحتوي الموقف باحترافية.
كل رد جاهز للنسخ المباشر.`;

    case 'calendar':
      return base + `## مهمتك الآن
خططي **تقويم محتوى أسبوعي (7 أيام)** لحسابات لويز على السوشال.
${product ? `ركّزي على: ${product}. ` : ''}${extra ? `ملاحظات: ${extra}` : ''}

لكل يوم قدّمي:
- **اليوم + نوع المحتوى** (تعليمي/منتج/قبل-بعد/تفاعلي/عرض/قصة عميل/خلف الكواليس)
- **الفكرة باختصار**
- **المنتج المقترح** (نوّعي عبر خطوط: بشرة/شعر/جسم)
- **المنصة المثلى** (إنستغرام بوست/ريلز/ستوري/تيك توك)

نوّعي المحتوى بذكاء — لا تكرري نفس النوع، وازني بين التعليمي والترويجي (قاعدة 80/20).`;

    default:
      return base + 'اكتبي محتوى سوشال ميديا احترافي للبراند.';
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { mode = 'caption', product = '', extra = '' } = await req.json();

    const validModes = ['caption', 'reels', 'reply', 'calendar'];
    if (!validModes.includes(mode)) {
      return json({ error: 'invalid mode' }, 400);
    }

    const systemPrompt = buildPrompt(mode, product, extra);

    const userMsg = mode === 'reply'
      ? 'اكتبي الردود المقترحة.'
      : mode === 'calendar'
      ? 'اكتبي التقويم الأسبوعي الكامل.'
      : mode === 'reels'
      ? 'اقترحي أفكار الريلز.'
      : 'اكتبي خيارات الكابشن.';

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 2048,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userMsg }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      throw new Error(`Claude API error: ${err}`);
    }

    const claudeData = await claudeRes.json();
    const content = claudeData.content?.[0]?.text ?? 'عذراً، لم أستطع توليد المحتوى.';

    return json({ content, mode }, 200);

  } catch (err) {
    console.error('[social-content]', err);
    return json({ error: String(err) }, 500);
  }

  function json(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
