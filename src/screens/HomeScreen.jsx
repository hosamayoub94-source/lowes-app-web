// =============================================================
// HomeScreen 2.0 — مركز قيادة يومي
// تحية بحسب الوقت · حضور سريع · مهام اليوم ·
// آخر إعلان · تهنئة اليوم · KPIs · Charts
// =============================================================
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { useAuth }  from '@hooks/useAuth';
import { useTheme } from '@hooks/useTheme';
import { navItemsForRole } from '@data/navigation';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@services/supabase';
import { ROLES }    from '@data/teams';

// ── Daily motivation quotes ─────────────────────────────────────
const MOTIVATIONS = [
  { text: 'كل يوم هو فرصة جديدة لتكون أفضل مما كنت عليه بالأمس.', icon: '🌅' },
  { text: 'النجاح ليس نهاية الطريق — إنه استمرار في العطاء والتميز.', icon: '🏆' },
  { text: 'العميل الراضي هو أقوى إعلان يمكن أن تحصل عليه.', icon: '⭐' },
  { text: 'الفريق الذي يتواصل بصدق هو الفريق الذي ينجح دائماً.', icon: '🤝' },
  { text: 'ابدأ يومك بنية صادقة وستجد الطريق يُفتح أمامك.', icon: '✨' },
  { text: 'التفاصيل الصغيرة هي ما تصنع الفرق الكبير في تجربة العميل.', icon: '🔍' },
  { text: 'لويز بروفشنال — نحن لا نبيع منتجات فحسب، نبيع ثقة وجودة.', icon: '💎' },
  { text: 'كل سؤال من عميل هو فرصة لتترك انطباعاً لا يُنسى.', icon: '💬' },
  { text: 'المثابرة تحول الصعب إلى ممكن، والممكن إلى سهل.', icon: '💪' },
  { text: 'الجودة ليست صدفة — هي نتيجة جهد متواصل وعناية حقيقية.', icon: '🌟' },
  { text: 'تعلّم شيئاً جديداً عن منتجاتنا اليوم — معرفتك قوتك.', icon: '📚' },
  { text: 'ابتسامتك في بداية اليوم تُعدي كل من حولك بالطاقة الإيجابية.', icon: '😊' },
  { text: 'العناية بالبشرة علم وفن — أنت سفير لويز في هذا العالم.', icon: '🧴' },
  { text: 'كل هدف كبير يبدأ بخطوة صغيرة — ابدأ الآن.', icon: '🎯' },
  { text: 'الاحترافية تعني الوفاء بوعودك حتى حين لا يراك أحد.', icon: '🏅' },
  { text: 'زميلك نجاحه نجاحك — ادعم فريقك لتنجح معه.', icon: '👥' },
  { text: 'كل شكوى عميل هي بذرة تحسين — اسمع بقلب مفتوح.', icon: '👂' },
  { text: 'الوقت ثمين — استثمر كل دقيقة في ما يُضيف قيمة حقيقية.', icon: '⏰' },
  { text: 'البشرة الصحية تبدأ بمنتج موثوق ومستشار صادق — أنت ذلك المستشار.', icon: '✅' },
  { text: 'السعادة في العمل تأتي حين تؤمن بما تقدمه لعملائك.', icon: '❤️' },
  { text: 'كن الموظف الذي يتذكره العميل ليس لأنه باع له، بل لأنه ساعده.', icon: '🌈' },
  { text: 'الحماس معدٍ — عاملك وعميلك يشعران بطاقتك.', icon: '⚡' },
  { text: 'تميّز بالمعرفة — من يعرف المنتج جيداً يُقنع بسهولة.', icon: '🔬' },
  { text: 'الصدق مع العميل أطول عمراً من أي بيع سريع.', icon: '🤲' },
  { text: 'لا تنتظر الفرصة — اصنعها بنفسك من خلال عملك اليومي.', icon: '🚀' },
  { text: 'الهدوء في المواقف الصعبة هو أكبر دليل على الاحترافية.', icon: '🌊' },
  { text: 'اليوم الذي تتعلم فيه شيئاً جديداً ليس يوماً ضائعاً.', icon: '💡' },
  { text: 'عميلنا الراضي يجلب معه عشرة عملاء آخرين.', icon: '📈' },
  { text: 'أفضل استثمار هو استثمارك في تطوير نفسك ومهاراتك.', icon: '🌱' },
  { text: 'روتين الصباح الجيد يحدد مسار يومك كله — ابدأ بقوة.', icon: '☀️' },
  { text: 'الفشل ليس نهاية — هو درس يقربك من النجاح.', icon: '🔄' },
  { text: 'اجعل كل تفاعل مع العميل يستحق أن يُحكى.', icon: '💫' },
  { text: 'معرفة المكونات تجعلك مستشاراً لا بائعاً.', icon: '🧪' },
  { text: 'شركتنا تنمو بنمو كل فرد فينا — أنت جزء من هذا النجاح.', icon: '🏢' },
  { text: 'الطاقة الإيجابية التي تحضرها معك تنعكس على نتائجك.', icon: '🌞' },
];

