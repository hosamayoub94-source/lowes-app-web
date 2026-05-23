// =============================================================
// ProfileScreen — employee profile with points, level & schedule
// =============================================================
import { useEffect, useState } from 'react';
import { Hero } from '@components/ui/Hero';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { Avatar } from '@components/ui/Avatar';
import { Button } from '@components/ui/Button';
import { useAuth } from '@hooks/useAuth';
import { useTheme } from '@hooks/useTheme';
import { useUiStore } from '@stores/uiStore';
import { ROLE_LABELS } from '@data/teams';

// ── Level system (mirrors task.types) ────────────────────────
const LEVELS = [
  { min: 500, max: Infinity, icon: '🏆', label: 'أسطورة',  cls: 'bg-green-bg text-green-fg'  },
  { min: 300, max: 499,      icon: '💎', label: 'خبير',    cls: 'bg-teal/10 text-teal'       },
  { min: 150, max: 299,      icon: '🔥', label: 'محترف',   cls: 'bg-amber-bg text-amber-fg'  },
  { min: 50,  max: 149,      icon: '⭐', label: 'نجم',     cls: 'bg-blue-bg text-blue-fg'    },
  { min: 0,   max: 49,       icon: '🌱', label: 'مبتدئ',  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
];
function getLevel(pts = 0) {
  return LEVELS.find(l => pts >= l.min && pts <= l.max) || LEVELS[LEVELS.length - 1];
}

// ── Shift labels ──────────────────────────────────────────────
const SHIFT_LABELS = {
  morning:  { label: 'صباحي',  icon: '🌅' },
  evening:  { label: 'مسائي',  icon: '🌇' },
  night:    { label: 'ليلي',   icon: '🌙' },
  flexible: { label: 'مرن',    icon: '🕐' },
};

// ── Data fetchers ─────────────────────────────────────────────
async function fetchFullProfile(userId) {
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

async function fetchMonthlyPoints(employeeName) {
  if (!employeeName) return 0;
  const { supabase } = await import('@services/supabase');
  const from = new Date(); from.setDate(1); from.setHours(0, 0, 0, 0);
  const { data } = await supabase
    .from('task_points').select('points')
    .eq('employee_name', employeeName)
    .gte('created_at', from.toISOString());
  return (data ?? []).reduce((s, r) => s + (r.points || 0), 0);
}

async function fetchProfileStats(userId) {
  const { supabase } = await import('@services/supabase');
  const month = new Date().toISOString().slice(0, 7);
  const [attRes, salRes] = await Promise.all([
    supabase.from('attendance_logs')
      .select('check_in, check_out, work_date')
      .eq('employee_id', userId)
      .gte('work_date', month + '-01')
      .lte('work_date', month + '-31')
      .order('work_date', { ascending: false }),
    supabase.from('employee_salary_settings')
      .select('base_salary_usd, currency')
      .eq('employee_id', userId)
      .order('effective_date', { ascending: false })
      .limit(1).maybeSingle(),
  ]);
  const logs = attRes.data ?? [];
  let mins = 0;
  for (const l of logs) {
    if (l.check_in && l.check_out) mins += (new Date(l.check_out) - new Date(l.check_in)) / 60000;
  }
  return {
    daysWorked:   logs.length,
    hoursWorked:  Math.round(mins / 60),
    lastWorkDate: logs[0]?.work_date ?? null,
    salary:       salRes.data?.base_salary_usd ? Number(salRes.data.base_salary_usd).toLocaleString() : null,
    salaryCur:    salRes.data?.currency ?? 'USD',
  };
}

// ── Sub-components ────────────────────────────────────────────
function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-sm font-semibold text-text">{value}</span>
    </div>
  );
}

