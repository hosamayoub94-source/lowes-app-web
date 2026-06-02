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
import { SelfieCapture } from '@components/attendance/SelfieCapture';

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
  return d.toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { weekday: 'short' });
}

/** Arabic full day name from "YYYY/MM/DD" */
function arabicDaySlash(slash) {
  return new Date(slashToISO(slash) + 'T00:00:00').toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { weekday: 'long' });
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

// ── Min minutes that must pass after check-in before check-out is allowed ──
// Prevents accidental check-in → immediate check-out mistakes.
const MIN_MINUTES_BEFORE_CHECKOUT = 60;

/** Whole minutes elapsed since a "HH:MM" check-in time until now. */
function minutesSinceCheckIn(timeIn) {
  if (!timeIn) return Infinity;
  const [h, m] = timeIn.slice(0, 5).split(':').map(Number);
  const now    = new Date();
  let mins = (now.getHours() * 60 + now.getMinutes()) - (h * 60 + m);
  if (mins < 0) mins += 1440; // crossed midnight
  return mins;
}

// ── Absence reason options ────────────────────────────────────
const ABSENCE_REASONS = [
  { key: 'sick',       label: 'مرض',          icon: '🤒' },
  { key: 'vacation',   label: 'إجازة',         icon: '🏖️' },
  { key: 'permission', label: 'إذن مسبق',      icon: '📋' },
  { key: 'emergency',  label: 'ظرف طارئ',     icon: '🆘' },
  { key: 'other',      label: 'سبب آخر',       icon: '📌' },
];

