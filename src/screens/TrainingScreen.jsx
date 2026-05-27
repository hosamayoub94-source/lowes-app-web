// =============================================================
// TrainingScreen — التدريب اليومي على المنتجات والمعرفة
// اختبارات يومية · أسئلة وأجوبة · تثقيف الموظفين
// مجهولة تمامًا — لا يُحفظ اسم المستجيب في قاعدة البيانات
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@services/supabase';
import { useAuth }  from '@hooks/useAuth';
import { Link }     from 'react-router-dom';

const CATEGORIES = [
  { key: 'all',         label: 'الكل',        icon: '📚' },
  { key: 'products',    label: 'المنتجات',     icon: '🧴' },
  { key: 'skincare',    label: 'العناية',      icon: '✨' },
  { key: 'ingredients', label: 'المكونات',     icon: '🔬' },
  { key: 'company',     label: 'الشركة',       icon: '🏢' },
  { key: 'customer_qa', label: 'أسئلة العملاء', icon: '💬' },
  { key: 'general',     label: 'عام',          icon: '💡' },
];

const ANSWER_LABELS = { a: 'أ', b: 'ب', c: 'ج', d: 'د' };
const ANSWER_KEYS   = ['a', 'b', 'c', 'd'];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return iso; }
}

// ── Single Question Card ───────────────────────────────────────
function QuestionCard({ question, answered, onAnswer }) {
  const options = [
    { key: 'a', text: question.option_a },
    { key: 'b', text: question.option_b },
    { key: 'c', text: question.option_c },
    { key: 'd', text: question.option_d },
  ].filter(o => o.text);

  const isAnswered   = !!answered;
  const correctKey   = question.correct_answer;
  const selectedKey  = answered?.selected;
  const wasCorrect   = answered?.isCorrect;

  const getCategoryMeta = (cat) => CATEGORIES.find(c => c.key === cat) ?? CATEGORIES[0];
  const catMeta = getCategoryMeta(question.category);

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-border/50">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-teal bg-teal/10 px-2.5 py-1 rounded-full">
          {catMeta.icon} {catMeta.label}
        </span>
        <div className="flex items-center gap-2">
          {question.is_checkout_question && (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">⭐ سؤال الخروج</span>
          )}
          {isAnswered && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${wasCorrect ? 'text-emerald-600 bg-emerald-50' : 'text-red-500 bg-red-50'}`}>
              {wasCorrect ? '✅ صح' : '❌ خطأ'}
            </span>
          )}
        </div>
      </div>

      {/* Question text */}
      <div className="px-4 pt-4 pb-3">
        <p className="text-sm font-semibold text-text leading-relaxed">{question.question}</p>
      </div>

      {/* Options */}
      <div className="px-4 pb-4 space-y-2">
        {options.map(opt => {
          const isCorrect  = opt.key === correctKey;
          const isSelected = opt.key === selectedKey;
          let cls = 'border-border bg-surface-alt hover:border-teal/40 hover:bg-teal/5';

          if (isAnswered) {
            if (isCorrect) cls = 'border-emerald-400 bg-emerald-50 text-emerald-800';
            else if (isSelected && !isCorrect) cls = 'border-red-400 bg-red-50 text-red-700';
            else cls = 'border-border/50 bg-surface-alt/50 opacity-60';
          }

          return (
            <button
              key={opt.key}
              disabled={isAnswered}
              onClick={() => onAnswer(question, opt.key)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-start transition-all ${cls} ${!isAnswered ? 'active:scale-[0.99]' : ''}`}
            >
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                isAnswered
                  ? isCorrect ? 'bg-emerald-500 text-white' : isSelected ? 'bg-red-500 text-white' : 'bg-border text-muted'
                  : 'bg-navy/10 text-navy font-black'
              }`}>
                {ANSWER_LABELS[opt.key]}
              </span>
              <span className="text-sm font-medium flex-1">{opt.text}</span>
              {isAnswered && isCorrect && <span className="shrink-0 text-emerald-600 font-bold">✓</span>}
              {isAnswered && isSelected && !isCorrect && <span className="shrink-0 text-red-500">✗</span>}
            </button>
          );
        })}

        {/* Explanation */}
        {isAnswered && question.explanation && (
          <div className="mt-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-100">
            <p className="text-[11px] font-bold text-blue-700 mb-1">💡 التوضيح</p>
            <p className="text-xs text-blue-800 leading-relaxed">{question.explanation}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Screen ────────────────────────────────────────────────
export default function TrainingScreen() {
  const { role } = useAuth();
  const isAdmin  = role === 'admin' || role === 'manager';

  const [questions, setQuestions]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [activeCategory, setActiveCat] = useState('all');
  const [answered, setAnswered]     = useState({}); // { [questionId]: { selected, isCorrect } }
  const [statsMap, setStatsMap]     = useState({}); // { [questionId]: { total, correct } }

  // Load today's questions
  const loadQuestions = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const today = todayISO();
      const { data, error: e } = await supabase
        .from('quiz_questions')
        .select('*')
        .eq('question_date', today)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (e) {
        if (e.code === 'PGRST205' || e.code === '42P01') {
          setError('لم يتم إعداد نظام الاختبارات بعد. يرجى تشغيل ملف الـ migration SQL.');
          setQuestions([]);
          return;
        }
        throw e;
      }
      setQuestions(data ?? []);

      // Load response stats for today
      if (data && data.length > 0) {
        const ids = data.map(q => q.id);
        const { data: responses } = await supabase
          .from('quiz_responses')
          .select('question_id, is_correct')
          .in('question_id', ids);

        const sm = {};
        (responses ?? []).forEach(r => {
          if (!sm[r.question_id]) sm[r.question_id] = { total: 0, correct: 0 };
          sm[r.question_id].total++;
          if (r.is_correct) sm[r.question_id].correct++;
        });
        setStatsMap(sm);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadQuestions(); }, [loadQuestions]);

  // Handle answering a question
  const handleAnswer = async (question, selectedKey) => {
    if (answered[question.id]) return;

    const isCorrect = selectedKey === question.correct_answer;
    setAnswered(a => ({ ...a, [question.id]: { selected: selectedKey, isCorrect } }));

    // Submit anonymous response to DB
    try {
      await supabase.from('quiz_responses').insert({
        question_id:     question.id,
        selected_answer: selectedKey,
        is_correct:      isCorrect,
        source:          'training',
      });
      // Update local stats
      setStatsMap(sm => ({
        ...sm,
        [question.id]: {
          total:   (sm[question.id]?.total ?? 0) + 1,
          correct: (sm[question.id]?.correct ?? 0) + (isCorrect ? 1 : 0),
        },
      }));
    } catch {}
  };

  // Filtered questions by category
  const filteredQ = activeCategory === 'all'
    ? questions
    : questions.filter(q => q.category === activeCategory);

  const answeredCount = Object.keys(answered).filter(id => questions.find(q => q.id === id)).length;
  const correctCount  = Object.values(answered).filter(a => a.isCorrect).length;

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-24 sm:pb-8" dir="rtl">

      {/* ── Header ────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-teal to-navy rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-4 -end-4 w-32 h-32 rounded-full bg-white" />
          <div className="absolute -bottom-8 -start-8 w-48 h-48 rounded-full bg-white" />
        </div>
        <div className="relative">
          <div className="flex items-center justify-between mb-1">
            <span className="text-3xl">🧠</span>
            {isAdmin && (
              <Link to="/admin/quiz"
                className="text-xs font-bold bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-xl transition">
                ⚙️ إدارة الأسئلة
              </Link>
            )}
          </div>
          <h1 className="text-2xl font-black mt-2">التدريب اليومي</h1>
          <p className="text-white/70 text-xs mt-0.5">{formatDate(todayISO())}</p>

          {questions.length > 0 && (
            <div className="mt-4 flex items-center gap-4">
              <div className="flex-1 bg-white/20 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-700"
                  style={{ width: `${questions.length ? (answeredCount / questions.length * 100) : 0}%` }}
                />
              </div>
              <span className="text-sm font-bold text-white/90 shrink-0">
                {answeredCount}/{questions.length}
              </span>
            </div>
          )}
          {answeredCount > 0 && (
            <p className="text-xs text-white/70 mt-1.5">
              {correctCount} إجابة صحيحة من {answeredCount} — {Math.round(correctCount / answeredCount * 100)}% ✨
            </p>
          )}
        </div>
      </div>

      {/* ── Category tabs ─────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
        {CATEGORIES.filter(c => c.key === 'all' || questions.some(q => q.category === c.key)).map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveCat(cat.key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border shrink-0 ${
              activeCategory === cat.key
                ? 'bg-navy text-white border-transparent shadow-sm'
                : 'bg-surface text-muted border-border hover:border-teal/40'
            }`}
          >
            {cat.icon} {cat.label}
            {cat.key !== 'all' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${activeCategory === cat.key ? 'bg-white/20 text-white' : 'bg-surface-alt text-muted'}`}>
                {questions.filter(q => q.category === cat.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ───────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-surface border border-border rounded-2xl p-4 space-y-3 animate-pulse">
              <div className="h-3 bg-surface-alt rounded w-1/4" />
              <div className="h-4 bg-surface-alt rounded w-3/4" />
              <div className="h-4 bg-surface-alt rounded w-1/2" />
              {[1,2,3,4].map(j => <div key={j} className="h-12 bg-surface-alt rounded-xl" />)}
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-surface border border-border rounded-2xl p-6 text-center">
          <p className="text-3xl mb-3">⚠️</p>
          <p className="text-sm font-semibold text-text mb-1">خطأ في تحميل الأسئلة</p>
          <p className="text-xs text-muted mb-4 leading-relaxed">{error}</p>
          <button onClick={loadQuestions} className="px-4 py-2 rounded-xl bg-teal text-white text-sm font-bold hover:opacity-90 transition">
            إعادة المحاولة
          </button>
        </div>
      ) : filteredQ.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <p className="text-4xl mb-4">📚</p>
          <p className="text-base font-bold text-text mb-2">
            {questions.length === 0 ? 'لا توجد أسئلة لهذا اليوم' : 'لا توجد أسئلة في هذه الفئة'}
          </p>
          <p className="text-xs text-muted leading-relaxed">
            {questions.length === 0
              ? isAdmin
                ? 'انتقل إلى إدارة الأسئلة لإضافة أسئلة جديدة لهذا اليوم'
                : 'سيتم إضافة أسئلة اليوم قريباً من المسؤول'
              : 'جرّب فئة أخرى'}
          </p>
          {questions.length === 0 && isAdmin && (
            <Link to="/admin/quiz" className="inline-block mt-4 px-4 py-2 rounded-xl bg-teal text-white text-sm font-bold hover:opacity-90 transition">
              + إضافة أسئلة
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Privacy notice */}
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-100">
            <span className="text-lg shrink-0">🔒</span>
            <div>
              <p className="text-xs font-bold text-blue-800">ملاحظة خصوصية</p>
              <p className="text-[11px] text-blue-700 mt-0.5 leading-relaxed">
                إجاباتك مجهولة تمامًا — لن يستطيع أحد رؤية ردودك الشخصية. الغرض فقط تثقيفي.
              </p>
            </div>
          </div>

          {filteredQ.map(q => (
            <QuestionCard
              key={q.id}
              question={q}
              answered={answered[q.id] ?? null}
              onAnswer={handleAnswer}
            />
          ))}

          {/* Completion message */}
          {answeredCount === questions.length && questions.length > 0 && (
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white text-center shadow-lg">
              <p className="text-4xl mb-3">🎉</p>
              <p className="text-lg font-black">أحسنت! أجبت على كل الأسئلة</p>
              <p className="text-white/80 text-sm mt-1">
                {correctCount} صحيحة من {answeredCount} — {Math.round(correctCount / answeredCount * 100)}%
              </p>
              {correctCount === answeredCount && (
                <p className="text-white/70 text-xs mt-2">💯 إجابات كاملة! أنت محترف حقيقي 🌟</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