function DailyMotivation() {
  const dayIndex = Math.floor(Date.now() / 86400000);
  const q = MOTIVATIONS[dayIndex % MOTIVATIONS.length];
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <div className="relative rounded-2xl overflow-hidden border border-teal/20 bg-gradient-to-l from-teal/8 to-navy/5 px-4 py-3.5">
      <button
        onClick={() => setVisible(false)}
        className="absolute top-2 end-2 text-muted/40 hover:text-muted text-xs w-5 h-5 flex items-center justify-center rounded-full hover:bg-surface-alt transition"
        aria-label="إغلاق"
      >✕</button>
      <div className="flex gap-3 items-start pe-5">
        <span className="text-2xl shrink-0 mt-0.5">{q.icon}</span>
        <div>
          <p className="text-[10px] font-bold text-teal/70 uppercase tracking-widest mb-1">طاقة اليوم</p>
          <p className="text-sm font-semibold text-text leading-relaxed">{q.text}</p>
        </div>
      </div>
    </div>
  );
}

// ── Chart colors (theme-aware) ──────────────────────────────────
function useChartColors() {
  const { isDark } = useTheme();
  return useMemo(() => ({
    axis:   isDark ? '#8b949e' : '#6b7280',
    grid:   isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,31,61,0.08)',
    teal:   'rgb(13,115,119)',
    green:  isDark ? '#3fb950' : '#10b981',
    cursor: isDark ? 'rgba(13,115,119,0.12)' : 'rgba(13,115,119,0.06)',
  }), [isDark]);
}