// ── Absence reason modal ───────────────────────────────────────
function AbsenceReasonModal({ slash, userName, existingReason, onSave, onClose }) {
  const [selected, setSelected] = useState(existingReason ?? '');
  const [note,     setNote]     = useState('');
  const [saving,   setSaving]   = useState(false);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const dayName = arabicDaySlash(slash);
      const reason  = note.trim() ? `${selected} — ${note.trim()}` : selected;
      await supabase.from('attendance').insert({
        employee_name: userName,
        date:          slash,
        day:           dayName,
        type:          'absent',
        time_in:       '00:00',
        note:          reason,
        method:        'manual',
        recorded_at:   nowHHMM(),
        status:        '❌ غائب',
      });
      onSave();
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center p-4"
      onClick={onClose}>
      <div className="bg-surface rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden" dir="rtl"
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border/40">
          <p className="font-bold text-text">📝 سبب الغياب</p>
          <p className="text-xs text-muted mt-0.5">{arabicDaySlash(slash)} — {slash}</p>
        </div>
        <div className="p-4 space-y-2">
          {ABSENCE_REASONS.map(r => (
            <button key={r.key} onClick={() => setSelected(r.key)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm font-semibold transition ${
                selected === r.key
                  ? 'border-teal bg-teal/10 text-teal'
                  : 'border-border bg-surface-alt text-text hover:border-teal/40'
              }`}>
              <span className="text-xl">{r.icon}</span>
              {r.label}
            </button>
          ))}
          {selected && (
            <input
              value={note} onChange={e => setNote(e.target.value)}
              placeholder="ملاحظة إضافية (اختياري)"
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30 mt-1"
            />
          )}
        </div>
        <div className="flex gap-2 px-4 pb-4">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted hover:text-text transition">إلغاء</button>
          <button onClick={handleSave} disabled={!selected || saving}
            className="flex-1 py-2.5 rounded-xl bg-teal text-white text-sm font-bold disabled:opacity-40 hover:bg-teal/90 transition">
            {saving ? '…' : '✓ حفظ السبب'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Day badge in weekly strip ──────────────────────────────────
function DayBadge({ dayRec, slash, userName, onReasonSaved }) {
  const today     = todaySlash();
  const isToday   = slash === today;
  const isFuture  = slash > today;
  const isPast    = slash < today;
  const [showModal, setShowModal] = useState(false);

  if (isFuture) return (
    <div className="flex flex-col items-center gap-1 p-2 rounded-xl border border-border bg-surface opacity-30">
      <span className="text-[10px] font-bold text-muted">{dayLabelSlash(slash)}</span>
      <span className="text-lg">—</span>
    </div>
  );

  const checkIn     = dayRec?.checkIn;
  const checkOut    = dayRec?.checkOut;
  const complete    = !!(checkIn && checkOut);
  const hasAbsReason = dayRec?.absReason;

  if (!checkIn) return (
    <>
      <div
        onClick={() => isPast && !hasAbsReason && setShowModal(true)}
        className={`flex flex-col items-center gap-1 p-2 rounded-xl border cursor-pointer transition
          ${isToday ? 'border-teal/30 bg-teal/5' : hasAbsReason ? 'border-purple-200 bg-purple-50' : 'border-border/50 bg-surface-alt/50 hover:border-red-300'}`}>
        <span className={`text-[10px] font-bold ${isToday ? 'text-teal' : 'text-muted'}`}>{dayLabelSlash(slash)}</span>
        <span className="text-lg">{isToday ? '⏳' : hasAbsReason ? '📝' : '❌'}</span>
        <span className="text-[9px] text-muted/60">{isToday ? 'الآن' : hasAbsReason ? 'مبرر' : 'غياب'}</span>
      </div>
      {showModal && (
        <AbsenceReasonModal
          slash={slash} userName={userName}
          existingReason={hasAbsReason}
          onSave={() => { setShowModal(false); onReasonSaved?.(); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
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

// ── Who is in today — live presence board (name + team) ────────
function WhoIsInToday() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const dateVal = todaySlash();

  const load = useCallback(async () => {
    try {
      const [{ data: att }, { data: profs }] = await Promise.all([
        supabase.from('attendance').select('employee_name,type,time_in').eq('date', dateVal).in('type', ['in', 'out']),
        supabase.from('profiles').select('employee_name,team').eq('is_active', true),
      ]);
      const teamMap = {};
      (profs ?? []).forEach(p => { teamMap[p.employee_name] = p.team; });
      const map = {};
      (att ?? []).forEach(r => {
        if (!map[r.employee_name]) map[r.employee_name] = { name: r.employee_name, in: null, out: null, team: teamMap[r.employee_name] || null };
        if (r.type === 'in' && !map[r.employee_name].in) map[r.employee_name].in = r.time_in;
        if (r.type === 'out') map[r.employee_name].out = r.time_in;
      });
      setRows(Object.values(map).filter(r => r.in).sort((a, b) => (a.in || '').localeCompare(b.in || '')));
    } catch { /* silent */ } finally { setLoading(false); }
  }, [dateVal]);

  useEffect(() => {
    load();
    const ch = supabase.channel('whois_' + dateVal)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => load())
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [load, dateVal]);

  const present = rows.filter(r => !r.out);
  const left    = rows.filter(r => r.out);

  const initial = (n) => (n || '؟').trim().charAt(0);
  const teamColor = (t) =>
    t === 'social' || t === 'ميديا' ? 'bg-purple-500/15 text-purple-600'
    : t === 'sales' || t === 'مبيعات' ? 'bg-amber-500/15 text-amber-600'
    : t === 'ops' || t === 'إدارة' ? 'bg-blue-500/15 text-blue-600'
    : 'bg-teal/15 text-teal';

  return (
    <div className="bg-surface rounded-3xl p-4 shadow-sm border border-border space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-text flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          الموجودون الآن
          <span className="text-xs font-extrabold text-emerald-600">{present.length}</span>
        </p>
        {loading && <span className="text-[10px] text-muted animate-pulse">…</span>}
      </div>

      {present.length === 0 && !loading && (
        <p className="text-xs text-muted text-center py-3">لا أحد سجّل حضوره بعد اليوم</p>
      )}

      <div className="space-y-1.5">
        {present.map(r => (
          <div key={r.name} className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-surface-alt transition">
            <div className="relative shrink-0">
              <div className={`w-8 h-8 rounded-full grid place-items-center font-bold text-xs ${teamColor(r.team)}`}>{initial(r.name)}</div>
              <span className="absolute -bottom-0.5 -end-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-surface" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text font-medium truncate">{r.name}</p>
              {r.team && <p className="text-[10px] text-muted">{r.team}</p>}
            </div>
            <span className="text-[11px] text-emerald-600 font-semibold tabular-nums shrink-0">{r.in?.slice(0,5)}</span>
          </div>
        ))}
      </div>

      {left.length > 0 && (
        <div className="pt-2 border-t border-border space-y-1.5">
          <p className="text-[10px] font-bold text-muted uppercase tracking-wider">غادروا ({left.length})</p>
          {left.map(r => (
            <div key={r.name} className="flex items-center gap-2.5 px-2 py-1 opacity-60">
              <div className="w-7 h-7 rounded-full bg-surface-alt grid place-items-center font-bold text-xs text-muted shrink-0">{initial(r.name)}</div>
              <span className="flex-1 text-sm text-muted truncate">{r.name}</span>
              <span className="text-[10px] text-muted shrink-0">🏠 {r.out?.slice(0,5)}</span>
            </div>
          ))}
        </div>
      )}
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
  // Face verification descriptor loaded from profile
  const [faceDescriptor, setFaceDescriptor] = useState(null);
  // Minutes still remaining before check-out is allowed (0 = unlocked)
  const [checkoutLockLeft, setCheckoutLockLeft] = useState(0);
  // Selfie verification: 'in' | 'out' | null
  const [cameraMode, setCameraMode] = useState(null);

  // ── Checkout quiz state ────────────────────────────────────
  const [checkoutQuizChecked,  setCheckoutQuizChecked]  = useState(false);
  const [checkoutQuiz,         setCheckoutQuiz]         = useState(null);
  const [checkoutQuizLoading,  setCheckoutQuizLoading]  = useState(false);

  const days    = last7DaysSlash();
  const noteRef = useRef(null);
  const today   = week[todaySlash()] ?? null;

  // Live clock + check-out lock countdown
  useEffect(() => {
    const tick = () => {
      setClock(nowHHMMSS());
      if (today?.checkIn && !today?.checkOut) {
        setDuration(calcDuration(today.checkIn, null) ?? '');
        const left = MIN_MINUTES_BEFORE_CHECKOUT - minutesSinceCheckIn(today.checkIn);
        setCheckoutLockLeft(left > 0 ? left : 0);
      } else {
        setCheckoutLockLeft(0);
      }
    };
    tick(); // run immediately so the lock state is correct on mount
    const t = setInterval(tick, 1000);
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

      // Build map: { "YYYY/MM/DD": { checkIn, checkOut, inId, outId, absReason } }
      const map = {};
      daysArr.forEach(d => { map[d] = { checkIn: null, checkOut: null, inId: null, outId: null, absReason: null }; });

      (data ?? []).forEach(r => {
        const key = r.date; // already "YYYY/MM/DD"
        if (!map[key]) map[key] = { checkIn: null, checkOut: null, inId: null, outId: null, absReason: null };
        if (r.type === 'in') {
          // keep the LATEST check-in of the day (supports multiple shifts)
          if (!map[key].checkIn || (r.time_in ?? '') >= map[key].checkIn) {
            map[key].checkIn = r.time_in ?? null;
            map[key].inId    = r.id;
          }
        } else if (r.type === 'out') {
          if (!map[key].checkOut || (r.time_in ?? '') >= map[key].checkOut) {
            map[key].checkOut = r.time_in ?? null;
            map[key].outId    = r.id;
          }
        } else if (r.type === 'absent') {
          map[key].absReason = r.note ?? 'مسجّل';
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

  // Load face descriptor for verification
  useEffect(() => {
    if (!userName) return;
    supabase.from('profiles')
      .select('face_descriptor')
      .eq('employee_name', userName)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.face_descriptor) setFaceDescriptor(data.face_descriptor);
      })
      .catch(() => {});
  }, [userName]);

  const flash = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); };

  // ── Check-in ─────────────────────────────────────────────────
  // Tap → open selfie camera → doCheckIn(url)
  const handleCheckIn = () => {
    if (saving || today?.checkIn) return;
    setError(null);
    setCameraMode('in');
  };

  // Start a NEW check-in even if the day already shows complete
  // (second shift, or fixing a wrong/old record — e.g. admin).
  const handleNewCheckIn = () => {
    if (saving) return;
    setError(null);
    setCheckoutQuizChecked(false);
    setCameraMode('in');
  };

  const doCheckIn = async (selfieUrl) => {
    setCameraMode(null);
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
        selfie_url:    selfieUrl ?? null,
      });
      if (insErr) throw new Error(insErr.message);
      flash('✅ تم تسجيل الحضور بنجاح!');
      await loadData();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  // ── Actual check-out (called after quiz + selfie) ─────────────
  const doActualCheckOut = async (selfieUrl) => {
    setCameraMode(null);
    setSaving(true); setError(null);
    const now     = nowHHMM();
    const dateVal = todaySlash();
    const dayName = arabicDaySlash(dateVal);
    try {
      const { error: insErr } = await supabase.from('attendance').insert({
        employee_name: userName,
        date:          dateVal,
        day:           dayName,   // REQUIRED (NOT NULL) — was missing → checkout failed
        type:          'out',
        time_in:       now,   // DB uses time_in for out-rows too
        method:        'app',
        recorded_at:   now,
        note:          note.trim() || null,
        status:        '🚪 خروج',
        selfie_url:    selfieUrl ?? null,
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
  // One tap → (optional daily quiz) → selfie camera → record out.
  // No more confusing two-step "tap to reveal note" that left
  // employees thinking they'd checked out when they hadn't.
  const handleCheckOut = async () => {
    // "Already out" only counts when the latest out is at/after the latest in
    // (matches the isCheckedOut display logic). A stale/old out row — e.g. an
    // earlier 00:08 record or a previous shift — must NOT block a real checkout.
    const alreadyOut = !!today?.checkOut && (!today?.checkIn || today.checkOut >= today.checkIn);
    if (saving || !today?.checkIn || alreadyOut) return;

    // Block check-out within the first hour to prevent accidental
    // check-in → instant check-out mistakes.
    const minsSince = minutesSinceCheckIn(today.checkIn);
    if (minsSince < MIN_MINUTES_BEFORE_CHECKOUT) {
      const left = MIN_MINUTES_BEFORE_CHECKOUT - minsSince;
      setError(`لا يمكن تسجيل الانصراف قبل مرور ساعة على الأقل من الحضور. تبقّى ${left} دقيقة.`);
      return;
    }

    // If quiz already handled this session, go straight to the camera
    if (checkoutQuizChecked) { setCameraMode('out'); return; }

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
        return; // quiz modal first, then it opens the camera
      }
    } catch {} // no quiz table / network error → proceed to camera
    setCheckoutQuizLoading(false);
    setCheckoutQuizChecked(true);
    setCameraMode('out');
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
  // After the quiz, open the selfie camera (then doActualCheckOut runs)
  const handleQuizContinue = () => { setCheckoutQuiz(null); setCheckoutQuizChecked(true); setCameraMode('out'); };
  const handleQuizSkip     = () => { setCheckoutQuiz(null); setCheckoutQuizChecked(true); setCameraMode('out'); };

  const isCheckedIn  = !!today?.checkIn;
  // Counts as "checked out" only when the latest out is at/after the latest in.
  // A new check-in after an earlier out re-opens the day (multiple shifts).
  const isCheckedOut = !!today?.checkOut && (!today?.checkIn || today.checkOut >= today.checkIn);
  const isComplete   = isCheckedIn && isCheckedOut;

  const btnState = isComplete ? 'done' : isCheckedIn ? 'checkout' : 'checkin';
  // Check-out is locked during the first hour after check-in
  const checkoutLocked = btnState === 'checkout' && checkoutLockLeft > 0;
  const BIG_BTN = checkoutLocked
    ? { label: `الانصراف متاح بعد ${checkoutLockLeft} د`, icon: '⏳', cls: 'bg-surface-alt text-muted cursor-not-allowed shadow-none border border-border' }
    : {
        checkin:  { label: 'تسجيل الحضور',    icon: '✅', cls: 'bg-teal hover:bg-teal/90 text-white shadow-teal/25' },
        checkout: { label: 'تسجيل الانصراف',  icon: '🏠', cls: 'bg-navy hover:bg-navy/90 text-white shadow-navy/25' },
        done:     { label: 'اليوم مكتمل 🎉',   icon: '✨', cls: 'bg-emerald-500 text-white cursor-default shadow-emerald-200' },
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
          {new Date().toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { weekday:'long', day:'numeric', month:'long' })}
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

        {/* Optional check-out note — always available (no longer a blocking step) */}
        {btnState === 'checkout' && (
          <div className="space-y-2">
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
          onClick={checkoutLocked ? undefined : btnState === 'checkin' ? handleCheckIn : btnState === 'checkout' ? handleCheckOut : undefined}
          disabled={saving || btnState === 'done' || checkoutLocked}
          className={`w-full flex items-center justify-center gap-3 py-5 rounded-2xl text-lg font-extrabold shadow-xl transition-all active:scale-[0.97] disabled:active:scale-100 ${BIG_BTN.cls}`}
        >
          {saving ? (
            <span className="w-6 h-6 border-3 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <span className="text-2xl">{BIG_BTN.icon}</span>
          )}
          {BIG_BTN.label}
        </button>

        {/* Check-out lock hint */}
        {checkoutLocked && (
          <p className="text-center text-xs text-muted -mt-1">
            لتفادي التسجيل بالخطأ، يمكنك تسجيل الانصراف بعد مرور ساعة على الحضور.
          </p>
        )}

        {/* New check-in — allowed even when the day shows complete
            (second shift, or fixing a wrong/old record). */}
        {btnState === 'done' && (
          <button
            onClick={handleNewCheckIn}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold border border-teal/40 text-teal bg-teal/5 hover:bg-teal/10 transition-all active:scale-[0.98] disabled:opacity-60"
          >
            <span className="text-lg">➕</span>
            تسجيل حضور جديد
          </button>
        )}

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

      {/* ── Selfie verification camera ───────────────────────── */}
      {cameraMode && (
        <SelfieCapture
          label={cameraMode === 'in' ? 'تأكيد الحضور بصورة' : 'تأكيد الانصراف بصورة'}
          employeeName={userName}
          kind={cameraMode}
          storedDescriptor={faceDescriptor}
          onCapture={(url, verifyResult) => {
            // If forced (face mismatch), log it — manager will see it
            if (verifyResult?.forced) {
              supabase.from('notifications').insert({
                user_id:  null, // broadcast — will be filtered by manager role
                type:     'system_alert',
                title:    `⚠️ تحذير: وجه غير متطابق — ${userName}`,
                message:  `الموظف ${userName} سجّل ${cameraMode === 'in' ? 'حضور' : 'انصراف'} بتطابق ${verifyResult.confidence}% فقط`,
                severity: 'high',
              }).catch(() => {});
            }
            cameraMode === 'in' ? doCheckIn(url) : doActualCheckOut(url);
          }}
          onClose={() => setCameraMode(null)}
        />
      )}

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
            <DayBadge key={slash} dayRec={week[slash]} slash={slash}
              userName={userName} onReasonSaved={loadData} />
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

      {/* ── Who is in today (live) ───────────────────────────── */}
      <WhoIsInToday />
    </div>
  );
}
