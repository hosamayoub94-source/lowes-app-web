// =============================================================
// AttendanceScreen 2.0 — سجل الحضور اليومي
// • ساعة رقمية حية
// • زر حضور/انصراف مع animation
// • عرض أسبوعي للأيام السبعة الماضية
// • مدة العمل مباشرة
// • notes عند الانصراف
// =============================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth }   from '@hooks/useAuth';
import { supabase }  from '@services/supabase';

// ── Helpers ────────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().slice(0, 10); }

function last7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

function dayLabel(iso) {
  const d = new Date(iso);
  const today = todayISO();
  if (iso === today) return 'اليوم';
  const diff = Math.floor((new Date(today) - d) / 86400000);
  if (diff === 1) return 'أمس';
  return d.toLocaleDateString('ar-SA', { weekday: 'short' });
}

function timeFmt(timeStr) {
  if (!timeStr) return '—';
  // If it's already HH:MM format
  if (/^\d{2}:\d{2}/.test(timeStr)) return timeStr.slice(0, 5);
  // If it's an ISO string
  return new Date(timeStr).toLocaleTimeString('ar-SA', { hour:'2-digit', minute:'2-digit', hour12: false });
}

function calcDuration(checkIn, checkOut) {
  if (!checkIn) return null;
  const start = new Date(`1970-01-01T${checkIn.slice(0, 5)}:00`);
  const end   = checkOut ? new Date(`1970-01-01T${checkOut.slice(0, 5)}:00`) : new Date();
  // Handle midnight crossing
  let mins = Math.floor((end - start) / 60000);
  if (mins < 0) mins += 1440;
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}س ${m}د` : `${m}د`;
}

function liveClock() {
  return new Date().toLocaleTimeString('ar-SA', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false });
}

// ── Day status badge ───────────────────────────────────────────
function DayBadge({ rec, iso }) {
  const isToday = iso === todayISO();
  const isFuture = iso > todayISO();

  if (isFuture) return (
    <div className={`flex flex-col items-center gap-1 p-2 rounded-xl border ${isToday ? 'border-teal bg-teal/5' : 'border-border bg-surface'} opacity-30`}>
      <span className="text-[10px] font-bold text-muted">{dayLabel(iso)}</span>
      <span className="text-lg">—</span>
    </div>
  );

  if (!rec) return (
    <div className={`flex flex-col items-center gap-1 p-2 rounded-xl border ${isToday ? 'border-teal/30 bg-teal/5' : 'border-border/50 bg-surface-alt/50'}`}>
      <span className={`text-[10px] font-bold ${isToday ? 'text-teal' : 'text-muted'}`}>{dayLabel(iso)}</span>
      <span className="text-lg">{isToday ? '⏳' : '❌'}</span>
      <span className="text-[9px] text-muted/60">{isToday ? 'الآن' : 'غياب'}</span>
    </div>
  );

  const isComplete = rec.check_in && rec.check_out;
  return (
    <div className={`flex flex-col items-center gap-1 p-2 rounded-xl border ${
      isToday ? 'border-teal bg-teal/5' :
      isComplete ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
    }`}>
      <span className={`text-[10px] font-bold ${isToday ? 'text-teal' : isComplete ? 'text-emerald-700' : 'text-amber-700'}`}>{dayLabel(iso)}</span>
      <span className="text-lg">{isComplete ? '✅' : '⏳'}</span>
      <span className={`text-[9px] font-semibold ${isToday ? 'text-teal' : isComplete ? 'text-emerald-600' : 'text-amber-600'}`}>
        {rec.check_in?.slice(0,5)}
      </span>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────
export default function AttendanceScreen() {
  const { name: userName } = useAuth();

  const [clock, setClock]       = useState(liveClock());
  const [today, setToday]       = useState(null);      // today's record
  const [week, setWeek]         = useState({});         // { 'YYYY-MM-DD': record }
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState('');
  const [note, setNote]         = useState('');
  const [showNote, setShowNote] = useState(false);
  const [duration, setDuration] = useState('');

  const days = last7Days();
  const noteRef = useRef(null);

  // Live clock + live duration
  useEffect(() => {
    const t = setInterval(() => {
      setClock(liveClock());
      if (today?.check_in && !today?.check_out) {
        setDuration(calcDuration(today.check_in, null) ?? '');
      }
    }, 1000);
    return () => clearInterval(t);
  }, [today]);

  // Load this week's records
  const loadData = useCallback(async () => {
    if (!userName) return;
    setLoading(true);
    try {
      const from = days[0];
      const { data } = await supabase.from('attendance')
        .select('*')
        .eq('employee_name', userName)
        .gte('date', from)
        .lte('date', todayISO());
      const map = {};
      (data ?? []).forEach(r => { map[r.date] = r; });
      setWeek(map);
      setToday(map[todayISO()] ?? null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [userName]);

  useEffect(() => { loadData(); }, [loadData]);

  // Duration refresh when today changes
  useEffect(() => {
    if (today?.check_in && !today?.check_out) {
      setDuration(calcDuration(today.check_in, null) ?? '');
    } else if (today?.check_in && today?.check_out) {
      setDuration(calcDuration(today.check_in, today.check_out) ?? '');
    } else {
      setDuration('');
    }
  }, [today]);

  const flash = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleCheckIn = async () => {
    if (saving || today?.check_in) return;
    setSaving(true); setError(null);
    const now = new Date().toLocaleTimeString('ar-SA', { hour:'2-digit', minute:'2-digit', hour12:false });
    try {
      await supabase.from('attendance').upsert(
        { employee_name: userName, date: todayISO(), check_in: now },
        { onConflict: 'employee_name,date' }
      );
      flash('✅ تم تسجيل الحضور بنجاح!');
      await loadData();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleCheckOut = async () => {
    if (saving || !today?.check_in || today?.check_out) return;
    if (showNote) {
      setSaving(true); setError(null);
      const now = new Date().toLocaleTimeString('ar-SA', { hour:'2-digit', minute:'2-digit', hour12:false });
      try {
        await supabase.from('attendance').update({ check_out: now, notes: note.trim()||null }).eq('employee_name', userName).eq('date', todayISO());
        flash('🏠 تم تسجيل الانصراف بنجاح!');
        setShowNote(false); setNote('');
        await loadData();
      } catch (e) { setError(e.message); }
      finally { setSaving(false); }
    } else {
      setShowNote(true);
      setTimeout(() => noteRef.current?.focus(), 100);
    }
  };

  const isCheckedIn  = !!today?.check_in;
  const isCheckedOut = !!today?.check_out;
  const isComplete   = isCheckedIn && isCheckedOut;

  // Big button state
  const btnState = isComplete ? 'done' : isCheckedIn ? 'checkout' : 'checkin';
  const BIG_BTN = {
    checkin:  { label: 'تسجيل الحضور',   icon: '✅', cls: 'bg-teal hover:bg-teal/90 text-white shadow-teal/25' },
    checkout: { label: showNote ? 'تأكيد الانصراف' : 'تسجيل الانصراف', icon: '🏠', cls: 'bg-navy hover:bg-navy/90 text-white shadow-navy/25' },
    done:     { label: 'اليوم مكتمل 🎉',  icon: '✨', cls: 'bg-emerald-500 text-white cursor-default shadow-emerald-200' },
  }[btnState];

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-24 sm:pb-8" dir="rtl">

      {/* ── Live clock card ────────────────────────────────────── */}
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
              في العمل منذ {today.check_in?.slice(0,5)} — {duration || '…'}
            </span>
          ) : (
            <span className="text-sm text-white/50">لم تسجّل حضورك بعد</span>
          )}
        </div>
      </div>

      {/* ── Success / Error ────────────────────────────────────── */}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl px-4 py-3 text-sm font-semibold text-center animate-in slide-in-from-top-2 duration-200">
          {success}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-4 py-3 text-sm text-center">
          ⚠️ {error}
        </div>
      )}

      {/* ── Main action button ─────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-3xl p-5 space-y-3">
        <button
          onClick={btnState === 'done' ? undefined : (btnState === 'checkout' ? handleCheckOut : handleCheckIn)}
          disabled={saving || btnState === 'done'}
          className={`w-full py-5 rounded-2xl text-lg font-extrabold flex items-center justify-center gap-3 transition-all duration-200 shadow-lg ${BIG_BTN.cls} ${saving ? 'opacity-70' : 'hover:scale-[1.02] active:scale-[0.98]'} disabled:cursor-default`}>
          {saving ? (
            <span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <span className="text-2xl">{BIG_BTN.icon}</span>
          )}
          {BIG_BTN.label}
        </button>

        {/* Note input (check-out only) */}
        {showNote && btnState === 'checkout' && (
          <div className="animate-in slide-in-from-bottom-2 duration-200 space-y-2">
            <label className="text-xs text-muted font-semibold block">ملاحظات (اختياري)</label>
            <textarea ref={noteRef} value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="مثال: اجتماع مطوّل، عمل إضافي…"
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30 resize-none" />
            <button onClick={() => setShowNote(false)} className="text-xs text-muted hover:text-red-500 transition">إلغاء</button>
          </div>
        )}

        {/* Today's times row */}
        <div className="grid grid-cols-3 gap-3 pt-1">
          {[
            { label: 'الدخول',    val: today?.check_in?.slice(0,5)  || '—', color: 'text-teal'    },
            { label: 'مدة العمل', val: duration || '—',                     color: 'text-amber-600' },
            { label: 'الخروج',    val: today?.check_out?.slice(0,5) || '—', color: 'text-navy'    },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className={`text-xl font-extrabold tabular-nums ${s.color}`}>{s.val}</p>
              <p className="text-[10px] text-muted font-medium mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Weekly view ────────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-3xl p-4">
        <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-3">آخر 7 أيام</p>
        {loading ? (
          <div className="grid grid-cols-7 gap-1.5">
            {[...Array(7)].map((_,i) => <div key={i} className="h-20 rounded-xl bg-surface-alt animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {days.map(iso => <DayBadge key={iso} iso={iso} rec={week[iso]} />)}
          </div>
        )}

        {/* Week stats */}
        {!loading && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
            {[
              { label: 'أيام الحضور',   val: days.filter(d => week[d]?.check_in).length,                          icon: '✅' },
              { label: 'أيام الغياب',   val: days.filter(d => d <= todayISO() && !week[d]?.check_in).length,      icon: '❌' },
              { label: 'أيام مكتملة',   val: days.filter(d => week[d]?.check_in && week[d]?.check_out).length,    icon: '🏆' },
            ].map(s => (
              <div key={s.label} className="text-center flex-1">
                <p className="text-xl font-extrabold text-text">{s.icon} {s.val}</p>
                <p className="text-[10px] text-muted mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Today's notes (if any) ─────────────────────────────── */}
      {today?.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2">
          <span className="text-lg shrink-0">📝</span>
          <div>
            <p className="text-xs font-bold text-amber-700 mb-0.5">ملاحظات اليوم</p>
            <p className="text-sm text-amber-800">{today.notes}</p>
          </div>
        </div>
      )}

    </div>
  );
}
