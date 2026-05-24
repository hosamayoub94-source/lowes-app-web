// =============================================================
// AttendanceScreen 3.0 — سجل الحضور اليومي
// Schema الحقيقي: صفان لكل يوم (type:"in" + type:"out")
//   date: "YYYY/MM/DD"  |  time_in: "HH:MM"  |  time_out: "HH:MM"
// =============================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth }   from '@hooks/useAuth';
import { supabase }  from '@services/supabase';

// ── Date helpers ───────────────────────────────────────────────
/** Returns "YYYY/MM/DD" — matches DB format */
function todaySlash() {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

/** Returns Arabic day name from "YYYY/MM/DD" */
function dayLabel(slash) {
  const today = todaySlash();
  if (slash === today) return 'اليوم';
  const [y, m, day] = slash.split('/').map(Number);
  const d    = new Date(y, m - 1, day);
  const diff = Math.round((new Date(today.replace(/\//g, '-')) - d) / 86400000);
  if (diff === 1) return 'أمس';
  return d.toLocaleDateString('ar-SA', { weekday: 'short' });
}

/** Returns array of last 7 days as "YYYY/MM/DD" */
function last7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  });
}

/** "YYYY/MM/DD" → "YYYY-MM-DD" for Supabase range queries */
function toISO(slash) { return slash.replace(/\//g, '-'); }

/** HH:MM — locale-independent, for DB storage */
function nowHHMM() {
  const d = new Date();
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

/** HH:MM:SS — for live clock display */
function nowHHMMSS() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2,'0')).join(':');
}

/** Arabic day name (e.g. "الأربعاء") */
function arabicDay(slash) {
  const [y, m, day] = slash.split('/').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('ar-SA', { weekday: 'long' });
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
      <span className="text-[10px] font-bold text-muted">{dayLabel(slash)}</span>
      <span className="text-lg">—</span>
    </div>
  );

  const checkIn  = dayRec?.checkIn;
  const checkOut = dayRec?.checkOut;
  const complete = !!(checkIn && checkOut);

  if (!checkIn) return (
    <div className={`flex flex-col items-center gap-1 p-2 rounded-xl border ${isToday ? 'border-teal/30 bg-teal/5' : 'border-border/50 bg-surface-alt/50'}`}>
      <span className={`text-[10px] font-bold ${isToday ? 'text-teal' : 'text-muted'}`}>{dayLabel(slash)}</span>
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
        {dayLabel(slash)}
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
  // week: { "YYYY/MM/DD": { checkIn: "HH:MM"|null, checkOut: "HH:MM"|null, inId, outId, noteIn, noteOut } }
  const [week, setWeek]         = useState({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState('');
  const [note, setNote]         = useState('');
  const [showNote, setShowNote] = useState(false);
  const [duration, setDuration] = useState('');

  const days    = last7Days();
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
    try {
      const fromISO = toISO(days[0]);
      const toISO_  = toISO(todaySlash());

      // date column stores "YYYY/MM/DD" — use cast trick for range queries
      const { data, error: fetchErr } = await supabase
        .from('attendance')
        .select('id,date,type,time_in,time_out,note')
        .eq('employee_name', userName)
        .gte('date', fromISO)   // Supabase casts text to date for comparison
        .lte('date', toISO_)
        .in('type', ['in', 'out']);

      if (fetchErr) throw new Error(fetchErr.message);

      // Aggregate: { "YYYY/MM/DD": { checkIn, checkOut, inId, outId } }
      const map = {};
      (data ?? []).forEach(r => {
        const key = r.date; // "YYYY/MM/DD"
        if (!map[key]) map[key] = { checkIn: null, checkOut: null, inId: null, outId: null, noteOut: null };
        if (r.type === 'in') {
          map[key].checkIn  = r.time_in;
          map[key].inId     = r.id;
        } else if (r.type === 'out') {
          map[key].checkOut = r.time_in;  // for "out" rows, the departure time is in time_in
          map[key].outId    = r.id;
          map[key].noteOut  = r.note;
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
    const now  = nowHHMM();
    const dateVal = todaySlash(); // "YYYY/MM/DD"
    try {
      const { error: insErr } = await supabase.from('attendance').insert({
        employee_name: userName,
        team:          team ?? null,
        date:          dateVal,
        day:           arabicDay(dateVal),
        type:          'in',
        time_in:       now,
        time_out:      null,
        hours:         0,
        status:        '✅ حاضر',
        recorded_at:   now,
        delay_minutes: 0,
        was_late:      false,
        method:        'app',
      });
      if (insErr) throw new Error(insErr.message);
      flash('✅ تم تسجيل الحضور بنجاح!');
      await loadData();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  // ── Check-out ─────────────────────────────────────────────────
  const handleCheckOut = async () => {
    if (saving || !today?.checkIn || today?.checkOut) return;
    if (!showNote) { setShowNote(true); setTimeout(() => noteRef.current?.focus(), 100); return; }

    setSaving(true); setError(null);
    const now      = nowHHMM();
    const dateVal  = todaySlash();
    const checkinTime = today.checkIn;
    const workedMins  = (() => {
      const [hi,mi] = checkinTime.slice(0,5).split(':').map(Number);
      const [ho,mo] = now.split(':').map(Number);
      let m = (ho*60+mo) - (hi*60+mi);
      if (m < 0) m += 1440;
      return m;
    })();
    const workedHrs = +(workedMins / 60).toFixed(2);

    try {
      const { error: insErr } = await supabase.from('attendance').insert({
        employee_name: userName,
        team:          team ?? null,
        date:          dateVal,
        day:           arabicDay(dateVal),
        type:          'out',
        time_in:       now,      // departure time stored in time_in for "out" rows
        time_out:      now,
        hours:         workedHrs,
        status:        '🚪 خروج',
        note:          note.trim() || null,
        recorded_at:   now,
        delay_minutes: 0,
        was_late:      false,
        method:        'app',
      });
      if (insErr) throw new Error(insErr.message);
      flash('🏠 تم تسجيل الانصراف بنجاح!');
      setShowNote(false); setNote('');
      await loadData();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const isCheckedIn  = !!today?.checkIn;
  const isCheckedOut = !!today?.checkOut;
  const isComplete   = isCheckedIn && isCheckedOut;

  const btnState = isComplete ? 'done' : isCheckedIn ? 'checkout' : 'checkin';
  const BIG_BTN = {
    checkin:  { label: 'تسجيل الحضور',                                        icon: '✅', cls: 'bg-teal hover:bg-teal/90 text-white shadow-teal/25' },
    checkout: { label: showNote ? 'تأكيد الانصراف' : 'تسجيل الانصراف',        icon: '🏠', cls: 'bg-navy hover:bg-navy/90 text-white shadow-navy/25' },
    done:     { label: 'اليوم مكتمل 🎉',                                       icon: '✨', cls: 'bg-emerald-500 text-white cursor-default shadow-emerald-200' },
  }[btnState];

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
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl px-4 py-3 text-sm font-semibold text-center animate-in slide-in-from-top-2 duration-200">
          {success}
        </div>
      )}
      {error && (
        <div className="bg-red-bg border border-red/20 text-red-fg rounded-2xl px-4 py-3 text-sm text-center">
          ⚠️ {error}
        </div>
      )}

      {/* ── Main action button ───────────────────────────────── */}
      <div className="bg-surface border border-border rounded-3xl p-5 space-y-3">
        <button
          onClick={btnState === 'done' ? undefined : (btnState === 'checkout' ? handleCheckOut : handleCheckIn)}
          disabled={saving || btnState === 'done'}
          className={`w-full py-5 rounded-2xl text-lg font-extrabold flex items-center justify-center gap-3 transition-all duration-200 shadow-lg ${BIG_BTN.cls} ${saving ? 'opacity-70' : 'hover:scale-[1.02] active:scale-[0.98]'} disabled:cursor-default`}>
          {saving
            ? <span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <span className="text-2xl">{BIG_BTN.icon}</span>
          }
          {BIG_BTN.label}
        </button>

        {/* Note input (check-out only) */}
        {showNote && btnState === 'checkout' && (
          <div className="animate-in slide-in-from-bottom-2 duration-200 space-y-2">
            <label className="text-xs text-muted font-semibold block">ملاحظات (اختياري)</label>
            <textarea
              ref={noteRef} value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="مثال: اجتماع مطوّل، عمل إضافي…"
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30 resize-none"
            />
            <button onClick={() => { setShowNote(false); setNote(''); }} className="text-xs text-muted hover:text-red-fg transition">
              إلغاء
            </button>
          </div>
        )}

        {/* Today's stat row */}
        <div className="grid grid-cols-3 gap-3 pt-1">
          {[
            { label: 'الدخول',    val: today?.checkIn?.slice(0,5)  || '—', color: 'text-teal'     },
            { label: 'مدة العمل', val: duration || '—',                    color: 'text-amber-600' },
            { label: 'الخروج',    val: today?.checkOut?.slice(0,5) || '—', color: 'text-navy'     },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className={`text-xl font-extrabold tabular-nums ${s.color}`}>{s.val}</p>
              <p className="text-[10px] text-muted font-medium mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Weekly strip ─────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-3xl p-4">
        <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-3">آخر 7 أيام</p>
        {loading ? (
          <div className="grid grid-cols-7 gap-1.5">
            {[...Array(7)].map((_,i) => <div key={i} className="h-20 rounded-xl bg-surface-alt animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {days.map(slash => <DayBadge key={slash} slash={slash} dayRec={week[slash]} />)}
          </div>
        )}

        {!loading && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
            {[
              { label: 'أيام الحضور',  val: days.filter(d => week[d]?.checkIn).length,                               icon: '✅' },
              { label: 'أيام الغياب',  val: days.filter(d => d <= todaySlash() && !week[d]?.checkIn).length,         icon: '❌' },
              { label: 'أيام مكتملة',  val: days.filter(d => week[d]?.checkIn && week[d]?.checkOut).length,          icon: '🏆' },
            ].map(s => (
              <div key={s.label} className="text-center flex-1">
                <p className="text-xl font-extrabold text-text">{s.icon} {s.val}</p>
                <p className="text-[10px] text-muted mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Today's note ─────────────────────────────────────── */}
      {today?.noteOut && (
        <div className="bg-amber-bg border border-amber/20 rounded-2xl px-4 py-3 flex items-start gap-2">
          <span className="text-lg shrink-0">📝</span>
          <div>
            <p className="text-xs font-bold text-amber-fg mb-0.5">ملاحظات اليوم</p>
            <p className="text-sm text-amber-fg/80">{today.noteOut}</p>
          </div>
        </div>
      )}

    </div>
  );
}