function StatCard({ icon, label, value, tone = 'teal' }) {
  const cls = { teal: 'text-teal', green: 'text-green-fg', blue: 'text-blue-fg', amber: 'text-amber-fg' };
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col gap-1">
      <div className="text-2xl">{icon}</div>
      <div className={`text-xl font-bold ${cls[tone] ?? 'text-teal'}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { id, name, role, team, avatar_url, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const lang       = useUiStore(s => s.lang);
  const toggleLang = useUiStore(s => s.toggleLang);

  const [profile, setProfile]         = useState(null);
  const [stats, setStats]             = useState(null);
  const [monthPoints, setMonthPoints] = useState(0);
  const [statsErr, setStatsErr]       = useState(null);

  useEffect(() => {
    if (!id) return;
    fetchFullProfile(id).then(setProfile).catch(() => {});
    fetchProfileStats(id).then(setStats).catch(e => setStatsErr(e.message));
  }, [id]);

  useEffect(() => {
    if (!profile?.employee_name) return;
    fetchMonthlyPoints(profile.employee_name).then(setMonthPoints).catch(() => {});
  }, [profile?.employee_name]);

  const totalPoints = profile?.total_points ?? 0;
  const level       = getLevel(totalPoints);
  const nextLevel   = LEVELS.slice().reverse().find(l => l.min > totalPoints);
  const levelPct    = nextLevel
    ? Math.min(Math.round(((totalPoints - level.min) / (nextLevel.min - level.min)) * 100), 99)
    : 100;

  const shiftMeta = profile?.shift_type ? SHIFT_LABELS[profile.shift_type] : null;
  const hasSchedule = shiftMeta || profile?.work_start || profile?.rest_day;

  return (
    <div className="space-y-5" dir="rtl">
      <Hero eyebrow="الملف الشخصي" title="حسابي" subtitle="بياناتك الشخصية وإحصائياتك." />

      {/* ── Identity card ── */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            <Avatar name={name || ''} src={avatar_url} size="2xl" />
            <span className="absolute -bottom-1 -end-1 text-xl leading-none" title={level.label}>
              {level.icon}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xl font-extrabold truncate text-text">{name || '—'}</div>
            <div className="text-sm text-muted">{ROLE_LABELS[role] ?? role ?? ''}</div>
            {team && <div className="text-xs text-muted mt-0.5">الفريق: {team}</div>}
            <span className={`inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full text-xs font-bold ${level.cls}`}>
              {level.icon} {level.label}
            </span>
          </div>
        </div>
        <div className="mt-4">
          <InfoRow label="الدور"      value={ROLE_LABELS[role] ?? role} />
          <InfoRow label="الفريق"     value={team} />
          {profile?.page_name && <InfoRow label="اسم الصفحة"   value={profile.page_name} />}
          {stats?.lastWorkDate && (
            <InfoRow label="آخر حضور" value={new Date(stats.lastWorkDate).toLocaleDateString('ar')} />
          )}
          {stats?.salary && <InfoRow label="الراتب" value={`$${stats.salary}`} />}
        </div>
      </Card>

      {/* ── Points & Level ── */}
      <Card>
        <CardTitle>⭐ النقاط والمستوى</CardTitle>
        <CardSubtitle>تقدمك في نظام مكافآت الفريق</CardSubtitle>
        <div className="mt-4 space-y-4">
          {/* Level badge + progress */}
          <div className="flex items-center gap-3">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0 ${level.cls}`}>
              {level.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-bold text-text">{level.label}</span>
                <span className="text-xs font-semibold text-teal">{totalPoints} نقطة</span>
              </div>
              <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full bg-teal transition-all duration-700"
                  style={{ width: `${levelPct}%` }}
                />
              </div>
              {nextLevel ? (
                <div className="text-[10px] text-muted mt-1">
                  {nextLevel.min - totalPoints} نقطة للوصول إلى {nextLevel.icon} {nextLevel.label}
                </div>
              ) : (
                <div className="text-[10px] text-teal mt-1 font-semibold">المستوى الأعلى — أسطورة الفريق! 🎉</div>
              )}
            </div>
          </div>

          {/* Points stat grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-alt rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-teal">{totalPoints}</div>
              <div className="text-xs text-muted mt-0.5">إجمالي النقاط</div>
            </div>
            <div className="bg-surface-alt rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-green-fg">+{monthPoints}</div>
              <div className="text-xs text-muted mt-0.5">نقاط هذا الشهر</div>
            </div>
          </div>

          {/* All levels reference */}
          <div>
            <div className="text-xs font-semibold text-muted mb-2">سلّم المستويات</div>
            <div className="space-y-1">
              {[...LEVELS].reverse().map(l => (
                <div
                  key={l.label}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs ${l.label === level.label ? 'font-bold ' + l.cls : 'text-muted'}`}
                >
                  <span>{l.icon} {l.label}</span>
                  <span>{l.min === 0 ? '0' : l.min === Infinity ? '∞' : l.min}+ نقطة</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Work schedule ── */}
      {hasSchedule && (
        <Card>
          <CardTitle>🗓️ جدول العمل</CardTitle>
          <CardSubtitle>ورديتك وساعات دوامك الرسمي</CardSubtitle>
          <div className="mt-4">
            {shiftMeta && (
              <InfoRow label="نوع الوردية" value={`${shiftMeta.icon} ${shiftMeta.label}`} />
            )}
            {profile?.work_start && profile?.work_end && (
              <InfoRow label="ساعات العمل" value={`${profile.work_start} – ${profile.work_end}`} />
            )}
            {profile?.rest_day && (
              <InfoRow label="يوم الراحة" value={profile.rest_day} />
            )}
          </div>
        </Card>
      )}

      {/* ── Attendance stats ── */}
      {statsErr ? (
        <div className="text-xs text-red-500 bg-red-50 rounded-xl px-4 py-3">{statsErr}</div>
      ) : (
        <div>
          <h2 className="text-sm font-semibold text-muted mb-3">إحصائيات الشهر الحالي</h2>
          {stats === null ? (
            <div className="text-center py-8 text-muted text-sm">جار التحميل…</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard icon="📅" label="أيام الحضور"    value={stats.daysWorked}                  tone="teal"  />
              <StatCard icon="⏱️" label="ساعات العمل"    value={stats.hoursWorked + ' ساعة'}       tone="blue"  />
              {stats.salary && (
                <StatCard icon="💰" label="الراتب الأساسي" value={'$' + stats.salary}              tone="green" />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Preferences ── */}
      <Card>
        <CardTitle>التفضيلات</CardTitle>
        <CardSubtitle>تخصيص واجهة الاستخدام</CardSubtitle>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" onClick={toggleTheme}>
            الثيم: {theme === 'dark' ? 'ليلي 🌙' : 'نهاري ☀️'} — تبديل
          </Button>
          <Button variant="secondary" size="lg" onClick={toggleLang}>
            اللغة: {lang === 'ar' ? 'العربية' : 'English'} — تبديل
          </Button>
        </div>
      </Card>

      {/* ── Session ── */}
      <Card>
        <CardTitle>الجلسة</CardTitle>
        <CardSubtitle>إدارة الجلسة الحالية</CardSubtitle>
        <div className="mt-4">
          <Button variant="danger" onClick={logout}>تسجيل الخروج</Button>
        </div>
      </Card>
    </div>
  );
}