// ── Time helpers ────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours();
  if (h < 5)  return { text: 'طاب مساؤك',    icon: '🌙' };
  if (h < 12) return { text: 'صباح الخير',    icon: '🌅' };
  if (h < 17) return { text: 'مساء الخير',    icon: '☀️' };
  if (h < 21) return { text: 'أمسك سعيد',    icon: '🌇' };
  return      { text: 'طاب مساؤك',            icon: '🌙' };
}
function todayISO()  { return new Date().toISOString().slice(0, 10); }
/** "YYYY/MM/DD" — matches actual attendance table date format */
function todaySlash() {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}
/** "HH:MM" locale-independent */
function nowHHMM() {
  const d = new Date();
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}
function last7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}
function dayLabel(iso) { return new Date(iso).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { weekday: 'short' }); }
function fullDate() {
  return new Date().toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function sameMonthDay(dateStr, today) {
  if (!dateStr) return false;
  try {
    const d = new Date(dateStr);
    return d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  } catch { return false; }
}

// ── Avatar color (consistent) ───────────────────────────────────
function avatarColor(name) {
  const colors = ['bg-teal/20 text-teal','bg-navy/20 text-navy','bg-amber/20 text-amber','bg-red/20 text-red','bg-purple/20 text-purple','bg-green/20 text-green'];
  let h = 0; for (const c of (name||'')) h = (h*31+c.charCodeAt(0))%colors.length;
  return colors[h];
}

// ── Skeleton ────────────────────────────────────────────────────
function Skel({ className = '' }) {
  return <div className={`bg-surface-alt animate-pulse rounded-xl ${className}`} />;
}

// ── Custom Chart Tooltip ─────────────────────────────────────────
function ChartTooltip({ active, payload, label, prefix = '', suffix = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="text-muted mb-0.5">{label}</p>
      <p className="font-bold text-text">{prefix}{payload[0].value}{suffix}</p>
    </div>
  );
}

// ── Attendance Quick Card ────────────────────────────────────────
// Uses real schema: type="in"|"out" rows, date="YYYY/MM/DD", time_in column
function AttendanceCard({ name, team }) {
  // { checkIn: "HH:MM"|null, checkOut: "HH:MM"|null }
  const [att, setAtt]         = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    if (!name) { setLoading(false); return; }
    const { data } = await supabase
      .from('attendance')
      .select('type,time_in')
      .eq('employee_name', name)
      .eq('date', todaySlash())
      .in('type', ['in', 'out']);
    if (data) {
      const inRow  = data.find(r => r.type === 'in');
      const outRow = data.find(r => r.type === 'out');
      setAtt({ checkIn: inRow?.time_in ?? null, checkOut: outRow?.time_in ?? null });
    }
    setLoading(false);
  }, [name]);

  useEffect(() => { load(); }, [load]);

  const arabicDay = () => new Date().toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { weekday: 'long' });

  const checkIn = async () => {
    if (saving || att?.checkIn) return;
    setSaving(true);
    const now = nowHHMM();
    const dateVal = todaySlash();
    await supabase.from('attendance').insert({
      employee_name: name, team: team ?? null,
      date: dateVal, day: arabicDay(),
      type: 'in', time_in: now, time_out: null,
      hours: 0, status: '✅ حاضر', recorded_at: now,
      delay_minutes: 0, was_late: false, method: 'app',
    });
    await load();
    setSaving(false);
  };

  const checkOut = async () => {
    if (saving || !att?.checkIn || att?.checkOut) return;
    setSaving(true);
    const now = nowHHMM();
    const dateVal = todaySlash();
    const [hi,mi] = (att.checkIn).split(':').map(Number);
    const [ho,mo] = now.split(':').map(Number);
    let mins = (ho*60+mo)-(hi*60+mi); if(mins<0) mins+=1440;
    await supabase.from('attendance').insert({
      employee_name: name, team: team ?? null,
      date: dateVal, day: arabicDay(),
      type: 'out', time_in: now, time_out: now,
      hours: +(mins/60).toFixed(2), status: '🚪 خروج',
      recorded_at: now, delay_minutes: 0, was_late: false, method: 'app',
    });
    await load();
    setSaving(false);
  };

  const isCheckedIn  = !!att?.checkIn;
  const isCheckedOut = !!att?.checkOut;
  const isComplete   = isCheckedIn && isCheckedOut;

  return (
    <div className={`rounded-2xl p-4 border transition-all ${
      isComplete  ? 'bg-emerald-50 border-emerald-200' :
      isCheckedIn ? 'bg-teal/5 border-teal/20' :
                    'bg-surface border-border'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-1">الحضور اليوم</p>
          {loading ? (
            <Skel className="h-6 w-32 mt-1" />
          ) : isComplete ? (
            <div>
              <p className="text-base font-extrabold text-emerald-700">✅ اكتمل</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                دخول {att.checkIn} — خروج {att.checkOut}
              </p>
            </div>
          ) : isCheckedIn ? (
            <div>
              <p className="text-base font-extrabold text-teal">⏳ في العمل</p>
              <p className="text-xs text-muted mt-0.5">دخول: {att.checkIn}</p>
            </div>
          ) : (
            <div>
              <p className="text-base font-extrabold text-text">لم تسجّل بعد</p>
              <p className="text-xs text-muted mt-0.5">{fullDate()}</p>
            </div>
          )}
        </div>

        <div className="shrink-0">
          {!loading && !isComplete && (
            isCheckedIn ? (
              <button onClick={checkOut} disabled={saving}
                className="px-4 py-2 rounded-xl bg-navy text-white text-sm font-bold hover:bg-navy/90 disabled:opacity-50 transition shadow-sm hover:scale-[1.02] active:scale-[0.98]">
                {saving ? '⏳' : '🏠 خروج'}
              </button>
            ) : (
              <button onClick={checkIn} disabled={saving}
                className="px-4 py-2 rounded-xl bg-teal text-white text-sm font-bold hover:bg-teal/90 disabled:opacity-50 transition shadow-sm hover:scale-[1.02] active:scale-[0.98]">
                {saving ? '⏳' : '✅ دخول'}
              </button>
            )
          )}
          {!loading && isComplete && (
            <span className="text-3xl">🎉</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── My Tasks Widget ──────────────────────────────────────────────
function MyTasksCard({ name, userId }) {
  const [tasks, setTasks]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!name) return;
    // Filter by assignee_id (UUID FK) or assigned_to (UUID) — both point to profile.id
    const filter = userId
      ? `assignee_id.eq.${userId},assigned_to.eq.${userId}`
      : null;
    let q = supabase.from('tasks').select('id,title,status,priority,due_date');
    if (filter) q = q.or(filter);
    q.not('status', 'in', '("done","completed","cancelled")')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(4)
      .then(({ data }) => { setTasks(data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [name, userId]);

  const STATUS_DOT = {
    pending: 'bg-amber-400', in_progress: 'bg-teal', in_review: 'bg-violet-400',
    review: 'bg-violet-400', overdue: 'bg-red-400', blocked: 'bg-red-400', open: 'bg-gray-300',
  };
  const isOverdue = due => due && new Date(due) < new Date() && !due.includes(todayISO());
  const isToday   = due => due?.slice(0,10) === todayISO();
  const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const fmtDueDateShort = iso => { if (!iso) return ''; const d = new Date(iso); return `${d.getDate()} ${MONTHS_AR[d.getMonth()]}`; };

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <p className="text-[11px] font-bold text-muted uppercase tracking-wider">مهامي</p>
          {!loading && <p className="text-xs text-muted/70 mt-0.5">{tasks.length} مهمة مفتوحة</p>}
        </div>
        <Link to="/tasks" className="text-xs text-teal font-semibold hover:underline">عرض الكل ←</Link>
      </div>
      <div className="px-4 pb-4 space-y-2">
        {loading ? [1,2,3].map(i => <Skel key={i} className="h-10" />) :
         tasks.length === 0 ? (
          <div className="flex flex-col items-center py-5 text-center">
            <span className="text-3xl mb-1.5 opacity-50">✅</span>
            <p className="text-xs text-muted font-medium">لا توجد مهام مفتوحة!</p>
          </div>
        ) : tasks.map(t => (
          <div key={t.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-surface-alt hover:bg-surface-alt/80 transition">
            <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[t.status] ?? 'bg-gray-300'}`} />
            <p className="flex-1 text-sm text-text truncate font-medium">{t.title}</p>
            {t.due_date && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                isOverdue(t.due_date) ? 'bg-red-100 text-red-600' :
                isToday(t.due_date)  ? 'bg-amber-100 text-amber-700' : 'text-muted'
              }`}>
                {isOverdue(t.due_date) ? '⚠️ متأخر' : isToday(t.due_date) ? '⏰ اليوم' : fmtDueDateShort(t.due_date)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Latest Announcement ──────────────────────────────────────────
// ── Emergency Announcement Banner ───────────────────────────────
function EmergencyBanner() {
  const [ann, setAnn]         = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const now = new Date().toISOString();
    supabase.from('announcements')
      .select('id,title,body,created_at')
      .eq('is_emergency', true)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => setAnn(data?.[0] ?? null))
      .catch(() => {});
  }, []);

  if (!ann || dismissed) return null;

  return (
    <div className="relative rounded-2xl overflow-hidden border border-red-300 bg-red-50 px-4 py-3.5 shadow-sm" dir="rtl">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 end-2 text-red-300 hover:text-red-500 text-xs w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-100 transition"
        aria-label="إغلاق"
      >✕</button>
      <div className="flex gap-3 items-start pe-5">
        <span className="text-2xl shrink-0 mt-0.5 animate-pulse">🚨</span>
        <div>
          <p className="text-[10px] font-extrabold text-red-600 uppercase tracking-widest mb-1">إعلان طارئ</p>
          <p className="text-sm font-extrabold text-red-700 leading-snug">{ann.title}</p>
          {ann.body && <p className="text-xs text-red-600 mt-1 leading-relaxed">{ann.body}</p>}
        </div>
      </div>
    </div>
  );
}

function AnnouncementCard() {
  const [ann, setAnn]         = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('announcements').select('id,title,body,is_pinned,is_emergency,created_at,created_by')
      .eq('is_emergency', false)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => { setAnn(data?.[0] ?? null); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <Skel className="h-24" />;
  if (!ann) return null;

  return (
    <Link to="/notifications" className="block bg-surface border border-border rounded-2xl px-4 py-3.5 hover:border-teal/30 hover:shadow-sm transition-all group">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-teal/10 text-teal flex items-center justify-center text-lg shrink-0 group-hover:bg-teal/20 transition">
          {ann.is_pinned ? '📌' : '📢'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider">آخر إعلان</p>
            {ann.is_pinned && <span className="text-[9px] font-bold text-teal bg-teal/10 px-1.5 py-0.5 rounded-full">مثبّت</span>}
          </div>
          <p className="text-sm font-bold text-text truncate">{ann.title}</p>
          {ann.body && <p className="text-xs text-muted mt-0.5 line-clamp-1">{ann.body}</p>}
        </div>
        <span className="text-muted text-sm group-hover:text-teal transition shrink-0">←</span>
      </div>
    </Link>
  );
}

// ── Celebration Banner ───────────────────────────────────────────
function CelebrationBanner() {
  const [celebrations, setCelebrations] = useState([]);

  useEffect(() => {
    const today = new Date();
    supabase.from('profiles').select('employee_name,birthday,hire_date').eq('is_active', true)
      .then(({ data }) => {
        const found = [];
        (data ?? []).forEach(p => {
          if (sameMonthDay(p.birthday, today))
            found.push({ type: 'birthday', name: p.employee_name });
          if (sameMonthDay(p.hire_date, today)) {
            const yrs = today.getFullYear() - new Date(p.hire_date).getFullYear();
            if (yrs >= 1) found.push({ type: 'anniversary', name: p.employee_name, years: yrs });
          }
        });
        setCelebrations(found);
      }).catch(() => {});
  }, []);

  if (!celebrations.length) return null;

  return (
    <div className="bg-gradient-to-r from-amber-50 to-amber-100/60 border border-amber-200 rounded-2xl px-4 py-3.5 animate-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-3">
        <span className="text-3xl animate-bounce">🎉</span>
        <div className="flex-1">
          {celebrations.map((c, i) => (
            <p key={i} className="text-sm font-bold text-amber-800">
              {c.type === 'birthday'
                ? `🎂 اليوم عيد ميلاد ${c.name}! — كل عام وأنت بخير 💙`
                : `🏆 ${c.name} يكمل ${c.years === 1 ? 'سنة' : `${c.years} سنوات`} في Lowe's! — شكراً لعطاءك ✨`}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── KPI Bar ──────────────────────────────────────────────────────
function KpiItem({ label, value, icon, tone, loading }) {
  const tones = {
    teal:   'bg-teal/10 text-teal',
    blue:   'bg-blue-100 text-blue-700',
    amber:  'bg-amber-100 text-amber-700',
    purple: 'bg-violet-100 text-violet-700',
    green:  'bg-emerald-100 text-emerald-700',
  };
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col gap-2">
      <div className={`w-9 h-9 rounded-xl ${tones[tone] ?? tones.teal} flex items-center justify-center text-lg`}>{icon}</div>
      {loading ? <Skel className="h-7 w-12" /> : <p className="text-2xl font-extrabold text-text tabular-nums">{value}</p>}
      <p className="text-xs text-muted font-medium leading-tight">{label}</p>
    </div>
  );
}

