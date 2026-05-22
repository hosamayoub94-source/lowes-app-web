// =============================================================
// HomeScreen — landing dashboard once authenticated.
// Fetches real KPI data from Supabase: attendance, tasks,
// notifications, and leave balance.
// =============================================================
import { useEffect, useState } from 'react';
import { Hero } from '@components/ui/Hero';
import { StatCard } from '@components/ui/StatCard';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { useAuth } from '@hooks/useAuth';
import { navItemsForRole } from '@data/navigation';
import { Link } from 'react-router-dom';
import { supabase } from '@services/supabase';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchKPIs(name, userId) {
  const today = todayISO();
  const year  = new Date().getFullYear();

  const [attendanceRes, tasksRes, notifRes, leaveRes] = await Promise.allSettled([
    // Today's attendance count for this employee
    supabase
      .from('attendance')
      .select('id', { count: 'exact', head: true })
      .eq('employee_name', name)
      .eq('date', today),

    // Open tasks
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress']),

    // Unread notifications count
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false),

    // Leave balance for this employee this year
    userId
      ? supabase
          .from('leave_balances')
          .select('total_days, used_days')
          .eq('employee_id', userId)
          .eq('year', year)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const attendanceCount = attendanceRes.status === 'fulfilled'
    ? (attendanceRes.value.count ?? 0) : 0;
  const tasksCount = tasksRes.status === 'fulfilled'
    ? (tasksRes.value.count ?? 0) : '—';
  const notifCount = notifRes.status === 'fulfilled'
    ? (notifRes.value.count ?? 0) : '—';

  let leaveBalance = '—';
  if (leaveRes.status === 'fulfilled') {
    const d = leaveRes.value?.data;
    const total_days = d?.total_days ?? 15;
    const used_days  = d?.used_days  ?? 0;
    leaveBalance = total_days - used_days;
  }

  return { attendanceCount, tasksCount, notifCount, leaveBalance };
}

export default function HomeScreen() {
  const { name, role, id: userId } = useAuth();
  const items = navItemsForRole(role);

  const [kpi, setKpi] = useState({
    attendanceCount: '—',
    tasksCount: '—',
    notifCount: '—',
    leaveBalance: '—',
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!name) return;
    fetchKPIs(name, userId)
      .then(setKpi)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [name, userId]);

  const attendanceLabel = loaded
    ? kpi.attendanceCount > 0 ? 'حاضر ✓' : 'غير مسجّل'
    : '—';

  const leaveLabel = typeof kpi.leaveBalance === 'number'
    ? `${kpi.leaveBalance} يوم`
    : kpi.leaveBalance;

  return (
    <div className="space-y-5">
      <Hero
        eyebrow="لوحة التحكم"
        title={`أهلاً ${name || ''} 👋`}
        subtitle="تابع حضورك ومهامك وأرقام يومك من مكان واحد."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="الحضور اليوم"
          value={attendanceLabel}
          hint="آخر تحديث الآن"
          tone="teal"
        />
        <StatCard
          label="مهام مفتوحة"
          value={kpi.tasksCount}
          tone="blue"
        />
        <StatCard
          label="الإشعارات الجديدة"
          value={kpi.notifCount}
          tone="amber"
        />
        <StatCard
          label="رصيد الإجازات"
          value={leaveLabel}
          hint={typeof kpi.leaveBalance === 'number' ? 'متبقٍ لهذا العام' : undefined}
          tone="purple"
        />
      </div>

      <Card>
        <CardTitle>اختصارات سريعة</CardTitle>
        <CardSubtitle>الوصول السريع للأقسام التي تستخدمها بشكل متكرر</CardSubtitle>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {items.map((item) => (
            <Button
              key={item.id}
              as={Link}
              to={item.path}
              variant="secondary"
              size="lg"
              leftIcon={<span aria-hidden>{item.icon}</span>}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}
