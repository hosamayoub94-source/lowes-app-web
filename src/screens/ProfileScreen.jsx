// =============================================================
// ProfileScreen — full employee profile with live Supabase data
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

const TONE = { teal:'text-teal', green:'text-green-600', orange:'text-orange-500', blue:'text-blue-600', red:'text-red-500' };

function StatCard({ icon, label, value, tone = 'teal' }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col gap-1">
      <div className="text-2xl">{icon}</div>
      <div className={['text-xl font-bold', TONE[tone] ?? TONE.teal].join(' ')}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-sm font-semibold text-text">{value}</span>
    </div>
  );
}

async function fetchProfileStats(userId) {
  const { supabase } = await import('@services/supabase');
  const now   = new Date();
  const month = now.toISOString().slice(0, 7);
  const from  = month + '-01';
  const to    = month + '-31';

  const [attRes, salRes] = await Promise.all([
    supabase.from('attendance_logs')
      .select('id,check_in,check_out,work_date')
      .eq('employee_id', userId)
      .gte('work_date', from)
      .lte('work_date', to)
      .order('work_date', { ascending: false }),
    supabase.from('employee_salary_settings')
      .select('base_salary_usd,currency,effective_date')
      .eq('employee_id', userId)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const logs = attRes.data ?? [];
  const sal  = salRes.data ?? null;
  let totalMinutes = 0;
  for (const log of logs) {
    if (log.check_in && log.check_out) {
      totalMinutes += (new Date(log.check_out) - new Date(log.check_in)) / 60000;
    }
  }
  return {
    daysWorked:   logs.length,
    hoursWorked:  Math.round(totalMinutes / 60),
    lastWorkDate: logs[0]?.work_date ?? null,
    salary:       sal?.base_salary_usd ? Number(sal.base_salary_usd).toLocaleString() : null,
  };
}

export default function ProfileScreen() {
  const { id, name, role, team, avatar_url, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const lang       = useUiStore((s) => s.lang);
  const toggleLang = useUiStore((s) => s.toggleLang);

  const [stats, setStats]       = useState(null);
  const [statsErr, setStatsErr] = useState(null);

  useEffect(() => {
    if (!id) return;
    fetchProfileStats(id).then(setStats).catch(e => setStatsErr(e.message));
  }, [id]);

  return (
    <div className="space-y-5" dir="rtl">
      <Hero eyebrow="الملف الشخصي" title="حسابي" subtitle="بياناتك الشخصية وإحصائياتك." />

      <Card>
        <div className="flex items-center gap-4">
          <Avatar name={name || ''} src={avatar_url} size="2xl" />
          <div className="min-w-0 flex-1">
            <div className="text-xl font-extrabold truncate text-text">{name || '—'}</div>
            <div className="text-sm text-muted truncate">{ROLE_LABELS[role] ?? role ?? ''}</div>
            {team && <div className="text-xs text-muted mt-1">الفريق: {team}</div>}
          </div>
        </div>
        <div className="mt-4">
          <InfoRow label="الدور"   value={ROLE_LABELS[role] ?? role} />
          <InfoRow label="الفريق"  value={team} />
          {stats?.lastWorkDate && (
            <InfoRow label="آخر حضور" value={new Date(stats.lastWorkDate).toLocaleDateString('ar')} />
          )}
          {stats?.salary && (
            <InfoRow label="الراتب الأساسي" value={'$' + stats.salary} />
          )}
        </div>
      </Card>

      {statsErr ? (
        <div className="text-xs text-red-500 bg-red-50 rounded-xl px-4 py-3">{statsErr}</div>
      ) : (
        <div>
          <h2 className="text-sm font-semibold text-muted mb-3">إحصائيات الشهر الحالي</h2>
          {stats === null ? (
            <div className="text-center py-8 text-muted text-sm">جار التحميل…</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard icon="📅" label="أيام الحضور"    value={stats.daysWorked}           tone="teal"  />
              <StatCard icon="⏱️" label="ساعات العمل"    value={stats.hoursWorked + ' ساعة'} tone="blue"  />
              {stats.salary && (
                <StatCard icon="💰" label="الراتب الأساسي" value={'$' + stats.salary}       tone="green" />
              )}
            </div>
          )}
        </div>
      )}

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