// ── Mini Leaderboard ─────────────────────────────────────────────
const MEDALS = ['🥇','🥈','🥉'];
function MiniLeaderboard() {
  const [top3, setTop3]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
    Promise.allSettled([
      supabase.from('profiles').select('employee_name,avatar_url').eq('is_active', true),
      supabase.from('task_points').select('employee_name,points').gte('created_at', monthStart+'T00:00:00'),
    ]).then(([profRes, ptsRes]) => {
      const profiles = profRes.value?.data ?? [];
      const pts      = ptsRes.value?.data  ?? [];
      const map = {};
      pts.forEach(r => { map[r.employee_name] = (map[r.employee_name]||0) + r.points; });
      const board = profiles
        .filter(p => p.employee_name)
        .map(p => ({ name: p.employee_name, avatar: p.avatar_url, points: map[p.employee_name]||0 }))
        .sort((a, b) => b.points - a.points)
        .slice(0, 3)
        .filter(p => p.points > 0);
      setTop3(board); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (!loading && !top3.length) return null;

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <p className="text-[11px] font-bold text-muted uppercase tracking-wider">ليدربورد الشهر</p>
          <p className="text-xs text-muted/70 mt-0.5">أفضل الموظفين هذا الشهر</p>
        </div>
        <Link to="/achievements" className="text-xs text-teal font-semibold hover:underline">عرض الكل ←</Link>
      </div>
      <div className="px-4 pb-4 space-y-2">
        {loading ? [1,2,3].map(i => <Skel key={i} className="h-12" />) :
         top3.map((e, idx) => (
          <div key={e.name} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-alt">
            <span className="text-xl w-7 text-center">{MEDALS[idx]}</span>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden ${avatarColor(e.name)}`}>
              {e.avatar ? <img src={e.avatar} className="w-full h-full object-cover" alt="" /> : e.name.charAt(0)}
            </div>
            <p className="flex-1 font-semibold text-text text-sm truncate">{e.name}</p>
            <span className="font-black text-teal text-sm tabular-nums">{e.points} نقطة</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Quick Shortcuts ──────────────────────────────────────────────
function QuickShortcuts({ role }) {
  const items = navItemsForRole(role).slice(0, 8);
  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-3">وصول سريع</p>
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {items.map(item => (
          <Link key={item.id} to={item.path}
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-surface-alt transition-all group hover:scale-105 active:scale-95">
            <span className="text-2xl group-hover:scale-110 transition-transform">{item.icon}</span>
            <span className="text-[10px] text-muted font-medium text-center leading-tight group-hover:text-teal transition-colors">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Today Team Status (manager only) ────────────────────────────
const ROLE_LABELS_SHORT = {
  manager:'مدير', admin:'أدمن', sales_manager:'مبيعات',
  social_manager:'سوشال', media_buyer:'ميديا', employee:'موظف',
};

function TodayTeamStatus() {
  const [data, setData] = useState(null); // { present: [], absent: [] }
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const dateSlash = todaySlash();
    Promise.allSettled([
      // NOTE: column is role_type (not role) + only active employees
      supabase.from('profiles').select('id,employee_name,role_type,team,is_active').eq('is_active', true).order('employee_name'),
      supabase.from('attendance').select('employee_name,time_in').eq('type','in').eq('date',dateSlash),
    ]).then(([pRes, aRes]) => {
      const profiles = (pRes.value?.data ?? []).map(p => ({ ...p, role: p.role_type }));
      const checkedIn = new Map((aRes.value?.data ?? []).map(r => [r.employee_name, r.time_in]));
      const present = [], absent = [];
      profiles.forEach(p => {
        if (!p.employee_name) return;
        const timeIn = checkedIn.get(p.employee_name);
        if (timeIn) present.push({ ...p, timeIn });
        else         absent.push(p);
      });
      setData({ present, absent });
    });
  }, []);

  if (!data) return (
    <div className="bg-surface border border-border rounded-2xl p-4 animate-pulse">
      <div className="h-4 w-40 bg-surface-alt rounded mb-3" />
      <div className="grid grid-cols-3 gap-2">
        {[1,2,3].map(i => <div key={i} className="h-16 bg-surface-alt rounded-xl" />)}
      </div>
    </div>
  );

  const total = data.present.length + data.absent.length;
  const pct   = total > 0 ? Math.round((data.present.length / total) * 100) : 0;

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-surface-alt/50 transition"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal/10 flex items-center justify-center text-lg shrink-0">👥</div>
          <div className="text-right">
            <p className="text-sm font-bold text-text">حضور الفريق اليوم</p>
            <p className="text-xs text-muted">
              <span className="text-teal font-semibold">{data.present.length}</span> حاضر
              {data.absent.length > 0 && <span className="text-muted"> · {data.absent.length} غائب</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Mini progress ring */}
          <div className="relative w-10 h-10">
            <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-border)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15" fill="none" stroke="#0d7377" strokeWidth="3"
                strokeDasharray={`${pct * 0.942} 94.2`} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-teal">{pct}%</span>
          </div>
          <span className={`text-muted text-xs transition-transform duration-200 ${open ? 'rotate-90' : '-rotate-90'}`}>‹</span>
        </div>
      </button>

      {/* Expanded list */}
      {open && (
        <div className="border-t border-border/40">
          {/* Present */}
          {data.present.length > 0 && (
            <div className="px-4 pt-3 pb-2">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">✅ حاضرون ({data.present.length})</p>
              <div className="space-y-1.5">
                {data.present.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-green-bg/40">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-teal/20 flex items-center justify-center text-xs font-bold text-teal shrink-0">
                        {p.employee_name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-text leading-none">{p.employee_name}</p>
                        <p className="text-[10px] text-muted mt-0.5">{ROLE_LABELS_SHORT[p.role] ?? p.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-green-fg tabular-nums">{p.timeIn ?? '—'}</span>
                      <button
                        onClick={() => navigate(`/chat?dm=${encodeURIComponent(p.employee_name)}`)}
                        className="text-[10px] px-2 py-1 rounded-lg bg-teal/10 text-teal hover:bg-teal/20 transition font-semibold"
                        title="رسالة مباشرة"
                      >💬</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Absent */}
          {data.absent.length > 0 && (
            <div className="px-4 pt-2 pb-3">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">❌ لم يسجلوا بعد ({data.absent.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {data.absent.map(p => (
                  <span key={p.id}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-surface-alt border border-border text-muted">
                    {p.employee_name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Main HomeScreen
// ════════════════════════════════════════════════════════════════
export default function HomeScreen() {
  const { name, role, id: userId, team } = useAuth();
  const isManager = [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER].includes(role);
  const g = greeting();
  const cc = useChartColors();

  // KPIs
  const [kpi, setKpi]         = useState({ tasks: '—', notifs: '—', leave: '—', sales: '—' });
  const [kpiLoaded, setKpiLoaded] = useState(false);

  // Charts
  const [attChart, setAttChart]   = useState([]);
  const [salesChart, setSalesChart] = useState([]);
  const [chartsLoaded, setChartsLoaded] = useState(false);

  useEffect(() => {
    if (!name) return;
    const today     = todayISO();
    const year      = new Date().getFullYear();
    const days      = last7Days();
    const monthFrom = days[0];

    Promise.allSettled([
      // Open tasks for me — filter by UUID (assignee_id or assigned_to)
      userId
        ? supabase.from('tasks').select('id',{count:'exact',head:true})
            .or(`assignee_id.eq.${userId},assigned_to.eq.${userId}`)
            .not('status','in','("done","completed","cancelled")')
        : Promise.resolve({count: 0}),
      // Unread notifications (current user's only)
      userId
        ? supabase.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',userId).eq('is_read',false)
        : Promise.resolve({count:0}),
      // Leave balance — compute from approved annual leave_requests this year
      userId ? supabase.from('leave_requests').select('days').eq('employee_id',userId).eq('type','annual').eq('status','approved').gte('start_date',year+'-01-01').lte('start_date',year+'-12-31')
             : Promise.resolve({data:[]}),
      // Attendance chart — attendance table uses 'YYYY/MM/DD' date format
      supabase.from('attendance').select('date,employee_name').eq('type','in')
        .gte('date',monthFrom.replace(/-/g,'/')).lte('date',today.replace(/-/g,'/')),
      // Sales chart (managers)
      isManager ? supabase.from('daily_sales_reports').select('report_date,total_sales_usd').gte('report_date',monthFrom).lte('report_date',today)
                : Promise.resolve({data:[]}),
    ]).then(([tRes, nRes, lRes, aRes, sRes]) => {
      // KPIs
      const tasks  = tRes.value?.count  ?? '—';
      const notifs = nRes.value?.count  ?? '—';
      const leaveRows  = lRes.value?.data ?? [];
      const usedDays   = leaveRows.reduce((s, r) => s + (r.days || 0), 0);
      const leave      = `${15 - usedDays} يوم`;

      setKpi({ tasks, notifs, leave });
      setKpiLoaded(true);

      // Attendance chart (unique attendees per day)
      // r.date is 'YYYY/MM/DD' — convert to ISO 'YYYY-MM-DD' for key lookup
      const attByDay = {}; days.forEach(d => { attByDay[d] = new Set(); });
      (aRes.value?.data??[]).forEach(r => {
        const isoDate = r.date?.replace(/\//g, '-');
        if(attByDay[isoDate]) attByDay[isoDate].add(r.employee_name);
      });
      setAttChart(days.map(d => ({ day: dayLabel(d), count: attByDay[d].size })));

      // Sales chart
      const salesByDay = {}; days.forEach(d => { salesByDay[d] = 0; });
      (sRes.value?.data??[]).forEach(r => {
        if (salesByDay[r.report_date] !== undefined) salesByDay[r.report_date] += Number(r.total_sales_usd)||0;
      });
      setSalesChart(days.map(d => ({ day: dayLabel(d), sales: Math.round(salesByDay[d]) })));
      setChartsLoaded(true);
    }).catch(() => { setKpiLoaded(true); setChartsLoaded(true); });
  }, [name, userId, isManager]);

  return (
    <div className="space-y-4" dir="rtl">

      {/* ── Emergency banner ────────────────────────────────────── */}
      <EmergencyBanner />

      {/* ── Hero greeting ───────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 pt-1">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-extrabold text-xl shadow-sm ${avatarColor(name)}`}>
            {name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div>
            <p className="text-lg font-extrabold text-text leading-tight">
              {g.icon} {g.text}{name ? `، ${name.split(' ')[0]}` : ''}
            </p>
            <p className="text-xs text-muted mt-0.5">{fullDate()}</p>
          </div>
        </div>
        <Link to="/notifications" className="relative w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center text-muted hover:text-teal hover:border-teal/40 transition">
          🔔
          {typeof kpi.notifs === 'number' && kpi.notifs > 0 && (
            <span className="absolute -top-1 -end-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold grid place-items-center shadow">
              {kpi.notifs > 9 ? '9+' : kpi.notifs}
            </span>
          )}
        </Link>
      </div>

      {/* ── Daily motivation ────────────────────────────────────── */}
      <DailyMotivation />

      {/* ── Celebration ─────────────────────────────────────────── */}
      <CelebrationBanner />

      {/* ── 2-column layout (quick cards) ───────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <AttendanceCard name={name} team={team} />
        <MyTasksCard name={name} userId={userId} />
      </div>

      {/* ── Latest Announcement ─────────────────────────────────── */}
      <AnnouncementCard />

      {/* ── KPI strip ───────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <KpiItem label="مهام مفتوحة" icon="📋" value={kpi.tasks}  tone="blue"   loading={!kpiLoaded} />
        <KpiItem label="إشعارات جديدة" icon="🔔" value={kpi.notifs} tone="amber"  loading={!kpiLoaded} />
        <KpiItem label="رصيد الإجازة" icon="🏖️" value={kpi.leave}  tone="purple" loading={!kpiLoaded} />
      </div>

      {/* ── Charts ──────────────────────────────────────────────── */}
      {chartsLoaded && (
        <div className={`grid gap-4 ${isManager ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
          <div className="bg-surface border border-border rounded-2xl p-4">
            <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-0.5">حضور الفريق</p>
            <p className="text-xs text-muted/70 mb-4">آخر 7 أيام</p>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attChart} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: cc.axis }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: cc.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip suffix=" موظف" />} cursor={{ fill: cc.cursor }} />
                  <Bar dataKey="count" fill={cc.teal} radius={[6,6,0,0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {isManager && (
            <div className="bg-surface border border-border rounded-2xl p-4">
              <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-0.5">المبيعات</p>
              <p className="text-xs text-muted/70 mb-4">آخر 7 أيام بالدولار</p>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={salesChart} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: cc.axis }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: cc.axis }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip prefix="$" />} />
                    <Line type="monotone" dataKey="sales" stroke={cc.green} strokeWidth={2.5}
                      dot={{ fill: cc.green, r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Today Team Status (managers only) ──────────────────── */}
      {isManager && <TodayTeamStatus />}

      {/* ── Daily Training Card ─────────────────────────────────── */}
      <Link to="/training" className="block">
        <div className="bg-gradient-to-r from-teal to-navy rounded-2xl px-5 py-4 flex items-center gap-4 hover:opacity-95 transition-all active:scale-[0.99] shadow-md shadow-teal/10">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl shrink-0">🧠</div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-sm">التدريب اليومي</p>
            <p className="text-white/70 text-xs mt-0.5">أسئلة وأجوبة — زد معرفتك بالمنتجات يومياً</p>
          </div>
          <span className="text-white/50 text-lg shrink-0">←</span>
        </div>
      </Link>

      {/* ── Leaderboard ─────────────────────────────────────────── */}
      <MiniLeaderboard />

      {/* ── Quick shortcuts ──────────────────────────────────────── */}
      <QuickShortcuts role={role} />

    </div>
  );
}
