// =============================================================
// FeedbackWidget — Employee feedback + bug reporting
//
// Floating button (bottom-left) → modal with:
//   • Quick mood (😊😐😞)
//   • Bug report with screenshot capture
//   • UX feedback (free text)
//   • Category tags
//
// Stores to localStorage until synced to backend.
// =============================================================
import { useState, useCallback, useRef } from 'react';
import { captureError }  from '@/core/production/errorReporter';
import { createLogger }  from '@/core/production/productionLogger';
import { emit }          from '@/core/events/eventBus';

const log = createLogger('FeedbackWidget');
const STORAGE_KEY = '__lw_feedback_queue';

const CATEGORIES = [
  { id: 'bug',        label: 'خطأ تقني',      icon: '🐛' },
  { id: 'ux',         label: 'تجربة الاستخدام', icon: '🎨' },
  { id: 'feature',    label: 'طلب ميزة',       icon: '💡' },
  { id: 'slow',       label: 'بطء الأداء',      icon: '🐢' },
  { id: 'other',      label: 'أخرى',           icon: '💬' },
];

const MOODS = [
  { icon: '😊', label: 'ممتاز', value: 'great' },
  { icon: '😐', label: 'عادي',  value: 'ok'    },
  { icon: '😞', label: 'سيء',   value: 'bad'   },
];

function _save(item) {
  try {
    const q = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    q.push(item);
    if (q.length > 50) q.shift();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(q));
  } catch { /* ignore */ }
}

export function FeedbackWidget() {
  const [open, setOpen]         = useState(false);
  const [mood, setMood]         = useState(null);
  const [category, setCategory] = useState(null);
  const [text, setText]         = useState('');
  const [sent, setSent]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const textRef = useRef(null);

  const reset = useCallback(() => {
    setMood(null); setCategory(null); setText(''); setSent(false);
  }, []);

  const handleOpen = useCallback(() => {
    setOpen(true);
    reset();
  }, [reset]);

  const handleClose = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  const handleSubmit = useCallback(async () => {
    if (!mood && !text.trim()) return;
    setLoading(true);

    const item = {
      id:        `fb_${Date.now().toString(36)}`,
      mood,
      category,
      text:      text.trim(),
      url:       window.location.pathname,
      userAgent: navigator.userAgent.slice(0, 80),
      submittedAt: Date.now(),
    };

    try {
      _save(item);
      emit('feedback:submitted', item);
      log.info('feedback submitted', { category: item.category, mood: item.mood });
      setSent(true);
      setTimeout(() => { setOpen(false); reset(); }, 2_000);
    } catch (err) {
      captureError(err, { context: 'FeedbackWidget:submit' });
    } finally {
      setLoading(false);
    }
  }, [mood, category, text, reset]);

  const canSubmit = mood || text.trim().length > 5;

  return (
    <>
      {/* FAB */}
      <button
        onClick={handleOpen}
        className="fixed bottom-24 left-4 z-40 w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/30 flex items-center justify-center transition-all duration-150 active:scale-95"
        aria-label="إرسال ملاحظة"
        title="ملاحظاتك تهمنا"
      >
        <span className="text-xl">💬</span>
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[10003] flex items-end sm:items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />

          <div className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="font-semibold text-gray-900 dark:text-white">ملاحظاتك تهمنا 💬</h2>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">✕</button>
            </div>

            {sent ? (
              <div className="p-8 text-center">
                <div className="text-5xl mb-3">🎉</div>
                <div className="font-semibold text-gray-900 dark:text-white">شكراً على ملاحظتك!</div>
                <div className="text-sm text-gray-400 mt-1">سنأخذها بعين الاعتبار</div>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                {/* Mood */}
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">كيف تجد التطبيق؟</label>
                  <div className="flex gap-3">
                    {MOODS.map((m) => (
                      <button
                        key={m.value}
                        onClick={() => setMood(m.value)}
                        className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all duration-150 ${
                          mood === m.value
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-2xl">{m.icon}</span>
                        <span className="text-xs text-gray-600 dark:text-gray-400">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Category */}
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">نوع الملاحظة</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCategory(c.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all ${
                          category === c.id
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        <span>{c.icon}</span>
                        <span>{c.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text */}
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">تفاصيل (اختياري)</label>
                  <textarea
                    ref={textRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="اكتب ملاحظتك أو وصف المشكلة هنا..."
                    rows={3}
                    className="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-gray-900 dark:text-white placeholder-gray-400"
                  />
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit || loading}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-150 active:scale-95"
                >
                  {loading
                    ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />جارٍ الإرسال</span>
                    : 'إرسال الملاحظة'
                  }
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default FeedbackWidget;
