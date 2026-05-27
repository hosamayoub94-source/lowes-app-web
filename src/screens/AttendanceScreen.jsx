// =============================================================
// AttendanceScreen 5.0 — سجل الحضور اليومي
// Schema الحقيقي في DB:
//   date: text "YYYY/MM/DD"
//   type: "in" | "out"  (صف منفصل لكل حدث)
//   time_in: "HH:MM"   (يُستخدم للحضور والانصراف معاً)
// =============================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth }   from '@hooks/useAuth';
import { supabase }  from '@services/supabase';

// ── Date helpers ───────────────────────────────────────────────
/** Returns "YYYY/MM/DD" — matches DB text format */
function todaySlash() {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

/** Returns "YYYY/MM/DD" for a Date offset by i days back */
function slashDate(daysBack = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

/** Last 7 days as "YYYY/MM/DD", oldest first */
function last7DaysSlash() {
  return Array.from({ length: 7 }, (_, i) => slashDate(6 - i));
}

/** "YYYY/MM/DD" → ISO for Date() parsing */
function slashToISO(slash) {
  return slash.replace(/\//g, '-');
}

/** Arabic label from "YYYY/MM/DD" */
function dayLabelSlash(slash) {
  const today = todaySlash();
  if (slash === today) return 'اليوم';
  const d    = new Date(slashToISO(slash) + 'T00:00:00');
  const tDay = new Date(slashToISO(today)  + 'T00:00:00');
  const diff = Math.round((tDay - d) / 86400000);
  if (diff === 1) return 'أمس';
  return d.toLocaleDateString('ar-SA', { weekday: 'short' });
}

/** Arabic full day name from "YYYY/MM/DD" */
function arabicDaySlash(slash) {
  return new Date(slashToISO(slash) + 'T00:00:00').toLocaleDateString('ar-SA', { weekday: 'long' });
}

/** HH:MM for DB storage */
function nowHHMM() {
  const d = new Date();
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

/** HH:MM:SS for live clock */
function nowHHMMSS() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2,'0')).join(':');
}

function calcDuration(timeIn, timeOut) {
  if (!timeIn) return null;
  const parse = t => { const [h,m] = t.slice(0,5).split(':').map(Number); return h*60+m; };
  const start  = parse(timeIn);
  const end    = timeOut ? parse(timeOut) : (new Date().getHours()*60 + new Date().getMinutes());
  let mins = end - start;
  if (mins < 0) mins += 1440;
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}س ${m}د` : `${m}د`;
}

// ── Day badge in weekly strip ──────────────────────────────────
function DayBadge({ dayRec, slash }) {
  const today   = todaySlash();
  const isToday = slash === today;
  const isFuture = slash > today;

  if (isFuture) return (
    <div className="flex flex-col items-center gap-1 p-2 rounded-xl border border-border bg-surface opacity-30">
      <span className="text-[10px] font-bold text-muted">{dayLabelSlash(slash)}</span>
      <span className="text-lg">—</span>
    </div>
  );

  const checkIn  = dayRec?.checkIn;
  const checkOut = dayRec?.checkOut;
  const complete = !!(checkIn && checkOut);

  if (!checkIn) return (
    <div className={`flex flex-col items-center gap-1 p-2 rounded-xl border ${isToday ? 'border-teal/30 bg-teal/5' : 'border-border/50 bg-surface-alt/50'}`}>
      <span className={`text-[10px] font-bold ${isToday ? 'text-teal' : 'text-muted'}`}>{dayLabelSlash(slash)}</span>
      <span className="text-lg">{isToday ? '⏳' : '❌'}</span>
      <span className="text-[9px] text-muted/60">{isToday ? 'الآن' : 'غياب'}</span>
    </div>
  );

  return (
    <div className={`flex flex-col items-center gap-1 p-2 rounded-xl border ${
      isToday   ? 'border-teal bg-teal/5' :
      complete  ? 'border-emerald-200 bg-emerald-50' :
                  'border-amber-200 bg-amber-50'
    }`}>
      <span className={`text-[10px] font-bold ${isToday ? 'text-teal' : complete ? 'text-emerald-700' : 'text-amber-700'}`}>
        {dayLabelSlash(slash)}
      </span>
      <span className="text-lg">{complete ? '✅' : '⏳'}</span>
      <span className={`text-[9px] font-semibold ${isToday ? 'text-teal' : complete ? 'text-emerald-600' : 'text-amber-600'}`}>
        {checkIn?.slice(0,5)}
      </span>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────
export default function AttendanceScreen() {
  const { name: userName, team } = useAuth();

  const [clock, setClock]       = useState(nowHHMMSS());
  // week: { "YYYY/MM/DD": { checkIn, checkOut, inId, outId } }
  const [week, setWeek]         = useState({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState('');
  const [note, setNote]         = useState('');
  const [showNote, setShowNote] = useState(false);
  const [duration, setDuration] = useState('');

  // ── Checkout quiz state ────────────────────────────────────
  const [checkoutQuizChecked,  setCheckoutQuizChecked]  = useState(false);
  const [checkoutQuiz,         setCheckoutQuiz]         = useState(null);
  const [checkoutQuizLoading,  setCheckoutQuizLoading]  = useState(false);

  const days    = last7DaysSlash();
  const noteRef = useRef(null);
  const today   = week[todaySlash()] ?? null;

  // Live clock
  useEffect(() => {
    const t = setInterval(() => {
      setClock(nowHHMMSS());
      if (today?.checkIn && !today?.checkOut) {
        setDuration(calcDuration(today.checkIn, null) ?? '');
      }
    }, 1000);
    return () => clearInterval(t);
  }, [today]);

  // Duration on today change
  useEffect(() => {
    if (today?.checkIn && today?.checkOut) {
      setDuration(calcDuration(today.checkIn, today.checkOut) ?? '');
    } else if (today?.checkIn) {
      setDuration(calcDuration(today.checkIn, null) ?? '');
    } else {
      setDuration('');
    }
  }, [today]);

  // Load last-7-days data
  const loadData = useCallback(async () => {
    if (!userName) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const daysArr = last7DaysSlash(); // ["YYYY/MM/DD", ...]

      const { data, error: fetchErr } = await supabase
        .from('attendance')
        .select('id,date,type,time_in,note')
        .eq('employee_name', userName)
        .in('date', daysArr)
        .order('date');

      if (fetchErr) throw new Error(fetchErr.message);

      // Build map: { "YYYY/MM/DD": { checkIn, checkOut, inId, outId } }
      const map = {};
      daysArr.forEach(d => { map[d] = { checkIn: null, checkOut: null, inId: null, outId: null }; });

      (data ?? []).forEach(r => {
        const key = r.date; // already "YYYY/MM/DD"
        if (!map[key]) map[key] = { checkIn: null, checkOut: null, inId: null, outId: null };
        if (r.type === 'in') {
          map[key].checkIn = r.time_in ?? null;
          map[key].inId    = r.id;
        } else if (r.type === 'out') {
          map[key].checkOut = r.time_in ?? null; // time_in used for both
          map[key].outId    = r.id;
        }
      });

      setWeek(map);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userName]);

  useEffect(() => { loadData(); }, [loadData]);

  const flash = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); };

  // ── Check-in ─────────────────────────────────────────────────
  const handleCheckIn = async () => {
    if (saving || today?.checkIn) return;
    setSaving(true); setError(null);
    const now      = nowHHMM();
    const dateVal  = todaySlash();
    const dayName  = arabicDaySlash(dateVal);
    try {
      const { error: insErr } = await supabase.from('attendance').insert({
        employee_name: userName,
        date:          dateVal,
        day:           dayName,
        type:          'in',
        time_in:       now,
        team:          team ?? null,
        method:        'app',
        recorded_at:   now,
        delay_minutes: 0,
        was_late:      false,
        status:        '✅ حاضر',
      });
      if (insErr) throw new Error(insErr.message);
      flash('✅ تم تسجيل الحضور بنجاح!');
      await loadData();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  // ── Actual check-out (shared by quiz flow + direct) ───────────
  const doActualCheckOut = async () => {
    setSaving(true); setError(null);
    const now     = nowHHMM();
    const dateVal = todaySlash();
    try {
      const { error: insErr } = await supabase.from('attendance').insert({
        employee_name: userName,
        date:          dateVal,
        type:          'out',
        time_in:       now,   // DB uses time_in for out-rows too
        method:        'app',
        recorded_at:   now,
        note:          note.trim() || null,
      });
      if (insErr) throw new Error(insErr.message);
      flash('🏠 تم تسجيل الانصراف بنجاح!');
      setShowNote(false); setNote('');
      setCheckoutQuizChecked(false);
      await loadData();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  // ── Check-out ─────────────────────────────────────────────────
  const handleCheckOut = async () => {
    if (saving || !today?.checkIn || today?.checkOut) return;
    if (!showNote) { setShowNote(true); setTimeout(() => noteRef.current?.focus(), 100); return; }

    // If quiz already handled, proceed directly
    if (checkoutQuizChecked) {
      await doActualCheckOut();
      return;
    }

    // Check for today's checkout quiz question
    setCheckoutQuizLoading(true);
    try {
      const todayISO = slashToISO(todaySlash());
      const { data: q } = await supabase
        .from('quiz_questions')
        .select('*')
        .eq('is_checkout_question', true)
        .eq('question_date', todayISO)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (q) {
        setCheckoutQuiz({ question: q, step: 'question' });
        setCheckoutQuizLoading(false);
        return; // show quiz modal first
      }
    } catch {} // table doesn't exist yet or network error → proceed normally
    setCheckoutQuizLoading(false);
    setCheckoutQuizChecked(true);
    await doActualCheckOut();
  };

  // ── Quiz handlers ──────────────────────────────────────────────
  const handleQuizAnswer = async (answerKey) => {
    if (!checkoutQuiz || checkoutQuiz.step !== 'question') return;
    const { question } = checkoutQuiz;
    const isCorrect = answerKey === question.correct_answer;
    setCheckoutQuiz(q => ({ ...q, step: 'result', selected: answerKey, isCorrect }));
    try {
      await supabase.from('quiz_responses').insert({
        question_id:     question.id,
        selected_answer: answerKey,
        is_correct:      isCorrect,
        source:          'checkout',
      });
    } catch {}
  };
  const handleQuizContinue = async () => { setCheckoutQuiz(null); setCheckoutQuizChecked(true); await doActualCheckOut(); };
  const handleQuizSkip     = async () => { setCheckoutQuiz(null); setCheckoutQuizChecked(true); await doActualCheckOut(); };

  const isCheckedIn  = !!today?.checkIn;
  const isCheckedOut = !!today?.checkOut;
  const isComplete   = isCheckedIn && isCheckedOut;

  const btnState = isComplete ? 'done' : isCheckedIn ? 'checkout' : 'checkin';
  const BIG_BTN = {
    checkin:  { label: 'تسجيل الحضور',                                        icon: '✅', cls: 'bg-teal hover:bg-teal/90 text-white shadow-teal/25' },
    checkout: { label: showNote ? 'تأكيد الانصراف' : 'تسجيل الانصراف',        icon: '🏠', cls: 'bg-navy hover:bg-navy/90 text-white shadow-navy/25' },
    done:     { label: 'اليوم مكتمل 🎉',                                       icon: '✨', cls: 'bg-emerald-500 text-white cursor-default shadow-emerald-200' },
  }[btnState];

  // Stats
  const completedDays = days.filter(d => d <= todaySlash() && week[d]?.checkIn && week[d]?.checkOut).length;
  const presentDays   = days.filter(d => d <= todaySlash() && week[d]?.checkIn).length;
  const absentDays    = days.filter(d => d < todaySlash() && !week[d]?.checkIn).length;

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-24 sm:pb-8" dir="rtl">

      {/* ── Live clock card ──────────────────────────────────── */}
      <div className="bg-gradient-to-br from-navy to-navy/90 rounded-3xl p-6 text-white text-center shadow-xl shadow-navy/20">
        <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-2">
          {new Date().toLocaleDateString('ar-SA', { weekday:'long', day:'numeric', month:'long' })}
        </p>
        <p className="text-5xl font-black tabular-nums tracking-tight font-mono">{clock}</p>
        <div className="mt-4 flex items-center justify-center gap-2">
          {isComplete ? (
            <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> يوم عمل مكتمل
            </span>
          ) : isCheckedIn ? (
            <span className="flex items-center gap-1.5 text-sm font-bold text-teal/90">
              <span className="w-2 h-2 rounded-full bg-teal animate-pulse" />
              في العمل منذ {today.checkIn?.slice(0,5)} — {duration || '…'}
            </span>
          ) : (
            <span className="text-sm text-white/50">لم تسجّل حضورك بعد</span>
          )}
        </div>
      </div>

      {/* ── Success / Error ──────────────────────────────────── */}
      {success && (
        <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold text-center animate-fadeIn">
          {success}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-600 text-sm text-center">
          ⚠️ {error}
        </div>
      )}

      {/* ── Main action card ─────────────────────────────────── */}
      <div className="bg-surface rounded-3xl p-5 shadow-sm border border-border space-y-4">

        {/* Note textarea (check-out) */}
        {showNote && btnState === 'checkout' && (
          <div className="space-y-2 animate-fadeIn">
            <label className="text-xs font-bold text-muted block">ملاحظة الانصراف (اختياري)</label>
            <textarea
              ref={noteRef}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="أي ملاحظة قبل المغادرة؟"
              rows={2}
              className="w-full resize-none rounded-xl border border-border bg-surface-alt p-3 text-sm text-text placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-teal/40"
            />
          </div>
        )}

        {/* Big action button */}
        <button
          onClick={btnState === 'checkin' ? handleCheckIn : btnState === 'checkout' ? handleCheckOut : undefined}
          disabled={saving || btnState === 'done'}
          className={`w-full flex items-center justify-center gap-3 py-5 rounded-2xl text-lg font-extrabold shadow-xl transition-all active:scale-[0.97] disabled:opacity-70 ${BIG_BTN.cls}`}
        >
          {saving ? (
            <span className="w-6 h-6 border-3 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <span className="text-2xl">{BIG_BTN.icon}</span>
          )}
          {BIG_BTN.label}
        </button>

        {/* Today stats row */}
        <div className="grid grid-cols-3 gap-3 pt-1">
          {[
            { label: 'الدخول',    val: today?.checkIn?.slice(0,5)  || '—', active: isCheckedIn },
            { label: 'مدة العمل', val: duration || '—',                    active: isCheckedIn },
            { label: 'الخروج',    val: today?.checkOut?.slice(0,5) || '—', active: isCheckedOut },
          ].map(({ label, val, active }) => (
            <div key={label} className="text-center space-y-1">
              <p className={`text-base font-extrabold tabular-nums ${active ? 'text-teal' : 'text-muted/40'}`}>{val}</p>
              <p className="text-[10px] text-muted">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Checkout Quiz Loading ────────────────────────────── */}
      {checkoutQuizLoading && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
          <div className="bg-surface rounded-3xl p-8 text-center w-full max-w-sm">
            <span className="w-8 h-8 border-4 border-teal/30 border-t-teal rounded-full animate-spin inline-block mb-3" />
            <p className="text-sm text-muted">جارٍ تحميل سؤال اليوم…</p>
          </div>
        </div>
      )}

      {/* ── Checkout Quiz Modal ──────────────────────────────── */}
      {checkoutQuiz && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-4"
          onClick={e => e.target === e.currentTarget && handleQuizSkip()}>
          <div className="bg-surface rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden" dir="rtl">
            {/* Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-teal to-navy text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-white/60 uppercase tracking-wider">قبل المغادرة</p>
                  <p className="text-base font-black mt-0.5">🧠 سؤال اليوم السريع</p>
                </div>
                <button onClick={handleQuizSkip}
                  className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white font-bold text-lg transition flex items-center justify-center">
                  ×
                </button>
              </div>
              <p className="text-[11px] text-white/50 mt-2 flex items-center gap-1">
                🔒 مجهول تمامًا — لا أحد يرى إجابتك
              </p>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Question */}
              <p className="text-sm font-semibold text-text leading-relaxed">
                {checkoutQuiz.question.question}
              </p>

              {/* Options — question step */}
              {checkoutQuiz.step === 'question' && (
                <div className="space-y-2">
                  {(['a','b','c','d']).filter(k => checkoutQuiz.question[`option_${k}`]).map(k => {
                    const LBL = { a:'أ', b:'ب', c:'ج', d:'د' };
                    return (
                      <button key={k} onClick={() => handleQuizAnswer(k)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-border bg-surface-alt hover:border-teal/50 hover:bg-teal/5 text-start transition-all active:scale-[0.98]">
                        <span className="w-7 h-7 rounded-lg bg-navy/10 text-navy text-xs font-black flex items-center justify-center shrink-0">
                          {LBL[k]}
                        </span>
                        <span className="text-sm text-text">{checkoutQuiz.question[`option_${k}`]}</span>
                      </button>
                    );
                  })}
                  <button onClick={handleQuizSkip}
                    className="w-full text-xs text-muted hover:text-text py-2 transition">
                    تخطّي السؤال ←
                  </button>
                </div>
              )}

              {/* Result step */}
              {checkoutQuiz.step === 'result' && (
                <div className="space-y-3">
                  <div className={`px-4 py-3 rounded-xl border-2 ${checkoutQuiz.isCorrect ? 'border-emerald-400 bg-emerald-50' : 'border-red-300 bg-red-50'}`}>
                    <p className={`text-base font-black mb-1 ${checkoutQuiz.isCorrect ? 'text-emerald-700' : 'text-red-600'}`}>
                      {checkoutQuiz.isCorrect ? '✅ إجابة صحيحة! أحسنت 🌟' : '❌ إجابة خاطئة'}
                    </p>
                    {!checkoutQuiz.isCorrect && (
                      <p className="text-xs text-text">
                        الإجابة الصحيحة:{' '}
                        <strong className="text-emerald-700">
                          {checkoutQuiz.question[`option_${checkoutQuiz.question.correct_answer}`]}
                        </strong>
                      </p>
                    )}
                  </div>
                  {checkoutQuiz.question.explanation && (
                    <div className="px-4 py-3 rounded-xl bg-blue-50 border border-blue-100">
                      <p className="text-[11px] font-bold text-blue-700 mb-1">💡 معلومة مفيدة</p>
                      <p className="text-xs text-blue-800 leading-relaxed">{checkoutQuiz.question.explanation}</p>
                    </div>
                  )}
                  <button onClick={handleQuizContinue}
                    className="w-full py-3 rounded-xl bg-navy text-white font-bold text-sm hover:opacity-90 transition">
                    تسجيل الانصراف 🏠
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Weekly strip ─────────────────────────────────────── */}
      <div className="bg-surface rounded-3xl p-4 shadow-sm border border-border space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-muted uppercase tracking-wider">آخر 7 أيام</p>
          {loading && <span className="text-[10px] text-muted animate-pulse">جارٍ التحميل…</span>}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map(slash => (
            <DayBadge key={slash} dayRec={week[slash]} slash={slash} />
          ))}
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border">
          {[
            { icon: '🏆', val: completedDays, label: 'أيام مكتملة',  color: 'text-emerald-600' },
            { icon: '❌', val: absentDays,    label: 'أيام الغياب',   color: 'text-red-500'     },
            { icon: '✅', val: presentDays,   label: 'أيام الحضور',   color: 'text-teal'        },
          ].map(({ icon, val, label, color }) => (
            <div key={label} className="text-center">
              <p className={`text-xl font-black ${color}`}>{val} {icon}</p>
              <p className="text-[10px] text-muted">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
