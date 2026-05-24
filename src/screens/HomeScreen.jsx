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
import { Link }     from 'react-router-dom';
import { supabase } from '@services/supabase';
import { ROLES }    from '@data/teams';

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
function dayLabel(iso) { return new Date(iso).toLocaleDateString('ar-SA', { weekday: 'short' }); }
function fullDate() {
  return new Date().toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
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

  const arabicDay = () => new Date().toLocaleDateString('ar-SA', { weekday: 'long' });

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
function MyTasksCard({ name }) {
  const [tasks, setTasks]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!name) return;
    supabase.from('tasks')
      .select('id,title,status,priority,due_date')
      .ilike('assigned_to', `%${name}%`)
      .not('status', 'in', '("done","completed","مكتملة")')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(4)
      .then(({ data }) => { setTasks(data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [name]);

  const STATUS_DOT = {
    pending: 'bg-amber-400', in_progress: 'bg-teal', review: 'bg-violet-400',
    blocked: 'bg-red-400', open: 'bg-gray-300',
  };
  const isOverdue = due => due && new Date(due) < new Date() && !due.includes(todayISO());
  const isToday   = due => due?.slice(0,10) === todayISO();

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
                {isOverdue(t.due_date) ? '⚠️ متأخر' : isToday(t.due_date) ? '⏰ اليوم' : t.due_date.slice(5)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Latest Announcement ──────────────────────────────────────────
function AnnouncementCard() {
  const [ann, setAnn]         = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('announcements').select('id,title,body,is_pinned,created_at,created_by')
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
    supabase.from('profiles').select('employee_name,birthday,join_date').eq('is_active', true)
      .then(({ data }) => {
        const found = [];
        (data ?? []).forEach(p => {
          if (sameMonthDay(p.birthday, today))
            found.push({ type: 'birthday', name: p.employee_name });
          if (sameMonthDay(p.join_date, today)) {
            const yrs = today.getFullYear() - new Date(p.join_date).getFullYear();
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
      // Open tasks for me
      supabase.from('tasks').select('id',{count:'exact',head:true})
        .ilike('assigned_to', `%${name}%`)
        .not('status','in','("done","completed","مكتملة")'),
      // Unread notifications
      supabase.from('notifications').select('id',{count:'exact',head:true}).eq('is_read',false),
      // Leave balance
      userId ? supabase.from('leave_balances').select('total_days,used_days').eq('employee_id',userId).eq('year',year).maybeSingle()
             : Promise.resolve({data:null}),
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
      const ld     = lRes.value?.data;
      const leave  = ld ? `${(ld.total_days??15)-(ld.used_days??0)} يوم` : '—';

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

      {/* ── Celebration ─────────────────────────────────────────── */}
      <CelebrationBanner />

      {/* ── 2-column layout (quick cards) ───────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <AttendanceCard name={name} team={team} />
        <MyTasksCard name={name} />
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

      {/* ── Leaderboard ─────────────────────────────────────────── */}
      <MiniLeaderboard />

      {/* ── Quick shortcuts ──────────────────────────────────────── */}
      <QuickShortcuts role={role} />

    </div>
  );
}
