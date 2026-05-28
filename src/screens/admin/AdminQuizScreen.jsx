// =============================================================
// AdminQuizScreen 2.0 — إدارة أسئلة الاختبار اليومي
// ✅ يدوي  🎯 من قالب  ⚡ توليد تلقائي  📊 إحصائيات
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@services/supabase';
import { useAuth }  from '@hooks/useAuth';

// ── Categories ─────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'general',     label: 'عام',            icon: '💡' },
  { key: 'products',    label: 'المنتجات',        icon: '🧴' },
  { key: 'skincare',    label: 'العناية بالبشرة', icon: '✨' },
  { key: 'ingredients', label: 'المكونات',        icon: '🔬' },
  { key: 'company',     label: 'الشركة',          icon: '🏢' },
  { key: 'customer_qa', label: 'أسئلة العملاء',   icon: '💬' },
];
const ANSWER_LABELS = { a: 'أ', b: 'ب', c: 'ج', d: 'د' };

// ── Question Templates (pre-made knowledge base) ───────────────
const QUESTION_TEMPLATES = [
  // Products
  { category: 'products', question: 'ما هو نوع منتج الكريم المرطب الأساسي من لووز؟', option_a: 'كريم مرطب للبشرة الجافة', option_b: 'كريم للتبييض فقط', option_c: 'واقي شمس', option_d: 'منتج للتقشير', correct_answer: 'a', explanation: 'كريم المرطب الأساسي مصمم للبشرة الجافة ويوفر ترطيبًا عميقًا.' },
  { category: 'products', question: 'كم عدد المنتجات الرئيسية في خط العناية بالبشرة من لووز؟', option_a: '5 منتجات', option_b: '10 منتجات أو أكثر', option_c: '3 منتجات فقط', option_d: '2 منتج', correct_answer: 'b', explanation: 'يضم خط العناية بالبشرة من لووز أكثر من 10 منتجات متخصصة.' },
  { category: 'products', question: 'ما الفرق الرئيسي بين السيروم والكريم؟', option_a: 'السيروم أخف وامتصاصه أسرع', option_b: 'السيروم أثقل من الكريم', option_c: 'لا فرق بينهما', option_d: 'الكريم يُستخدم نهارًا فقط', correct_answer: 'a', explanation: 'السيروم يحتوي على جزيئات أصغر تتغلغل في طبقات أعمق من البشرة بسرعة أكبر.' },
  { category: 'products', question: 'ما الترتيب الصحيح لتطبيق منتجات العناية بالبشرة؟', option_a: 'غسيل ← تونر ← سيروم ← مرطب ← واقي شمس', option_b: 'مرطب ← سيروم ← غسيل', option_c: 'واقي شمس أولاً دائمًا', option_d: 'لا يهم الترتيب', correct_answer: 'a', explanation: 'الترتيب الصحيح يضمن تغلغل المنتجات بفعالية.' },
  { category: 'products', question: 'متى يُنصح باستخدام الواقي من الشمس؟', option_a: 'كل صباح كل يوم', option_b: 'في الصيف فقط', option_c: 'عند الذهاب للشاطئ فقط', option_d: 'مرة في الأسبوع', correct_answer: 'a', explanation: 'الحماية من الأشعة فوق البنفسجية ضرورية يوميًا حتى في الأيام الغائمة.' },

  // Skincare
  { category: 'skincare', question: 'ما الفرق بين البشرة الدهنية والمختلطة؟', option_a: 'الدهنية دهنية في كل الوجه، المختلطة دهنية في منطقة T فقط', option_b: 'لا فرق', option_c: 'المختلطة أسوأ', option_d: 'الدهنية تحتاج مرطبًا والمختلطة لا', correct_answer: 'a', explanation: 'البشرة المختلطة تتميز بمنطقة T دهنية (الجبهة والأنف والذقن) مع خدود طبيعية أو جافة.' },
  { category: 'skincare', question: 'ما أهمية الغسيل المسائي للوجه؟', option_a: 'إزالة الأتربة والمكياج والزيوت المتراكمة خلال اليوم', option_b: 'ليس ضروريًا إذا لم يكن هناك مكياج', option_c: 'فقط للنساء', option_d: 'يُجفف البشرة', correct_answer: 'a', explanation: 'الغسيل المسائي ضروري لمنع انسداد المسام ومكافحة الشيخوخة المبكرة.' },
  { category: 'skincare', question: 'أي نوع بشرة يحتاج إلى الترطيب الأكثر؟', option_a: 'البشرة الجافة', option_b: 'البشرة الدهنية', option_c: 'البشرة العادية', option_d: 'كل البشرة تحتاج نفس الكمية', correct_answer: 'a', explanation: 'البشرة الجافة تفقد الرطوبة بشكل أسرع وتحتاج مرطبات غنية بالزيوت.' },
  { category: 'skincare', question: 'ما العمر الذي ينبغي البدء فيه باستخدام كريم مضاد للشيخوخة؟', option_a: 'من الثلاثينات كوقاية', option_b: 'بعد الخمسين فقط', option_c: 'قبل العشرين', option_d: 'لا توجد سن محددة وليس ضروريًا', correct_answer: 'a', explanation: 'بدء الوقاية من الثلاثينات يؤخر ظهور علامات التقدم في السن بشكل ملحوظ.' },
  { category: 'skincare', question: 'ما الذي يسبب ظهور البثور (الحبوب)؟', option_a: 'انسداد المسام بالزيوت والأتربة والخلايا الميتة', option_b: 'شرب الكثير من الماء', option_c: 'البرد فقط', option_d: 'المرطبات دائمًا', correct_answer: 'a', explanation: 'المحافظة على نظافة البشرة وتقشيرها بانتظام يمنع انسداد المسام.' },

  // Ingredients
  { category: 'ingredients', question: 'ما وظيفة مكوّن الريتينول في منتجات العناية؟', option_a: 'تجديد الخلايا ومكافحة التجاعيد', option_b: 'ترطيب البشرة فقط', option_c: 'تفتيح البشرة', option_d: 'حماية من الشمس', correct_answer: 'a', explanation: 'الريتينول (فيتامين أ) يحفز إنتاج الكولاجين ويسرع دوران الخلايا.' },
  { category: 'ingredients', question: 'ما فائدة مكوّن النياسيناميد (فيتامين B3)؟', option_a: 'تصغير المسام وتوحيد لون البشرة وتقليل الدهون', option_b: 'ترطيب فقط', option_c: 'تقشير كيميائي', option_d: 'حماية من التلوث', correct_answer: 'a', explanation: 'النياسيناميد متعدد الفوائد: يعمل على المسام ولون البشرة وإنتاج الزهم.' },
  { category: 'ingredients', question: 'لماذا يُعدّ حمض الهيالورونيك مكوّنًا أساسيًا في المرطبات؟', option_a: 'يجذب الرطوبة من الهواء ويحتجزها في البشرة', option_b: 'يمنع الشيخوخة مباشرة', option_c: 'يعالج حب الشباب', option_d: 'يوفر الحماية من الشمس', correct_answer: 'a', explanation: 'حمض الهيالورونيك يمكنه امتصاص ما يصل إلى 1000 ضعف وزنه من الماء.' },
  { category: 'ingredients', question: 'ما الفرق بين SPF 30 وSPF 50 في واقي الشمس؟', option_a: 'SPF 50 يحجب نسبة أعلى من الأشعة الضارة', option_b: 'SPF 30 أقوى لأن رقمه أصغر', option_c: 'لا فرق عمليًا', option_d: 'SPF 50 للبشرة الداكنة فقط', correct_answer: 'a', explanation: 'SPF 30 يحجب 97% من الأشعة UVB، أما SPF 50 فيحجب 98%.' },
  { category: 'ingredients', question: 'ما هو مكوّن AHA وما وظيفته؟', option_a: 'أحماض ألفا هيدروكسيلية — تقشّر الجلد وتجدد الخلايا', option_b: 'مرطب طبيعي', option_c: 'مانع للتعرق', option_d: 'صبغة للبشرة', correct_answer: 'a', explanation: 'AHA (مثل حمض الجليكوليك واللاكتيك) تذيب الروابط بين الخلايا الميتة لكشف بشرة أكثر إشراقًا.' },

  // Company
  { category: 'company', question: 'ما هي الأسواق الرئيسية التي تعمل فيها لووز بروفشنال؟', option_a: 'تركيا والإمارات والشرق الأوسط وسوريا', option_b: 'أمريكا وأوروبا فقط', option_c: 'المملكة العربية السعودية فقط', option_d: 'دول آسيا حصرًا', correct_answer: 'a', explanation: 'لووز بروفشنال براند عناية بالبشرة والكوزمتك يخدم أسواق تركيا والإمارات والشرق الأوسط وسوريا.' },
  { category: 'company', question: 'ما هي رسالة شركة لووز بروفشنال؟', option_a: 'تقديم منتجات عناية بالبشرة عالية الجودة بأسعار مناسبة', option_b: 'الترفيه والموضة فقط', option_c: 'المنتجات الغذائية', option_d: 'الإلكترونيات', correct_answer: 'a', explanation: 'لووز تؤمن بأن كل شخص يستحق عناية فعّالة بالبشرة.' },
  { category: 'company', question: 'كيف يجب أن يتعامل فريق المبيعات مع شكاوى العملاء؟', option_a: 'الاستماع أولاً ثم حل المشكلة بسرعة واحترام', option_b: 'تحويل الشكوى لقسم آخر مباشرة', option_c: 'طلب الدفع أولاً قبل الحل', option_d: 'تجاهل الشكاوى الصغيرة', correct_answer: 'a', explanation: 'الاستجابة السريعة والمحترمة تحول الشكوى إلى فرصة لبناء ولاء العميل.' },
  { category: 'company', question: 'ما هي قيمة الشركة الأساسية تجاه منتجاتها؟', option_a: 'الجودة والفعالية المثبتة علميًا', option_b: 'الربح أولاً', option_c: 'الكمية على حساب الجودة', option_d: 'التصدير فقط', correct_answer: 'a', explanation: 'لووز تلتزم بتقديم منتجات مبنية على أبحاث علمية وتركيبات محسوبة.' },

  // Customer Q&A
  { category: 'customer_qa', question: 'عميل يسأل: "هل يناسب هذا المنتج بشرتي الحساسة؟" ما ردك الأمثل؟', option_a: 'اسأله عن نوع بشرته ومشاكلها أولاً ثم أنصحه بالمنتج المناسب', option_b: 'قل له "نعم يناسب الجميع"', option_c: 'قل له "جرّب وستعرف"', option_d: 'أحله لشخص آخر مباشرة', correct_answer: 'a', explanation: 'الاستماع لاحتياجات العميل وطرح الأسئلة الصحيحة يبني الثقة ويضمن رضاه.' },
  { category: 'customer_qa', question: 'عميل يشكو من حرقة بعد استخدام المنتج، ماذا تفعل؟', option_a: 'اطلب منه إيقاف الاستخدام فورًا وتقديم بديل مناسب', option_b: 'قل له إنه طبيعي', option_c: 'تجاهل الشكوى', option_d: 'أخبره بالاستمرار', correct_answer: 'a', explanation: 'الحرقة قد تدل على عدم ملاءمة المنتج — سلامة العميل الأولوية دائمًا.' },
  { category: 'customer_qa', question: 'كيف تشرح الفرق بين المنتجات بسعرين مختلفين لعميل؟', option_a: 'اشرح الفرق في التركيبة والتركيز والنتائج المتوقعة', option_b: 'قل له الأغلى دائمًا الأفضل', option_c: 'تجنب ذكر الأسعار', option_d: 'قل لا فرق بينهما', correct_answer: 'a', explanation: 'الشفافية في شرح الفرق بين المنتجات تبني مصداقيتك وتساعد العميل على اتخاذ قرار صحيح.' },
  { category: 'customer_qa', question: 'عميل يريد روتين عناية كامل بميزانية محدودة، ما توصيتك؟', option_a: 'غسول وجه + مرطب + واقي شمس كأساس لا غنى عنه', option_b: 'اشتري كل شيء', option_c: 'لا تحتاج لشيء', option_d: 'سيروم فقط', correct_answer: 'a', explanation: 'الروتين الثلاثي الأساسي (غسول + مرطب + واقي شمس) هو الحد الأدنى لعناية صحية بالبشرة.' },

  // General
  { category: 'general', question: 'ما أهمية شرب الماء بكميات كافية على صحة البشرة؟', option_a: 'يحسن الترطيب الداخلي ويحسن مظهر البشرة', option_b: 'لا علاقة له بالبشرة', option_c: 'يسبب الانتفاخ فقط', option_d: 'مفيد للكلى فقط', correct_answer: 'a', explanation: 'شرب 8-10 أكواب ماء يوميًا يدعم وظائف الجلد ويحسن مرونته.' },
  { category: 'general', question: 'كم مرة يُنصح بتطبيق واقي الشمس في اليوم؟', option_a: 'مرة صباحًا وإعادة تطبيق كل ساعتين عند التعرض للشمس', option_b: 'مرة في اليوم كافية', option_c: 'ثلاث مرات قبل النوم', option_d: 'أسبوعيًا فقط', correct_answer: 'a', explanation: 'الحماية الفعالة تتطلب إعادة التطبيق خاصة عند التعرض المباشر للشمس.' },
  { category: 'general', question: 'ما أفضل وقت لتطبيق المنتجات المرطبة؟', option_a: 'فور التنظيف والبشرة لا تزال رطبة قليلاً', option_b: 'بعد ساعة من الغسيل', option_c: 'قبل الغسيل', option_d: 'قبل النوم فقط', correct_answer: 'a', explanation: 'تطبيق المرطب على بشرة نظيفة ورطبة قليلاً يحسن الامتصاص ويحبس الرطوبة.' },
  { category: 'general', question: 'ما أهمية التقشير المنتظم للبشرة؟', option_a: 'إزالة الخلايا الميتة وتحسين امتصاص المنتجات', option_b: 'يُضر بالبشرة دائمًا', option_c: 'لا فائدة منه', option_d: 'يجب التقشير يوميًا', correct_answer: 'a', explanation: 'التقشير 1-2 مرة أسبوعيًا يجدد البشرة لكن الإفراط يضر بالحاجز الوقائي.' },
];

