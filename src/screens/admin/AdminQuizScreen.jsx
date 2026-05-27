// =============================================================
// AdminQuizScreen — إدارة أسئلة الاختبار اليومي
// إضافة / تعديل / حذف الأسئلة + تحديد سؤال الخروج
// Admin & Manager only
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@services/supabase';
import { useAuth }  from '@hooks/useAuth';

const CATEGORIES = [
  { key: 'general',     label: 'عام',            icon: '💡' },
  { key: 'products',    label: 'المنتجات',        icon: '🧴' },
  { key: 'skincare',    label: 'العناية بالبشرة', icon: '✨' },
  { key: 'ingredients', label: 'المكونات',        icon: '🔬' },
  { key: 'company',     label: 'الشركة',          icon: '🏢' },
  { key: 'customer_qa', label: 'أسئلة العملاء',   icon: '💬' },
];
const ANSWER_LABELS = { a: 'أ', b: 'ب', c: 'ج', d: 'د' };

const EMPTY_FORM = {
  question: '',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  correct_answer: 'a',
  explanation: '',
  category: 'general',
  question_date: new Date().toISOString().slice(0, 10),
  is_checkout_question: false,
};

function todayISO() { return new Date().toISOString().slice(0, 10); }

function formatDateAr(iso) {
  try { return new Date(iso).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

export default function AdminQuizScreen() {
  const { name }  = useAuth();

  const [questions, setQuestions] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [filterDate, setFilterDate] = useState(todayISO());
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [editId, setEditId]       = useState(null);
  const [statsMap, setStatsMap]   = useState({});

  const loadQuestions = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: e } = await supabase
        .from('quiz_questions')
        .select('*')
        .eq('question_date', filterDate)
        .order('is_checkout_question', { ascending: false })
        .order('created_at', { ascending: true });

      if (e) {
        if (e.code === 'PGRST205' || e.code === '42P01') {
          setError('جدول الأسئلة غير موجود بعد. قم بتشغيل Migration SQL v5 في Supabase Dashboard.');
          setQuestions([]);
          return;
        }
        throw e;
      }
      setQuestions(data ?? []);

      // Load response stats
      if (data && data.length > 0) {
        const ids = data.map(q => q.id);
        const { data: resp } = await supabase
          .from('quiz_responses')
          .select('question_id, is_correct')
          .in('question_id', ids);
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

  const handleSave = async () => {
    // Validation
    if (!form.question.trim())  { setFormError('السؤال مطلوب'); return; }
    if (!form.option_a.trim())  { setFormError('الخيار أ مطلوب'); return; }
    if (!form.option_b.trim())  { setFormError('الخيار ب مطلوب'); return; }
    setFormError(null);
    setFormSaving(true);

    try {
      const payload = {
        question:            form.question.trim(),
        option_a:            form.option_a.trim(),
        option_b:            form.option_b.trim(),
        option_c:            form.option_c.trim() || null,
        option_d:            form.option_d.trim() || null,
        correct_answer:      form.correct_answer,
        explanation:         form.explanation.trim() || null,
        category:            form.category,
        question_date:       form.question_date,
        is_checkout_question: form.is_checkout_question,
        is_active:           true,
        created_by:          name,
      };

      // If marking as checkout question, unmark any existing checkout question for that date
      if (form.is_checkout_question && !editId) {
        await supabase.from('quiz_questions')
          .update({ is_checkout_question: false })
          .eq('question_date', form.question_date)
          .eq('is_checkout_question', true);
      }

      let err;
      if (editId) {
        const { error } = await supabase.from('quiz_questions').update(payload).eq('id', editId);
        err = error;
      } else {
        const { error } = await supabase.from('quiz_questions').insert(payload);
        err = error;
      }

      if (err) throw err;

      setShowForm(false);
      setEditId(null);
      setForm({ ...EMPTY_FORM, question_date: filterDate });
      await loadQuestions();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setFormSaving(false);
    }
  };

  const handleEdit = (q) => {
    setForm({
      question:            q.question,
      option_a:            q.option_a,
      option_b:            q.option_b,
      option_c:            q.option_c ?? '',
      option_d:            q.option_d ?? '',
      correct_answer:      q.correct_answer,
      explanation:         q.explanation ?? '',
      category:            q.category ?? 'general',
      question_date:       q.question_date,
      is_checkout_question: q.is_checkout_question ?? false,
    });
    setEditId(q.id);
    setShowForm(true);
    setFormError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل تريد حذف هذا السؤال نهائياً؟')) return;
    try {
      await supabase.from('quiz_questions').update({ is_active: false }).eq('id', id);
      await loadQuestions();
    } catch {}
  };

  const handleToggleCheckout = async (q) => {
    try {
      if (!q.is_checkout_question) {
        // Unmark any existing checkout question for this date
        await supabase.from('quiz_questions')
          .update({ is_checkout_question: false })
          .eq('question_date', q.question_date)
          .eq('is_checkout_question', true);
        await supabase.from('quiz_questions')
          .update({ is_checkout_question: true })
          .eq('id', q.id);
      } else {
        await supabase.from('quiz_questions')
          .update({ is_checkout_question: false })
          .eq('id', q.id);
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
          <h2 className="text-base font-black text-text">🧠 إدارة أسئلة الاختبار</h2>
          <p className="text-xs text-muted mt-0.5">إضافة وتعديل أسئلة الاختبار اليومي</p>
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="bg-surface border border-border rounded-xl px-3 py-2 text-sm text-text focus:border-teal focus:outline-none"
          />
          <button
            onClick={() => { setShowForm(s => !s); setEditId(null); setForm({ ...EMPTY_FORM, question_date: filterDate }); setFormError(null); }}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition ${showForm && !editId ? 'bg-surface border border-border text-muted' : 'bg-teal text-white hover:opacity-90'}`}
          >
            {showForm && !editId ? '✕ إلغاء' : '+ سؤال جديد'}
          </button>
        </div>
      </div>

      {/* ── Create / Edit Form ─────────────────────────────────── */}
      {showForm && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-border bg-surface-alt">
            <p className="text-sm font-bold text-text">{editId ? '✏️ تعديل السؤال' : '➕ سؤال جديد'}</p>
          </div>
          <div className="p-4 space-y-4">
            {formError && (
              <div className="px-4 py-2.5 bg-red-50 border border-red-100 rounded-xl">
                <p className="text-xs text-red-600 font-semibold">{formError}</p>
              </div>
            )}

            {/* Question */}
            <div>
              <label className="text-[11px] font-bold text-muted uppercase tracking-wider block mb-1.5">السؤال *</label>
              <textarea
                value={form.question}
                onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
                placeholder="أكتب السؤال هنا..."
                rows={3}
                className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text placeholder:text-muted/50 focus:border-teal focus:outline-none resize-none"
              />
            </div>

            {/* Options */}
            <div className="grid grid-cols-2 gap-3">
              {['a', 'b', 'c', 'd'].map(k => (
                <div key={k}>
                  <label className="text-[11px] font-bold text-muted block mb-1.5">
                    الخيار {ANSWER_LABELS[k]} {k === 'a' || k === 'b' ? '*' : '(اختياري)'}
                  </label>
                  <input
                    value={form[`option_${k}`]}
                    onChange={e => setForm(f => ({ ...f, [`option_${k}`]: e.target.value }))}
                    placeholder={`الخيار ${ANSWER_LABELS[k]}…`}
                    className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text placeholder:text-muted/50 focus:border-teal focus:outline-none"
                  />
                </div>
              ))}
            </div>

            {/* Correct answer */}
            <div>
              <label className="text-[11px] font-bold text-muted uppercase tracking-wider block mb-1.5">الإجابة الصحيحة *</label>
              <div className="flex gap-2">
                {['a', 'b', 'c', 'd'].map(k => (
                  <button key={k}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, correct_answer: k }))}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-black border-2 transition ${
                      form.correct_answer === k
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'bg-surface-alt border-border text-muted hover:border-teal/40'
                    }`}
                  >
                    {ANSWER_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>

            {/* Category + Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-muted uppercase tracking-wider block mb-1.5">الفئة</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text focus:border-teal focus:outline-none"
                >
                  {CATEGORIES.map(c => (
                    <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-muted uppercase tracking-wider block mb-1.5">تاريخ السؤال</label>
                <input
                  type="date"
                  value={form.question_date}
                  onChange={e => setForm(f => ({ ...f, question_date: e.target.value }))}
                  className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text focus:border-teal focus:outline-none"
                />
              </div>
            </div>

            {/* Explanation */}
            <div>
              <label className="text-[11px] font-bold text-muted uppercase tracking-wider block mb-1.5">التوضيح / الشرح (اختياري)</label>
              <textarea
                value={form.explanation}
                onChange={e => setForm(f => ({ ...f, explanation: e.target.value }))}
                placeholder="أضف شرحًا يُعرض بعد الإجابة..."
                rows={2}
                className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text placeholder:text-muted/50 focus:border-teal focus:outline-none resize-none"
              />
            </div>

            {/* Checkout question toggle */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-amber-50 border border-amber-100">
              <div>
                <p className="text-sm font-bold text-amber-800">⭐ سؤال عند الانصراف</p>
                <p className="text-[11px] text-amber-600 mt-0.5">يُعرض اختياريًا عند تسجيل الخروج</p>
              </div>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, is_checkout_question: !f.is_checkout_question }))}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${form.is_checkout_question ? 'bg-amber-500' : 'bg-border'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${form.is_checkout_question ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0.5 rtl:translate-x-[-2px]'}`} />
              </button>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={handleSave} disabled={formSaving}
                className="flex-1 py-3 rounded-xl bg-teal text-white font-bold text-sm hover:opacity-90 transition disabled:opacity-60">
                {formSaving ? 'جاري الحفظ…' : editId ? '💾 حفظ التعديلات' : '✅ إضافة السؤال'}
              </button>
              <button onClick={() => { setShowForm(false); setEditId(null); setFormError(null); }}
                className="px-4 py-3 rounded-xl border border-border text-muted text-sm hover:text-red-fg transition">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Summary bar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-surface border border-border rounded-2xl">
        <span className="text-sm text-muted">
          يوم: <span className="font-bold text-text">{formatDateAr(filterDate)}</span>
        </span>
        <span className="text-muted/40">·</span>
        <span className="text-sm text-muted">
          <span className="font-bold text-text">{questions.length}</span> سؤال
        </span>
        {questions.some(q => q.is_checkout_question) && (
          <>
            <span className="text-muted/40">·</span>
            <span className="text-xs text-amber-600 font-bold">⭐ سؤال الخروج محدد</span>
          </>
        )}
      </div>

      {/* ── Questions list ─────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="bg-surface border border-border rounded-2xl p-4 animate-pulse">
              <div className="h-4 bg-surface-alt rounded w-3/4 mb-3" />
              <div className="grid grid-cols-2 gap-2">
                {[1,2,3,4].map(j => <div key={j} className="h-8 bg-surface-alt rounded-xl" />)}
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-surface border border-border rounded-2xl p-6 text-center">
          <p className="text-3xl mb-3">⚠️</p>
          <p className="text-sm font-semibold text-text mb-2">خطأ في تحميل الأسئلة</p>
          <p className="text-xs text-muted mb-4 leading-relaxed">{error}</p>
          <div className="bg-surface-alt border border-border rounded-xl p-3 text-start text-xs text-muted leading-relaxed">
            <p className="font-bold text-text mb-1">📋 تعليمات تشغيل Migration:</p>
            <p>1. افتح Supabase Dashboard</p>
            <p>2. انتقل إلى SQL Editor</p>
            <p>3. انسخ محتوى ملف: <code className="bg-surface px-1 rounded">supabase_migration_v5_profile_quiz.sql</code></p>
            <p>4. نفّذ الاستعلام</p>
          </div>
        </div>
      ) : questions.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <p className="text-4xl mb-4">📝</p>
          <p className="text-base font-bold text-text mb-2">لا توجد أسئلة لهذا اليوم</p>
          <p className="text-xs text-muted mb-4">اضغط على "سؤال جديد" لإضافة أسئلة اليوم</p>
          <button onClick={() => { setShowForm(true); setForm({ ...EMPTY_FORM, question_date: filterDate }); }}
            className="px-4 py-2 rounded-xl bg-teal text-white text-sm font-bold hover:opacity-90 transition">
            + إضافة أول سؤال
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q, idx) => {
            const catMeta = getCatMeta(q.category);
            const stats   = statsMap[q.id] ?? { total: 0, correct: 0 };
            const pct     = stats.total ? Math.round(stats.correct / stats.total * 100) : null;
            const opts    = [
              { k: 'a', t: q.option_a },
              { k: 'b', t: q.option_b },
              { k: 'c', t: q.option_c },
              { k: 'd', t: q.option_d },
            ].filter(o => o.t);

            return (
              <div key={q.id} className="bg-surface border border-border rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 flex items-center gap-2 border-b border-border/50">
                  <span className="w-6 h-6 rounded-lg bg-navy/10 text-navy text-[11px] font-black flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] font-bold text-teal bg-teal/10 px-2 py-0.5 rounded-full">
                    {catMeta.icon} {catMeta.label}
                  </span>
                  {q.is_checkout_question && (
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">⭐ سؤال الخروج</span>
                  )}
                  {stats.total > 0 && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ms-auto shrink-0 ${pct >= 70 ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'}`}>
                      {pct}% ✓ ({stats.total})
                    </span>
                  )}
                </div>

                {/* Question */}
                <div className="px-4 py-3">
                  <p className="text-sm font-semibold text-text leading-relaxed">{q.question}</p>
                  {q.explanation && (
                    <p className="text-[11px] text-muted mt-1.5 leading-relaxed">💡 {q.explanation}</p>
                  )}
                </div>

                {/* Options compact */}
                <div className="px-4 pb-3 grid grid-cols-2 gap-1.5">
                  {opts.map(o => (
                    <div key={o.k}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs border ${
                        o.k === q.correct_answer
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 font-bold'
                          : 'border-border bg-surface-alt text-muted'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded flex items-center justify-center font-black text-[10px] shrink-0 ${o.k === q.correct_answer ? 'bg-emerald-500 text-white' : 'bg-border/50 text-muted'}`}>
                        {ANSWER_LABELS[o.k]}
                      </span>
                      <span className="truncate">{o.t}</span>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="px-4 pb-3 flex items-center gap-2 pt-1 border-t border-border/30">
                  <button onClick={() => handleToggleCheckout(q)}
                    className={`text-[11px] font-bold px-3 py-1.5 rounded-xl transition border ${
                      q.is_checkout_question
                        ? 'bg-amber-100 border-amber-200 text-amber-700'
                        : 'bg-surface-alt border-border text-muted hover:border-amber-300'
                    }`}
                  >
                    {q.is_checkout_question ? '⭐ إلغاء سؤال الخروج' : '☆ سؤال الخروج'}
                  </button>
                  <button onClick={() => handleEdit(q)}
                    className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-surface-alt border border-border text-muted hover:border-teal/40 hover:text-teal transition">
                    ✏️ تعديل
                  </button>
                  <button onClick={() => handleDelete(q.id)}
                    className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-surface-alt border border-border text-muted hover:border-red/40 hover:text-red-fg transition ms-auto">
                    🗑️ حذف
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