const EMPTY_FORM = {
  question: '', option_a: '', option_b: '', option_c: '', option_d: '',
  correct_answer: 'a', explanation: '', category: 'general',
  question_date: new Date().toISOString().slice(0, 10),
  is_checkout_question: false,
};

function todayISO() { return new Date().toISOString().slice(0, 10); }

function addDays(isoDate, n) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatDateAr(iso) {
  try { return new Date(iso).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

// ── Template picker panel ──────────────────────────────────────
function TemplatePicker({ targetDate, onSelect, onClose }) {
  const [activeCategory, setActiveCategory] = useState('all');
  const filtered = activeCategory === 'all'
    ? QUESTION_TEMPLATES
    : QUESTION_TEMPLATES.filter(t => t.category === activeCategory);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-black/60 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[85vh]" dir="rtl">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border bg-surface-alt shrink-0">
          <div>
            <h3 className="font-bold text-text text-sm">🎯 اختر قالبًا</h3>
            <p className="text-[11px] text-muted mt-0.5">{filtered.length} قالب متاح — سيتم تعديله لتاريخ {formatDateAr(targetDate)}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface flex items-center justify-center text-muted hover:text-text transition">✕</button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1.5 p-3 border-b border-border/50 overflow-x-auto shrink-0">
          <button onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${activeCategory === 'all' ? 'bg-teal text-white' : 'bg-surface-alt text-muted hover:text-text'}`}>
            📚 الكل ({QUESTION_TEMPLATES.length})
          </button>
          {CATEGORIES.map(c => {
            const cnt = QUESTION_TEMPLATES.filter(t => t.category === c.key).length;
            return (
              <button key={c.key} onClick={() => setActiveCategory(c.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${activeCategory === c.key ? 'bg-teal text-white' : 'bg-surface-alt text-muted hover:text-text'}`}>
                {c.icon} {c.label} ({cnt})
              </button>
            );
          })}
        </div>

        {/* Templates list */}
        <div className="overflow-y-auto p-3 space-y-2 flex-1">
          {filtered.map((t, i) => (
            <button key={i} onClick={() => onSelect({ ...t, question_date: targetDate, is_checkout_question: false })}
              className="w-full text-start p-3.5 rounded-xl bg-surface-alt border border-border hover:border-teal/50 hover:bg-teal/5 transition-all group">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-bold text-teal bg-teal/10 px-2 py-0.5 rounded-full">
                  {CATEGORIES.find(c => c.key === t.category)?.icon} {CATEGORIES.find(c => c.key === t.category)?.label}
                </span>
                <span className="text-[10px] text-muted ms-auto group-hover:text-teal transition">اختر ←</span>
              </div>
              <p className="text-xs font-semibold text-text leading-relaxed line-clamp-2">{t.question}</p>
              <div className="mt-2 grid grid-cols-2 gap-1">
                {['a','b'].map(k => (
                  <span key={k} className={`text-[10px] px-2 py-1 rounded-lg border truncate ${k === t.correct_answer ? 'border-emerald-300 bg-emerald-50 text-emerald-700 font-bold' : 'border-border bg-surface text-muted'}`}>
                    {ANSWER_LABELS[k]}: {t[`option_${k}`]}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Auto-generate panel ─────────────────────────────────────────
function AutoGeneratePanel({ onClose, onGenerated }) {
  const [startDate, setStartDate]  = useState(todayISO());
  const [daysCount, setDaysCount]  = useState(7);
  const [perDay, setPerDay]        = useState(1);
  const [categories, setCategories] = useState(['general','products','skincare','ingredients','company','customer_qa']);
  const [saving, setSaving]        = useState(false);
  const [preview, setPreview]      = useState([]);
  const { name } = useAuth();

  const buildPreview = () => {
    const pool = QUESTION_TEMPLATES.filter(t => categories.includes(t.category));
    if (!pool.length) return;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const result = [];
    for (let d = 0; d < daysCount; d++) {
      const date = addDays(startDate, d);
      for (let q = 0; q < perDay; q++) {
        const tmpl = shuffled[(d * perDay + q) % shuffled.length];
        result.push({ ...tmpl, question_date: date, is_checkout_question: q === 0, is_active: true, created_by: name });
      }
    }
    setPreview(result);
  };

  useEffect(() => { buildPreview(); }, [startDate, daysCount, perDay, categories]);

  const toggleCat = (key) => {
    setCategories(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handleSave = async () => {
    if (!preview.length) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('quiz_questions').insert(preview);
      if (error) throw error;
      onGenerated(preview.length);
    } catch (e) {
      alert('خطأ: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-black/60 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]" dir="rtl">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border bg-surface-alt shrink-0">
          <div>
            <h3 className="font-bold text-text text-sm">⚡ توليد تلقائي</h3>
            <p className="text-[11px] text-muted mt-0.5">إنشاء جدول أسئلة لفترة كاملة من المكتبة</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface flex items-center justify-center text-muted hover:text-text transition">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* Controls */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-muted block mb-1.5">تاريخ البداية</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full bg-surface-alt border border-border rounded-xl px-2.5 py-2 text-xs text-text focus:border-teal outline-none" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-muted block mb-1.5">عدد الأيام</label>
              <select value={daysCount} onChange={e => setDaysCount(+e.target.value)}
                className="w-full bg-surface-alt border border-border rounded-xl px-2.5 py-2 text-xs text-text focus:border-teal outline-none">
                {[3,5,7,14,30].map(n => <option key={n} value={n}>{n} يوم</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-muted block mb-1.5">سؤال/يوم</label>
              <select value={perDay} onChange={e => setPerDay(+e.target.value)}
                className="w-full bg-surface-alt border border-border rounded-xl px-2.5 py-2 text-xs text-text focus:border-teal outline-none">
                {[1,2,3,5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {/* Category filter */}
          <div>
            <label className="text-[11px] font-bold text-muted block mb-2">الفئات المشمولة</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(c => (
                <button key={c.key} onClick={() => toggleCat(c.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${categories.includes(c.key) ? 'bg-teal/10 border-teal/40 text-teal' : 'bg-surface-alt border-border text-muted hover:border-teal/30'}`}>
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview summary */}
          {preview.length > 0 && (
            <div className="bg-surface-alt border border-border rounded-xl p-3">
              <p className="text-xs font-bold text-text mb-2">📋 معاينة ({preview.length} سؤال)</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {Array.from({ length: daysCount }).map((_, d) => {
                  const date = addDays(startDate, d);
                  const dayQs = preview.filter(q => q.question_date === date);
                  return (
                    <div key={d} className="flex items-start gap-2">
                      <span className="text-[10px] text-muted shrink-0 w-20">{formatDateAr(date)}</span>
                      <div className="flex-1 space-y-0.5">
                        {dayQs.map((q, qi) => (
                          <p key={qi} className="text-[10px] text-text truncate">
                            {q.is_checkout_question ? '⭐' : '•'} {q.question}
                          </p>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border shrink-0 flex gap-3">
          <button onClick={buildPreview}
            className="flex-1 py-2.5 rounded-xl bg-surface-alt border border-border text-sm font-bold text-muted hover:text-text transition">
            🔀 إعادة الخلط
          </button>
          <button onClick={handleSave} disabled={saving || !preview.length || !categories.length}
            className="flex-1 py-2.5 rounded-xl bg-teal text-white text-sm font-bold hover:opacity-90 disabled:opacity-50 transition">
            {saving ? '⏳ جاري الحفظ…' : `✅ حفظ ${preview.length} سؤال`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main screen ─────────────────────────────────────────────────
export default function AdminQuizScreen() {
  const { name } = useAuth();

  const [questions, setQuestions]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [filterDate, setFilterDate] = useState(todayISO());
  const [statsMap, setStatsMap]     = useState({});

  // Form state
  const [showForm, setShowForm]       = useState(false);
  const [formMode, setFormMode]       = useState('manual'); // 'manual' | 'template'
  const [form, setForm]               = useState({ ...EMPTY_FORM });
  const [formError, setFormError]     = useState(null);
  const [formSaving, setFormSaving]   = useState(false);
  const [editId, setEditId]           = useState(null);

  // Panels
  const [showGenerate, setShowGenerate] = useState(false);

  const loadQuestions = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: e } = await supabase
        .from('quiz_questions')
        .select('*')
        .eq('question_date', filterDate)
        .eq('is_active', true)
        .order('is_checkout_question', { ascending: false })
        .order('created_at', { ascending: true });

      if (e) {
        if (e.code === 'PGRST205' || e.code === '42P01') {
          setError('جدول الأسئلة غير موجود. قم بتشغيل Migration SQL v5.');
          setQuestions([]); return;
        }
        throw e;
      }
      setQuestions(data ?? []);

      if (data?.length) {
        const ids = data.map(q => q.id);
        const { data: resp } = await supabase.from('quiz_responses').select('question_id, is_correct').in('question_id', ids);
        const sm = {};
        (resp ?? []).forEach(r => {
          if (!sm[r.question_id]) sm[r.question_id] = { total: 0, correct: 0 };
          sm[r.question_id].total++;
          if (r.is_correct) sm[r.question_id].correct++;
        });
        setStatsMap(sm);
      } else { setStatsMap({}); }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterDate]);

  useEffect(() => { loadQuestions(); }, [loadQuestions]);

  const openNewManual = () => {
    setForm({ ...EMPTY_FORM, question_date: filterDate });
    setEditId(null); setFormError(null); setFormMode('manual'); setShowForm(true);
  };

  const handleTemplateSelect = (tmpl) => {
    setForm({ ...tmpl });
    setEditId(null); setFormError(null); setFormMode('manual'); setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.question.trim()) { setFormError('السؤال مطلوب'); return; }
    if (!form.option_a.trim()) { setFormError('الخيار أ مطلوب'); return; }
    if (!form.option_b.trim()) { setFormError('الخيار ب مطلوب'); return; }
    setFormError(null); setFormSaving(true);
    try {
      const payload = {
        question: form.question.trim(), option_a: form.option_a.trim(),
        option_b: form.option_b.trim(), option_c: form.option_c.trim() || null,
        option_d: form.option_d.trim() || null, correct_answer: form.correct_answer,
        explanation: form.explanation.trim() || null, category: form.category,
        question_date: form.question_date, is_checkout_question: form.is_checkout_question,
        is_active: true, created_by: name,
      };
      if (form.is_checkout_question && !editId) {
        await supabase.from('quiz_questions').update({ is_checkout_question: false })
          .eq('question_date', form.question_date).eq('is_checkout_question', true);
      }
      const { error } = editId
        ? await supabase.from('quiz_questions').update(payload).eq('id', editId)
        : await supabase.from('quiz_questions').insert(payload);
      if (error) throw error;
      setShowForm(false); setEditId(null); setForm({ ...EMPTY_FORM, question_date: filterDate });
      await loadQuestions();
    } catch (e) { setFormError(e.message); } finally { setFormSaving(false); }
  };

  const handleEdit = (q) => {
    setForm({ question: q.question, option_a: q.option_a, option_b: q.option_b,
      option_c: q.option_c ?? '', option_d: q.option_d ?? '', correct_answer: q.correct_answer,
      explanation: q.explanation ?? '', category: q.category ?? 'general',
      question_date: q.question_date, is_checkout_question: q.is_checkout_question ?? false });
    setEditId(q.id); setShowForm(true); setFormMode('manual'); setFormError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل تريد حذف هذا السؤال؟')) return;
    try { await supabase.from('quiz_questions').update({ is_active: false }).eq('id', id); await loadQuestions(); } catch {}
  };

  const handleToggleCheckout = async (q) => {
    try {
      if (!q.is_checkout_question) {
        await supabase.from('quiz_questions').update({ is_checkout_question: false }).eq('question_date', q.question_date).eq('is_checkout_question', true);
        await supabase.from('quiz_questions').update({ is_checkout_question: true }).eq('id', q.id);
      } else {
        await supabase.from('quiz_questions').update({ is_checkout_question: false }).eq('id', q.id);
      }
      await loadQuestions();
    } catch {}
  };

  const getCatMeta = (key) => CATEGORIES.find(c => c.key === key) ?? CATEGORIES[0];

  return (
    <div className="space-y-4" dir="rtl">

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-text">🧠 أسئلة التدريب اليومي</h2>
          <p className="text-xs text-muted mt-0.5">{QUESTION_TEMPLATES.length} قالب متاح · توليد تلقائي · يدوي</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
            className="bg-surface border border-border rounded-xl px-3 py-2 text-sm text-text focus:border-teal focus:outline-none" />
          <button onClick={() => setShowGenerate(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-navy text-white text-sm font-bold hover:opacity-90 transition">
            ⚡ توليد تلقائي
          </button>
          <button onClick={openNewManual}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition ${showForm && !editId ? 'bg-surface border border-border text-muted' : 'bg-teal text-white hover:opacity-90'}`}>
            {showForm && !editId ? '✕ إلغاء' : '+ سؤال جديد'}
          </button>
        </div>
      </div>

      {/* ── Create / Edit Form ─────────────────────────────────── */}
      {showForm && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-border bg-surface-alt flex items-center justify-between">
            <p className="text-sm font-bold text-text">{editId ? '✏️ تعديل السؤال' : '➕ سؤال جديد'}</p>
            {!editId && (
              <button onClick={() => setFormMode('template')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal/10 border border-teal/30 text-teal text-xs font-bold hover:bg-teal/20 transition">
                🎯 اختر من القوالب
              </button>
            )}
          </div>
          <div className="p-4 space-y-4">
            {formError && (
              <div className="px-4 py-2.5 bg-red-50 border border-red-100 rounded-xl">
                <p className="text-xs text-red-600 font-semibold">{formError}</p>
              </div>
            )}
            <div>
              <label className="text-[11px] font-bold text-muted uppercase tracking-wider block mb-1.5">السؤال *</label>
              <textarea value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
                placeholder="اكتب السؤال هنا..." rows={3}
                className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text placeholder:text-muted/50 focus:border-teal focus:outline-none resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {['a','b','c','d'].map(k => (
                <div key={k}>
                  <label className="text-[11px] font-bold text-muted block mb-1.5">الخيار {ANSWER_LABELS[k]} {k < 'c' ? '*' : '(اختياري)'}</label>
                  <input value={form[`option_${k}`]} onChange={e => setForm(f => ({ ...f, [`option_${k}`]: e.target.value }))}
                    placeholder={`الخيار ${ANSWER_LABELS[k]}…`}
                    className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text placeholder:text-muted/50 focus:border-teal focus:outline-none" />
                </div>
              ))}
            </div>
            <div>
              <label className="text-[11px] font-bold text-muted uppercase tracking-wider block mb-1.5">الإجابة الصحيحة *</label>
              <div className="flex gap-2">
                {['a','b','c','d'].map(k => (
                  <button key={k} type="button" onClick={() => setForm(f => ({ ...f, correct_answer: k }))}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-black border-2 transition ${form.correct_answer === k ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-surface-alt border-border text-muted hover:border-teal/40'}`}>
                    {ANSWER_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-muted uppercase tracking-wider block mb-1.5">الفئة</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text focus:border-teal focus:outline-none">
                  {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-muted uppercase tracking-wider block mb-1.5">تاريخ السؤال</label>
                <input type="date" value={form.question_date} onChange={e => setForm(f => ({ ...f, question_date: e.target.value }))}
                  className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text focus:border-teal focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-muted uppercase tracking-wider block mb-1.5">الشرح / التوضيح (اختياري)</label>
              <textarea value={form.explanation} onChange={e => setForm(f => ({ ...f, explanation: e.target.value }))}
                placeholder="شرح يُعرض بعد الإجابة..." rows={2}
                className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text placeholder:text-muted/50 focus:border-teal focus:outline-none resize-none" />
            </div>
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-amber-50 border border-amber-100">
              <div>
                <p className="text-sm font-bold text-amber-800">⭐ سؤال عند الانصراف</p>
                <p className="text-[11px] text-amber-600 mt-0.5">يُعرض عند تسجيل الخروج</p>
              </div>
              <button type="button" onClick={() => setForm(f => ({ ...f, is_checkout_question: !f.is_checkout_question }))}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${form.is_checkout_question ? 'bg-amber-500' : 'bg-border'}`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${form.is_checkout_question ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0.5 rtl:translate-x-[-2px]'}`} />
              </button>
            </div>
            <div className="flex gap-3">
              <button onClick={handleSave} disabled={formSaving}
                className="flex-1 py-3 rounded-xl bg-teal text-white font-bold text-sm hover:opacity-90 transition disabled:opacity-60">
                {formSaving ? 'جاري الحفظ…' : editId ? '💾 حفظ التعديلات' : '✅ إضافة السؤال'}
              </button>
              <button onClick={() => { setShowForm(false); setEditId(null); setFormError(null); }}
                className="px-4 py-3 rounded-xl border border-border text-muted text-sm hover:text-red-500 transition">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Summary bar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-surface border border-border rounded-2xl">
        <span className="text-sm text-muted">يوم: <span className="font-bold text-text">{formatDateAr(filterDate)}</span></span>
        <span className="text-muted/40">·</span>
        <span className="text-sm text-muted"><span className="font-bold text-text">{questions.length}</span> سؤال</span>
        {questions.some(q => q.is_checkout_question) && (
          <><span className="text-muted/40">·</span><span className="text-xs text-amber-600 font-bold">⭐ سؤال الخروج محدد</span></>
        )}
        <button onClick={loadQuestions} className="ms-auto text-xs text-muted hover:text-teal transition">↻ تحديث</button>
      </div>

      {/* ── Questions list ─────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="bg-surface border border-border rounded-2xl p-4 animate-pulse">
              <div className="h-4 bg-surface-alt rounded w-3/4 mb-3" />
              <div className="grid grid-cols-2 gap-2">{[1,2,3,4].map(j => <div key={j} className="h-8 bg-surface-alt rounded-xl" />)}</div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-surface border border-border rounded-2xl p-6 text-center">
          <p className="text-3xl mb-3">⚠️</p>
          <p className="text-sm font-semibold text-text mb-2">خطأ في تحميل الأسئلة</p>
          <p className="text-xs text-muted">{error}</p>
        </div>
      ) : questions.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <p className="text-4xl mb-4">📝</p>
          <p className="text-base font-bold text-text mb-2">لا توجد أسئلة لهذا اليوم</p>
          <p className="text-xs text-muted mb-5">أضف أسئلة يدويًا أو استخدم التوليد التلقائي</p>
          <div className="flex gap-2 justify-center flex-wrap">
            <button onClick={openNewManual}
              className="px-4 py-2 rounded-xl bg-teal text-white text-sm font-bold hover:opacity-90 transition">
              + سؤال يدوي
            </button>
            <button onClick={() => setShowGenerate(true)}
              className="px-4 py-2 rounded-xl bg-navy text-white text-sm font-bold hover:opacity-90 transition">
              ⚡ توليد تلقائي
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q, idx) => {
            const catMeta = getCatMeta(q.category);
            const stats   = statsMap[q.id] ?? { total: 0, correct: 0 };
            const pct     = stats.total ? Math.round(stats.correct / stats.total * 100) : null;
            const opts    = [{ k:'a', t:q.option_a },{ k:'b', t:q.option_b },{ k:'c', t:q.option_c },{ k:'d', t:q.option_d }].filter(o => o.t);
            return (
              <div key={q.id} className="bg-surface border border-border rounded-2xl overflow-hidden">
                <div className="px-4 py-3 flex items-center gap-2 border-b border-border/50">
                  <span className="w-6 h-6 rounded-lg bg-navy/10 text-navy text-[11px] font-black flex items-center justify-center shrink-0">{idx + 1}</span>
                  <span className="flex items-center gap-1 text-[11px] font-bold text-teal bg-teal/10 px-2 py-0.5 rounded-full">{catMeta.icon} {catMeta.label}</span>
                  {q.is_checkout_question && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">⭐ خروج</span>}
                  {stats.total > 0 && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ms-auto shrink-0 ${pct >= 70 ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'}`}>
                      {pct}% ({stats.total})
                    </span>
                  )}
                </div>
                <div className="px-4 py-3">
                  <p className="text-sm font-semibold text-text leading-relaxed">{q.question}</p>
                  {q.explanation && <p className="text-[11px] text-muted mt-1.5 leading-relaxed">💡 {q.explanation}</p>}
                </div>
                <div className="px-4 pb-3 grid grid-cols-2 gap-1.5">
                  {opts.map(o => (
                    <div key={o.k} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs border ${o.k === q.correct_answer ? 'border-emerald-300 bg-emerald-50 text-emerald-800 font-bold' : 'border-border bg-surface-alt text-muted'}`}>
                      <span className={`w-5 h-5 rounded flex items-center justify-center font-black text-[10px] shrink-0 ${o.k === q.correct_answer ? 'bg-emerald-500 text-white' : 'bg-border/50 text-muted'}`}>{ANSWER_LABELS[o.k]}</span>
                      <span className="truncate">{o.t}</span>
                    </div>
                  ))}
                </div>
                <div className="px-4 pb-3 flex items-center gap-2 pt-1 border-t border-border/30">
                  <button onClick={() => handleToggleCheckout(q)}
                    className={`text-[11px] font-bold px-3 py-1.5 rounded-xl transition border ${q.is_checkout_question ? 'bg-amber-100 border-amber-200 text-amber-700' : 'bg-surface-alt border-border text-muted hover:border-amber-300'}`}>
                    {q.is_checkout_question ? '⭐ إلغاء الخروج' : '☆ سؤال الخروج'}
                  </button>
                  <button onClick={() => handleEdit(q)} className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-surface-alt border border-border text-muted hover:border-teal/40 hover:text-teal transition">✏️ تعديل</button>
                  <button onClick={() => handleDelete(q.id)} className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-surface-alt border border-border text-muted hover:border-red/40 hover:text-red-fg transition ms-auto">🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Panels ─────────────────────────────────────────────── */}
      {formMode === 'template' && (
        <TemplatePicker
          targetDate={filterDate}
          onSelect={handleTemplateSelect}
          onClose={() => setFormMode('manual')}
        />
      )}
      {showGenerate && (
        <AutoGeneratePanel
          onClose={() => setShowGenerate(false)}
          onGenerated={async (count) => {
            setShowGenerate(false);
            await loadQuestions();
            alert(`✅ تم إنشاء ${count} سؤال بنجاح!`);
          }}
        />
      )}
    </div>
  );
}
